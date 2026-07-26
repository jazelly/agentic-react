import { __AGENTIC_REACT_CONFIG__, target } from '../../shared/const.js';
import { DEFAULT_TOOLKIT_ICON_DATA_URL } from '../../shared/default_toolkit_icon.js';
import { SOURCE_LOOKUP_PATH } from '../../shared/protocol.js';
import {
  buildSelectionSourcePreview,
  buildWebContextText,
} from '../../shared/selection_context_format.js';
import {
  buildBrowserSourceCandidates,
  isAllowedProjectSourcePath,
  normalizeSourceRoot,
  toAbsoluteSourcePath,
} from '../../shared/source_path.js';
import type {
  AgenticReactSettingsClient,
  AgenticReactSettingsSnapshot,
  AgenticReactShortcutKey,
  SelectionContext,
  SelectionResolvedSource,
  ToolkitConfig,
  ToolkitPosition,
  ToolkitTuningModalStyle,
  ToolkitTuningModalStyleSlot,
  TuningModalActions,
  TuningModalContext,
  TuningModalExtension,
  TuningModalExtensionCleanup,
} from '../../shared/types.js';
import { openToolboxIconCropper } from '../settings/icon_modal.js';
import {
  CONFIGURABLE_SHORTCUT_KEYS,
  LOCKED_ESCAPE_SHORTCUT,
  createEscapeKeyCycleGuard,
  createShortcutDispatcher,
  findDuplicateShortcut,
  getShortcutActionLabel,
  normalizeShortcutFromEvent,
  normalizeShortcutString,
} from '../settings/shortcuts.js';
import {
  createKeycap,
  createSettingsSectionTitle,
  createSmallButton,
  createSourceBadge,
  setDisabled,
  stopHostActivationEvents,
} from '../settings/ui.js';
import {
  buildSelectionContextForElement,
  getSelectionElementComponentName,
} from './selection_context.js';
import {
  clearSelectableElementCache,
  getSelectableElementAtPosition,
} from './selection_dom.js';

interface ToolkitRuntimeOptions {
  initialConfig?: ToolkitConfig;
  settingsClient?: AgenticReactSettingsClient;
}

interface ToolkitRuntimeResult {
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
}

const DEFAULT_TOOLKIT_CONFIG: Required<Omit<ToolkitConfig, 'iconUrl'>> & {
  iconUrl: string | null;
} = {
  enabled: true,
  defaultVisible: true,
  defaultExpanded: false,
  position: 'bottom-right',
  offset: {
    x: 20,
    y: 20,
  },
  accentColor: '#111827',
  zIndex: 2147483000,
  iconUrl: DEFAULT_TOOLKIT_ICON_DATA_URL,
  tuningModal: {},
};

const DEFAULT_SNIPPET_CONTEXT_LINES = 8;
const DEFAULT_MAX_SNIPPET_FILES = 3;
const LAUNCHER_SIZE = 58;
const SELECTION_CONFIRMATION_MS = 1100;
const SELECTION_STYLE_ID = 'agentic-react-selection-styles';
const CONTRAST_LIGHT = 'rgba(255, 255, 255, 0.98)';
const CONTRAST_DARK = 'rgba(15, 23, 42, 0.98)';
const SELECTED_LABEL_MAX_LENGTH = 96;
const TUNING_PANEL_MARGIN = 12;
const TUNING_PANEL_GAP = 8;
const TUNING_FONT_WEIGHT_OPTIONS = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
];
const TUNING_FONT_FAMILY_OPTIONS = [
  'inherit',
  'system-ui',
  'Inter',
  'Arial',
  'Georgia',
  'Times New Roman',
  'monospace',
];
const TUNING_DISPLAY_OPTIONS = [
  'block',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
];
const TUNING_FLEX_DIRECTION_OPTIONS = [
  'row',
  'row-reverse',
  'column',
  'column-reverse',
];
const TUNING_JUSTIFY_OPTIONS = [
  'flex-start',
  'center',
  'flex-end',
  'space-between',
  'space-around',
  'space-evenly',
];
const TUNING_ALIGN_OPTIONS = [
  'stretch',
  'flex-start',
  'center',
  'flex-end',
  'baseline',
];

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface OverlayActionElements {
  actionsElement: HTMLDivElement;
  tuneButtonElement: HTMLButtonElement;
  deleteButtonElement: HTMLButtonElement;
}

interface TuningSession {
  anchorElement: HTMLElement;
  element: Element;
  selectionContext: SelectionContext;
  setSelectionContext: (selectionContext: SelectionContext) => void;
}

const mergeToolkitConfig = (
  config: ToolkitConfig | undefined,
  nextConfig: Partial<ToolkitConfig> | undefined,
): Required<Omit<ToolkitConfig, 'iconUrl'>> & { iconUrl: string | null } => {
  const baseConfig = {
    ...DEFAULT_TOOLKIT_CONFIG,
    ...(config || {}),
    iconUrl:
      config?.iconUrl !== undefined
        ? config.iconUrl
        : DEFAULT_TOOLKIT_CONFIG.iconUrl,
  };

  if (!nextConfig) {
    return {
      ...baseConfig,
      offset: {
        ...DEFAULT_TOOLKIT_CONFIG.offset,
        ...(baseConfig.offset || {}),
      },
      tuningModal: {
        ...DEFAULT_TOOLKIT_CONFIG.tuningModal,
        ...(baseConfig.tuningModal || {}),
        classNames: {
          ...(baseConfig.tuningModal?.classNames || {}),
        },
        styles: {
          ...(baseConfig.tuningModal?.styles || {}),
        },
        tokens: {
          ...(baseConfig.tuningModal?.tokens || {}),
        },
      },
    };
  }

  return {
    ...baseConfig,
    ...nextConfig,
    iconUrl:
      nextConfig.iconUrl !== undefined
        ? nextConfig.iconUrl
        : baseConfig.iconUrl,
    offset: {
      ...DEFAULT_TOOLKIT_CONFIG.offset,
      ...(baseConfig.offset || {}),
      ...(nextConfig.offset || {}),
    },
    tuningModal: {
      ...DEFAULT_TOOLKIT_CONFIG.tuningModal,
      ...(baseConfig.tuningModal || {}),
      ...(nextConfig.tuningModal || {}),
      classNames: {
        ...(baseConfig.tuningModal?.classNames || {}),
        ...(nextConfig.tuningModal?.classNames || {}),
      },
      styles: {
        ...(baseConfig.tuningModal?.styles || {}),
        ...(nextConfig.tuningModal?.styles || {}),
      },
      tokens: {
        ...(baseConfig.tuningModal?.tokens || {}),
        ...(nextConfig.tuningModal?.tokens || {}),
      },
    },
  };
};

const setPosition = (
  element: HTMLElement,
  position: ToolkitPosition,
  xOffset: number,
  yOffset: number,
) => {
  element.style.top = '';
  element.style.right = '';
  element.style.bottom = '';
  element.style.left = '';

  if (position === 'top-left') {
    element.style.top = `${yOffset}px`;
    element.style.left = `${xOffset}px`;
    return;
  }

  if (position === 'top-right') {
    element.style.top = `${yOffset}px`;
    element.style.right = `${xOffset}px`;
    return;
  }

  if (position === 'bottom-left') {
    element.style.bottom = `${yOffset}px`;
    element.style.left = `${xOffset}px`;
    return;
  }

  element.style.bottom = `${yOffset}px`;
  element.style.right = `${xOffset}px`;
};

const toKebabCase = (value: string): string =>
  value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const getTuningTokenName = (tokenName: string): string =>
  `--agentic-react-tuning-${toKebabCase(tokenName)}`;

const applyStyleDeclaration = (
  element: HTMLElement,
  styleDeclaration: ToolkitTuningModalStyle | undefined,
) => {
  if (!styleDeclaration) return;

  for (const [propertyName, propertyValue] of Object.entries(
    styleDeclaration,
  )) {
    if (propertyName.startsWith('--') || propertyName.includes('-')) {
      element.style.setProperty(propertyName, String(propertyValue));
    } else {
      (element.style as CSSStyleDeclaration & Record<string, string>)[
        propertyName
      ] = String(propertyValue);
    }
  }
};

const parseCssColor = (color: string): RgbaColor | null => {
  const normalizedColor = color.trim().toLowerCase();
  if (
    !normalizedColor ||
    normalizedColor === 'transparent' ||
    normalizedColor === 'currentcolor'
  ) {
    return null;
  }

  const colorMatch = normalizedColor.match(/^rgba?\((.+)\)$/);
  if (!colorMatch) {
    return null;
  }

  const colorParts = colorMatch[1]
    .replace(/\s*\/\s*/, ' ')
    .split(/[,\s]+/)
    .filter(Boolean);

  if (colorParts.length < 3) {
    return null;
  }

  const parseChannel = (channel: string): number | null => {
    if (channel.endsWith('%')) {
      const percentValue = Number.parseFloat(channel);
      return Number.isFinite(percentValue)
        ? Math.round((Math.max(0, Math.min(100, percentValue)) / 100) * 255)
        : null;
    }

    const value = Number.parseFloat(channel);
    return Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : null;
  };

  const parseAlpha = (alpha: string | undefined): number => {
    if (!alpha) return 1;

    if (alpha.endsWith('%')) {
      const percentValue = Number.parseFloat(alpha);
      return Number.isFinite(percentValue)
        ? Math.max(0, Math.min(1, percentValue / 100))
        : 1;
    }

    const value = Number.parseFloat(alpha);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  };

  const r = parseChannel(colorParts[0]);
  const g = parseChannel(colorParts[1]);
  const b = parseChannel(colorParts[2]);

  if (r === null || g === null || b === null) {
    return null;
  }

  return {
    r,
    g,
    b,
    a: parseAlpha(colorParts[3]),
  };
};

const getRelativeLuminance = ({ r, g, b }: RgbaColor): number => {
  const toLinearChannel = (channel: number): number => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  );
};

const getEffectiveBackgroundColor = (element: Element): RgbaColor | null => {
  let currentElement: Element | null = element;

  while (currentElement) {
    const computedStyle = window.getComputedStyle(currentElement);
    const backgroundColor = parseCssColor(computedStyle.backgroundColor);
    if (backgroundColor && backgroundColor.a > 0.05) {
      return backgroundColor;
    }

    currentElement = currentElement.parentElement;
  }

  return parseCssColor(window.getComputedStyle(document.body).backgroundColor);
};

const applyHoverContrastForElement = (
  hoverElement: HTMLElement,
  element: Element,
) => {
  const backgroundColor = getEffectiveBackgroundColor(element);
  const isDarkSurface = backgroundColor
    ? getRelativeLuminance(backgroundColor) < 0.46
    : false;

  hoverElement.style.setProperty(
    '--agentic-react-hover-inner',
    isDarkSurface ? CONTRAST_LIGHT : CONTRAST_DARK,
  );
  hoverElement.style.setProperty(
    '--agentic-react-hover-outer',
    isDarkSurface ? CONTRAST_DARK : CONTRAST_LIGHT,
  );
  hoverElement.style.setProperty(
    '--agentic-react-hover-fill',
    isDarkSurface ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.08)',
  );
};

const normalizeElementLabel = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
};

const truncateElementLabel = (
  value: string,
  maxLength = SELECTED_LABEL_MAX_LENGTH,
): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
};

const getLabelledByText = (element: Element): string => {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) return '';

  const labelText = labelledBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent)
    .filter(Boolean)
    .join(' ');
  return normalizeElementLabel(labelText);
};

const getAssociatedFormLabelText = (element: Element): string => {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    const labels = Array.from(element.labels ?? []);
    return normalizeElementLabel(
      labels.map((labelElement) => labelElement.textContent).join(' '),
    );
  }

  return '';
};

const getMeaningfulVisibleText = (element: Element): string => {
  const textContent = normalizeElementLabel(element.textContent);
  if (!textContent) return '';

  const repeatedWhitespaceText = textContent.replace(/\s+/g, '');
  if (repeatedWhitespaceText.length < 2) return '';
  return textContent;
};

const formatDomElementLabel = (element: Element, label: string): string => {
  const tagName = element.tagName.toLowerCase();
  if (!label) return tagName;

  if (/^(button|a|input|select|textarea|img)$/i.test(tagName)) {
    return `${tagName}: ${label}`;
  }

  return label;
};

const formatSourceLocationLabel = (
  selectionContext?: SelectionContext | null,
): string => {
  const source =
    selectionContext?.resolvedSources[0] ??
    selectionContext?.externalComponent?.usedBy ??
    selectionContext?.sourceTrace.find((frame) => frame.kind === 'project');
  if (!source?.filePath) return '';

  const fileName = source.filePath.split('/').pop() || source.filePath;
  return source.lineNumber ? `${fileName}:${source.lineNumber}` : fileName;
};

const formatComponentLocationLabel = (
  componentName?: string | null,
  sourceLocationLabel?: string | null,
): string => {
  if (!componentName) return sourceLocationLabel || '';

  const componentLabel = `<${componentName}>`;
  return sourceLocationLabel
    ? `${componentLabel} in ${sourceLocationLabel}`
    : componentLabel;
};

const buildTuningTargetLabel = (selectionContext: SelectionContext): string =>
  formatComponentLocationLabel(
    selectionContext.componentName ||
      selectionContext.externalComponent?.componentName,
    formatSourceLocationLabel(selectionContext),
  ) ||
  selectionContext.selector ||
  'the selected element';

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const rgbStringToHex = (colorValue: string): string => {
  const match = colorValue.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!match) return '#111827';

  return `#${[match[1], match[2], match[3]]
    .map((part) =>
      clampNumber(Number(part), 0, 255).toString(16).padStart(2, '0'),
    )
    .join('')}`;
};

const hexToRgbString = (hexValue: string): string => {
  const normalizedHex = hexValue.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(normalizedHex)) return 'rgb(17, 24, 39)';

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  return `rgb(${red}, ${green}, ${blue})`;
};

const formatAlpha = (alphaValue: number): string =>
  Number(alphaValue.toFixed(2)).toString();

const formatRgbaColor = ({ r, g, b, a }: RgbaColor): string =>
  `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;

const cssColorToRgbaString = (
  colorValue: string,
  fallbackColor: RgbaColor = { r: 0, g: 0, b: 0, a: 0 },
): string => formatRgbaColor(parseCssColor(colorValue) || fallbackColor);

const hexToRgbaString = (hexValue: string): string => {
  const rgbColor = parseCssColor(hexToRgbString(hexValue));
  return rgbColor ? formatRgbaColor(rgbColor) : 'rgba(17, 24, 39, 1)';
};

const hasTuneableText = (element: Element): boolean => {
  const tagName = element.tagName.toLowerCase();
  if (
    /^(a|button|input|label|legend|option|p|span|strong|em|small|textarea|h[1-6])$/.test(
      tagName,
    )
  ) {
    return true;
  }

  if (getMeaningfulVisibleText(element)) {
    return true;
  }

  return Array.from(element.children).some((childElement) =>
    hasTuneableText(childElement),
  );
};

const hasTuneableLayout = (
  element: Element,
  computedStyle: CSSStyleDeclaration,
) => {
  const tagName = element.tagName.toLowerCase();
  if (/^(flex|inline-flex|grid|inline-grid)$/.test(computedStyle.display)) {
    return true;
  }

  if (
    /^(article|aside|body|div|fieldset|footer|form|header|label|li|main|nav|ol|section|table|tbody|td|tfoot|th|thead|tr|ul)$/.test(
      tagName,
    )
  ) {
    return true;
  }

  return element.children.length > 0;
};

const normalizeCssNumber = (value: string, fallbackValue: number): number => {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
};

const buildSelectedElementLabel = (
  element: Element,
  selectionContext?: SelectionContext | null,
  componentNameOverride?: string | null,
): string => {
  const componentName =
    componentNameOverride ||
    selectionContext?.componentName ||
    selectionContext?.externalComponent?.componentName;
  const sourceLocationLabel = formatSourceLocationLabel(selectionContext);
  const componentLocationLabel = formatComponentLocationLabel(
    componentName,
    sourceLocationLabel,
  );

  const labelCandidates = [
    componentLocationLabel,
    element.getAttribute('aria-label'),
    getLabelledByText(element),
    getAssociatedFormLabelText(element),
    element.getAttribute('alt'),
    element.getAttribute('title'),
    element.getAttribute('placeholder'),
    element.getAttribute('name'),
    element.id ? `#${element.id}` : '',
  ];

  for (const labelCandidate of labelCandidates) {
    const normalizedLabel = normalizeElementLabel(labelCandidate);
    if (!normalizedLabel) continue;

    if (normalizedLabel === componentLocationLabel) {
      return truncateElementLabel(normalizedLabel);
    }

    return truncateElementLabel(
      formatDomElementLabel(element, normalizedLabel),
    );
  }

  if (sourceLocationLabel) {
    return truncateElementLabel(sourceLocationLabel);
  }

  const visibleTextLabel = getMeaningfulVisibleText(element);
  if (visibleTextLabel) {
    return truncateElementLabel(
      formatDomElementLabel(element, visibleTextLabel),
    );
  }

  return truncateElementLabel(
    sourceLocationLabel || element.tagName.toLowerCase(),
  );
};

