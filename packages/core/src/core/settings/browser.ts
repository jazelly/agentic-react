import type {
  AgenticReactSettingsBootstrap,
  AgenticReactSettingsCapability,
  AgenticReactSettingsError,
  AgenticReactSettingsRpcResult,
  AgenticReactSettingsSnapshot,
  AgenticReactShortcutKey,
  AgenticReactShortcutSettings,
  AgenticReactToolboxIconMime,
} from '../../shared/types.js';
import { createUnavailableSettingsSnapshot } from './schema.js';

export type BrowserSettingsBridgeRequest = (
  event:
    | 'settings:get-effective'
    | 'settings:update-shortcuts'
    | 'settings:reset-shortcut'
    | 'settings:apply-icon'
    | 'settings:reset-icon'
    | 'settings:reset-shortcuts',
  payload: unknown,
  timeoutMs?: number,
) => Promise<unknown>;

export interface BrowserSettingsClientOptions {
  initialSettings?: AgenticReactSettingsBootstrap;
  request: BrowserSettingsBridgeRequest;
}

const DEFAULT_SETTINGS_RPC_TIMEOUT_MS = 10000;

const createSettingsError = (
  code: AgenticReactSettingsError['code'],
  message: string,
): AgenticReactSettingsError => ({
  code,
  message,
});

export const createAgenticReactSettingsClient = ({
  initialSettings,
  request,
}: BrowserSettingsClientOptions) => {
  let snapshot: AgenticReactSettingsSnapshot =
    initialSettings || createUnavailableSettingsSnapshot();
  const capability: AgenticReactSettingsCapability =
    initialSettings?.capability || {
      available: false,
      reason: 'Settings capability was not provided by the dev adapter.',
    };

  const requestSettings = async (
    event: Parameters<BrowserSettingsBridgeRequest>[0],
    payload: Record<string, unknown> = {},
  ): Promise<AgenticReactSettingsRpcResult> => {
    if (!capability.available || !capability.token) {
      return {
        success: false,
        ...snapshot,
        error: createSettingsError(
          'settings_unavailable',
          capability.reason || 'Agentic React settings are unavailable.',
        ),
      };
    }

    try {
      const result = await request(
        event,
        {
          ...payload,
          token: capability.token,
        },
        DEFAULT_SETTINGS_RPC_TIMEOUT_MS,
      );
      if (!isSettingsRpcResult(result)) {
        return {
          success: false,
          ...snapshot,
          error: createSettingsError(
            'invalid_payload',
            'Settings bridge returned an invalid response.',
          ),
        };
      }

      snapshot = {
        effectiveSettings: result.effectiveSettings,
        sources: result.sources,
        errors: result.errors,
      };
      return result;
    } catch (error) {
      return {
        success: false,
        ...snapshot,
        error: createSettingsError(
          'settings_unavailable',
          error instanceof Error ? error.message : 'Settings bridge failed.',
        ),
      };
    }
  };

  return {
    getEffectiveSettings: () => requestSettings('settings:get-effective'),
    updateShortcuts: (shortcuts: Partial<AgenticReactShortcutSettings>) =>
      requestSettings('settings:update-shortcuts', { shortcuts }),
    resetShortcut: (key: AgenticReactShortcutKey) =>
      requestSettings('settings:reset-shortcut', { key }),
    applyIcon: (input: { data: string; mime?: AgenticReactToolboxIconMime }) =>
      requestSettings('settings:apply-icon', { icon: input }),
    resetIcon: () => requestSettings('settings:reset-icon'),
    resetShortcuts: () => requestSettings('settings:reset-shortcuts'),
    getCachedSnapshot: () => snapshot,
    getCapability: () => ({ ...capability }),
  };
};

const isSettingsRpcResult = (
  value: unknown,
): value is AgenticReactSettingsRpcResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const result = value as Partial<AgenticReactSettingsRpcResult>;
  return (
    typeof result.success === 'boolean' &&
    !!result.effectiveSettings &&
    !!result.sources &&
    Array.isArray(result.errors)
  );
};
