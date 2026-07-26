import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createAgenticReactSettingsEngine } from '@agentic-react/core';
import { RuntimeBridgeServer } from '@agentic-react/core/bridge';
import {
  createStreamableHttpMcpHandler,
  initMcpServer,
} from '@agentic-react/core/mcp';
import {
  __AGENTIC_REACT_BRIDGE_URL__,
  __AGENTIC_REACT_CONFIG__,
} from '@agentic-react/core/shared/const';
import {
  generateCustomToolsScript,
  toBundledClientImportSpecifier,
  toRelativeImportSpecifier,
} from '@agentic-react/core/shared/custom-tools-script';
import { BRIDGE_WS_PATH } from '@agentic-react/core/shared/protocol';
import type {
  AgenticReactSettingsBootstrap,
  AgenticReactToolkitConfig,
  CustomTool,
} from '@agentic-react/core/shared/types';

interface NextWebpackContext {
  dev: boolean;
  isServer: boolean;
  webpack: {
    DefinePlugin: new (definitions: Record<string, string>) => unknown;
  };
}

interface NextConfig {
  webpack?: (config: any, context: NextWebpackContext) => any;
  [key: string]: unknown;
}

export interface AgenticReactNextOptions {
  customTools?: CustomTool[];
  rootDir?: string;
  settingsRoot?: string;
  toolkit?: AgenticReactToolkitConfig;
  bridgeUrl?: string;
  server?: {
    enabled?: boolean;
    host?: string;
    port?: number;
  };
}

interface BridgeServerState {
  started: boolean;
  server?: http.Server;
  settingsEngine: ReturnType<typeof createAgenticReactSettingsEngine>;
}

const DEFAULT_BRIDGE_HOST = '127.0.0.1';
const DEFAULT_BRIDGE_PORT = 51426;
const NEXT_BRIDGE_STATE_KEY = Symbol.for('agentic-react.nextBridgeServers');

const require = createRequire(import.meta.url);

const getCoreDistPath = () =>
  path.dirname(require.resolve('@agentic-react/core/overlay'));

const writeNextClientEntry = (
  rootDir: string,
  bridgeUrl: string | null,
  customTools: CustomTool[],
  toolkitConfig: AgenticReactToolkitConfig,
  settingsBootstrap: AgenticReactSettingsBootstrap,
): string => {
  const coreDistPath = getCoreDistPath();
  const generatedDirectory = path.join(rootDir, '.agentic-react-next');
  const generatedEntryPath = path.join(generatedDirectory, 'client-entry.mjs');
  const constSpecifier = toRelativeImportSpecifier(
    generatedDirectory,
    path.join(coreDistPath, 'shared/const.js'),
  );
  const protocolSpecifier = toRelativeImportSpecifier(
    generatedDirectory,
    path.join(coreDistPath, 'shared/protocol.js'),
  );
  const overlaySpecifier = toRelativeImportSpecifier(
    generatedDirectory,
    path.join(coreDistPath, 'overlay.js'),
  );
  const customToolsScript = generateCustomToolsScript(
    customTools,
    (specifier) =>
      toBundledClientImportSpecifier(rootDir, generatedDirectory, specifier),
  );

  const entrySource = `
import {
  ${__AGENTIC_REACT_BRIDGE_URL__},
  ${__AGENTIC_REACT_CONFIG__},
} from ${JSON.stringify(constSpecifier)};
import { BRIDGE_WS_PATH } from ${JSON.stringify(protocolSpecifier)};

if (typeof window !== 'undefined') {
  const existingAgenticReactConfig = window[${__AGENTIC_REACT_CONFIG__}] || {};
  window[${__AGENTIC_REACT_CONFIG__}] = {
    ...existingAgenticReactConfig,
    sourceRoot: existingAgenticReactConfig.sourceRoot || ${JSON.stringify(rootDir)},
    toolkit: {
      ...(existingAgenticReactConfig.toolkit || {}),
      ...${JSON.stringify(toolkitConfig)},
    },
    settings: existingAgenticReactConfig.settings || ${JSON.stringify(settingsBootstrap)},
  };

  if (!window[${__AGENTIC_REACT_BRIDGE_URL__}]) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    window[${__AGENTIC_REACT_BRIDGE_URL__}] =
      ${JSON.stringify(bridgeUrl || '')} ||
      \`\${protocol}//\${window.location.host}\${BRIDGE_WS_PATH}\`;
  }
}

void import(${JSON.stringify(overlaySpecifier)});

${customToolsScript}
`;

  fs.mkdirSync(generatedDirectory, { recursive: true });
  if (
    !fs.existsSync(generatedEntryPath) ||
    fs.readFileSync(generatedEntryPath, 'utf8') !== entrySource
  ) {
    fs.writeFileSync(generatedEntryPath, entrySource);
  }

  return generatedEntryPath;
};

