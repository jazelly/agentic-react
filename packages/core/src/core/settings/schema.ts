import type {
  AgenticReactAppearanceSettings,
  AgenticReactSettings,
  AgenticReactSettingsError,
  AgenticReactSettingsSnapshot,
  AgenticReactSettingsSource,
  AgenticReactSettingsSources,
  AgenticReactShortcutKey,
  AgenticReactShortcutSettings,
  AgenticReactToolboxIconFilename,
  AgenticReactToolboxIconMetadata,
  AgenticReactToolboxIconMime,
  AgenticReactToolkitConfig,
} from '../../shared/types.js';

export const AGENTIC_REACT_SETTINGS_SCHEMA_VERSION = 1;
export const AGENTIC_REACT_SETTINGS_DIRECTORY = '.agentic-react';
export const AGENTIC_REACT_SETTINGS_FILENAME = 'settings.json';
export const AGENTIC_REACT_WEBP_ICON_FILENAME = 'toolbox-icon.webp';
export const AGENTIC_REACT_PNG_ICON_FILENAME = 'toolbox-icon.png';

export const AGENTIC_REACT_SHORTCUT_KEYS: AgenticReactShortcutKey[] = [
  'singleSelect',
  'multiSelect',
  'toggleToolbox',
  'done',
];

export const PACKAGE_DEFAULT_SHORTCUTS: AgenticReactShortcutSettings = {
  singleSelect: 'Ctrl+Alt+Shift+S',
  multiSelect: 'Ctrl+Alt+Shift+M',
  toggleToolbox: 'Ctrl+Alt+Shift+A',
  done: 'Enter',
};

export const PACKAGE_DEFAULT_SETTINGS: AgenticReactSettings = {
  schemaVersion: AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
  shortcuts: PACKAGE_DEFAULT_SHORTCUTS,
  appearance: {
    toolboxIcon: null,
    toolboxIconUrl: null,
  },
};

export interface PersistedAgenticReactSettings {
  schemaVersion: 1;
  shortcuts?: Partial<AgenticReactShortcutSettings>;
  appearance?: Partial<AgenticReactAppearanceSettings>;
}

export interface PersistedSettingsParseResult {
  settings: PersistedAgenticReactSettings | null;
  errors: AgenticReactSettingsError[];
}

interface SanitizedProjectSettingsDefaults {
  shortcuts?: Partial<AgenticReactShortcutSettings>;
  toolboxIconUrl?: string;
}

const SHORTCUT_MAX_LENGTH = 80;
const TOOLBOX_ICON_URL_MAX_LENGTH = Math.ceil((1024 * 1024 * 4) / 3) + 128;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const createSettingsError = (
  code: AgenticReactSettingsError['code'],
  message: string,
  detail?: string,
): AgenticReactSettingsError => ({
  code,
  message,
  ...(detail ? { detail } : {}),
});

export const createUnavailableSettingsSnapshot = (
  message = 'Agentic React settings persistence is unavailable.',
): AgenticReactSettingsSnapshot => ({
  effectiveSettings: PACKAGE_DEFAULT_SETTINGS,
  sources: {
    shortcuts: {
      singleSelect: 'package',
      multiSelect: 'package',
      toggleToolbox: 'package',
      done: 'package',
    },
    appearance: {
      toolboxIcon: 'package',
    },
  },
  errors: [createSettingsError('settings_unavailable', message)],
});

export const sanitizeProjectSettingsDefaults = (
  toolkitConfig: AgenticReactToolkitConfig | undefined,
): SanitizedProjectSettingsDefaults => {
  const settingsDefaults = toolkitConfig?.settings;
  const shortcuts = isObjectRecord(settingsDefaults)
    ? sanitizeShortcutOverrides(settingsDefaults.shortcuts)
    : {};
  const projectDefaults: SanitizedProjectSettingsDefaults = {};
  const iconUrl = sanitizeProjectIconUrl(toolkitConfig?.iconUrl);

  if (Object.keys(shortcuts).length > 0) {
    projectDefaults.shortcuts = shortcuts;
  }
  if (iconUrl !== undefined) {
    projectDefaults.toolboxIconUrl = iconUrl;
  }

  return projectDefaults;
};

