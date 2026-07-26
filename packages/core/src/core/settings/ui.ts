import type { AgenticReactSettingsSource } from '../../shared/types.js';

export const SETTINGS_SOURCE_LABELS: Record<
  AgenticReactSettingsSource,
  string
> = {
  global: 'Global override',
  project: 'Project configuration',
  package: 'Default',
};

export const stopHostActivationEvents = (element: HTMLElement) => {
  const stopEvent = (event: Event) => {
    event.stopPropagation();
  };
  for (const eventName of [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'click',
    'touchstart',
    'touchend',
    'contextmenu',
  ]) {
    // Isolate at the toolbox boundary after descendant handlers have run. A
    // capture listener here would prevent the toolbox controls themselves from
    // receiving activation events.
    element.addEventListener(eventName, stopEvent);
  }
};

export const createSettingsSectionTitle = (text: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.textContent = text;
  element.style.fontSize = '11px';
  element.style.fontWeight = '800';
  element.style.letterSpacing = '0';
  element.style.color = '#334155';
  element.style.paddingTop = '8px';
  element.style.borderTop = '1px solid rgba(15, 23, 42, 0.08)';
  return element;
};

export const createSourceBadge = (
  source: AgenticReactSettingsSource,
): HTMLSpanElement => {
  const element = document.createElement('span');
  element.textContent = SETTINGS_SOURCE_LABELS[source];
  element.style.display = 'inline-flex';
  element.style.alignItems = 'center';
  element.style.minHeight = '20px';
  element.style.padding = '2px 6px';
  element.style.border = '1px solid rgba(15, 23, 42, 0.12)';
  element.style.borderRadius = '999px';
  element.style.background = source === 'global' ? '#ecfeff' : '#f8fafc';
  element.style.color = source === 'global' ? '#155e75' : '#475569';
  element.style.fontSize = '10px';
  element.style.fontWeight = '800';
  element.style.whiteSpace = 'nowrap';
  return element;
};

export const createSmallButton = (
  label: string,
  options: { danger?: boolean; muted?: boolean } = {},
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.style.height = '30px';
  button.style.padding = '6px 8px';
  button.style.border = '1px solid rgba(15, 23, 42, 0.14)';
  button.style.borderRadius = '8px';
  button.style.background = options.danger
    ? '#fee2e2'
    : options.muted
      ? '#f8fafc'
      : '#111827';
  button.style.color = options.danger
    ? '#991b1b'
    : options.muted
      ? '#111827'
      : '#ffffff';
  button.style.fontSize = '11px';
  button.style.fontWeight = '800';
  button.style.cursor = 'pointer';
  return button;
};

export const createKeycap = (text: string): HTMLSpanElement => {
  const element = document.createElement('span');
  element.textContent = text;
  element.style.display = 'inline-flex';
  element.style.alignItems = 'center';
  element.style.minHeight = '24px';
  element.style.maxWidth = '100%';
  element.style.padding = '3px 7px';
  element.style.border = '1px solid rgba(15, 23, 42, 0.18)';
  element.style.borderRadius = '6px';
  element.style.background = '#ffffff';
  element.style.color = '#111827';
  element.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace';
  element.style.fontSize = '11px';
  element.style.fontWeight = '800';
  element.style.overflow = 'hidden';
  element.style.textOverflow = 'ellipsis';
  element.style.whiteSpace = 'nowrap';
  return element;
};

export const setDisabled = (element: HTMLButtonElement, disabled: boolean) => {
  element.disabled = disabled;
  element.style.opacity = disabled ? '0.48' : '1';
  element.style.cursor = disabled ? 'not-allowed' : 'pointer';
};
