import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RuntimeBridgeServer } from '../../bridge/server.js';
import type {
  AgenticReactSettingsBootstrap,
  AgenticReactSettingsError,
  AgenticReactSettingsRpcResult,
  AgenticReactSettingsSnapshot,
  AgenticReactShortcutKey,
  AgenticReactShortcutSettings,
  AgenticReactToolboxIconMetadata,
  AgenticReactToolboxIconMime,
  AgenticReactToolkitConfig,
} from '../../shared/types.js';
import {
  AGENTIC_REACT_PNG_ICON_FILENAME,
  AGENTIC_REACT_SETTINGS_DIRECTORY,
  AGENTIC_REACT_SETTINGS_FILENAME,
  AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
  AGENTIC_REACT_SHORTCUT_KEYS,
  AGENTIC_REACT_WEBP_ICON_FILENAME,
  type PersistedAgenticReactSettings,
  createUnavailableSettingsSnapshot,
  getIconFilenameForMime,
  isAllowedToolboxIconMime,
  mergeSettings,
  normalizePersistedSettingsForWrite,
  sanitizeProjectSettingsDefaults,
  validatePersistedSettings,
} from './schema.js';
import {
  normalizeShortcutString,
  validateShortcutSettings,
} from './shortcuts.js';

export interface NodeSettingsStoreOptions {
  homeDir?: string;
  settingsRoot?: string;
  projectToolkitConfig?: AgenticReactToolkitConfig;
  fileSystem?: NodeSettingsStoreFileSystem;
}

export interface AgenticReactSettingsEngineOptions
  extends NodeSettingsStoreOptions {
  token?: string;
}

const MAX_SHORTCUT_PATCH_KEYS = AGENTIC_REACT_SHORTCUT_KEYS.length;
const MAX_ICON_BYTES = 1024 * 1024;
const MAX_ICON_ENCODED_CHARS = Math.ceil((MAX_ICON_BYTES * 4) / 3) + 128;
const NODE_SHORTCUT_PLATFORM =
  process.platform === 'darwin' ? 'MacIntel' : 'Win32';

export interface NodeSettingsStoreFileSystem {
  mkdirSync: typeof fs.mkdirSync;
  readFileSync: typeof fs.readFileSync;
  renameSync: typeof fs.renameSync;
  rmSync: typeof fs.rmSync;
  writeFileSync: typeof fs.writeFileSync;
}

