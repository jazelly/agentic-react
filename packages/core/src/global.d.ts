import type {
  AgenticReactConfig,
  AgenticReactSettingsClient,
  SelectionContext,
  ToolResultValue,
  ToolkitConfig,
  TuningModalExtension,
} from './shared/types.js';
import type { WastedRenderFiberInfo } from './types/internal.js';

type AgenticReactTools = {
  highlightComponent: (
    componentName: string,
    options?: { debugMode?: boolean },
  ) => unknown[];
  getComponentTree: (options?: {
    allComponents?: boolean;
    debugMode?: boolean;
  }) => Promise<unknown>;
  getComponentStates: (
    componentName: string,
    options?: { debugMode?: boolean },
  ) => unknown;
  getUnnecessaryRenderedComponents: (
    timeframe?: number,
    options?: {
      allComponents?: boolean;
      debugMode?: boolean;
    },
  ) => Promise<WastedRenderFiberInfo[]>;
  registerCustomTool: (
    name: string,
    handler: (args: unknown) => ToolResultValue | Promise<ToolResultValue>,
  ) => void;
};

type AgenticReactRuntime = {
  showToolkit: () => void;
  hideToolkit: () => void;
  setToolkitConfig: (config: Partial<ToolkitConfig>) => ToolkitConfig;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  setSelectionMode: (enabled: boolean) => void;
  getLastSelectionContext: () => SelectionContext | null;
  copyLastSelectionContext: (format?: 'text' | 'json') => Promise<{
    success: boolean;
    copied: boolean;
    format: 'text' | 'json';
    context?: SelectionContext;
    error?: string;
  }>;
  registerTuningModalExtension: (extension: TuningModalExtension) => () => void;
  settings: AgenticReactSettingsClient;
};

declare global {
  interface Window {
    __AGENTIC_REACT_CONFIG__?: AgenticReactConfig;
    __AGENTIC_REACT_BRIDGE_URL__?: string;
    __AGENTIC_REACT_TOOLS__: AgenticReactTools;
    __AGENTIC_REACT__: AgenticReactRuntime;
  }
}