export const validatePersistedSettings = (
  value: unknown,
): PersistedSettingsParseResult => {
  if (!isObjectRecord(value)) {
    return {
      settings: null,
      errors: [
        createSettingsError(
          'invalid_settings',
          'Settings file must contain a JSON object.',
        ),
      ],
    };
  }

  if (value.schemaVersion !== AGENTIC_REACT_SETTINGS_SCHEMA_VERSION) {
    return {
      settings: null,
      errors: [
        createSettingsError(
          'unsupported_schema',
          `Unsupported Agentic React settings schemaVersion: ${String(
            value.schemaVersion,
          )}.`,
        ),
      ],
    };
  }

  const errors: AgenticReactSettingsError[] = [];
  const shortcuts = sanitizeShortcutOverrides(value.shortcuts, errors);
  const toolboxIcon = sanitizeToolboxIconMetadata(value.appearance, errors);
  const settings: PersistedAgenticReactSettings = {
    schemaVersion: AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
  };

  if (Object.keys(shortcuts).length > 0) {
    settings.shortcuts = shortcuts;
  }
  if (toolboxIcon !== undefined) {
    settings.appearance = {
      toolboxIcon,
    };
  }

  return {
    settings,
    errors,
  };
};

export const mergeSettings = (
  globalSettings: PersistedAgenticReactSettings | null,
  projectDefaults: SanitizedProjectSettingsDefaults = {},
  errors: AgenticReactSettingsError[] = [],
  globalToolboxIconUrl: string | null = null,
): AgenticReactSettingsSnapshot => {
  const shortcuts = { ...PACKAGE_DEFAULT_SHORTCUTS };
  const shortcutSources: Record<
    AgenticReactShortcutKey,
    AgenticReactSettingsSource
  > = {
    singleSelect: 'package',
    multiSelect: 'package',
    toggleToolbox: 'package',
    done: 'package',
  };

  for (const key of AGENTIC_REACT_SHORTCUT_KEYS) {
    const projectValue = projectDefaults.shortcuts?.[key];
    if (isValidShortcut(projectValue)) {
      shortcuts[key] = projectValue.trim();
      shortcutSources[key] = 'project';
    }
  }

  for (const key of AGENTIC_REACT_SHORTCUT_KEYS) {
    const globalValue = globalSettings?.shortcuts?.[key];
    if (isValidShortcut(globalValue)) {
      shortcuts[key] = globalValue.trim();
      shortcutSources[key] = 'global';
    }
  }

  const packageAppearance = PACKAGE_DEFAULT_SETTINGS.appearance;
  const appearance: AgenticReactAppearanceSettings = {
    toolboxIcon: null,
    toolboxIconUrl: packageAppearance.toolboxIconUrl,
  };
  const sources: AgenticReactSettingsSources = {
    shortcuts: shortcutSources,
    appearance: {
      toolboxIcon: 'package',
    },
  };

  if (
    globalSettings?.appearance?.toolboxIcon !== undefined &&
    globalToolboxIconUrl
  ) {
    appearance.toolboxIcon = globalSettings.appearance.toolboxIcon;
    appearance.toolboxIconUrl = globalToolboxIconUrl;
    sources.appearance.toolboxIcon = 'global';
  } else if (projectDefaults.toolboxIconUrl) {
    appearance.toolboxIconUrl = projectDefaults.toolboxIconUrl;
    sources.appearance.toolboxIcon = 'project';
  }

  return {
    effectiveSettings: {
      schemaVersion: AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
      shortcuts,
      appearance,
    },
    sources,
    errors,
  };
};

export const normalizePersistedSettingsForWrite = (
  settings: PersistedAgenticReactSettings,
): PersistedAgenticReactSettings => {
  const shortcuts = sanitizeShortcutOverrides(settings.shortcuts);
  const normalized: PersistedAgenticReactSettings = {
    schemaVersion: AGENTIC_REACT_SETTINGS_SCHEMA_VERSION,
  };

  if (Object.keys(shortcuts).length > 0) {
    normalized.shortcuts = shortcuts;
  }
  if (settings.appearance?.toolboxIcon !== undefined) {
    normalized.appearance = {
      toolboxIcon: settings.appearance.toolboxIcon,
    };
  }

  return normalized;
};