const createSettingsError = (
  code: AgenticReactSettingsError['code'],
  message: string,
  detail?: string,
): AgenticReactSettingsError => ({
  code,
  message,
  ...(detail ? { detail } : {}),
});

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export class NodeSettingsStore {
  private readonly settingsRoot: string;
  private readonly projectToolkitConfig: AgenticReactToolkitConfig | undefined;
  private readonly fileSystem: NodeSettingsStoreFileSystem;

  constructor(options: NodeSettingsStoreOptions = {}) {
    this.settingsRoot =
      options.settingsRoot ||
      path.join(
        options.homeDir || os.homedir(),
        AGENTIC_REACT_SETTINGS_DIRECTORY,
      );
    this.projectToolkitConfig = options.projectToolkitConfig;
    this.fileSystem = options.fileSystem || fs;
  }

  getSettingsRootForTests(): string {
    return this.settingsRoot;
  }

  getSettingsFilePathForTests(): string {
    return this.settingsFilePath;
  }

  getSnapshot(): AgenticReactSettingsSnapshot {
    const readResult = this.readPersistedSettings();
    const resolvedIcon = this.resolveGlobalToolboxIcon(
      readResult.settings?.appearance?.toolboxIcon,
    );
    return mergeSettings(
      readResult.settings,
      sanitizeProjectSettingsDefaults(this.projectToolkitConfig),
      [...readResult.errors, ...resolvedIcon.errors],
      resolvedIcon.url,
    );
  }

  updateShortcuts(shortcuts: unknown): AgenticReactSettingsRpcResult {
    const validation = validateShortcutPatch(shortcuts);
    if (validation.success === false) {
      return this.failure(validation.error);
    }

    const readResult = this.readPersistedSettingsForWrite();
    const nextSettings = normalizePersistedSettingsForWrite({
      ...readResult.settings,
      shortcuts: {
        ...(readResult.settings.shortcuts || {}),
        ...validation.shortcuts,
      },
    });

    const effectiveValidation = this.validateEffectiveShortcuts(nextSettings);
    if (effectiveValidation) {
      return this.failure(effectiveValidation);
    }

    return this.writeSettingsResult(nextSettings);
  }

  resetShortcuts(): AgenticReactSettingsRpcResult {
    const readResult = this.readPersistedSettingsForWrite();
    const nextSettings = normalizePersistedSettingsForWrite({
      ...readResult.settings,
      shortcuts: undefined,
    });
    const effectiveValidation = this.validateEffectiveShortcuts(nextSettings);
    if (effectiveValidation) {
      return this.failure(effectiveValidation);
    }
    return this.writeSettingsResult(nextSettings);
  }

  resetShortcut(key: unknown): AgenticReactSettingsRpcResult {
    if (!AGENTIC_REACT_SHORTCUT_KEYS.includes(key as AgenticReactShortcutKey)) {
      return this.failure(
        createSettingsError(
          'invalid_payload',
          'Shortcut reset payload must include a known shortcut key.',
        ),
      );
    }

    const readResult = this.readPersistedSettingsForWrite();
    const nextShortcuts = { ...(readResult.settings.shortcuts || {}) };
    delete nextShortcuts[key as AgenticReactShortcutKey];
    const nextSettings = normalizePersistedSettingsForWrite({
      ...readResult.settings,
      shortcuts:
        Object.keys(nextShortcuts).length > 0 ? nextShortcuts : undefined,
    });
    const effectiveValidation = this.validateEffectiveShortcuts(nextSettings);
    if (effectiveValidation) {
      return this.failure(effectiveValidation);
    }
    return this.writeSettingsResult(nextSettings);
  }

  private validateEffectiveShortcuts(
    settings: PersistedAgenticReactSettings,
  ): AgenticReactSettingsError | null {
    const effectiveSettings = mergeSettings(
      settings,
      sanitizeProjectSettingsDefaults(this.projectToolkitConfig),
    ).effectiveSettings;
    const validation = validateShortcutSettings(
      effectiveSettings.shortcuts,
      NODE_SHORTCUT_PLATFORM,
    );
    if (validation.success === true) {
      return null;
    }
    return createSettingsError(
      'invalid_payload',
      `Invalid shortcut configuration: ${validation.reason}`,
    );
  }

  applyIcon(input: unknown): AgenticReactSettingsRpcResult {
    const validation = validateIconInput(input);
    if (validation.success === false) {
      return this.failure(validation.error);
    }

    const filename = getIconFilenameForMime(validation.mime);
    const iconPath = path.join(this.settingsRoot, filename);
    const readResult = this.readPersistedSettingsForWrite();
    const previousIcon = readResult.settings.appearance?.toolboxIcon;
    const previousIconBytes = this.readPreviousIconBytes(previousIcon);

    try {
      atomicWriteFile(this.fileSystem, iconPath, validation.bytes);
    } catch (error) {
      return this.failure(
        createSettingsError(
          'write_failed',
          'Failed to write Agentic React toolbox icon.',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }

    const nextSettings = normalizePersistedSettingsForWrite({
      ...readResult.settings,
      appearance: {
        ...(readResult.settings.appearance || {}),
        toolboxIcon: {
          filename,
          mime: validation.mime,
          updatedAt: Date.now(),
        },
      },
    });

    const writeError = this.writeSettings(nextSettings);
    if (writeError) {
      this.rollbackIconApply(filename, previousIcon, previousIconBytes);
      return this.failure(writeError);
    }

    this.removeIconFile(
      filename === AGENTIC_REACT_WEBP_ICON_FILENAME
        ? AGENTIC_REACT_PNG_ICON_FILENAME
        : AGENTIC_REACT_WEBP_ICON_FILENAME,
    );

    return this.success();
  }

  resetIcon(): AgenticReactSettingsRpcResult {
    const readResult = this.readPersistedSettingsForWrite();
    const nextSettings = normalizePersistedSettingsForWrite({
      ...readResult.settings,
      appearance: undefined,
    });
    const writeError = this.writeSettings(nextSettings);
    if (writeError) {
      return this.failure(writeError);
    }

    this.removeIconFile(AGENTIC_REACT_WEBP_ICON_FILENAME);
    this.removeIconFile(AGENTIC_REACT_PNG_ICON_FILENAME);
    return this.success();
  }

  private get settingsFilePath(): string {
    return path.join(this.settingsRoot, AGENTIC_REACT_SETTINGS_FILENAME);
  }

  private readPersistedSettings(): {
    settings: PersistedAgenticReactSettings | null;
    errors: AgenticReactSettingsError[];
  } {
    let source: string;
    try {
      source = this.fileSystem.readFileSync(this.settingsFilePath, 'utf8');
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        return {
          settings: {
            schemaVersion: AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
          },
          errors: [],
        };
      }
      return {
        settings: null,
        errors: [
          createSettingsError(
            'read_failed',
            'Failed to read Agentic React settings.',
            error instanceof Error ? error.message : String(error),
          ),
        ],
      };
    }

    try {
      return validatePersistedSettings(JSON.parse(source));
    } catch (error) {
      return {
        settings: null,
        errors: [
          createSettingsError(
            'invalid_settings',
            'Agentic React settings file contains invalid JSON.',
            error instanceof Error ? error.message : String(error),
          ),
        ],
      };
    }
  }

  private readPersistedSettingsForWrite(): {
    settings: PersistedAgenticReactSettings;
  } {
    const readResult = this.readPersistedSettings();
    return {
      settings:
        readResult.settings ||
        ({
          schemaVersion: AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
        } satisfies PersistedAgenticReactSettings),
    };
  }

  private writeSettingsResult(
    settings: PersistedAgenticReactSettings,
  ): AgenticReactSettingsRpcResult {
    try {
      const writeError = this.writeSettings(settings);
      if (writeError) {
        return this.failure(writeError);
      }
    } catch (error) {
      return this.failure(this.createWriteSettingsError(error));
    }

    return this.success();
  }

  private failure(
    error: AgenticReactSettingsError,
  ): AgenticReactSettingsRpcResult {
    return {
      success: false,
      ...this.getSnapshot(),
      error,
    };
  }

  private success(): AgenticReactSettingsRpcResult {
    return {
      success: true,
      ...this.getSnapshot(),
    };
  }

  private writeSettings(
    settings: PersistedAgenticReactSettings,
  ): AgenticReactSettingsError | null {
    try {
      atomicWriteJson(this.fileSystem, this.settingsFilePath, settings);
      return null;
    } catch (error) {
      return this.createWriteSettingsError(error);
    }
  }

  private createWriteSettingsError(error: unknown): AgenticReactSettingsError {
    return createSettingsError(
      'write_failed',
      'Failed to write Agentic React settings.',
      error instanceof Error ? error.message : String(error),
    );
  }

  private removeIconFile(filename: string) {
    try {
      this.fileSystem.rmSync(path.join(this.settingsRoot, filename), {
        force: true,
      });
    } catch (_error) {
      // Best-effort cleanup; stale files are ignored by metadata allowlist.
    }
  }

  private resolveGlobalToolboxIcon(
    metadata: AgenticReactToolboxIconMetadata | null | undefined,
  ): {
    url: string | null;
    errors: AgenticReactSettingsError[];
  } {
    if (!metadata) {
      return { url: null, errors: [] };
    }

    const iconPath = path.join(this.settingsRoot, metadata.filename);
    let bytes: Buffer;
    try {
      const rawBytes = this.fileSystem.readFileSync(iconPath);
      bytes = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
    } catch (error) {
      return {
        url: null,
        errors: [
          createSettingsError(
            isNodeErrorCode(error, 'ENOENT')
              ? 'invalid_settings'
              : 'read_failed',
            'Configured Agentic React toolbox icon could not be read.',
            metadata.filename,
          ),
        ],
      };
    }

    if (
      bytes.length === 0 ||
      bytes.length > MAX_ICON_BYTES ||
      !hasExpectedMagicBytes(bytes, metadata.mime)
    ) {
      return {
        url: null,
        errors: [
          createSettingsError(
            'invalid_settings',
            'Configured Agentic React toolbox icon is invalid.',
            metadata.filename,
          ),
        ],
      };
    }

    return {
      url: `data:${metadata.mime};base64,${bytes.toString('base64')}`,
      errors: [],
    };
  }

  private readPreviousIconBytes(
    metadata: AgenticReactToolboxIconMetadata | null | undefined,
  ): Buffer | null {
    if (!metadata) {
      return null;
    }

    try {
      const rawBytes = this.fileSystem.readFileSync(
        path.join(this.settingsRoot, metadata.filename),
      );
      return Buffer.isBuffer(rawBytes) ? Buffer.from(rawBytes) : null;
    } catch (_error) {
      return null;
    }
  }

  private rollbackIconApply(
    newFilename: string,
    previousIcon: AgenticReactToolboxIconMetadata | null | undefined,
    previousIconBytes: Buffer | null,
  ) {
    if (previousIcon?.filename === newFilename && previousIconBytes) {
      try {
        atomicWriteFile(
          this.fileSystem,
          path.join(this.settingsRoot, previousIcon.filename),
          previousIconBytes,
        );
        return;
      } catch (_error) {
        // Fall through to removing the uncommitted icon target.
      }
    }

    this.removeIconFile(newFilename);
  }
}

export class AgenticReactSettingsEngine {
  readonly token: string;
  readonly store: NodeSettingsStore;

  constructor(options: AgenticReactSettingsEngineOptions = {}) {
    this.token = options.token || randomBytes(32).toString('base64url');
    this.store = new NodeSettingsStore(options);
  }

  getBootstrap(): AgenticReactSettingsBootstrap {
    return {
      ...this.store.getSnapshot(),
      capability: {
        available: true,
        token: this.token,
      },
    };
  }

  registerBridge(runtimeBridge: RuntimeBridgeServer) {
    runtimeBridge.registerHandler('settings:get-effective', (payload) =>
      this.handleAuthorizedRequest(payload, () => ({
        success: true,
        ...this.store.getSnapshot(),
      })),
    );
    runtimeBridge.registerHandler('settings:update-shortcuts', (payload) =>
      this.handleAuthorizedRequest(payload, (body) =>
        this.store.updateShortcuts(body.shortcuts),
      ),
    );
    runtimeBridge.registerHandler('settings:apply-icon', (payload) =>
      this.handleAuthorizedRequest(payload, (body) =>
        this.store.applyIcon(body.icon || body),
      ),
    );
    runtimeBridge.registerHandler('settings:reset-icon', (payload) =>
      this.handleAuthorizedRequest(payload, () => this.store.resetIcon()),
    );
    runtimeBridge.registerHandler('settings:reset-shortcut', (payload) =>
      this.handleAuthorizedRequest(payload, (body) =>
        this.store.resetShortcut(body.key),
      ),
    );
    runtimeBridge.registerHandler('settings:reset-shortcuts', (payload) =>
      this.handleAuthorizedRequest(payload, () => this.store.resetShortcuts()),
    );
  }

  private handleAuthorizedRequest(
    payload: unknown,
    handler: (body: Record<string, unknown>) => AgenticReactSettingsRpcResult,
  ): AgenticReactSettingsRpcResult {
    if (!isObjectRecord(payload)) {
      return this.unauthorizedFailure(
        'Settings RPC payload must be an object.',
      );
    }
    if (payload.token !== this.token) {
      return this.unauthorizedFailure('Invalid Agentic React settings token.');
    }
    return handler(payload);
  }

  private unauthorizedFailure(message: string): AgenticReactSettingsRpcResult {
    return {
      success: false,
      ...createUnauthorizedSettingsSnapshot(message),
      error: createSettingsError('unauthorized', message),
    };
  }
}

export const createAgenticReactSettingsEngine = (
  options: AgenticReactSettingsEngineOptions = {},
): AgenticReactSettingsEngine => new AgenticReactSettingsEngine(options);

const validateShortcutPatch = (
  value: unknown,
):
  | {
      success: true;
      shortcuts: Partial<AgenticReactShortcutSettings>;
    }
  | {
      success: false;
      error: AgenticReactSettingsError;
    } => {
  if (!isObjectRecord(value)) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Shortcut update payload must be an object.',
      ),
    };
  }

  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_SHORTCUT_PATCH_KEYS) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Shortcut update payload must include one or more known shortcuts.',
      ),
    };
  }

  const shortcuts: Partial<AgenticReactShortcutSettings> = {};
  for (const [key, shortcut] of entries) {
    if (!AGENTIC_REACT_SHORTCUT_KEYS.includes(key as never)) {
      return {
        success: false,
        error: createSettingsError(
          'invalid_payload',
          `Unsupported shortcut key: ${key}.`,
        ),
      };
    }
    if (
      typeof shortcut !== 'string' ||
      shortcut.trim().length === 0 ||
      shortcut.trim().length > 80
    ) {
      return {
        success: false,
        error: createSettingsError(
          'invalid_payload',
          `Invalid shortcut value for ${key}.`,
        ),
      };
    }
    const normalized = normalizeShortcutString(
      shortcut.trim(),
      NODE_SHORTCUT_PLATFORM,
    );
    if (normalized.success === false) {
      return {
        success: false,
        error: createSettingsError(
          'invalid_payload',
          `Invalid shortcut value for ${key}: ${normalized.reason}`,
        ),
      };
    }
    shortcuts[key as keyof AgenticReactShortcutSettings] = normalized.label;
  }

  return {
    success: true,
    shortcuts,
  };
};