const prependEntry = (entryValue: unknown, prependPath: string): unknown => {
  if (typeof entryValue === 'string') {
    return [prependPath, entryValue];
  }

  if (Array.isArray(entryValue)) {
    return entryValue.includes(prependPath)
      ? entryValue
      : [prependPath, ...entryValue];
  }

  if (entryValue && typeof entryValue === 'object') {
    const entryObject = entryValue as Record<string, unknown>;
    const nextEntryObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entryObject)) {
      if (key.startsWith('webpack-hot-middleware') || key === prependPath) {
        nextEntryObject[key] = value;
        continue;
      }

      nextEntryObject[key] = prependEntry(value, prependPath);
    }
    return nextEntryObject;
  }

  return entryValue;
};

const getBridgeServerRegistry = (): Map<string, BridgeServerState> => {
  const globalRecord = globalThis as Record<
    symbol,
    Map<string, BridgeServerState>
  >;
  if (!globalRecord[NEXT_BRIDGE_STATE_KEY]) {
    globalRecord[NEXT_BRIDGE_STATE_KEY] = new Map();
  }
  return globalRecord[NEXT_BRIDGE_STATE_KEY];
};

const createBridgeHttpServer = (
  rootDir: string,
  customTools: CustomTool[],
  settingsEngine: ReturnType<typeof createAgenticReactSettingsEngine>,
) => {
  const runtimeBridge = new RuntimeBridgeServer();
  settingsEngine.registerBridge(runtimeBridge);
  const handleMcpRequest = createStreamableHttpMcpHandler(() =>
    initMcpServer(runtimeBridge, rootDir, customTools),
  );

  const httpServer = http.createServer(async (req, res) => {
    const requestUrl = req.url || '/';
    const requestPath = requestUrl.split('?')[0];

    if (requestPath === '/health') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (requestPath === '/mcp') {
      await handleMcpRequest(req, res);
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  });

  runtimeBridge.attach(httpServer);
  return httpServer;
};

const startNextBridgeServer = (
  options: AgenticReactNextOptions,
): {
  bridgeUrl: string | null;
  settingsBootstrap: AgenticReactSettingsBootstrap;
} => {
  const projectToolkitConfig = options.toolkit || {};
  const disabledSettingsEngine = createAgenticReactSettingsEngine({
    projectToolkitConfig,
    settingsRoot: options.settingsRoot,
  });

  if (options.server?.enabled === false) {
    return {
      bridgeUrl: options.bridgeUrl || null,
      settingsBootstrap: {
        ...disabledSettingsEngine.store.getSnapshot(),
        capability: {
          available: false,
          reason: 'Next bridge server is disabled.',
        },
      },
    };
  }

  const host = options.server?.host || DEFAULT_BRIDGE_HOST;
  const port = options.server?.port || DEFAULT_BRIDGE_PORT;
  const bridgeUrl =
    options.bridgeUrl || `ws://${host}:${port}${BRIDGE_WS_PATH}`;
  const registryKey = `${host}:${port}`;
  const registry = getBridgeServerRegistry();
  const existingState = registry.get(registryKey);

  if (existingState) {
    return {
      bridgeUrl,
      settingsBootstrap: existingState.settingsEngine.getBootstrap(),
    };
  }

  const settingsEngine = createAgenticReactSettingsEngine({
    projectToolkitConfig,
    settingsRoot: options.settingsRoot,
  });
  const serverState: BridgeServerState = { started: false, settingsEngine };
  registry.set(registryKey, serverState);

  const rootDir = options.rootDir || process.cwd();
  const httpServer = createBridgeHttpServer(
    rootDir,
    options.customTools || [],
    settingsEngine,
  );
  serverState.server = httpServer;

  httpServer.once('error', (error) => {
    serverState.started = false;
    registry.delete(registryKey);
    console.warn(
      `[agentic-react] Next bridge server failed on ${host}:${port}:`,
      error instanceof Error ? error.message : error,
    );
  });

  httpServer.listen(port, host, () => {
    serverState.started = true;
    console.info(
      `[agentic-react] Next MCP bridge listening on http://${host}:${port}`,
    );
  });

  return {
    bridgeUrl,
    settingsBootstrap: settingsEngine.getBootstrap(),
  };
};

export const withAgenticReactNext = (
  nextConfig: NextConfig = {},
  options: AgenticReactNextOptions = {},
): NextConfig => {
  return {
    ...nextConfig,
    webpack: (config: any, context: NextWebpackContext) => {
      const nextConfigWebpack = nextConfig.webpack;
      const transformedConfig =
        typeof nextConfigWebpack === 'function'
          ? nextConfigWebpack(config, context)
          : config;

      if (!context.dev || context.isServer) {
        return transformedConfig;
      }

      const rootDir = options.rootDir || process.cwd();
      const { bridgeUrl, settingsBootstrap } = startNextBridgeServer(options);
      const originalEntry = transformedConfig.entry;

      transformedConfig.entry = async () => {
        const entryPath = writeNextClientEntry(
          rootDir,
          bridgeUrl,
          options.customTools || [],
          options.toolkit || {},
          settingsBootstrap,
        );
        const resolvedEntry =
          typeof originalEntry === 'function'
            ? await originalEntry()
            : originalEntry;

        return prependEntry(resolvedEntry, entryPath);
      };

      return transformedConfig;
    },
  };
};

export default withAgenticReactNext;
export type {
  AgenticReactConfig,
  AgenticReactAppearanceSettings,
  AgenticReactProjectSettingsDefaults,
  AgenticReactSettings,
  AgenticReactSettingsBootstrap,
  AgenticReactSettingsCapability,
  AgenticReactSettingsClient,
  AgenticReactSettingsError,
  AgenticReactSettingsErrorCode,
  AgenticReactSettingsRpcFailure,
  AgenticReactSettingsRpcResult,
  AgenticReactSettingsRpcSuccess,
  AgenticReactSettingsSnapshot,
  AgenticReactSettingsSource,
  AgenticReactSettingsSources,
  AgenticReactShortcutKey,
  AgenticReactShortcutSettings,
  AgenticReactToolkitConfig,
  AgenticReactToolboxIconFilename,
  AgenticReactToolboxIconMetadata,
  AgenticReactToolboxIconMime,
  CustomClientFunction,
  CustomTool,
  JsonValue,
  SelectionContext,
  SelectionResolvedSource,
  SelectionSourceSnippet,
  SelectionStackFrame,
  ToolkitConfig,
  ToolkitOffset,
  ToolkitPosition,
  ToolkitTuningModalConfig,
  ToolkitTuningModalStyle,
  ToolkitTuningModalStyleSlot,
  ToolkitTuningModalStyleValue,
  ToolResultValue,
  TuningModalActions,
  TuningModalContext,
  TuningModalExtension,
  TuningModalExtensionCleanup,
  TuningModalSlotRenderArgs,
  TuningModalWrapArgs,
} from '@agentic-react/core/shared/types';
