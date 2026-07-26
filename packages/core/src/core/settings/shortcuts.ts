import type {
  AgenticReactShortcutKey,
  AgenticReactShortcutSettings,
} from '../../shared/types.js';

export const CONFIGURABLE_SHORTCUT_KEYS: AgenticReactShortcutKey[] = [
  'singleSelect',
  'multiSelect',
  'toggleToolbox',
  'done',
];

export const LOCKED_ESCAPE_SHORTCUT = {
  label: 'Escape',
  description: 'Cancel selection',
};

export type ShortcutAction = AgenticReactShortcutKey;

export interface ShortcutNormalizationSuccess {
  success: true;
  label: string;
  identity: string;
}

export interface ShortcutNormalizationFailure {
  success: false;
  reason: string;
}

export type ShortcutNormalizationResult =
  | ShortcutNormalizationSuccess
  | ShortcutNormalizationFailure;

export type ShortcutSettingsValidationResult =
  | {
      success: true;
      shortcuts: AgenticReactShortcutSettings;
    }
  | {
      success: false;
      reason: string;
      action: AgenticReactShortcutKey;
      duplicateAction?: AgenticReactShortcutKey;
    };

export interface ShortcutDispatcherOptions {
  getShortcuts: () => AgenticReactShortcutSettings;
  isActionApplicable: (action: ShortcutAction, event: KeyboardEvent) => boolean;
  onAction: (action: ShortcutAction, event: KeyboardEvent) => void;
  isPaused?: () => boolean;
  platform?: string;
}

export interface EscapeKeyCycleGuard {
  handleKeyDown: (
    key: string,
    ownsEscape: boolean,
  ) => 'ignore' | 'initial' | 'repeat';
  handleKeyUp: (key: string) => boolean;
}

/**
 * Keeps Escape isolated for the entire physical key cycle. Selection state is
 * normally cleared on the first keydown, but browsers may emit repeated
 * keydowns before keyup; those repeats still belong to the toolbox.
 */
export const createEscapeKeyCycleGuard = (): EscapeKeyCycleGuard => {
  let isAwaitingKeyUp = false;

  return {
    handleKeyDown: (key, ownsEscape) => {
      if (key !== 'Escape' || (!ownsEscape && !isAwaitingKeyUp)) {
        return 'ignore';
      }
      const disposition = isAwaitingKeyUp ? 'repeat' : 'initial';
      isAwaitingKeyUp = true;
      return disposition;
    },
    handleKeyUp: (key) => {
      if (key !== 'Escape' || !isAwaitingKeyUp) {
        return false;
      }
      isAwaitingKeyUp = false;
      return true;
    },
  };
};

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const MODIFIER_IDENTITY_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;
const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  control: 'Ctrl',
  ctrl: 'Ctrl',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  command: 'Meta',
  cmd: 'Meta',
  meta: 'Meta',
  win: 'Meta',
  windows: 'Meta',
};
const PURE_MODIFIER_KEYS = new Set([
  'Control',
  'Ctrl',
  'Alt',
  'Option',
  'Shift',
  'Meta',
  'Command',
  'OS',
]);
const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Esc: 'Escape',
  Del: 'Delete',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
};
const SUPPORTED_SPECIAL_KEYS = new Set([
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export const getShortcutActionLabel = (
  action: AgenticReactShortcutKey,
): string => {
  switch (action) {
    case 'singleSelect':
      return 'Single select';
    case 'multiSelect':
      return 'Multi select';
    case 'toggleToolbox':
      return 'Toggle toolbox';
    case 'done':
      return 'Done';
  }
};

export const isMacPlatform = (platform = getRuntimePlatform()): boolean =>
  /mac|iphone|ipad|ipod/i.test(platform);

export const getRuntimePlatform = (): string => {
  const navigatorLike =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & {
          userAgentData?: { platform?: string };
        })
      : null;
  const navigatorValue =
    navigatorLike?.userAgentData?.platform || navigatorLike?.platform || '';
  return navigatorValue || '';
};

export const normalizeShortcutString = (
  shortcut: string,
  platform = getRuntimePlatform(),
): ShortcutNormalizationResult => {
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  let key: string | null = null;

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    if (key) {
      return {
        success: false,
        reason: 'Use one non-modifier key per shortcut.',
      };
    }
    key = normalizeKeyName(part);
  }

  if (!key || PURE_MODIFIER_KEYS.has(key)) {
    return {
      success: false,
      reason: 'Choose a key in addition to any modifiers.',
    };
  }
  if (key === 'Escape') {
    return {
      success: false,
      reason: 'Escape is reserved for cancel selection.',
    };
  }
  if (!isSupportedShortcutKey(key)) {
    return {
      success: false,
      reason: `Unsupported key: ${key}.`,
    };
  }

  return buildShortcutResult(modifiers, key, platform);
};