const validateIconInput = (
  input: unknown,
):
  | {
      success: true;
      mime: AgenticReactToolboxIconMime;
      bytes: Buffer;
    }
  | {
      success: false;
      error: AgenticReactSettingsError;
    } => {
  if (!isObjectRecord(input)) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload must be an object.',
      ),
    };
  }

  const rawData = input.data ?? input.encoded;
  if (typeof rawData !== 'string' || rawData.length === 0) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload must include encoded image data.',
      ),
    };
  }
  if (rawData.length > MAX_ICON_ENCODED_CHARS) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload is too large.',
      ),
    };
  }

  const dataUrlMatch = rawData.match(
    /^data:(image\/(?:png|webp));base64,(.+)$/,
  );
  const mime = dataUrlMatch?.[1] || input.mime;
  const base64 = dataUrlMatch?.[2] || rawData;

  if (!isAllowedToolboxIconMime(mime)) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload must be PNG or WebP.',
      ),
    };
  }
  if (dataUrlMatch && input.mime && input.mime !== mime) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon MIME type does not match the data URL.',
      ),
    };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch (_error) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload is not valid base64.',
      ),
    };
  }

  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload is too large.',
      ),
    };
  }
  if (!hasExpectedMagicBytes(bytes, mime)) {
    return {
      success: false,
      error: createSettingsError(
        'invalid_payload',
        'Icon payload does not match the declared image format.',
      ),
    };
  }

  return {
    success: true,
    mime,
    bytes,
  };
};

const hasExpectedMagicBytes = (
  bytes: Buffer,
  mime: AgenticReactToolboxIconMime,
): boolean => {
  if (mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
};

const atomicWriteJson = (
  fileSystem: NodeSettingsStoreFileSystem,
  filePath: string,
  value: unknown,
) => {
  atomicWriteFile(fileSystem, filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const atomicWriteFile = (
  fileSystem: NodeSettingsStoreFileSystem,
  filePath: string,
  value: string | Buffer,
) => {
  const directory = path.dirname(filePath);
  fileSystem.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    fileSystem.writeFileSync(tempPath, value);
    fileSystem.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fileSystem.rmSync(tempPath, { force: true });
    } catch (_cleanupError) {
      // noop
    }
    throw error;
  }
};

const isNodeErrorCode = (error: unknown, code: string): boolean =>
  isObjectRecord(error) && error.code === code;

const createUnauthorizedSettingsSnapshot = (
  message: string,
): AgenticReactSettingsSnapshot => createUnavailableSettingsSnapshot(message);