export const getIconFilenameForMime = (
  mime: AgenticReactToolboxIconMime,
): AgenticReactToolboxIconFilename =>
  mime === 'image/webp'
    ? AGENTIC_REACT_WEBP_ICON_FILENAME
    : AGENTIC_REACT_PNG_ICON_FILENAME;

export const isAllowedToolboxIconMime = (
  mime: unknown,
): mime is AgenticReactToolboxIconMime =>
  mime === 'image/webp' || mime === 'image/png';

const sanitizeShortcutOverrides = (
  value: unknown,
  errors: AgenticReactSettingsError[] = [],
): Partial<AgenticReactShortcutSettings> => {
  const shortcuts: Partial<AgenticReactShortcutSettings> = {};
  if (value === undefined || value === null) {
    return shortcuts;
  }

  if (!isObjectRecord(value)) {
    errors.push(
      createSettingsError(
        'invalid_settings',
        'Settings shortcuts must be an object.',
      ),
    );
    return shortcuts;
  }

  for (const key of AGENTIC_REACT_SHORTCUT_KEYS) {
    const shortcut = value[key];
    if (shortcut === undefined) {
      continue;
    }
    if (!isValidShortcut(shortcut)) {
      errors.push(
        createSettingsError(
          'invalid_settings',
          `Invalid shortcut value for ${key}.`,
        ),
      );
      continue;
    }
    shortcuts[key] = shortcut.trim();
  }

  return shortcuts;
};

const sanitizeToolboxIconMetadata = (
  appearance: unknown,
  errors: AgenticReactSettingsError[],
): AgenticReactToolboxIconMetadata | null | undefined => {
  if (appearance === undefined || appearance === null) {
    return undefined;
  }
  if (!isObjectRecord(appearance)) {
    errors.push(
      createSettingsError(
        'invalid_settings',
        'Settings appearance must be an object.',
      ),
    );
    return undefined;
  }
  if (!Object.hasOwn(appearance, 'toolboxIcon')) {
    return undefined;
  }
  const toolboxIcon = appearance.toolboxIcon;
  if (toolboxIcon === null) {
    return null;
  }
  if (!isObjectRecord(toolboxIcon)) {
    errors.push(
      createSettingsError(
        'invalid_settings',
        'Toolbox icon metadata must be an object or null.',
      ),
    );
    return undefined;
  }
  if (
    (toolboxIcon.filename !== AGENTIC_REACT_WEBP_ICON_FILENAME &&
      toolboxIcon.filename !== AGENTIC_REACT_PNG_ICON_FILENAME) ||
    !isAllowedToolboxIconMime(toolboxIcon.mime) ||
    toolboxIcon.filename !== getIconFilenameForMime(toolboxIcon.mime) ||
    typeof toolboxIcon.updatedAt !== 'number' ||
    !Number.isFinite(toolboxIcon.updatedAt) ||
    toolboxIcon.updatedAt <= 0
  ) {
    errors.push(
      createSettingsError(
        'invalid_settings',
        'Toolbox icon metadata is invalid.',
      ),
    );
    return undefined;
  }

  return {
    filename: toolboxIcon.filename,
    mime: toolboxIcon.mime,
    updatedAt: toolboxIcon.updatedAt,
  };
};

const isValidShortcut = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= SHORTCUT_MAX_LENGTH;

const sanitizeProjectIconUrl = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (
    trimmedValue.length === 0 ||
    trimmedValue.length > TOOLBOX_ICON_URL_MAX_LENGTH ||
    exposesLocalFilePath(trimmedValue)
  ) {
    return undefined;
  }

  return trimmedValue;
};

const exposesLocalFilePath = (value: string): boolean => {
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.startsWith('file:') ||
    lowerValue.startsWith('~/') ||
    lowerValue.startsWith('/users/') ||
    lowerValue.startsWith('/home/') ||
    /^[a-z]:[\\/]/i.test(value)
  );
};