const getSourceRoot = (): string | undefined =>
  target[__AGENTIC_REACT_CONFIG__]?.sourceRoot;

const toTextContext = (selectionContext: SelectionContext): string =>
  buildWebContextText(selectionContext, {
    sourceRoot: getSourceRoot(),
  });

const copyText = async (text: string): Promise<boolean> => {
  if (target.navigator?.clipboard?.writeText) {
    try {
      await target.navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // fallback below
    }
  }

  try {
    const textAreaElement = document.createElement('textarea');
    textAreaElement.value = text;
    textAreaElement.style.position = 'fixed';
    textAreaElement.style.left = '-9999px';
    document.body.appendChild(textAreaElement);
    textAreaElement.select();
    const didCopy = document.execCommand('copy');
    textAreaElement.remove();
    return didCopy;
  } catch (_error) {
    return false;
  }
};

const preloadImage = (url: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image could not be loaded.'));
    image.decoding = 'async';
    image.src = url;
  });

const createOverlayIconButton = (
  label: string,
  iconPathMarkup: string,
): HTMLButtonElement => {
  const buttonElement = document.createElement('button');
  const iconElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg',
  );

  buttonElement.setAttribute('type', 'button');
  buttonElement.setAttribute('aria-label', label);
  buttonElement.setAttribute('title', label);
  buttonElement.style.width = '24px';
  buttonElement.style.height = '24px';
  buttonElement.style.border = '1px solid rgba(255, 255, 255, 0.86)';
  buttonElement.style.borderRadius = '6px';
  buttonElement.style.background = 'rgba(15, 23, 42, 0.96)';
  buttonElement.style.color = '#ffffff';
  buttonElement.style.display = 'inline-flex';
  buttonElement.style.alignItems = 'center';
  buttonElement.style.justifyContent = 'center';
  buttonElement.style.padding = '0';
  buttonElement.style.cursor = 'pointer';
  buttonElement.style.pointerEvents = 'auto';

  iconElement.setAttribute('viewBox', '0 0 24 24');
  iconElement.setAttribute('width', '14');
  iconElement.setAttribute('height', '14');
  iconElement.setAttribute('fill', 'none');
  iconElement.setAttribute('stroke', 'currentColor');
  iconElement.setAttribute('stroke-width', '2');
  iconElement.setAttribute('stroke-linecap', 'round');
  iconElement.setAttribute('stroke-linejoin', 'round');
  iconElement.setAttribute('aria-hidden', 'true');
  iconElement.innerHTML = iconPathMarkup;
  buttonElement.appendChild(iconElement);

  return buttonElement;
};

const createOverlayActions = (): OverlayActionElements => {
  const actionsElement = document.createElement('div');
  const tuneButtonElement = createOverlayIconButton(
    'Adjust selection',
    '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
  );
  const deleteButtonElement = createOverlayIconButton(
    'Delete selection',
    '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
  );

  actionsElement.setAttribute('data-agentic-react-selected-actions', 'true');
  actionsElement.style.position = 'absolute';
  actionsElement.style.pointerEvents = 'auto';
  actionsElement.style.display = 'inline-flex';
  actionsElement.style.gap = '4px';
  actionsElement.style.alignItems = 'center';

  actionsElement.appendChild(tuneButtonElement);
  actionsElement.appendChild(deleteButtonElement);

  return {
    actionsElement,
    tuneButtonElement,
    deleteButtonElement,
  };
};

const getNormalizedSourceRoot = (): string =>
  normalizeSourceRoot(getSourceRoot());

const extractRawSourceFromViteModule = (moduleText: string): string | null => {
  const trimmedText = moduleText.trim();
  const defaultExportMatch = trimmedText.match(
    /^export\s+default\s+((?:"(?:\\.|[^"])*")|(?:'(?:\\.|[^'])*'));\s*(?:\/\/# sourceMappingURL=[\s\S]*)?$/,
  );

  if (!defaultExportMatch) {
    return null;
  }

  const exportedValueText = defaultExportMatch[1]?.trim();
  if (!exportedValueText) {
    return null;
  }

  if (
    (exportedValueText.startsWith('"') && exportedValueText.endsWith('"')) ||
    (exportedValueText.startsWith("'") && exportedValueText.endsWith("'"))
  ) {
    try {
      const normalizedQuotedText = exportedValueText.startsWith("'")
        ? `"${exportedValueText
            .slice(1, -1)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')}"`
        : exportedValueText;
      return JSON.parse(normalizedQuotedText);
    } catch (_error) {
      return null;
    }
  }

  return null;
};

const normalizeSourceTextFromViteResponse = (
  responseText: string,
): string | null => {
  const rawSource = extractRawSourceFromViteModule(responseText);
  if (rawSource) {
    return rawSource;
  }

  if (responseText.includes('/node_modules/.vite/deps/')) {
    return null;
  }

  return responseText;
};

const placeResolvedSourceFirst = (
  resolvedSources: SelectionResolvedSource[],
  preferredSource: SelectionResolvedSource,
): SelectionResolvedSource[] => [
  preferredSource,
  ...resolvedSources.filter(
    (source) =>
      source.filePath !== preferredSource.filePath ||
      source.componentName !== preferredSource.componentName,
  ),
];

const enrichSelectionContextSourceLocation = async (
  selectionContext: SelectionContext,
): Promise<SelectionContext> => {
  if (!selectionContext.componentName || !selectionContext.selector) {
    return selectionContext;
  }

  try {
    const lookupUrl = new URL(SOURCE_LOOKUP_PATH, window.location.origin);
    lookupUrl.searchParams.set('component', selectionContext.componentName);
    lookupUrl.searchParams.set('selector', selectionContext.selector);
    const response = await fetch(lookupUrl, { cache: 'no-store' });
    if (!response.ok) {
      return selectionContext;
    }

    const source = (await response.json()) as SelectionResolvedSource;
    if (!source.filePath || !source.componentName) {
      return selectionContext;
    }

    const nextSelectionContext = {
      ...selectionContext,
      externalComponent: selectionContext.externalComponent
        ? {
            ...selectionContext.externalComponent,
            usedBy: source,
          }
        : null,
      resolvedSources: placeResolvedSourceFirst(
        selectionContext.resolvedSources,
        source,
      ),
    };

    return {
      ...nextSelectionContext,
      sourcePreview: buildSelectionSourcePreview(nextSelectionContext),
    };
  } catch (_error) {
    return selectionContext;
  }
};

const buildSourceSnippet = (
  sourceText: string,
  lineNumber: number,
  contextLines: number,
): { startLine: number; endLine: number; snippet: string } | null => {
  const lines = sourceText.split(/\r?\n/);
  if (lines.length === 0) {
    return null;
  }

  const safeLineNumber = Math.max(1, Math.min(lineNumber, lines.length));
  const startLine = Math.max(1, safeLineNumber - contextLines);
  const endLine = Math.min(lines.length, safeLineNumber + contextLines);
  const snippet = lines
    .slice(startLine - 1, endLine)
    .join('\n')
    .trim();

  if (!snippet) {
    return null;
  }

  return {
    startLine,
    endLine,
    snippet,
  };
};