export const normalizeShortcutFromEvent = (
  event: KeyboardEvent,
  platform = getRuntimePlatform(),
): ShortcutNormalizationResult => {
  const key = normalizeKeyName(event.key);
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  if (event.ctrlKey && key !== 'Control') modifiers.add('Ctrl');
  if (event.altKey && key !== 'Alt') modifiers.add('Alt');
  if (event.shiftKey && key !== 'Shift') modifiers.add('Shift');
  if (event.metaKey && key !== 'Meta') modifiers.add('Meta');

  if (!key || PURE_MODIFIER_KEYS.has(key)) {
    return {
      success: false,
      reason: 'Choose a key in addition to any modifiers.',
    };
  }
  if (key === 'Escape') {
    return {
      success: false,
      reason: 'Escape is reserved for cancel selection.',
    };
  }
  if (!isSupportedShortcutKey(key)) {
    return {
      success: false,
      reason: `Unsupported key: ${key}.`,
    };
  }

  return buildShortcutResult(modifiers, key, platform);
};

export const findDuplicateShortcut = (
  shortcut: string,
  shortcuts: AgenticReactShortcutSettings,
  exceptAction?: AgenticReactShortcutKey,
  platform = getRuntimePlatform(),
): AgenticReactShortcutKey | null => {
  const normalized = normalizeShortcutString(shortcut, platform);
  if (!normalized.success) {
    return null;
  }

  for (const action of CONFIGURABLE_SHORTCUT_KEYS) {
    if (action === exceptAction) {
      continue;
    }
    const candidate = normalizeShortcutString(shortcuts[action], platform);
    if (candidate.success && candidate.identity === normalized.identity) {
      return action;
    }
  }

  return null;
};

/** Validates and canonicalizes a complete shortcut set. */
export const validateShortcutSettings = (
  shortcuts: AgenticReactShortcutSettings,
  platform = getRuntimePlatform(),
): ShortcutSettingsValidationResult => {
  const normalized = {} as AgenticReactShortcutSettings;
  const identities = new Map<string, AgenticReactShortcutKey>();

  for (const action of CONFIGURABLE_SHORTCUT_KEYS) {
    const result = normalizeShortcutString(shortcuts[action], platform);
    if (result.success === false) {
      return {
        success: false,
        reason: `${getShortcutActionLabel(action)}: ${result.reason}`,
        action,
      };
    }

    const duplicateAction = identities.get(result.identity);
    if (duplicateAction) {
      return {
        success: false,
        reason: `${result.label} is already assigned to ${getShortcutActionLabel(
          duplicateAction,
        )}.`,
        action,
        duplicateAction,
      };
    }

    identities.set(result.identity, action);
    normalized[action] = result.label;
  }

  return { success: true, shortcuts: normalized };
};

export const createShortcutDispatcher = ({
  getShortcuts,
  isActionApplicable,
  onAction,
  isPaused = () => false,
  platform = getRuntimePlatform(),
}: ShortcutDispatcherOptions) => {
  const handleKeyDown = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || isPaused()) {
      return false;
    }

    const pressed = normalizeShortcutFromEvent(event, platform);
    if (!pressed.success) {
      return false;
    }

    const shortcuts = getShortcuts();
    for (const action of CONFIGURABLE_SHORTCUT_KEYS) {
      const configured = normalizeShortcutString(shortcuts[action], platform);
      if (
        configured.success &&
        configured.identity === pressed.identity &&
        isActionApplicable(action, event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onAction(action, event);
        return true;
      }
    }

    return false;
  };

  return {
    handleKeyDown,
  };
};

const buildShortcutResult = (
  modifiers: Set<(typeof MODIFIER_ORDER)[number]>,
  key: string,
  platform: string,
): ShortcutNormalizationSuccess => {
  const orderedModifiers = MODIFIER_ORDER.filter((modifier) =>
    modifiers.has(modifier),
  );
  const labelParts = [
    ...orderedModifiers.map((modifier) => displayModifier(modifier, platform)),
    key,
  ];
  const identityParts = [
    ...MODIFIER_IDENTITY_ORDER.filter((modifier) =>
      modifiers.has(identityToModifier(modifier)),
    ),
    key.toLowerCase(),
  ];

  return {
    success: true,
    label: labelParts.join('+'),
    identity: identityParts.join('+'),
  };
};

const identityToModifier = (
  modifier: (typeof MODIFIER_IDENTITY_ORDER)[number],
): (typeof MODIFIER_ORDER)[number] => {
  switch (modifier) {
    case 'ctrl':
      return 'Ctrl';
    case 'alt':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'meta':
      return 'Meta';
  }
};

const displayModifier = (
  modifier: (typeof MODIFIER_ORDER)[number],
  platform: string,
): string => {
  if (!isMacPlatform(platform)) {
    return modifier;
  }

  if (modifier === 'Meta') return 'Command';
  if (modifier === 'Alt') return 'Option';
  return modifier;
};

const normalizeKeyName = (key: string): string => {
  const mapped = NAMED_KEYS[key] || key;
  if (/^[a-z]$/i.test(mapped)) {
    return mapped.toUpperCase();
  }
  return mapped;
};

const isSupportedShortcutKey = (key: string): boolean =>
  /^[A-Z0-9]$/.test(key) ||
  /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) ||
  SUPPORTED_SPECIAL_KEYS.has(key);
