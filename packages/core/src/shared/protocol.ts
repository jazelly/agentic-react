export type RuntimeBridgeRequestEvent =
  | 'highlight-component'
  | 'get-component-tree'
  | 'get-component-states'
  | 'get-unnecessary-rerenders'
  | 'set-selection-mode'
  | 'get-last-selection-context'
  | 'copy-last-selection-context'
  | 'get-html-elements'
  | 'get-react-source-code'
  | 'custom-tool';

export type SettingsBridgeRequestEvent =
  | 'settings:get-effective'
  | 'settings:update-shortcuts'
  | 'settings:reset-shortcut'
  | 'settings:apply-icon'
  | 'settings:reset-icon'
  | 'settings:reset-shortcuts';

export type SourceBridgeRequestEvent = 'source:resolve';

export type BridgeRequestEvent =
  | RuntimeBridgeRequestEvent
  | SettingsBridgeRequestEvent
  | SourceBridgeRequestEvent;

export type BridgeMessage =
  | {
      type: 'bridge:request';
      id: string;
      event: BridgeRequestEvent;
      payload: unknown;
    }
  | {
      type: 'bridge:response';
      id: string;
      ok: boolean;
      payload?: unknown;
      error?: string;
    };

export const BRIDGE_WS_PATH = '/__agentic_react_bridge';
export const SOURCE_LOOKUP_PATH = '/__agentic_react_source';

export const BRIDGE_GLOBAL_CONFIG_KEY = '__AGENTIC_REACT_BRIDGE_URL__';