export const createSelectionToolkit = (
  options: ToolkitRuntimeOptions = {},
): ToolkitRuntimeResult => {
  const settingsClient = options.settingsClient;
  let settingsSnapshot: AgenticReactSettingsSnapshot | null =
    settingsClient?.getCachedSnapshot() || null;
  let toolkitConfig = mergeToolkitConfig(options.initialConfig, undefined);
  let isToolkitVisible = toolkitConfig.defaultVisible && toolkitConfig.enabled;
  let isPanelOpen = toolkitConfig.defaultExpanded;
  let isSettingsSectionOpen = false;
  let isSelectionMode = false;
  let isMultiSelectionMode = false;
  let pendingSingleSelectionContext: SelectionContext | null = null;
  let lastSelectionContext: SelectionContext | null = null;
  let multiSelectionContexts: SelectionContext[] = [];
  let recordingShortcutAction: AgenticReactShortcutKey | null = null;
  let selectionSessionId = 0;
  const escapeKeyCycleGuard = createEscapeKeyCycleGuard();

  const toolkitRootElement = document.createElement('div');
  const launcherButtonElement = document.createElement('button');
  const launcherIconElement = document.createElement('img');

  const panelElement = document.createElement('div');
  const selectButtonElement = document.createElement('button');
  const multiselectButtonElement = document.createElement('button');
  const doneButtonElement = document.createElement('button');
  const settingsButtonElement = document.createElement('button');
  const settingsSectionElement = document.createElement('div');
  const shortcutsSectionElement = document.createElement('div');
  const appearanceSectionElement = document.createElement('div');
  const iconPreviewElement = document.createElement('img');
  const iconFileInputElement = document.createElement('input');
  const iconChangeButtonElement = createSmallButton('Change', { muted: true });
  const iconResetButtonElement = createSmallButton('Reset', { muted: true });
  const clearAllButtonElement = document.createElement('button');
  const clearAllIconElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg',
  );
  const clearAllLabelElement = document.createElement('span');
  const statusElement = document.createElement('div');
  const hoverElement = document.createElement('div');
  const hoverLabelElement = document.createElement('div');
  const selectedElement = document.createElement('div');
  const selectedLabelElement = document.createElement('div');
  const selectedActions = createOverlayActions();
  const tuningModalElement = document.createElement('div');
  const tuningSurfaceElement = document.createElement('div');
  const tuningPanelElement = document.createElement('div');
  const tuningArrowElement = document.createElement('div');
  const tuningTitleElement = document.createElement('div');
  const tuningBodyElement = document.createElement('div');
  const tuningCloseButtonElement = document.createElement('button');
  const dimElements = Array.from({ length: 4 }, () =>
    document.createElement('div'),
  );
  let selectedTargetElement: Element | null = null;
  let dimTargetElement: Element | null = null;
  let hoverLabelTargetElement: Element | null = null;
  let hoverLabelRequestId = 0;
  let dimHideTimeout: number | null = null;
  let selectedPulseTimeout: number | null = null;
  let activeTuningSession: TuningSession | null = null;
  let tuningModalExtensions: TuningModalExtension[] = [];
  const tuningExtensionCleanups: Array<() => void> = [];
  let multiSelectedOverlays: Array<{
    element: Element;
    overlayElement: HTMLDivElement;
    labelElement: HTMLDivElement;
    actions: OverlayActionElements;
    selectionContext: SelectionContext;
    pulseTimeout: number | null;
  }> = [];

  toolkitRootElement.setAttribute('data-agentic-react-toolkit', 'true');
  toolkitRootElement.style.position = 'fixed';
  toolkitRootElement.style.display = 'flex';
  toolkitRootElement.style.flexDirection = 'column';
  toolkitRootElement.style.alignItems = 'flex-end';
  toolkitRootElement.style.gap = '10px';
  toolkitRootElement.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  toolkitRootElement.style.pointerEvents = 'auto';

  launcherButtonElement.setAttribute('type', 'button');
  launcherButtonElement.setAttribute(
    'aria-label',
    'Open Agentic React toolkit',
  );
  launcherButtonElement.setAttribute('data-agentic-react-launcher', 'true');
  launcherButtonElement.style.width = `${LAUNCHER_SIZE}px`;
  launcherButtonElement.style.height = `${LAUNCHER_SIZE}px`;
  launcherButtonElement.style.borderRadius = '999px';
  launcherButtonElement.style.border = 'none';
  launcherButtonElement.style.background = 'transparent';
  launcherButtonElement.style.boxShadow =
    'var(--agentic-react-launcher-shadow)';
  launcherButtonElement.style.cursor = 'pointer';
  launcherButtonElement.style.display = 'flex';
  launcherButtonElement.style.alignItems = 'center';
  launcherButtonElement.style.justifyContent = 'center';
  launcherButtonElement.style.padding = '0';
  launcherButtonElement.style.overflow = 'hidden';
  launcherButtonElement.style.transition =
    'transform 140ms ease, box-shadow 140ms ease, filter 140ms ease, background-color 140ms ease';
  launcherButtonElement.style.willChange = 'transform, box-shadow, filter';

  launcherIconElement.style.width = '100%';
  launcherIconElement.style.height = '100%';
  launcherIconElement.style.objectFit = 'cover';
  launcherIconElement.style.display = 'block';

  launcherButtonElement.appendChild(launcherIconElement);

  panelElement.style.display = 'none';
  panelElement.style.flexDirection = 'column';
  panelElement.style.gap = '8px';
  panelElement.style.background = 'rgba(255,255,255,0.96)';
  panelElement.style.border = '1px solid rgba(0,0,0,0.12)';
  panelElement.style.borderRadius = '10px';
  panelElement.style.padding = '10px';
  panelElement.style.minWidth = '206px';
  panelElement.style.maxWidth = '280px';
  panelElement.style.boxShadow = '0 16px 35px rgba(15, 23, 42, 0.26)';

  const createButton = (buttonElement: HTMLButtonElement, label: string) => {
    buttonElement.textContent = label;
    buttonElement.style.padding = '8px 12px';
    buttonElement.style.borderRadius = '8px';
    buttonElement.style.border = '1px solid rgba(255,255,255,0.2)';
    buttonElement.style.background = toolkitConfig.accentColor;
    buttonElement.style.color = '#ffffff';
    buttonElement.style.fontSize = '12px';
    buttonElement.style.fontWeight = '600';
    buttonElement.style.cursor = 'pointer';
    buttonElement.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    buttonElement.style.minWidth = '96px';
  };

  const createTrashIconButton = () => {
    clearAllButtonElement.setAttribute('type', 'button');
    clearAllButtonElement.setAttribute('aria-label', 'Clear all selections');
    clearAllButtonElement.setAttribute('title', 'Clear all selections');
    clearAllButtonElement.setAttribute('data-agentic-react-clear-all', 'true');
    clearAllButtonElement.style.padding = '8px 12px';
    clearAllButtonElement.style.borderRadius = '8px';
    clearAllButtonElement.style.border = '1px solid rgba(255,255,255,0.2)';
    clearAllButtonElement.style.background = '#334155';
    clearAllButtonElement.style.color = '#ffffff';
    clearAllButtonElement.style.cursor = 'pointer';
    clearAllButtonElement.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    clearAllButtonElement.style.minWidth = '96px';
    clearAllButtonElement.style.height = '34px';
    clearAllButtonElement.style.display = 'none';
    clearAllButtonElement.style.alignItems = 'center';
    clearAllButtonElement.style.justifyContent = 'center';
    clearAllButtonElement.style.gap = '6px';
    clearAllButtonElement.style.fontSize = '12px';
    clearAllButtonElement.style.fontWeight = '600';

    clearAllIconElement.setAttribute('viewBox', '0 0 24 24');
    clearAllIconElement.setAttribute('width', '16');
    clearAllIconElement.setAttribute('height', '16');
    clearAllIconElement.setAttribute('fill', 'none');
    clearAllIconElement.setAttribute('stroke', 'currentColor');
    clearAllIconElement.setAttribute('stroke-width', '2');
    clearAllIconElement.setAttribute('stroke-linecap', 'round');
    clearAllIconElement.setAttribute('stroke-linejoin', 'round');
    clearAllIconElement.setAttribute('aria-hidden', 'true');
    clearAllIconElement.innerHTML =
      '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>';

    clearAllLabelElement.textContent = 'Clear all';
    clearAllLabelElement.style.lineHeight = '1';
    clearAllLabelElement.style.whiteSpace = 'nowrap';

    clearAllButtonElement.appendChild(clearAllIconElement);
    clearAllButtonElement.appendChild(clearAllLabelElement);
  };

  createButton(selectButtonElement, 'Select');
  createButton(multiselectButtonElement, 'Multiselect');
  createButton(doneButtonElement, 'Done');
  createButton(settingsButtonElement, 'Settings');
  createTrashIconButton();

  doneButtonElement.style.background = '#dc2626';
  doneButtonElement.style.color = '#ffffff';
  doneButtonElement.style.display = 'none';
  settingsButtonElement.setAttribute('aria-expanded', 'false');
  settingsButtonElement.setAttribute('aria-controls', 'agentic-react-settings');
  settingsButtonElement.style.background = '#334155';
  settingsButtonElement.style.color = '#ffffff';

  settingsSectionElement.id = 'agentic-react-settings';
  settingsSectionElement.setAttribute('data-agentic-react-settings', 'true');
  settingsSectionElement.style.display = 'none';
  settingsSectionElement.style.flexDirection = 'column';
  settingsSectionElement.style.gap = '10px';
  settingsSectionElement.style.paddingTop = '2px';

  shortcutsSectionElement.style.display = 'flex';
  shortcutsSectionElement.style.flexDirection = 'column';
  shortcutsSectionElement.style.gap = '8px';
  appearanceSectionElement.style.display = 'flex';
  appearanceSectionElement.style.flexDirection = 'column';
  appearanceSectionElement.style.gap = '8px';

  iconPreviewElement.alt = 'Current toolbox icon';
  iconPreviewElement.style.width = `${LAUNCHER_SIZE}px`;
  iconPreviewElement.style.height = `${LAUNCHER_SIZE}px`;
  iconPreviewElement.style.borderRadius = '999px';
  iconPreviewElement.style.objectFit = 'cover';
  iconPreviewElement.style.boxShadow = '0 0 0 1px rgba(15, 23, 42, 0.16)';

  iconFileInputElement.type = 'file';
  iconFileInputElement.accept = 'image/png,image/jpeg,image/webp,image/gif';
  iconFileInputElement.style.display = 'none';

  statusElement.style.fontSize = '11px';
  statusElement.style.color = '#111827';
  statusElement.style.background = 'rgba(255, 255, 255, 0.95)';
  statusElement.style.border = '1px solid rgba(0,0,0,0.1)';
  statusElement.style.borderRadius = '8px';
  statusElement.style.padding = '6px 8px';
  statusElement.style.maxWidth = '280px';
  statusElement.style.display = 'none';

  panelElement.appendChild(selectButtonElement);
  panelElement.appendChild(multiselectButtonElement);
  panelElement.appendChild(doneButtonElement);
  panelElement.appendChild(clearAllButtonElement);
  panelElement.appendChild(settingsButtonElement);
  settingsSectionElement.appendChild(shortcutsSectionElement);
  settingsSectionElement.appendChild(appearanceSectionElement);
  panelElement.appendChild(settingsSectionElement);
  panelElement.appendChild(iconFileInputElement);
  panelElement.appendChild(statusElement);

  toolkitRootElement.appendChild(panelElement);
  toolkitRootElement.appendChild(launcherButtonElement);

  hoverElement.setAttribute('data-agentic-react-hover', 'true');
  hoverElement.style.position = 'fixed';
  hoverElement.style.pointerEvents = 'none';
  hoverElement.style.display = 'none';
  hoverElement.style.setProperty('--agentic-react-hover-inner', CONTRAST_DARK);
  hoverElement.style.setProperty('--agentic-react-hover-outer', CONTRAST_LIGHT);
  hoverElement.style.setProperty(
    '--agentic-react-hover-fill',
    'rgba(15, 23, 42, 0.08)',
  );
  hoverElement.appendChild(hoverLabelElement);

  hoverLabelElement.setAttribute('data-agentic-react-hover-label', 'true');
  hoverLabelElement.style.position = 'absolute';
  hoverLabelElement.style.pointerEvents = 'none';
  hoverLabelElement.style.maxWidth = 'min(420px, calc(100vw - 24px))';
  hoverLabelElement.style.overflow = 'hidden';
  hoverLabelElement.style.textOverflow = 'ellipsis';
  hoverLabelElement.style.whiteSpace = 'nowrap';

  selectedElement.setAttribute('data-agentic-react-selected', 'true');
  selectedElement.style.position = 'fixed';
  selectedElement.style.pointerEvents = 'none';
  selectedElement.style.display = 'none';
  selectedElement.style.background = 'transparent';
  selectedElement.appendChild(selectedLabelElement);
  selectedElement.appendChild(selectedActions.actionsElement);

  selectedLabelElement.setAttribute(
    'data-agentic-react-selected-label',
    'true',
  );
  selectedLabelElement.style.position = 'absolute';
  selectedLabelElement.style.pointerEvents = 'none';
  selectedLabelElement.style.maxWidth = 'min(260px, calc(100vw - 24px))';
  selectedLabelElement.style.overflow = 'hidden';
  selectedLabelElement.style.textOverflow = 'ellipsis';
  selectedLabelElement.style.whiteSpace = 'nowrap';

  tuningModalElement.setAttribute('data-agentic-react-tuning-modal', 'true');
  tuningModalElement.style.position = 'fixed';
  tuningModalElement.style.inset = '0';
  tuningModalElement.style.display = 'none';
  tuningModalElement.style.background = 'transparent';
  tuningModalElement.style.pointerEvents = 'auto';

  tuningSurfaceElement.setAttribute(
    'data-agentic-react-tuning-surface',
    'true',
  );
  tuningSurfaceElement.style.position = 'fixed';
  tuningSurfaceElement.style.pointerEvents = 'auto';
  tuningSurfaceElement.style.width = 'fit-content';
  tuningSurfaceElement.style.maxWidth = 'calc(100vw - 32px)';

  tuningPanelElement.setAttribute('data-agentic-react-tuning-panel', 'true');
  tuningPanelElement.style.position = 'relative';
  tuningPanelElement.style.width = 'min(420px, calc(100vw - 32px))';
  tuningPanelElement.style.maxHeight = 'min(50vh, calc(100vh - 24px))';
  tuningPanelElement.style.overflowY = 'auto';
  tuningPanelElement.style.overscrollBehavior = 'contain';
  tuningPanelElement.style.background =
    'var(--agentic-react-tuning-panel-background, #ffffff)';
  tuningPanelElement.style.border =
    'var(--agentic-react-tuning-panel-border, 1px solid rgba(15, 23, 42, 0.14))';
  tuningPanelElement.style.borderRadius =
    'var(--agentic-react-tuning-panel-radius, 10px)';
  tuningPanelElement.style.boxShadow =
    'var(--agentic-react-tuning-panel-shadow, 0 22px 60px rgba(15, 23, 42, 0.3))';
  tuningPanelElement.style.padding = '12px';
  tuningPanelElement.style.color =
    'var(--agentic-react-tuning-panel-color, #111827)';
  tuningPanelElement.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  tuningPanelElement.style.pointerEvents = 'auto';

  tuningArrowElement.setAttribute('aria-hidden', 'true');
  tuningArrowElement.style.position = 'fixed';
  tuningArrowElement.style.width = '10px';
  tuningArrowElement.style.height = '10px';
  tuningArrowElement.style.background =
    'var(--agentic-react-tuning-panel-background, #ffffff)';
  tuningArrowElement.style.transform = 'rotate(45deg)';
  tuningArrowElement.style.pointerEvents = 'none';

  tuningTitleElement.style.fontSize = '13px';
  tuningTitleElement.style.fontWeight = '700';
  tuningTitleElement.style.marginBottom = '8px';

  tuningBodyElement.style.display = 'flex';
  tuningBodyElement.style.flexDirection = 'column';
  tuningBodyElement.style.gap = '8px';

  tuningCloseButtonElement.setAttribute('type', 'button');
  tuningCloseButtonElement.setAttribute('aria-label', 'Close tuning options');
  tuningCloseButtonElement.textContent = 'Close';
  tuningCloseButtonElement.style.marginTop = '12px';
  tuningCloseButtonElement.style.width = '100%';
  tuningCloseButtonElement.style.padding = '8px 10px';
  tuningCloseButtonElement.style.border =
    'var(--agentic-react-tuning-control-border, 1px solid rgba(15, 23, 42, 0.14))';
  tuningCloseButtonElement.style.borderRadius =
    'var(--agentic-react-tuning-control-radius, 8px)';
  tuningCloseButtonElement.style.background =
    'var(--agentic-react-tuning-secondary-button-background, #f8fafc)';
  tuningCloseButtonElement.style.color =
    'var(--agentic-react-tuning-secondary-button-color, #111827)';
  tuningCloseButtonElement.style.cursor = 'pointer';

  tuningPanelElement.appendChild(tuningTitleElement);
  tuningPanelElement.appendChild(tuningBodyElement);
  tuningPanelElement.appendChild(tuningCloseButtonElement);
  tuningModalElement.appendChild(tuningArrowElement);
  tuningSurfaceElement.appendChild(tuningPanelElement);
  tuningModalElement.appendChild(tuningSurfaceElement);
  stopHostActivationEvents(toolkitRootElement);
  stopHostActivationEvents(tuningModalElement);
  stopHostActivationEvents(selectedActions.actionsElement);

  const getTuningModalConfig = () => toolkitConfig.tuningModal || {};

  const applyTuningTokens = (element: HTMLElement) => {
    const tokens = getTuningModalConfig().tokens || {};
    for (const [tokenName, tokenValue] of Object.entries(tokens)) {
      element.style.setProperty(
        getTuningTokenName(tokenName),
        String(tokenValue),
      );
    }
  };

  const applyTuningSlotStyles = (
    element: HTMLElement,
    ...slots: ToolkitTuningModalStyleSlot[]
  ) => {
    const tuningModalConfig = getTuningModalConfig();
    for (const slot of slots) {
      const className = tuningModalConfig.classNames?.[slot];
      if (className) {
        element.classList.add(
          ...className.split(/\s+/).filter((name) => name.length > 0),
        );
      }
      applyStyleDeclaration(element, tuningModalConfig.styles?.[slot]);
    }
  };

  const applyTuningModalStaticStyles = () => {
    applyTuningTokens(tuningModalElement);
    applyTuningSlotStyles(tuningModalElement, 'root');
    applyTuningSlotStyles(tuningSurfaceElement, 'surface');
    applyTuningSlotStyles(tuningPanelElement, 'panel');
    applyTuningSlotStyles(tuningArrowElement, 'arrow');
    applyTuningSlotStyles(tuningTitleElement, 'title');
    applyTuningSlotStyles(tuningBodyElement, 'body');
    applyTuningSlotStyles(tuningCloseButtonElement, 'closeButton');
  };

  applyTuningModalStaticStyles();

  for (const dimElement of dimElements) {
    dimElement.setAttribute('data-agentic-react-dim', 'true');
    dimElement.style.position = 'fixed';
    dimElement.style.pointerEvents = 'none';
    dimElement.style.display = 'none';
    dimElement.style.background = 'rgba(15, 23, 42, 0.28)';
    dimElement.style.backdropFilter = 'saturate(0.8)';
  }

  const mountSelectionStyles = () => {
    if (document.getElementById(SELECTION_STYLE_ID)) {
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = SELECTION_STYLE_ID;
    styleElement.textContent = `
      [data-agentic-react-selected="true"] {
        box-sizing: border-box;
        border: 2px solid rgba(255, 255, 255, 0.98);
        box-shadow:
          0 0 0 2px rgba(15, 23, 42, 0.96),
          0 0 0 6px rgba(255, 255, 255, 0.96),
          0 0 0 9px var(--agentic-react-selection-accent, #111827),
          0 16px 38px rgba(15, 23, 42, 0.22);
        transform-origin: center;
        animation: agentic-react-selected-idle-pulse 2200ms cubic-bezier(0.37, 0, 0.63, 1) infinite;
        backface-visibility: hidden;
        will-change: transform, box-shadow;
      }

      [data-agentic-react-selected-label="true"],
      [data-agentic-react-hover-label="true"] {
        box-sizing: border-box;
        left: 0;
        bottom: calc(100% + 6px);
        padding: 4px 6px;
        border: 1px solid rgba(255, 255, 255, 0.86);
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.96);
        color: #ffffff;
        box-shadow:
          0 0 0 1px rgba(15, 23, 42, 0.72),
          0 10px 24px rgba(15, 23, 42, 0.28);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0;
      }

      [data-agentic-react-hover-label="true"] {
        background: rgba(15, 23, 42, 0.9);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.44),
          0 8px 18px rgba(15, 23, 42, 0.24);
      }

      [data-agentic-react-selected-label="true"][data-align="left"],
      [data-agentic-react-hover-label="true"][data-align="left"] {
        left: 0;
      }

      [data-agentic-react-selected-actions="true"] {
        right: 0;
        bottom: calc(100% + 6px);
      }

      [data-agentic-react-hover="true"] {
        box-sizing: border-box;
        border: 2px solid var(--agentic-react-hover-inner, rgba(15, 23, 42, 0.98));
        background: var(--agentic-react-hover-fill, rgba(15, 23, 42, 0.08));
        box-shadow:
          0 0 0 2px var(--agentic-react-hover-outer, rgba(255, 255, 255, 0.98)),
          0 0 0 5px var(--agentic-react-selection-accent, #111827),
          inset 0 0 0 1px rgba(255, 255, 255, 0.18),
          0 12px 30px rgba(15, 23, 42, 0.2);
        transform: translateZ(0);
        transform-origin: center;
        animation: agentic-react-hover-pulse 2000ms cubic-bezier(0.37, 0, 0.63, 1) infinite;
        backface-visibility: hidden;
        will-change: transform, box-shadow;
      }

      [data-agentic-react-launcher="true"] {
        box-sizing: border-box;
        transform: translateZ(0);
        -webkit-tap-highlight-color: transparent;
      }

      [data-agentic-react-launcher="true"]:hover {
        background: rgba(255, 255, 255, 0.16) !important;
        box-shadow: var(--agentic-react-launcher-hover-shadow) !important;
        filter: brightness(1.08) saturate(1.08);
        transform: translateY(-2px) scale(1.035) !important;
      }

      [data-agentic-react-launcher="true"]:focus-visible {
        box-shadow: var(--agentic-react-launcher-focus-shadow) !important;
        outline: none;
        transform: translateY(-1px) scale(1.02) !important;
      }

      [data-agentic-react-launcher="true"]:active {
        filter: brightness(0.98) saturate(1.02);
        transform: translateY(0) scale(0.99) !important;
      }

      [data-agentic-react-selected="true"].agentic-react-selection-pulse {
        animation: agentic-react-selection-pulse ${SELECTION_CONFIRMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      @keyframes agentic-react-selected-idle-pulse {
        0%,
        100% {
          transform: scale(1);
          box-shadow:
            0 0 0 2px rgba(15, 23, 42, 0.96),
            0 0 0 6px rgba(255, 255, 255, 0.96),
            0 0 0 9px var(--agentic-react-selection-accent, #111827),
            0 16px 38px rgba(15, 23, 42, 0.22);
        }
        42% {
          transform: scale(1.009);
          box-shadow:
            0 0 0 3px rgba(15, 23, 42, 0.98),
            0 0 0 7px rgba(255, 255, 255, 0.97),
            0 0 0 11px var(--agentic-react-selection-accent, #111827),
            0 17px 40px rgba(15, 23, 42, 0.24);
        }
        70% {
          transform: scale(0.999);
          box-shadow:
            0 0 0 2px rgba(15, 23, 42, 0.96),
            0 0 0 6px rgba(255, 255, 255, 0.94),
            0 0 0 8px var(--agentic-react-selection-accent, #111827),
            0 15px 36px rgba(15, 23, 42, 0.21);
        }
      }

      @keyframes agentic-react-hover-pulse {
        0%,
        100% {
          transform: translateZ(0) scale(1);
          box-shadow:
            0 0 0 2px var(--agentic-react-hover-outer, rgba(255, 255, 255, 0.98)),
            0 0 0 5px var(--agentic-react-selection-accent, #111827),
            inset 0 0 0 1px rgba(255, 255, 255, 0.18),
            0 12px 30px rgba(15, 23, 42, 0.2);
        }
        44% {
          transform: translateZ(0) scale(1.01);
          box-shadow:
            0 0 0 3px var(--agentic-react-hover-outer, rgba(255, 255, 255, 0.98)),
            0 0 0 7px var(--agentic-react-selection-accent, #111827),
            inset 0 0 0 1px rgba(255, 255, 255, 0.22),
            0 14px 34px rgba(15, 23, 42, 0.22);
        }
        72% {
          transform: translateZ(0) scale(0.999);
          box-shadow:
            0 0 0 2px var(--agentic-react-hover-outer, rgba(255, 255, 255, 0.98)),
            0 0 0 5px var(--agentic-react-selection-accent, #111827),
            inset 0 0 0 1px rgba(255, 255, 255, 0.16),
            0 11px 28px rgba(15, 23, 42, 0.19);
        }
      }

      @keyframes agentic-react-selection-pulse {
        0% {
          transform: scale(1);
          box-shadow:
            0 0 0 2px rgba(15, 23, 42, 0.96),
            0 0 0 6px rgba(255, 255, 255, 0.96),
            0 0 0 9px var(--agentic-react-selection-accent, #111827),
            0 16px 38px rgba(15, 23, 42, 0.22);
        }
        38% {
          transform: scale(1.018);
          box-shadow:
            0 0 0 3px rgba(15, 23, 42, 0.98),
            0 0 0 8px rgba(255, 255, 255, 0.98),
            0 0 0 13px var(--agentic-react-selection-accent, #111827),
            0 19px 44px rgba(15, 23, 42, 0.26);
        }
        72% {
          transform: scale(0.998);
          box-shadow:
            0 0 0 2px rgba(15, 23, 42, 0.96),
            0 0 0 6px rgba(255, 255, 255, 0.94),
            0 0 0 8px var(--agentic-react-selection-accent, #111827),
            0 15px 36px rgba(15, 23, 42, 0.21);
        }
        100% {
          transform: scale(1);
          box-shadow:
            0 0 0 2px rgba(15, 23, 42, 0.96),
            0 0 0 6px rgba(255, 255, 255, 0.96),
            0 0 0 9px var(--agentic-react-selection-accent, #111827),
            0 16px 38px rgba(15, 23, 42, 0.22);
        }
      }
    `;
    (document.head || document.documentElement).appendChild(styleElement);
  };

  let renderSettingsPanel = () => {};

  const updateStatus = (message: string, shouldDisplay = true) => {
    statusElement.textContent = message;
    statusElement.style.display = shouldDisplay ? 'block' : 'none';
  };

  const getEffectiveShortcutSettings = () =>
    settingsSnapshot?.effectiveSettings.shortcuts;

  const getEffectiveIconUrl = () =>
    settingsSnapshot?.effectiveSettings.appearance.toolboxIconUrl ||
    toolkitConfig.iconUrl ||
    DEFAULT_TOOLKIT_ICON_DATA_URL;

  const getSettingsCapabilityMessage = () => {
    const capability = settingsClient?.getCapability();
    if (capability?.available) {
      return '';
    }
    return (
      capability?.reason ||
      'Settings persistence is unavailable in this runtime. Changes cannot be saved.'
    );
  };

  const applySettingsSnapshot = async (
    result: Awaited<
      ReturnType<AgenticReactSettingsClient['getEffectiveSettings']>
    >,
  ) => {
    settingsSnapshot = {
      effectiveSettings: result.effectiveSettings,
      sources: result.sources,
      errors: result.errors,
    };
    await renderLauncherLogo();
    renderSettingsPanel();
    renderPanelVisibility();
  };

  const renderMultiSelectionControls = () => {
    const hasSelections = multiSelectionContexts.length > 0;
    const hasPendingSingleSelection =
      !!pendingSingleSelectionContext && !!selectedTargetElement;
    doneButtonElement.style.display =
      isMultiSelectionMode || hasPendingSingleSelection ? 'block' : 'none';
    doneButtonElement.disabled =
      isMultiSelectionMode && !hasSelections && !hasPendingSingleSelection;
    doneButtonElement.style.opacity = doneButtonElement.disabled ? '0.45' : '1';
    doneButtonElement.style.cursor = doneButtonElement.disabled
      ? 'not-allowed'
      : 'pointer';
    clearAllButtonElement.style.display = isMultiSelectionMode
      ? 'flex'
      : 'none';
    clearAllButtonElement.disabled = !hasSelections;
    clearAllButtonElement.style.opacity = hasSelections ? '1' : '0.45';
    clearAllButtonElement.style.cursor = hasSelections
      ? 'pointer'
      : 'not-allowed';
    clearAllButtonElement.style.background = hasSelections
      ? '#334155'
      : '#64748b';
  };

  const renderPanelVisibility = () => {
    renderMultiSelectionControls();
    settingsButtonElement.setAttribute(
      'aria-expanded',
      String(isSettingsSectionOpen),
    );
    settingsSectionElement.style.display = isSettingsSectionOpen
      ? 'flex'
      : 'none';
    panelElement.style.display = isPanelOpen ? 'flex' : 'none';
  };

  const renderLauncherLogo = async () => {
    const nextIconUrl = getEffectiveIconUrl();
    try {
      if (nextIconUrl !== DEFAULT_TOOLKIT_ICON_DATA_URL) {
        await preloadImage(nextIconUrl);
      }
      launcherIconElement.src = nextIconUrl;
      iconPreviewElement.src = nextIconUrl;
    } catch (_error) {
      launcherIconElement.src = DEFAULT_TOOLKIT_ICON_DATA_URL;
      iconPreviewElement.src = DEFAULT_TOOLKIT_ICON_DATA_URL;
    }
  };

  const updateToolkitStyle = () => {
    toolkitRootElement.style.zIndex = String(toolkitConfig.zIndex);
    setPosition(
      toolkitRootElement,
      toolkitConfig.position,
      toolkitConfig.offset.x || 0,
      toolkitConfig.offset.y || 0,
    );

    panelElement.style.borderColor = `${toolkitConfig.accentColor}33`;
    launcherButtonElement.style.setProperty(
      '--agentic-react-launcher-shadow',
      `0 18px 38px rgba(15, 23, 42, 0.34), 0 8px 18px ${toolkitConfig.accentColor}3d, 0 0 0 1px rgba(255, 255, 255, 0.2)`,
    );
    launcherButtonElement.style.setProperty(
      '--agentic-react-launcher-hover-shadow',
      `0 24px 48px rgba(15, 23, 42, 0.42), 0 12px 28px ${toolkitConfig.accentColor}66, 0 0 0 4px ${toolkitConfig.accentColor}24, 0 0 0 1px rgba(255, 255, 255, 0.42)`,
    );
    launcherButtonElement.style.setProperty(
      '--agentic-react-launcher-focus-shadow',
      `0 20px 42px rgba(15, 23, 42, 0.38), 0 10px 24px ${toolkitConfig.accentColor}5c, 0 0 0 4px ${toolkitConfig.accentColor}33, 0 0 0 1px rgba(255, 255, 255, 0.5)`,
    );

    const buttons = [selectButtonElement, multiselectButtonElement];
    for (const buttonElement of buttons) {
      if (!buttonElement.disabled) {
        buttonElement.style.background = toolkitConfig.accentColor;
      }
      buttonElement.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    }
    doneButtonElement.style.background = '#dc2626';
    doneButtonElement.style.color = '#ffffff';
    doneButtonElement.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    clearAllButtonElement.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';

    hoverElement.style.zIndex = String(Math.max(0, toolkitConfig.zIndex - 2));
    hoverElement.style.setProperty(
      '--agentic-react-selection-accent',
      toolkitConfig.accentColor,
    );
    selectedElement.style.zIndex = String(
      Math.max(0, toolkitConfig.zIndex - 1),
    );
    selectedElement.style.setProperty(
      '--agentic-react-selection-accent',
      toolkitConfig.accentColor,
    );
    for (const { overlayElement } of multiSelectedOverlays) {
      overlayElement.style.zIndex = String(
        Math.max(0, toolkitConfig.zIndex - 1),
      );
      overlayElement.style.setProperty(
        '--agentic-react-selection-accent',
        toolkitConfig.accentColor,
      );
    }
    for (const dimElement of dimElements) {
      dimElement.style.zIndex = String(Math.max(0, toolkitConfig.zIndex - 3));
    }
    applyTuningModalStaticStyles();
    renderSettingsPanel();
    void renderLauncherLogo();
    renderPanelVisibility();
  };

  const applyElementRect = (overlayElement: HTMLElement, rect: DOMRect) => {
    overlayElement.style.left = `${rect.left}px`;
    overlayElement.style.top = `${rect.top}px`;
    overlayElement.style.width = `${rect.width}px`;
    overlayElement.style.height = `${rect.height}px`;
  };

  const createSettingsHelpText = (text: string) => {
    const element = document.createElement('div');
    element.textContent = text;
    element.style.fontSize = '11px';
    element.style.lineHeight = '1.35';
    element.style.color = '#64748b';
    return element;
  };

  const renderShortcutRows = () => {
    shortcutsSectionElement.replaceChildren(
      createSettingsSectionTitle('Shortcuts'),
    );

    const shortcuts = getEffectiveShortcutSettings();
    const sources = settingsSnapshot?.sources.shortcuts;
    if (!shortcuts || !sources) {
      shortcutsSectionElement.appendChild(
        createSettingsHelpText(getSettingsCapabilityMessage()),
      );
      return;
    }

    for (const action of CONFIGURABLE_SHORTCUT_KEYS) {
      const rowElement = document.createElement('div');
      const textWrapElement = document.createElement('div');
      const labelElement = document.createElement('div');
      const controlsElement = document.createElement('div');
      const normalized = normalizeShortcutString(shortcuts[action]);
      const keyButtonElement = createSmallButton(
        recordingShortcutAction === action
          ? 'Press shortcut'
          : normalized.success
            ? normalized.label
            : shortcuts[action],
        { muted: true },
      );
      const resetButtonElement = createSmallButton('Reset', { muted: true });

      rowElement.style.display = 'grid';
      rowElement.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
      rowElement.style.gap = '8px';
      rowElement.style.alignItems = 'center';

      labelElement.textContent = getShortcutActionLabel(action);
      labelElement.style.fontSize = '12px';
      labelElement.style.fontWeight = '800';
      labelElement.style.color = '#111827';
      textWrapElement.style.display = 'flex';
      textWrapElement.style.flexDirection = 'column';
      textWrapElement.style.gap = '4px';
      textWrapElement.appendChild(labelElement);
      textWrapElement.appendChild(createSourceBadge(sources[action]));

      controlsElement.style.display = 'grid';
      controlsElement.style.gridTemplateColumns = 'minmax(78px, 1fr) auto';
      controlsElement.style.gap = '6px';
      controlsElement.appendChild(keyButtonElement);
      controlsElement.appendChild(resetButtonElement);

      keyButtonElement.addEventListener('click', () => {
        if (!settingsClient?.getCapability().available) {
          updateStatus(getSettingsCapabilityMessage());
          return;
        }
        recordingShortcutAction = action;
        renderSettingsPanel();
        updateStatus(`Recording ${getShortcutActionLabel(action)} shortcut.`);
      });

      resetButtonElement.addEventListener('click', () => {
        if (!settingsClient?.getCapability().available) {
          updateStatus(getSettingsCapabilityMessage());
          return;
        }
        setDisabled(resetButtonElement, true);
        void settingsClient
          .resetShortcut(action)
          .then((result) => {
            if (result.success === false) {
              updateStatus(result.error.message);
              renderSettingsPanel();
              return;
            }
            return applySettingsSnapshot(result).then(() => {
              updateStatus(`Reset ${getShortcutActionLabel(action)} shortcut.`);
            });
          })
          .catch((error) => {
            updateStatus(
              error instanceof Error
                ? error.message
                : 'Failed to reset shortcut.',
            );
            renderSettingsPanel();
          });
      });

      rowElement.appendChild(textWrapElement);
      rowElement.appendChild(controlsElement);
      shortcutsSectionElement.appendChild(rowElement);
    }

    const escapeRowElement = document.createElement('div');
    const escapeLabelElement = document.createElement('div');
    escapeRowElement.style.display = 'grid';
    escapeRowElement.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    escapeRowElement.style.gap = '8px';
    escapeRowElement.style.alignItems = 'center';
    escapeLabelElement.textContent = LOCKED_ESCAPE_SHORTCUT.description;
    escapeLabelElement.style.fontSize = '12px';
    escapeLabelElement.style.fontWeight = '800';
    escapeLabelElement.style.color = '#111827';
    escapeRowElement.appendChild(escapeLabelElement);
    escapeRowElement.appendChild(createKeycap(LOCKED_ESCAPE_SHORTCUT.label));
    shortcutsSectionElement.appendChild(escapeRowElement);
  };

  const renderAppearanceSettings = () => {
    appearanceSectionElement.replaceChildren(
      createSettingsSectionTitle('Appearance'),
    );

    const source =
      settingsSnapshot?.sources.appearance.toolboxIcon || 'package';
    const controlsElement = document.createElement('div');
    const previewRowElement = document.createElement('div');
    const textWrapElement = document.createElement('div');
    const titleElement = document.createElement('div');
    const capabilityMessage = getSettingsCapabilityMessage();

    previewRowElement.style.display = 'grid';
    previewRowElement.style.gridTemplateColumns = `${LAUNCHER_SIZE}px minmax(0, 1fr)`;
    previewRowElement.style.gap = '10px';
    previewRowElement.style.alignItems = 'center';

    titleElement.textContent = 'Toolbox icon';
    titleElement.style.fontSize = '12px';
    titleElement.style.fontWeight = '800';
    titleElement.style.color = '#111827';
    textWrapElement.style.display = 'flex';
    textWrapElement.style.flexDirection = 'column';
    textWrapElement.style.gap = '5px';
    textWrapElement.appendChild(titleElement);
    textWrapElement.appendChild(createSourceBadge(source));

    controlsElement.style.display = 'flex';
    controlsElement.style.gap = '6px';
    controlsElement.style.flexWrap = 'wrap';
    controlsElement.appendChild(iconChangeButtonElement);
    if (source === 'global') {
      controlsElement.appendChild(iconResetButtonElement);
    }
    textWrapElement.appendChild(controlsElement);

    previewRowElement.appendChild(iconPreviewElement);
    previewRowElement.appendChild(textWrapElement);
    appearanceSectionElement.appendChild(previewRowElement);

    if (capabilityMessage) {
      appearanceSectionElement.appendChild(
        createSettingsHelpText(capabilityMessage),
      );
    }
  };

  renderSettingsPanel = () => {
    renderShortcutRows();
    renderAppearanceSettings();
  };

  const updateOverlayLabelForElement = (
    labelElement: HTMLElement,
    element: Element,
    rect: DOMRect,
    selectionContext?: SelectionContext | null,
  ) => {
    const componentNameOverride = selectionContext
      ? null
      : getSelectionElementComponentName(element);
    labelElement.textContent = buildSelectedElementLabel(
      element,
      selectionContext,
      componentNameOverride,
    );
    labelElement.dataset.align = 'left';
    labelElement.style.maxWidth = `${Math.max(
      80,
      Math.min(420, window.innerWidth - 24, window.innerWidth - rect.left - 12),
    )}px`;
  };

  const closeTuningModal = () => {
    for (const cleanup of tuningExtensionCleanups.splice(0)) {
      try {
        cleanup();
      } catch (_error) {
        // Extension cleanup should not prevent the built-in modal from closing.
      }
    }
    activeTuningSession = null;
    tuningModalElement.style.display = 'none';
    tuningBodyElement.replaceChildren();
    tuningSurfaceElement.replaceChildren(tuningPanelElement);
  };

  const positionTuningPanel = () => {
    if (!activeTuningSession?.anchorElement.isConnected) {
      closeTuningModal();
      return;
    }

    const anchorRect =
      activeTuningSession.anchorElement.getBoundingClientRect();
    const surfaceRect = tuningSurfaceElement.getBoundingClientRect();
    const panelRect = tuningPanelElement.getBoundingClientRect();
    const surfaceWidth = surfaceRect.width || panelRect.width;
    const surfaceHeight = surfaceRect.height || panelRect.height;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxLeft = Math.max(
      TUNING_PANEL_MARGIN,
      viewportWidth - TUNING_PANEL_MARGIN - surfaceWidth,
    );
    const maxTop = Math.max(
      TUNING_PANEL_MARGIN,
      viewportHeight - TUNING_PANEL_MARGIN - surfaceHeight,
    );
    const rightLeft = anchorRect.right + TUNING_PANEL_GAP;
    const leftLeft = anchorRect.left - TUNING_PANEL_GAP - surfaceWidth;
    const canFitRight =
      rightLeft + surfaceWidth <= viewportWidth - TUNING_PANEL_MARGIN;
    const canFitLeft = leftLeft >= TUNING_PANEL_MARGIN;
    const placeOnRight =
      canFitRight ||
      (!canFitLeft && viewportWidth - anchorRect.right >= anchorRect.left);
    const unclampedLeft = placeOnRight ? rightLeft : leftLeft;
    const left = clampNumber(unclampedLeft, TUNING_PANEL_MARGIN, maxLeft);
    const anchorCenterY = anchorRect.top + anchorRect.height / 2;
    const top = clampNumber(
      anchorCenterY - surfaceHeight / 2,
      TUNING_PANEL_MARGIN,
      maxTop,
    );
    const arrowTop = clampNumber(
      anchorCenterY - top - 5,
      14,
      Math.max(14, surfaceHeight - 18),
    );

    tuningSurfaceElement.dataset.placement = placeOnRight ? 'right' : 'left';
    tuningSurfaceElement.style.left = `${Math.round(left)}px`;
    tuningSurfaceElement.style.top = `${Math.round(top)}px`;
    tuningSurfaceElement.style.right = '';
    tuningSurfaceElement.style.bottom = '';
    tuningArrowElement.style.top = `${Math.round(top + arrowTop)}px`;
    tuningArrowElement.style.left = placeOnRight
      ? `${Math.round(left - 6)}px`
      : `${Math.round(left + surfaceWidth - 4)}px`;
    tuningArrowElement.style.right = '';
    tuningArrowElement.style.borderLeft = placeOnRight
      ? '1px solid rgba(15, 23, 42, 0.14)'
      : 'none';
    tuningArrowElement.style.borderBottom = placeOnRight
      ? '1px solid rgba(15, 23, 42, 0.14)'
      : 'none';
    tuningArrowElement.style.borderRight = placeOnRight
      ? 'none'
      : '1px solid rgba(15, 23, 42, 0.14)';
    tuningArrowElement.style.borderTop = placeOnRight
      ? 'none'
      : '1px solid rgba(15, 23, 42, 0.14)';
  };

  const addTuningPrompt = (prompt: string) => {
    if (!activeTuningSession) return;

    const nextTuningPrompts = [
      ...(activeTuningSession.selectionContext.tuningPrompts || []),
      prompt,
    ];
    const nextSelectionContext = {
      ...activeTuningSession.selectionContext,
      tuningPrompts: nextTuningPrompts,
    };

    activeTuningSession.selectionContext = nextSelectionContext;
    activeTuningSession.setSelectionContext(nextSelectionContext);
    updateStatus(`Added tuning prompt: ${prompt}`);
  };

  const buildTuningModalContext = (
    session: TuningSession,
    computedStyle: CSSStyleDeclaration,
    targetLabel: string,
    targetTagName: string,
  ): TuningModalContext => ({
    element: session.element,
    tagName: targetTagName,
    targetLabel,
    computedStyle,
    selectionContext: session.selectionContext,
  });

  const buildTuningModalActions = (): TuningModalActions => ({
    addPrompt: addTuningPrompt,
    close: closeTuningModal,
    requestReposition: positionTuningPanel,
  });

  const pushTuningExtensionCleanup = (cleanup: TuningModalExtensionCleanup) => {
    if (typeof cleanup === 'function') {
      tuningExtensionCleanups.push(cleanup);
    }
  };

  const renderTuningExtensionSlot = (
    slot: 'beforeFields' | 'afterFields' | 'footer',
    container: HTMLElement,
    context: TuningModalContext,
    actions: TuningModalActions,
  ) => {
    for (const extension of tuningModalExtensions) {
      const renderSlot = extension[slot];
      if (!renderSlot) continue;

      pushTuningExtensionCleanup(
        renderSlot({
          container,
          context,
          actions,
        }),
      );
    }
  };

  const renderTuningExtensionWrappers = (
    context: TuningModalContext,
    actions: TuningModalActions,
  ) => {
    for (const extension of tuningModalExtensions) {
      pushTuningExtensionCleanup(
        extension.wrapModal?.({
          surfaceElement: tuningSurfaceElement,
          panelElement: tuningPanelElement,
          context,
          actions,
        }),
      );
    }
  };

  const registerTuningModalExtension = (extension: TuningModalExtension) => {
    tuningModalExtensions = [
      ...tuningModalExtensions.filter(
        (registeredExtension) => registeredExtension.id !== extension.id,
      ),
      extension,
    ];

    return () => {
      tuningModalExtensions = tuningModalExtensions.filter(
        (registeredExtension) => registeredExtension.id !== extension.id,
      );
    };
  };

  const createTuningSectionTitle = (titleText: string) => {
    const sectionTitleElement = document.createElement('div');
    sectionTitleElement.textContent = titleText;
    sectionTitleElement.style.marginTop = '4px';
    sectionTitleElement.style.paddingTop = '8px';
    sectionTitleElement.style.borderTop = '1px solid rgba(15, 23, 42, 0.08)';
    sectionTitleElement.style.fontSize = '11px';
    sectionTitleElement.style.fontWeight = '800';
    sectionTitleElement.style.letterSpacing = '0';
    sectionTitleElement.style.color =
      'var(--agentic-react-tuning-section-color, #334155)';
    applyTuningSlotStyles(sectionTitleElement, 'sectionTitle');
    return sectionTitleElement;
  };

  const styleTuningControl = (
    controlElement: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ) => {
    controlElement.style.width = '100%';
    controlElement.style.minWidth = '0';
    controlElement.style.boxSizing = 'border-box';
    controlElement.style.border =
      'var(--agentic-react-tuning-control-border, 1px solid rgba(15, 23, 42, 0.14))';
    controlElement.style.borderRadius =
      'var(--agentic-react-tuning-control-radius, 8px)';
    controlElement.style.background =
      'var(--agentic-react-tuning-control-background, #ffffff)';
    controlElement.style.color =
      'var(--agentic-react-tuning-control-color, #111827)';
    controlElement.style.fontSize = '12px';
    controlElement.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
    applyTuningSlotStyles(controlElement, 'control');
  };

  const createTuningRow = (
    labelText: string,
    controlElement: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    suffixText = '',
  ) => {
    const rowElement = document.createElement('label');
    const labelElement = document.createElement('span');
    const controlWrapElement = document.createElement('span');
    const suffixElement = document.createElement('span');

    rowElement.style.display = 'grid';
    rowElement.style.gridTemplateColumns = '128px minmax(0, 1fr)';
    rowElement.style.alignItems = 'center';
    rowElement.style.gap = '12px';
    rowElement.style.fontSize = '12px';
    rowElement.style.fontWeight = '600';

    labelElement.textContent = labelText;
    labelElement.style.color =
      'var(--agentic-react-tuning-label-color, #111827)';
    labelElement.style.lineHeight = '1.2';
    controlElement.setAttribute('aria-label', labelText);
    styleTuningControl(controlElement);

    const createStepperButton = (label: string, direction: -1 | 1) => {
      const buttonElement = document.createElement('button');
      buttonElement.type = 'button';
      buttonElement.textContent = direction > 0 ? '+' : '-';
      buttonElement.setAttribute('aria-label', `${label} ${labelText}`);
      buttonElement.style.width = '26px';
      buttonElement.style.height = '32px';
      buttonElement.style.border =
        'var(--agentic-react-tuning-control-border, 1px solid rgba(15, 23, 42, 0.14))';
      buttonElement.style.borderRadius =
        'var(--agentic-react-tuning-control-radius, 8px)';
      buttonElement.style.background =
        'var(--agentic-react-tuning-secondary-button-background, #f8fafc)';
      buttonElement.style.color =
        'var(--agentic-react-tuning-secondary-button-color, #111827)';
      buttonElement.style.cursor = 'pointer';
      buttonElement.style.fontSize = '14px';
      buttonElement.style.fontWeight = '800';
      buttonElement.style.lineHeight = '1';
      buttonElement.addEventListener('click', (event) => {
        event.preventDefault();
        if (!(controlElement instanceof HTMLInputElement)) return;

        try {
          if (direction > 0) {
            controlElement.stepUp();
          } else {
            controlElement.stepDown();
          }
        } catch (_error) {
          const step = Number(controlElement.step) || 1;
          const nextValue =
            (Number(controlElement.value) || 0) + step * direction;
          controlElement.value = String(nextValue);
        }

        controlElement.dispatchEvent(
          new Event('change', { bubbles: true, cancelable: true }),
        );
      });
      applyTuningSlotStyles(buttonElement, 'stepperButton');
      return buttonElement;
    };

    if (controlElement instanceof HTMLInputElement) {
      const isColorInput = controlElement.type === 'color';
      controlElement.style.height = isColorInput ? '30px' : '32px';
      controlElement.style.width = isColorInput ? '34px' : '100%';
      controlElement.style.minWidth = isColorInput ? '34px' : '0';
      controlElement.style.padding = isColorInput ? '3px 4px' : '6px 8px';
      applyTuningSlotStyles(
        controlElement,
        isColorInput ? 'colorInput' : 'numberInput',
      );
    } else if (controlElement instanceof HTMLSelectElement) {
      controlElement.style.height = '32px';
      controlElement.style.padding = '6px 8px';
      applyTuningSlotStyles(controlElement, 'select');
    } else {
      controlElement.style.minHeight = '54px';
      controlElement.style.padding = '8px';
      controlElement.style.resize = 'vertical';
      applyTuningSlotStyles(controlElement, 'textarea');
    }

    const isNumberInput =
      controlElement instanceof HTMLInputElement &&
      controlElement.type === 'number';
    const isColorInput =
      controlElement instanceof HTMLInputElement &&
      controlElement.type === 'color';
    controlWrapElement.style.display = 'grid';
    controlWrapElement.style.gridTemplateColumns = isColorInput
      ? suffixText
        ? '34px minmax(0, 1fr)'
        : '34px'
      : isNumberInput
        ? suffixText
          ? 'minmax(0, 1fr) auto auto auto'
          : 'minmax(0, 1fr) auto auto'
        : suffixText
          ? 'minmax(0, 1fr) auto'
          : '1fr';
    controlWrapElement.style.alignItems = 'center';
    controlWrapElement.style.gap = '6px';
    controlWrapElement.appendChild(controlElement);

    if (isNumberInput) {
      controlWrapElement.appendChild(createStepperButton('Decrement', -1));
      controlWrapElement.appendChild(createStepperButton('Increment', 1));
    }

    if (suffixText) {
      suffixElement.textContent = suffixText;
      suffixElement.style.fontSize = '12px';
      suffixElement.style.color = '#475569';
      if (isColorInput) {
        suffixElement.setAttribute('data-agentic-react-color-value', 'true');
        suffixElement.style.minWidth = '0';
        suffixElement.style.overflow = 'hidden';
        suffixElement.style.textOverflow = 'ellipsis';
        suffixElement.style.whiteSpace = 'nowrap';
        suffixElement.style.fontFamily =
          'ui-monospace, SFMono-Regular, monospace';
        controlElement.addEventListener('input', () => {
          suffixElement.textContent = hexToRgbaString(controlElement.value);
        });
        controlElement.addEventListener('change', () => {
          suffixElement.textContent = hexToRgbaString(controlElement.value);
        });
      }
      applyTuningSlotStyles(suffixElement, 'suffix');
      controlWrapElement.appendChild(suffixElement);
    }

    rowElement.appendChild(labelElement);
    rowElement.appendChild(controlWrapElement);
    applyTuningSlotStyles(rowElement, 'row');
    applyTuningSlotStyles(labelElement, 'label');
    applyTuningSlotStyles(controlWrapElement, 'controlWrap');
    return rowElement;
  };

  const createTuningInput = (
    name: string,
    value: string,
    inputType = 'text',
  ) => {
    const inputElement = document.createElement('input');
    inputElement.type = inputType;
    inputElement.name = name;
    inputElement.value = value;
    return inputElement;
  };

  const createTuningNumberInput = (
    name: string,
    value: number,
    min: number,
    max: number,
    step: number,
  ) => {
    const inputElement = createTuningInput(name, String(value), 'number');
    inputElement.min = String(min);
    inputElement.max = String(max);
    inputElement.step = String(step);
    return inputElement;
  };

  const createTuningSelect = (
    name: string,
    values: string[],
    selectedValue: string,
  ) => {
    const selectElement = document.createElement('select');
    selectElement.name = name;

    for (const value of values) {
      const optionElement = document.createElement('option');
      optionElement.value = value;
      optionElement.textContent = value;
      selectElement.appendChild(optionElement);
    }

    selectElement.value = values.includes(selectedValue)
      ? selectedValue
      : values[0] || '';
    return selectElement;
  };

  const openTuningModal = (session: TuningSession) => {
    closeTuningModal();
    activeTuningSession = session;
    tuningBodyElement.replaceChildren();

    const computedStyle = window.getComputedStyle(session.element);
    const targetLabel = buildTuningTargetLabel(session.selectionContext);
    const targetTagName = session.element.tagName.toLowerCase();
    const supportsTextTuning = hasTuneableText(session.element);
    const supportsElementTuning = session.element instanceof HTMLElement;
    const supportsLayoutTuning =
      supportsElementTuning &&
      hasTuneableLayout(session.element, computedStyle);
    const targetRect = session.element.getBoundingClientRect();
    const tuningContext = buildTuningModalContext(
      session,
      computedStyle,
      targetLabel,
      targetTagName,
    );
    const tuningActions = buildTuningModalActions();

    tuningTitleElement.textContent = `Tune ${targetLabel}`;

    const targetTagElement = document.createElement('div');
    targetTagElement.setAttribute(
      'data-agentic-react-tuning-target-tag',
      'true',
    );
    targetTagElement.textContent = targetTagName;
    targetTagElement.style.display = 'inline-flex';
    targetTagElement.style.alignItems = 'center';
    targetTagElement.style.width = 'fit-content';
    targetTagElement.style.maxWidth = '100%';
    targetTagElement.style.marginBottom = '2px';
    targetTagElement.style.padding = '4px 8px';
    targetTagElement.style.border = '1px solid rgba(15, 23, 42, 0.1)';
    targetTagElement.style.borderRadius = '999px';
    targetTagElement.style.background = '#f8fafc';
    targetTagElement.style.color = '#0f172a';
    targetTagElement.style.fontFamily =
      'ui-monospace, SFMono-Regular, monospace';
    targetTagElement.style.fontSize = '12px';
    targetTagElement.style.fontWeight = '700';
    applyTuningSlotStyles(targetTagElement, 'targetTag');
    tuningBodyElement.appendChild(targetTagElement);

    const customPromptFormElement = document.createElement('form');
    const customPromptInputElement = document.createElement('textarea');
    const customPromptButtonElement = document.createElement('button');
    customPromptFormElement.style.display = 'grid';
    customPromptFormElement.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    customPromptFormElement.style.gap = '8px';
    customPromptFormElement.style.alignItems = 'end';
    customPromptInputElement.name = 'custom-tuning-prompt';
    customPromptInputElement.placeholder = 'Describe these changes...';
    customPromptInputElement.setAttribute(
      'aria-label',
      'Describe custom tuning changes',
    );
    styleTuningControl(customPromptInputElement);
    customPromptInputElement.style.minHeight = '42px';
    customPromptInputElement.style.padding = '8px';
    customPromptInputElement.style.resize = 'vertical';
    applyTuningSlotStyles(
      customPromptInputElement,
      'textarea',
      'customPromptInput',
    );
    customPromptButtonElement.type = 'submit';
    customPromptButtonElement.textContent = 'Add';
    customPromptButtonElement.style.height = '32px';
    customPromptButtonElement.style.padding = '0 12px';
    customPromptButtonElement.style.border =
      'var(--agentic-react-tuning-primary-button-border, 1px solid rgba(15, 23, 42, 0.14))';
    customPromptButtonElement.style.borderRadius =
      'var(--agentic-react-tuning-control-radius, 8px)';
    customPromptButtonElement.style.background =
      'var(--agentic-react-tuning-primary-button-background, #111827)';
    customPromptButtonElement.style.color =
      'var(--agentic-react-tuning-primary-button-color, #ffffff)';
    customPromptButtonElement.style.cursor = 'pointer';
    customPromptButtonElement.style.fontSize = '12px';
    customPromptButtonElement.style.fontWeight = '700';
    applyTuningSlotStyles(customPromptButtonElement, 'customPromptButton');
    applyTuningSlotStyles(customPromptFormElement, 'customPromptForm');
    customPromptFormElement.addEventListener('submit', (event) => {
      event.preventDefault();
      const customPrompt = customPromptInputElement.value.trim();
      if (!customPrompt) return;
      addTuningPrompt(customPrompt);
      customPromptInputElement.value = '';
    });
    customPromptFormElement.appendChild(customPromptInputElement);
    customPromptFormElement.appendChild(customPromptButtonElement);
    tuningBodyElement.appendChild(customPromptFormElement);

    const beforeFieldsElement = document.createElement('div');
    beforeFieldsElement.setAttribute(
      'data-agentic-react-tuning-slot',
      'before-fields',
    );
    renderTuningExtensionSlot(
      'beforeFields',
      beforeFieldsElement,
      tuningContext,
      tuningActions,
    );
    if (beforeFieldsElement.hasChildNodes()) {
      tuningBodyElement.appendChild(beforeFieldsElement);
    }

    tuningBodyElement.appendChild(createTuningSectionTitle('Visual'));

    if (supportsTextTuning) {
      const textColorInputElement = createTuningInput(
        'text-color',
        rgbStringToHex(computedStyle.color),
        'color',
      );
      textColorInputElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} text color to ${hexToRgbString(
            textColorInputElement.value,
          )}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow(
          'Text color',
          textColorInputElement,
          cssColorToRgbaString(computedStyle.color, {
            r: 17,
            g: 24,
            b: 39,
            a: 1,
          }),
        ),
      );
    }

    if (supportsElementTuning) {
      const backgroundColorInputElement = createTuningInput(
        'background-color',
        rgbStringToHex(computedStyle.backgroundColor),
        'color',
      );
      backgroundColorInputElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} background color to ${hexToRgbString(
            backgroundColorInputElement.value,
          )}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow(
          'Background',
          backgroundColorInputElement,
          cssColorToRgbaString(computedStyle.backgroundColor),
        ),
      );

      const opacityInputElement = createTuningNumberInput(
        'opacity',
        Number(normalizeCssNumber(computedStyle.opacity, 1).toFixed(2)),
        0,
        1,
        0.05,
      );
      opacityInputElement.addEventListener('change', () => {
        const opacity = Number(
          clampNumber(Number(opacityInputElement.value) || 1, 0, 1).toFixed(2),
        );
        opacityInputElement.value = String(opacity);
        addTuningPrompt(`Change ${targetLabel} opacity to ${opacity}.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Opacity', opacityInputElement),
      );
    }

    if (supportsTextTuning) {
      tuningBodyElement.appendChild(createTuningSectionTitle('Typography'));
      const currentFontFamily =
        computedStyle.fontFamily.split(',')[0]?.replace(/["']/g, '').trim() ||
        'inherit';
      const fontFamilySelectElement = createTuningSelect(
        'font-family',
        Array.from(
          new Set([currentFontFamily, ...TUNING_FONT_FAMILY_OPTIONS]),
        ).filter(Boolean),
        currentFontFamily,
      );
      fontFamilySelectElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} font family to ${fontFamilySelectElement.value}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow('Font', fontFamilySelectElement),
      );

      const fontSizeInputElement = document.createElement('input');
      fontSizeInputElement.type = 'number';
      fontSizeInputElement.name = 'font-size';
      fontSizeInputElement.min = '8';
      fontSizeInputElement.max = '72';
      fontSizeInputElement.step = '1';
      fontSizeInputElement.value = String(
        Math.round(Number.parseFloat(computedStyle.fontSize) || 16),
      );
      fontSizeInputElement.addEventListener('change', () => {
        const fontSize = clampNumber(
          Number(fontSizeInputElement.value) || 16,
          8,
          72,
        );
        fontSizeInputElement.value = String(fontSize);
        addTuningPrompt(`Change ${targetLabel} font size to ${fontSize}px.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Font size', fontSizeInputElement, 'px'),
      );

      const fontWeight = computedStyle.fontWeight || '400';
      const fontWeightSelectElement = createTuningSelect(
        'font-weight',
        Array.from(new Set([fontWeight, ...TUNING_FONT_WEIGHT_OPTIONS])),
        fontWeight,
      );
      fontWeightSelectElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} font weight to ${fontWeightSelectElement.value}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow('Font weight', fontWeightSelectElement),
      );
    }

    if (supportsElementTuning) {
      tuningBodyElement.appendChild(createTuningSectionTitle('Box'));
      const widthInputElement = createTuningNumberInput(
        'width',
        Math.round(
          targetRect.width || normalizeCssNumber(computedStyle.width, 0),
        ),
        0,
        2000,
        1,
      );
      widthInputElement.addEventListener('change', () => {
        const width = clampNumber(
          Number(widthInputElement.value) || 0,
          0,
          2000,
        );
        widthInputElement.value = String(width);
        addTuningPrompt(`Change ${targetLabel} width to ${width}px.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Width', widthInputElement, 'px'),
      );

      const heightInputElement = createTuningNumberInput(
        'height',
        Math.round(
          targetRect.height || normalizeCssNumber(computedStyle.height, 0),
        ),
        0,
        2000,
        1,
      );
      heightInputElement.addEventListener('change', () => {
        const height = clampNumber(
          Number(heightInputElement.value) || 0,
          0,
          2000,
        );
        heightInputElement.value = String(height);
        addTuningPrompt(`Change ${targetLabel} height to ${height}px.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Height', heightInputElement, 'px'),
      );

      const paddingInputElement = createTuningNumberInput(
        'padding',
        Math.round(normalizeCssNumber(computedStyle.paddingTop, 0)),
        0,
        240,
        1,
      );
      paddingInputElement.addEventListener('change', () => {
        const padding = clampNumber(
          Number(paddingInputElement.value) || 0,
          0,
          240,
        );
        paddingInputElement.value = String(padding);
        addTuningPrompt(`Change ${targetLabel} padding to ${padding}px.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Padding', paddingInputElement, 'px'),
      );

      const marginInputElement = createTuningNumberInput(
        'margin',
        Math.round(normalizeCssNumber(computedStyle.marginTop, 0)),
        -240,
        240,
        1,
      );
      marginInputElement.addEventListener('change', () => {
        const margin = clampNumber(
          Number(marginInputElement.value) || 0,
          -240,
          240,
        );
        marginInputElement.value = String(margin);
        addTuningPrompt(`Change ${targetLabel} margin to ${margin}px.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Margin', marginInputElement, 'px'),
      );
    }

    if (supportsLayoutTuning) {
      tuningBodyElement.appendChild(createTuningSectionTitle('Layout'));
      const displaySelectElement = createTuningSelect(
        'display',
        Array.from(new Set([computedStyle.display, ...TUNING_DISPLAY_OPTIONS])),
        computedStyle.display,
      );
      displaySelectElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} display layout to ${displaySelectElement.value}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow('Display', displaySelectElement),
      );

      const directionSelectElement = createTuningSelect(
        'layout-direction',
        TUNING_FLEX_DIRECTION_OPTIONS,
        computedStyle.flexDirection,
      );
      directionSelectElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} layout direction to ${directionSelectElement.value}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow('Layout direction', directionSelectElement),
      );

      const distributionSelectElement = createTuningSelect(
        'distribution',
        Array.from(
          new Set([computedStyle.justifyContent, ...TUNING_JUSTIFY_OPTIONS]),
        ),
        computedStyle.justifyContent,
      );
      distributionSelectElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} distribution to ${distributionSelectElement.value}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow('Distribution', distributionSelectElement),
      );

      const alignmentSelectElement = createTuningSelect(
        'alignment',
        Array.from(
          new Set([computedStyle.alignItems, ...TUNING_ALIGN_OPTIONS]),
        ),
        computedStyle.alignItems,
      );
      alignmentSelectElement.addEventListener('change', () => {
        addTuningPrompt(
          `Change ${targetLabel} alignment to ${alignmentSelectElement.value}.`,
        );
      });
      tuningBodyElement.appendChild(
        createTuningRow('Alignment', alignmentSelectElement),
      );

      const spacingInputElement = createTuningNumberInput(
        'spacing',
        Math.round(normalizeCssNumber(computedStyle.gap, 0)),
        0,
        240,
        1,
      );
      spacingInputElement.addEventListener('change', () => {
        const spacing = clampNumber(
          Number(spacingInputElement.value) || 0,
          0,
          240,
        );
        spacingInputElement.value = String(spacing);
        addTuningPrompt(`Change ${targetLabel} spacing to ${spacing}px.`);
      });
      tuningBodyElement.appendChild(
        createTuningRow('Spacing', spacingInputElement, 'px'),
      );
    }

    const afterFieldsElement = document.createElement('div');
    afterFieldsElement.setAttribute(
      'data-agentic-react-tuning-slot',
      'after-fields',
    );
    renderTuningExtensionSlot(
      'afterFields',
      afterFieldsElement,
      tuningContext,
      tuningActions,
    );
    if (afterFieldsElement.hasChildNodes()) {
      tuningBodyElement.appendChild(afterFieldsElement);
    }

    const footerElement = document.createElement('div');
    footerElement.setAttribute('data-agentic-react-tuning-slot', 'footer');
    renderTuningExtensionSlot(
      'footer',
      footerElement,
      tuningContext,
      tuningActions,
    );
    if (footerElement.hasChildNodes()) {
      tuningBodyElement.appendChild(footerElement);
    }

    if (!supportsTextTuning && !supportsElementTuning) {
      const emptyElement = document.createElement('div');
      emptyElement.textContent = 'No tuning options available.';
      emptyElement.style.fontSize = '12px';
      emptyElement.style.color = '#475569';
      tuningBodyElement.appendChild(emptyElement);
    }

    renderTuningExtensionWrappers(tuningContext, tuningActions);
    tuningModalElement.style.zIndex = String(toolkitConfig.zIndex + 1);
    tuningModalElement.style.display = 'block';
    positionTuningPanel();
  };

  const hideDimOverlay = () => {
    dimTargetElement = null;
    if (dimHideTimeout !== null) {
      window.clearTimeout(dimHideTimeout);
      dimHideTimeout = null;
    }

    for (const dimElement of dimElements) {
      dimElement.style.display = 'none';
    }
  };

  const showDimForElement = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const topHeight = Math.max(0, rect.top);
    const bottomTop = Math.min(viewportHeight, Math.max(0, rect.bottom));
    const leftWidth = Math.max(0, rect.left);
    const rightLeft = Math.min(viewportWidth, Math.max(0, rect.right));
    const middleTop = Math.max(0, rect.top);
    const middleHeight = Math.max(
      0,
      Math.min(viewportHeight, rect.bottom) - middleTop,
    );

    dimTargetElement = element;

    const [topElement, rightElement, bottomElement, leftElement] = dimElements;
    topElement.style.display = 'block';
    topElement.style.left = '0px';
    topElement.style.top = '0px';
    topElement.style.width = `${viewportWidth}px`;
    topElement.style.height = `${topHeight}px`;

    rightElement.style.display = 'block';
    rightElement.style.left = `${rightLeft}px`;
    rightElement.style.top = `${middleTop}px`;
    rightElement.style.width = `${Math.max(0, viewportWidth - rightLeft)}px`;
    rightElement.style.height = `${middleHeight}px`;

    bottomElement.style.display = 'block';
    bottomElement.style.left = '0px';
    bottomElement.style.top = `${bottomTop}px`;
    bottomElement.style.width = `${viewportWidth}px`;
    bottomElement.style.height = `${Math.max(0, viewportHeight - bottomTop)}px`;

    leftElement.style.display = 'block';
    leftElement.style.left = '0px';
    leftElement.style.top = `${middleTop}px`;
    leftElement.style.width = `${leftWidth}px`;
    leftElement.style.height = `${middleHeight}px`;
  };

  const scheduleDimHide = () => {
    if (dimHideTimeout !== null) {
      window.clearTimeout(dimHideTimeout);
    }

    dimHideTimeout = window.setTimeout(() => {
      hideDimOverlay();
    }, SELECTION_CONFIRMATION_MS);
  };

  const hideHoverOverlay = () => {
    hoverElement.style.display = 'none';
    hoverLabelElement.textContent = '';
    hoverLabelTargetElement = null;
    hoverLabelRequestId += 1;
  };

  const showHoverForElement = (element: Element | null) => {
    if (!element || toolkitRootElement.contains(element)) {
      hideHoverOverlay();
      if (isSelectionMode) {
        hideDimOverlay();
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    hoverElement.style.display = 'block';
    hoverElement.style.borderRadius = computedStyle.borderRadius || '6px';
    updateOverlayLabelForElement(hoverLabelElement, element, rect);
    if (hoverLabelTargetElement !== element) {
      hoverLabelTargetElement = element;
      hoverLabelRequestId += 1;
      const requestId = hoverLabelRequestId;
      void buildSelectionContextForElement(element)
        .then((selectionContext) => {
          if (
            requestId !== hoverLabelRequestId ||
            hoverLabelTargetElement !== element ||
            hoverElement.style.display === 'none'
          ) {
            return null;
          }

          updateOverlayLabelForElement(
            hoverLabelElement,
            element,
            element.getBoundingClientRect(),
            selectionContext,
          );

          return enrichSelectionContextSourceLocation(selectionContext);
        })
        .then((selectionContext) => {
          if (!selectionContext) {
            return;
          }

          if (
            requestId !== hoverLabelRequestId ||
            hoverLabelTargetElement !== element ||
            hoverElement.style.display === 'none'
          ) {
            return;
          }

          updateOverlayLabelForElement(
            hoverLabelElement,
            element,
            element.getBoundingClientRect(),
            selectionContext,
          );
        })
        .catch(() => {
          // Best effort only; the immediate DOM label remains visible.
        });
    }
    applyHoverContrastForElement(hoverElement, element);
    applyElementRect(hoverElement, rect);
    showDimForElement(element);
  };

  const hideSelectedOverlay = () => {
    selectedTargetElement = null;
    selectedElement.style.display = 'none';
    selectedLabelElement.textContent = '';
    selectedElement.classList.remove('agentic-react-selection-pulse');
    if (selectedPulseTimeout !== null) {
      window.clearTimeout(selectedPulseTimeout);
      selectedPulseTimeout = null;
    }
  };

  const createMultiSelectedOverlay = (
    element: Element,
    selectionContext: SelectionContext,
  ) => {
    const overlayElement = document.createElement('div');
    const labelElement = document.createElement('div');
    const actions = createOverlayActions();

    overlayElement.setAttribute('data-agentic-react-selected', 'true');
    overlayElement.setAttribute('data-agentic-react-multi-selected', 'true');
    overlayElement.style.position = 'fixed';
    overlayElement.style.pointerEvents = 'none';
    overlayElement.style.display = 'none';
    overlayElement.style.background = 'transparent';
    overlayElement.style.zIndex = String(Math.max(0, toolkitConfig.zIndex - 1));
    overlayElement.style.setProperty(
      '--agentic-react-selection-accent',
      toolkitConfig.accentColor,
    );

    labelElement.setAttribute('data-agentic-react-selected-label', 'true');
    labelElement.style.position = 'absolute';
    labelElement.style.pointerEvents = 'none';
    labelElement.style.maxWidth = 'min(260px, calc(100vw - 24px))';
    labelElement.style.overflow = 'hidden';
    labelElement.style.textOverflow = 'ellipsis';
    labelElement.style.whiteSpace = 'nowrap';

    overlayElement.appendChild(labelElement);
    overlayElement.appendChild(actions.actionsElement);
    stopHostActivationEvents(actions.actionsElement);
    document.body.appendChild(overlayElement);

    const overlay = {
      element,
      overlayElement,
      labelElement,
      actions,
      selectionContext,
      pulseTimeout: null,
    };

    actions.tuneButtonElement.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTuningModal({
        anchorElement: actions.tuneButtonElement,
        element,
        selectionContext: overlay.selectionContext,
        setSelectionContext: (nextSelectionContext) => {
          multiSelectionContexts = multiSelectionContexts.map((context) =>
            context === overlay.selectionContext
              ? nextSelectionContext
              : context,
          );
          overlay.selectionContext = nextSelectionContext;
        },
      });
    });

    actions.deleteButtonElement.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeMultiSelectedOverlay(overlay);
      updateStatus(
        `${multiSelectionContexts.length} selected. Continue selecting or click Done.`,
      );
    });

    return overlay;
  };

  const updateMultiSelectedOverlay = (
    overlay: (typeof multiSelectedOverlays)[number],
  ) => {
    const rect = overlay.element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(overlay.element);
    overlay.overlayElement.style.display = 'block';
    overlay.overlayElement.style.borderRadius =
      computedStyle.borderRadius || '6px';
    updateOverlayLabelForElement(
      overlay.labelElement,
      overlay.element,
      rect,
      overlay.selectionContext,
    );
    applyElementRect(overlay.overlayElement, rect);
  };

  const pulseMultiSelectedOverlay = (
    overlay: (typeof multiSelectedOverlays)[number],
  ) => {
    overlay.overlayElement.classList.remove('agentic-react-selection-pulse');
    void overlay.overlayElement.offsetWidth;
    overlay.overlayElement.classList.add('agentic-react-selection-pulse');

    if (overlay.pulseTimeout !== null) {
      window.clearTimeout(overlay.pulseTimeout);
    }
    overlay.pulseTimeout = window.setTimeout(() => {
      overlay.overlayElement.classList.remove('agentic-react-selection-pulse');
      overlay.pulseTimeout = null;
    }, SELECTION_CONFIRMATION_MS);
  };

  const showMultiSelectedForElement = (
    element: Element,
    selectionContext: SelectionContext,
    shouldPulse = false,
  ) => {
    if (toolkitRootElement.contains(element)) {
      return;
    }

    let overlay = multiSelectedOverlays.find(
      (candidateOverlay) => candidateOverlay.element === element,
    );
    if (!overlay) {
      overlay = createMultiSelectedOverlay(element, selectionContext);
      multiSelectedOverlays.push(overlay);
    } else {
      overlay.selectionContext = selectionContext;
    }

    updateMultiSelectedOverlay(overlay);

    if (shouldPulse) {
      pulseMultiSelectedOverlay(overlay);
    }
  };

  const clearMultiSelectedOverlays = () => {
    for (const overlay of multiSelectedOverlays) {
      if (overlay.pulseTimeout !== null) {
        window.clearTimeout(overlay.pulseTimeout);
      }
      overlay.overlayElement.remove();
    }
    multiSelectedOverlays = [];
  };

  const removeMultiSelectedOverlay = (
    overlay: (typeof multiSelectedOverlays)[number],
  ) => {
    if (overlay.pulseTimeout !== null) {
      window.clearTimeout(overlay.pulseTimeout);
    }
    overlay.overlayElement.remove();
    multiSelectedOverlays = multiSelectedOverlays.filter(
      (candidateOverlay) => candidateOverlay !== overlay,
    );
    multiSelectionContexts = multiSelectionContexts.filter(
      (selectionContext) =>
        selectionContext !== overlay.selectionContext &&
        selectionContext.selector !== overlay.selectionContext.selector,
    );
    renderMultiSelectionControls();
  };

  const clearMultiSelections = () => {
    multiSelectionContexts = [];
    clearMultiSelectedOverlays();
    closeTuningModal();
    renderMultiSelectionControls();
  };

  const clearPendingSingleSelection = () => {
    pendingSingleSelectionContext = null;
    hideSelectedOverlay();
  };

  const cancelPendingSelection = () => {
    selectionSessionId += 1;
    isSelectionMode = false;
    isMultiSelectionMode = false;
    clearPendingSingleSelection();
    clearMultiSelections();
    hideHoverOverlay();
    hideDimOverlay();
    closeTuningModal();
    clearSelectableElementCache();
    selectButtonElement.textContent = 'Select';
    multiselectButtonElement.textContent = 'Multiselect';
    launcherButtonElement.setAttribute(
      'aria-label',
      'Open Agentic React toolkit',
    );
    isPanelOpen = true;
    renderPanelVisibility();
    updateStatus('Selection cancelled');
  };

  const showSelectedForElement = (
    element: Element,
    shouldPulse = false,
    selectionContext: SelectionContext | null = pendingSingleSelectionContext ||
      lastSelectionContext,
  ) => {
    if (toolkitRootElement.contains(element)) {
      hideSelectedOverlay();
      return;
    }

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    selectedTargetElement = element;
    selectedElement.style.display = 'block';
    selectedElement.style.borderRadius = computedStyle.borderRadius || '6px';
    updateOverlayLabelForElement(
      selectedLabelElement,
      element,
      rect,
      selectionContext,
    );
    applyElementRect(selectedElement, rect);

    if (!shouldPulse) {
      return;
    }

    selectedElement.classList.remove('agentic-react-selection-pulse');
    void selectedElement.offsetWidth;
    selectedElement.classList.add('agentic-react-selection-pulse');

    if (selectedPulseTimeout !== null) {
      window.clearTimeout(selectedPulseTimeout);
    }
    selectedPulseTimeout = window.setTimeout(() => {
      selectedElement.classList.remove('agentic-react-selection-pulse');
      selectedPulseTimeout = null;
    }, SELECTION_CONFIRMATION_MS);
  };

  const updateSelectionOverlays = () => {
    if (selectedTargetElement?.isConnected) {
      showSelectedForElement(selectedTargetElement);
    } else if (selectedTargetElement) {
      hideSelectedOverlay();
    }

    multiSelectedOverlays = multiSelectedOverlays.filter((overlay) => {
      if (!overlay.element.isConnected) {
        if (overlay.pulseTimeout !== null) {
          window.clearTimeout(overlay.pulseTimeout);
        }
        overlay.overlayElement.remove();
        return false;
      }

      updateMultiSelectedOverlay(overlay);
      return true;
    });

    if (dimTargetElement?.isConnected) {
      showDimForElement(dimTargetElement);
    } else if (dimTargetElement) {
      hideDimOverlay();
    }

    if (activeTuningSession) {
      positionTuningPanel();
    }
  };

  const isToolkitElement = (element: Element) =>
    toolkitRootElement.contains(element) ||
    tuningModalElement.contains(element) ||
    hoverElement.contains(element) ||
    selectedElement.contains(element) ||
    multiSelectedOverlays.some(({ overlayElement }) =>
      overlayElement.contains(element),
    ) ||
    dimElements.some((dimElement) => dimElement.contains(element));

  const isToolkitNode = (node: Node) =>
    toolkitRootElement.contains(node) ||
    tuningModalElement.contains(node) ||
    hoverElement.contains(node) ||
    selectedElement.contains(node) ||
    multiSelectedOverlays.some(({ overlayElement }) =>
      overlayElement.contains(node),
    ) ||
    dimElements.some((dimElement) => dimElement.contains(node));

  const getSelectableElement = (clientX: number, clientY: number) =>
    getSelectableElementAtPosition(clientX, clientY, isToolkitElement);

  const onMouseMove = (mouseEvent: MouseEvent) => {
    if (!isSelectionMode) return;

    showHoverForElement(
      getSelectableElement(mouseEvent.clientX, mouseEvent.clientY),
    );
  };

  const onSelect = async (mouseEvent: MouseEvent) => {
    const clickTarget = mouseEvent.target;
    if (!isSelectionMode) {
      if (
        isPanelOpen &&
        clickTarget instanceof Node &&
        !toolkitRootElement.contains(clickTarget)
      ) {
        isPanelOpen = false;
        renderPanelVisibility();
      }
      return;
    }

    if (clickTarget instanceof Node && isToolkitNode(clickTarget)) {
      return;
    }

    const selectedTarget = getSelectableElement(
      mouseEvent.clientX,
      mouseEvent.clientY,
    );

    if (!selectedTarget) {
      return;
    }

    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    mouseEvent.stopImmediatePropagation();

    let didCaptureSelection = false;
    const captureSessionId = selectionSessionId;

    try {
      const selectionContext = await enrichSelectionContextSourceLocation(
        await buildSelectionContextForElement(selectedTarget),
      );
      if (captureSessionId !== selectionSessionId || !isSelectionMode) {
        return;
      }
      if (isMultiSelectionMode) {
        pendingSingleSelectionContext = null;
        hideSelectedOverlay();
        showMultiSelectedForElement(selectedTarget, selectionContext, true);
      } else {
        pendingSingleSelectionContext = selectionContext;
        showSelectedForElement(selectedTarget, true, selectionContext);
      }
      showDimForElement(selectedTarget);
      scheduleDimHide();
      didCaptureSelection = true;
      isPanelOpen = true;
      renderPanelVisibility();
      const capturedSelectionLabel = `${selectionContext.componentName || 'selection'}${
        selectionContext.selector ? ` (${selectionContext.selector})` : ''
      }`;
      if (isMultiSelectionMode) {
        const existingSelectionIndex = multiSelectionContexts.findIndex(
          (context) => context.selector === selectionContext.selector,
        );
        if (existingSelectionIndex >= 0) {
          multiSelectionContexts[existingSelectionIndex] = selectionContext;
        } else {
          multiSelectionContexts.push(selectionContext);
        }
        renderMultiSelectionControls();
        updateStatus(
          `Added ${capturedSelectionLabel}. ${multiSelectionContexts.length} selected. Click Done to copy all.`,
        );
      } else {
        updateStatus(`Captured ${capturedSelectionLabel}. Click Done to copy.`);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to capture selection context';
      if (captureSessionId === selectionSessionId) {
        updateStatus(message);
      }
    } finally {
      // A prior async capture can finish after Escape and a new selection
      // session have already started. It must not reset the new session's
      // mode, controls, overlays, or selectable-element cache.
      if (captureSessionId === selectionSessionId) {
        if (isMultiSelectionMode && didCaptureSelection) {
          isSelectionMode = true;
          multiselectButtonElement.textContent = 'Selecting...';
          launcherButtonElement.setAttribute(
            'aria-label',
            'Multiselect mode active for Agentic React toolkit',
          );
        } else {
          isSelectionMode = false;
          selectButtonElement.textContent = 'Select';
          multiselectButtonElement.textContent = 'Multiselect';
          launcherButtonElement.setAttribute(
            'aria-label',
            'Open Agentic React toolkit',
          );
        }
        renderMultiSelectionControls();
        hideHoverOverlay();
        if (!didCaptureSelection) {
          hideDimOverlay();
        }
        clearSelectableElementCache();
      }
    }
  };

  const enterSelectionMode = () => {
    selectionSessionId += 1;
    isSelectionMode = true;
    isMultiSelectionMode = false;
    clearMultiSelections();
    clearPendingSingleSelection();
    clearSelectableElementCache();
    isPanelOpen = true;
    renderPanelVisibility();
    selectButtonElement.textContent = 'Selecting...';
    multiselectButtonElement.textContent = 'Multiselect';
    doneButtonElement.style.display = 'none';
    launcherButtonElement.setAttribute(
      'aria-label',
      'Selection mode active for Agentic React toolkit',
    );
    updateStatus(
      'Selection mode enabled. Click any element to capture context.',
    );
  };

  const enterMultiSelectionMode = () => {
    selectionSessionId += 1;
    isSelectionMode = true;
    isMultiSelectionMode = true;
    clearMultiSelections();
    clearPendingSingleSelection();
    clearSelectableElementCache();
    isPanelOpen = true;
    renderPanelVisibility();
    selectButtonElement.textContent = 'Select';
    multiselectButtonElement.textContent = 'Selecting...';
    doneButtonElement.style.display = 'block';
    launcherButtonElement.setAttribute(
      'aria-label',
      'Multiselect mode active for Agentic React toolkit',
    );
    updateStatus('Multiselect enabled. Select elements, then click Done.');
  };

  const exitSelectionMode = () => {
    selectionSessionId += 1;
    isSelectionMode = false;
    isMultiSelectionMode = false;
    pendingSingleSelectionContext = null;
    clearMultiSelections();
    hideSelectedOverlay();
    selectButtonElement.textContent = 'Select';
    multiselectButtonElement.textContent = 'Multiselect';
    launcherButtonElement.setAttribute(
      'aria-label',
      'Open Agentic React toolkit',
    );
    closeTuningModal();
    hideHoverOverlay();
    hideDimOverlay();
    clearSelectableElementCache();
    renderMultiSelectionControls();
  };

  const togglePanel = () => {
    isPanelOpen = !isPanelOpen;
    if (!isPanelOpen) {
      exitSelectionMode();
    }
    renderPanelVisibility();
  };

  const showToolkit = () => {
    isToolkitVisible = true;
    toolkitRootElement.style.display = toolkitConfig.enabled ? 'flex' : 'none';
  };

  const hideToolkit = () => {
    isToolkitVisible = false;
    toolkitRootElement.style.display = 'none';
    exitSelectionMode();
    hideSelectedOverlay();
    closeTuningModal();
  };

  const setToolkitConfig = (config: Partial<ToolkitConfig>) => {
    toolkitConfig = mergeToolkitConfig(toolkitConfig, config);
    updateToolkitStyle();

    if (!toolkitConfig.enabled) {
      hideToolkit();
    } else if (isToolkitVisible) {
      showToolkit();
    }

    return toolkitConfig;
  };

  const getLastSelectionContext = (): SelectionContext | null => {
    return lastSelectionContext;
  };

  const enrichSelectionContextSourceSnippets = async (
    selectionContext: SelectionContext,
  ): Promise<SelectionContext> => {
    let enrichedSelectionContext =
      await enrichSelectionContextSourceLocation(selectionContext);

    if (enrichedSelectionContext.sourceSnippets.length > 0) {
      return enrichedSelectionContext;
    }

    const sourceSnippets: SelectionContext['sourceSnippets'] = [];
    const resolvedSources = enrichedSelectionContext.resolvedSources.slice(
      0,
      DEFAULT_MAX_SNIPPET_FILES,
    );
    const normalizedSourceRoot = getNormalizedSourceRoot();

    for (const resolvedSource of resolvedSources) {
      if (
        !isAllowedProjectSourcePath(
          resolvedSource.filePath,
          normalizedSourceRoot,
        )
      ) {
        continue;
      }

      if (!resolvedSource.lineNumber || resolvedSource.lineNumber < 1) {
        continue;
      }

      const candidateUrls = buildBrowserSourceCandidates(
        resolvedSource.filePath,
        normalizedSourceRoot,
      );
      if (candidateUrls.length === 0) {
        continue;
      }

      for (const candidateUrl of candidateUrls) {
        try {
          const response = await fetch(candidateUrl, { cache: 'no-store' });
          if (!response.ok) {
            continue;
          }

          const sourceTextResponse = await response.text();
          const sourceText =
            normalizeSourceTextFromViteResponse(sourceTextResponse);
          if (!sourceText) {
            continue;
          }
          const snippetPayload = buildSourceSnippet(
            sourceText,
            resolvedSource.lineNumber,
            DEFAULT_SNIPPET_CONTEXT_LINES,
          );

          if (!snippetPayload) {
            continue;
          }

          sourceSnippets.push({
            filePath:
              toAbsoluteSourcePath(
                resolvedSource.filePath,
                normalizedSourceRoot,
              ) ?? resolvedSource.filePath,
            startLine: snippetPayload.startLine,
            endLine: snippetPayload.endLine,
            snippet: snippetPayload.snippet,
          });
          break;
        } catch (_error) {
          // best effort only
        }
      }
    }

    if (sourceSnippets.length === 0) {
      return enrichedSelectionContext;
    }

    enrichedSelectionContext = {
      ...enrichedSelectionContext,
      sourceSnippets,
    };
    return {
      ...enrichedSelectionContext,
      sourcePreview: buildSelectionSourcePreview(enrichedSelectionContext),
    };
  };

  const copySelectionContexts = async (
    selectionContexts: SelectionContext[],
  ): Promise<{
    success: boolean;
    copied: boolean;
    contexts: SelectionContext[];
    error?: string;
  }> => {
    if (selectionContexts.length === 0) {
      return {
        success: false,
        copied: false,
        contexts: [],
        error: 'No selections found',
      };
    }

    const textToCopy = selectionContexts
      .map(
        (selectionContext, index) =>
          `Selection ${index + 1}\n${toTextContext(selectionContext)}`,
      )
      .join('\n\n---\n\n');
    const copied = await copyText(textToCopy);

    return {
      success: copied,
      copied,
      contexts: selectionContexts,
      error: copied ? undefined : 'Failed to copy selections to clipboard',
    };
  };

  const copyLastSelectionContext = async (
    format: 'text' | 'json' = 'text',
  ): Promise<{
    success: boolean;
    copied: boolean;
    format: 'text' | 'json';
    context?: SelectionContext;
    error?: string;
  }> => {
    if (!lastSelectionContext) {
      return {
        success: false,
        copied: false,
        format,
        error: 'No selection context found',
      };
    }

    lastSelectionContext =
      await enrichSelectionContextSourceSnippets(lastSelectionContext);

    const textToCopy =
      format === 'json'
        ? JSON.stringify(lastSelectionContext, null, 2)
        : toTextContext(lastSelectionContext);
    const copied = await copyText(textToCopy);

    if (!copied) {
      return {
        success: false,
        copied: false,
        format,
        context: lastSelectionContext,
        error: 'Failed to copy context to clipboard',
      };
    }

    updateStatus('Copied last selection context');

    return {
      success: true,
      copied: true,
      format,
      context: lastSelectionContext,
    };
  };

  const hasPendingSelection = () =>
    !!pendingSingleSelectionContext || multiSelectionContexts.length > 0;

  const commitPendingSelection = () => {
    doneButtonElement.click();
  };

  const shortcutDispatcher = createShortcutDispatcher({
    getShortcuts: () =>
      settingsSnapshot?.effectiveSettings.shortcuts ||
      target[__AGENTIC_REACT_CONFIG__]?.settings?.effectiveSettings
        .shortcuts || {
        singleSelect: 'Ctrl+Alt+Shift+S',
        multiSelect: 'Ctrl+Alt+Shift+M',
        toggleToolbox: 'Ctrl+Alt+Shift+A',
        done: 'Enter',
      },
    isPaused: () => recordingShortcutAction !== null,
    isActionApplicable: (action) => {
      if (!toolkitConfig.enabled) {
        return false;
      }
      if (action === 'done') {
        return hasPendingSelection();
      }
      return true;
    },
    onAction: (action) => {
      if (action === 'singleSelect') {
        enterSelectionMode();
      } else if (action === 'multiSelect') {
        enterMultiSelectionMode();
      } else if (action === 'toggleToolbox') {
        togglePanel();
      } else {
        commitPendingSelection();
      }
    },
  });

  const handleShortcutRecording = (event: KeyboardEvent): boolean => {
    if (!recordingShortcutAction) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.key === 'Escape') {
      escapeKeyCycleGuard.handleKeyDown(event.key, true);
      recordingShortcutAction = null;
      renderSettingsPanel();
      updateStatus('Shortcut recording cancelled.');
      return true;
    }

    const normalized = normalizeShortcutFromEvent(event);
    if (normalized.success === false) {
      updateStatus(normalized.reason);
      renderSettingsPanel();
      return true;
    }

    const existingShortcuts = getEffectiveShortcutSettings();
    if (!existingShortcuts || !settingsClient) {
      updateStatus(getSettingsCapabilityMessage());
      recordingShortcutAction = null;
      renderSettingsPanel();
      return true;
    }

    const duplicateAction = findDuplicateShortcut(
      normalized.label,
      existingShortcuts,
      recordingShortcutAction,
    );
    if (duplicateAction) {
      updateStatus(
        `${normalized.label} is already assigned to ${getShortcutActionLabel(
          duplicateAction,
        )}.`,
      );
      renderSettingsPanel();
      return true;
    }

    const actionToSave = recordingShortcutAction;
    recordingShortcutAction = null;
    renderSettingsPanel();
    updateStatus(`Saving ${getShortcutActionLabel(actionToSave)} shortcut.`);
    void settingsClient
      .updateShortcuts({ [actionToSave]: normalized.label })
      .then((result) => {
        if (result.success === false) {
          updateStatus(result.error.message);
          renderSettingsPanel();
          return;
        }
        return applySettingsSnapshot(result).then(() => {
          updateStatus(`Saved ${normalized.label}.`);
        });
      })
      .catch((error) => {
        updateStatus(
          error instanceof Error ? error.message : 'Failed to save shortcut.',
        );
        renderSettingsPanel();
      });
    return true;
  };

  const handleEscapeKeyDown = (event: KeyboardEvent): boolean => {
    const ownsEscape =
      !!activeTuningSession || isSelectionMode || hasPendingSelection();
    const disposition = escapeKeyCycleGuard.handleKeyDown(
      event.key,
      ownsEscape,
    );
    if (disposition === 'ignore') {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (disposition === 'repeat') {
      return true;
    }

    if (activeTuningSession) {
      closeTuningModal();
      return true;
    }

    if (isSelectionMode || hasPendingSelection()) {
      cancelPendingSelection();
    }
    return true;
  };

  const onGlobalKeyDown = (event: KeyboardEvent) => {
    if (handleShortcutRecording(event)) {
      return;
    }
    if (event.key === 'Escape' && handleEscapeKeyDown(event)) {
      return;
    }
    shortcutDispatcher.handleKeyDown(event);
  };

  const onGlobalKeyUp = (event: KeyboardEvent) => {
    if (!escapeKeyCycleGuard.handleKeyUp(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  settingsButtonElement.addEventListener('click', () => {
    isSettingsSectionOpen = !isSettingsSectionOpen;
    if (isSettingsSectionOpen) {
      renderSettingsPanel();
    }
    renderPanelVisibility();
  });

  iconChangeButtonElement.addEventListener('click', () => {
    if (!settingsClient?.getCapability().available) {
      updateStatus(getSettingsCapabilityMessage());
      return;
    }
    iconFileInputElement.click();
  });

  iconFileInputElement.addEventListener('change', () => {
    const file = iconFileInputElement.files?.[0];
    iconFileInputElement.value = '';
    if (!file) {
      return;
    }
    void openToolboxIconCropper({
      file,
      zIndex: toolkitConfig.zIndex + 2,
      restoreFocusTo: iconChangeButtonElement,
      onError: (message) => updateStatus(message),
      onCancel: () => updateStatus('Icon change cancelled.'),
      onApply: async (icon) => {
        if (!settingsClient) {
          throw new Error(getSettingsCapabilityMessage());
        }
        const result = await settingsClient.applyIcon(icon);
        if (result.success === false) {
          throw new Error(result.error.message);
        }
        await preloadImage(
          result.effectiveSettings.appearance.toolboxIconUrl || '',
        );
        await applySettingsSnapshot(result);
        updateStatus('Updated toolbox icon.');
      },
    }).catch((error) => {
      updateStatus(
        error instanceof Error ? error.message : 'Failed to process image.',
      );
    });
  });

  iconResetButtonElement.addEventListener('click', () => {
    if (!settingsClient?.getCapability().available) {
      updateStatus(getSettingsCapabilityMessage());
      return;
    }
    setDisabled(iconResetButtonElement, true);
    void settingsClient
      .resetIcon()
      .then((result) => {
        if (result.success === false) {
          updateStatus(result.error.message);
          renderSettingsPanel();
          return;
        }
        return applySettingsSnapshot(result).then(() => {
          updateStatus('Reset toolbox icon.');
        });
      })
      .catch((error) => {
        updateStatus(
          error instanceof Error ? error.message : 'Failed to reset icon.',
        );
        renderSettingsPanel();
      });
  });

  selectedActions.tuneButtonElement.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedTargetElement || !pendingSingleSelectionContext) {
      updateStatus('No selection to adjust.');
      return;
    }

    openTuningModal({
      anchorElement: selectedActions.tuneButtonElement,
      element: selectedTargetElement,
      selectionContext: pendingSingleSelectionContext,
      setSelectionContext: (nextSelectionContext) => {
        pendingSingleSelectionContext = nextSelectionContext;
      },
    });
  });

  selectedActions.deleteButtonElement.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    pendingSingleSelectionContext = null;
    hideSelectedOverlay();
    hideDimOverlay();
    closeTuningModal();
    renderMultiSelectionControls();
    updateStatus('Cleared selected context.');
  });

  tuningCloseButtonElement.addEventListener('click', () => {
    closeTuningModal();
  });

  tuningModalElement.addEventListener('click', (event) => {
    if (event.target === tuningModalElement) {
      closeTuningModal();
    }
  });

  launcherButtonElement.addEventListener('click', () => {
    togglePanel();
  });

  selectButtonElement.addEventListener('click', () => {
    if (isSelectionMode) {
      exitSelectionMode();
    } else {
      enterSelectionMode();
    }
  });

  multiselectButtonElement.addEventListener('click', () => {
    if (isMultiSelectionMode) {
      exitSelectionMode();
    } else {
      enterMultiSelectionMode();
    }
  });

  clearAllButtonElement.addEventListener('click', () => {
    if (!isMultiSelectionMode) {
      return;
    }

    if (multiSelectionContexts.length === 0) {
      updateStatus('No selections to clear.');
      return;
    }

    clearMultiSelections();
    hideDimOverlay();
    updateStatus('Cleared all selections. Continue selecting or click Done.');
  });

  doneButtonElement.addEventListener('click', () => {
    void (async () => {
      if (isMultiSelectionMode) {
        const selectionContextsToCopy = multiSelectionContexts.slice();
        const copyResult = await copySelectionContexts(selectionContextsToCopy);
        const copiedMessage = `Copied ${copyResult.contexts.length} selected ${
          copyResult.contexts.length === 1 ? 'context' : 'contexts'
        }`;
        if (copyResult.success) {
          lastSelectionContext =
            copyResult.contexts[copyResult.contexts.length - 1] ??
            lastSelectionContext;
        } else {
          updateStatus(copyResult.error || 'Failed to copy selections');
          return;
        }
        exitSelectionMode();
        isPanelOpen = true;
        renderPanelVisibility();
        if (copyResult.success) {
          updateStatus(copiedMessage);
        }
        return;
      }

      if (pendingSingleSelectionContext) {
        const selectionContextToCopy =
          await enrichSelectionContextSourceSnippets(
            pendingSingleSelectionContext,
          );
        // Keep the enriched pending value available when clipboard access
        // fails so Done can be retried without losing the transaction.
        pendingSingleSelectionContext = selectionContextToCopy;
        const copied = await copyText(toTextContext(selectionContextToCopy));
        if (!copied) {
          updateStatus('Failed to copy context to clipboard');
          return;
        }
        lastSelectionContext = selectionContextToCopy;
        exitSelectionMode();
        isPanelOpen = true;
        renderPanelVisibility();
        updateStatus('Copied selected context');
      } else {
        updateStatus('No selection to copy.');
      }
    })();
  });

  const mountToolkit = () => {
    if (!document.body) {
      return false;
    }

    mountSelectionStyles();
    updateToolkitStyle();
    toolkitRootElement.style.display = isToolkitVisible ? 'flex' : 'none';

    for (const dimElement of dimElements) {
      if (!dimElement.isConnected) {
        document.body.appendChild(dimElement);
      }
    }
    if (!toolkitRootElement.isConnected) {
      document.body.appendChild(toolkitRootElement);
    }
    if (!hoverElement.isConnected) {
      document.body.appendChild(hoverElement);
    }
    if (!selectedElement.isConnected) {
      document.body.appendChild(selectedElement);
    }
    if (!tuningModalElement.isConnected) {
      document.body.appendChild(tuningModalElement);
    }
    return true;
  };

  if (!mountToolkit()) {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        mountToolkit();
      },
      { once: true },
    );
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onSelect, true);
  document.addEventListener('scroll', updateSelectionOverlays, true);
  window.addEventListener('keydown', onGlobalKeyDown, true);
  window.addEventListener('keyup', onGlobalKeyUp, true);
  window.addEventListener('resize', updateSelectionOverlays);

  return {
    showToolkit,
    hideToolkit,
    setToolkitConfig,
    enterSelectionMode,
    exitSelectionMode,
    setSelectionMode: (enabled: boolean) => {
      if (enabled) {
        enterSelectionMode();
      } else {
        exitSelectionMode();
      }
    },
    getLastSelectionContext,
    copyLastSelectionContext,
    registerTuningModalExtension,
  };
};
