import fs from 'node:fs';
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
import { SOURCE_LOOKUP_PATH } from '@agentic-react/core/shared/protocol';
import type {
  AgenticReactSettingsBootstrap,
  AgenticReactToolkitConfig,
  CustomTool,
} from '@agentic-react/core/shared/types';
import {
  findComponentSourceInProject,
  registerSourceLookupHandler,
} from '@agentic-react/core/source-lookup';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

interface WebpackEnv {
  mode?: string;
}

const resolveWebpackMode = (
  config: Record<string, unknown>,
  env: WebpackEnv,
): string | undefined => {
  if (typeof env.mode === 'string') return env.mode;
  if (typeof config.mode === 'string') return config.mode;
  return process.env.NODE_ENV;
};

export interface AgenticReactWebpackOptions {
  customTools?: CustomTool[];
  rootDir?: string;
  settingsRoot?: string;
  toolkit?: AgenticReactToolkitConfig;
}

type WebpackDevServer = {
  server?: unknown;
};

const require = createRequire(import.meta.url);

const getCoreDistPath = () =>
  path.dirname(require.resolve('@agentic-react/core/overlay'));

const sanitizeGeneratedEntryName = (value: string): string =>
  value.trim().replace(/[^A-Za-z0-9._-]+/g, '-');

const getGeneratedEntryName = (config: Record<string, unknown>): string => {
  const output = config.output;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const uniqueName = (output as Record<string, unknown>).uniqueName;
    if (typeof uniqueName === 'string') {
      return sanitizeGeneratedEntryName(uniqueName);
    }
  }

  return '';
};

const writeWebpackClientEntry = (
  rootDir: string,
  generatedEntryName: string,
  customTools: CustomTool[],
  toolkitConfig: AgenticReactToolkitConfig,
  settingsBootstrap: AgenticReactSettingsBootstrap,
): string => {
  const coreDistPath = getCoreDistPath();
  const generatedDirectory = generatedEntryName
    ? path.join(rootDir, '.agentic-react-webpack', generatedEntryName)
    : path.join(rootDir, '.agentic-react-webpack');
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

const prependWebpackEntry = (
  entryValue: unknown,
  prependPath: string,
): unknown => {
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
      nextEntryObject[key] = prependWebpackEntry(value, prependPath);
    }
    return nextEntryObject;
  }

  return entryValue;
};

const createSourceLookupMiddleware = (rootDir: string) => ({
  name: 'agentic-react-source-lookup',
  path: SOURCE_LOOKUP_PATH,
  middleware: (req: any, res: any) => {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const requestUrl = new URL(
      req.url || SOURCE_LOOKUP_PATH,
      'http://127.0.0.1',
    );
    const componentName = requestUrl.searchParams.get('component') || '';
    const selector = requestUrl.searchParams.get('selector') || '';
    const source = findComponentSourceInProject(
      rootDir,
      componentName,
      selector,
    );

    if (!source) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(source));
  },
});

const createMcpMiddlewares = (createMcpServer: () => Server) => {
  return [
    {
      name: 'agentic-react-mcp',
      path: '/mcp',
      middleware: createStreamableHttpMcpHandler(createMcpServer),
    },
  ];
};

export const withAgenticReactWebpack = (
  config: Record<string, unknown>,
  env: WebpackEnv = {},
  options: AgenticReactWebpackOptions = {},
) => {
  if (resolveWebpackMode(config, env) !== 'development') {
    return config;
  }

  const nextConfig = { ...config };
  const rootDir =
    options.rootDir ||
    (typeof nextConfig.context === 'string'
      ? nextConfig.context
      : process.cwd());
  const settingsEngine = createAgenticReactSettingsEngine({
    projectToolkitConfig: options.toolkit || {},
    settingsRoot: options.settingsRoot,
  });
  const entryPath = writeWebpackClientEntry(
    rootDir,
    getGeneratedEntryName(nextConfig),
    options.customTools || [],
    options.toolkit || {},
    settingsEngine.getBootstrap(),
  );
  const runtimeBridge = new RuntimeBridgeServer();
  registerSourceLookupHandler(runtimeBridge, rootDir);
  settingsEngine.registerBridge(runtimeBridge);
  const createMcpServer = () =>
    initMcpServer(runtimeBridge, rootDir, options.customTools || []);
  const mcpMiddlewares = [
    createSourceLookupMiddleware(rootDir),
    ...createMcpMiddlewares(createMcpServer),
  ];

  nextConfig.entry = prependWebpackEntry(nextConfig.entry, entryPath);

  const devServer =
    nextConfig.devServer && typeof nextConfig.devServer === 'object'
      ? { ...(nextConfig.devServer as Record<string, any>) }
      : {};
  const existingSetupMiddlewares = devServer.setupMiddlewares;
  const existingOnListening = devServer.onListening;
  let bridgeAttached = false;

  devServer.setupMiddlewares = (
    middlewares: unknown[],
    webpackDevServer: WebpackDevServer,
  ) => {
    const configuredMiddlewares =
      typeof existingSetupMiddlewares === 'function'
        ? existingSetupMiddlewares(middlewares, webpackDevServer)
        : middlewares;

    return [...mcpMiddlewares, ...configuredMiddlewares];
  };

  devServer.onListening = (webpackDevServer: WebpackDevServer) => {
    if (!bridgeAttached && webpackDevServer.server) {
      runtimeBridge.attach(webpackDevServer.server);
      bridgeAttached = true;
    }

    if (typeof existingOnListening === 'function') {
      existingOnListening(webpackDevServer);
    }
  };

  nextConfig.devServer = devServer;
  return nextConfig;
};

export default withAgenticReactWebpack;
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
