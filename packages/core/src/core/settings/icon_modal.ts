import type { AgenticReactToolboxIconMime } from '../../shared/types.js';
import {
  type ImageCropState,
  type ImageCropperSource,
  createDefaultImageCropState,
  decodeImageCropperSource,
  dragImageCropState,
  encodeImageCrop,
  isImageCropperError,
  renderImageCropToCanvas,
  rotateImageCropState,
  zoomImageCropState,
} from './image_cropper.js';
import { stopHostActivationEvents } from './ui.js';

export interface ToolboxIconCropperOptions {
  file: File;
  zIndex: number;
  restoreFocusTo: HTMLElement;
  onApply: (icon: {
    data: string;
    mime: AgenticReactToolboxIconMime;
  }) => Promise<void>;
  onCancel?: () => void;
  onError?: (message: string) => void;
}

const PREVIEW_SIZE = 256;

export const openToolboxIconCropper = async ({
  file,
  zIndex,
  restoreFocusTo,
  onApply,
  onCancel,
  onError,
}: ToolboxIconCropperOptions): Promise<void> => {
  let source: ImageCropperSource;
  try {
    source = await decodeImageCropperSource(file);
  } catch (error) {
    const message = getCropperErrorMessage(error);
    onError?.(message);
    throw error;
  }

  createToolboxIconCropperModal({
    source,
    zIndex,
    restoreFocusTo,
    onApply,
    onCancel,
    onError,
  });
};

const createToolboxIconCropperModal = ({
  source,
  zIndex,
  restoreFocusTo,
  onApply,
  onCancel,
  onError,
}: Omit<ToolboxIconCropperOptions, 'file'> & {
  source: ImageCropperSource;
}) => {
  let state: ImageCropState = createDefaultImageCropState(source);
  let dragStart: { x: number; y: number; state: ImageCropState } | null = null;
  let isApplying = false;
  const previousActiveElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : restoreFocusTo;

  const root = document.createElement('div');
  const dialog = document.createElement('div');
  const title = document.createElement('div');
  const previewFrame = document.createElement('div');
  const previewCanvas = document.createElement('canvas');
  const finalPreview = document.createElement('canvas');
  const zoomLabel = document.createElement('label');
  const zoomInput = document.createElement('input');
  const rotateRow = document.createElement('div');
  const rotateLeftButton = createModalButton('Rotate left', true);
  const rotateRightButton = createModalButton('Rotate right', true);
  const errorElement = document.createElement('div');
  const footer = document.createElement('div');
  const cancelButton = createModalButton('Cancel', true);
  const applyButton = createModalButton('Apply', false);

  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.zIndex = String(zIndex);
  root.style.display = 'grid';
  root.style.placeItems = 'center';
  root.style.padding = '16px';
  root.style.background = 'rgba(15, 23, 42, 0.42)';
  root.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  stopHostActivationEvents(root);
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      close(false);
    }
  });

  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'agentic-react-icon-crop-title');
  dialog.tabIndex = -1;
  dialog.style.width = 'min(360px, calc(100vw - 32px))';
  dialog.style.background = '#ffffff';
  dialog.style.border = '1px solid rgba(15, 23, 42, 0.16)';
  dialog.style.borderRadius = '10px';
  dialog.style.boxShadow = '0 24px 70px rgba(15, 23, 42, 0.34)';
  dialog.style.padding = '14px';
  dialog.style.display = 'flex';
  dialog.style.flexDirection = 'column';
  dialog.style.gap = '12px';
  dialog.style.color = '#111827';

  title.id = 'agentic-react-icon-crop-title';
  title.textContent = 'Crop toolbox icon';
  title.style.fontSize = '14px';
  title.style.fontWeight = '800';

  previewFrame.style.width = `${PREVIEW_SIZE}px`;
  previewFrame.style.maxWidth = '100%';
  previewFrame.style.aspectRatio = '1 / 1';
  previewFrame.style.margin = '0 auto';
  previewFrame.style.borderRadius = '999px';
  previewFrame.style.overflow = 'hidden';
  previewFrame.style.cursor = 'grab';
  previewFrame.style.touchAction = 'none';
  previewFrame.style.boxShadow =
    '0 0 0 1px rgba(15, 23, 42, 0.16), 0 12px 30px rgba(15, 23, 42, 0.18)';

  previewCanvas.style.width = '100%';
  previewCanvas.style.height = '100%';
  previewCanvas.style.display = 'block';
  previewFrame.appendChild(previewCanvas);

  zoomInput.type = 'range';
  zoomInput.min = String(state.zoom);
  zoomInput.max = String(state.zoom * 4);
  zoomInput.step = '0.01';
  zoomInput.value = String(state.zoom);
  zoomInput.setAttribute('aria-label', 'Zoom icon crop');
  zoomLabel.textContent = 'Zoom';
  zoomLabel.style.display = 'grid';
  zoomLabel.style.gridTemplateColumns = '52px minmax(0, 1fr)';
  zoomLabel.style.alignItems = 'center';
  zoomLabel.style.gap = '8px';
  zoomLabel.style.fontSize = '12px';
  zoomLabel.style.fontWeight = '700';
  zoomLabel.appendChild(zoomInput);

  finalPreview.style.width = '48px';
  finalPreview.style.height = '48px';
  finalPreview.style.borderRadius = '999px';
  finalPreview.style.boxShadow = '0 0 0 1px rgba(15, 23, 42, 0.2)';
  rotateLeftButton.textContent = 'Rotate left';
  rotateRightButton.textContent = 'Rotate right';
  rotateRow.style.display = 'grid';
  rotateRow.style.gridTemplateColumns = '1fr 1fr auto';
  rotateRow.style.gap = '8px';
  rotateRow.style.alignItems = 'center';
  rotateRow.appendChild(rotateLeftButton);
  rotateRow.appendChild(rotateRightButton);
  rotateRow.appendChild(finalPreview);

  errorElement.setAttribute('role', 'status');
  errorElement.setAttribute('aria-live', 'polite');
  errorElement.style.minHeight = '16px';
  errorElement.style.fontSize = '12px';
  errorElement.style.color = '#b91c1c';

  cancelButton.textContent = 'Cancel';
  applyButton.textContent = 'Apply';
  footer.style.display = 'grid';
  footer.style.gridTemplateColumns = '1fr 1fr';
  footer.style.gap = '8px';
  footer.appendChild(cancelButton);
  footer.appendChild(applyButton);

  dialog.appendChild(title);
  dialog.appendChild(previewFrame);
  dialog.appendChild(zoomLabel);
  dialog.appendChild(rotateRow);
  dialog.appendChild(errorElement);
  dialog.appendChild(footer);
  root.appendChild(dialog);
  document.body.appendChild(root);

  const setError = (message: string) => {
    errorElement.textContent = message;
    onError?.(message);
  };
  const render = () => {
    renderImageCropToCanvas(previewCanvas, source, state, {
      size: PREVIEW_SIZE,
      pixelRatio: window.devicePixelRatio || 1,
    });
    renderImageCropToCanvas(finalPreview, source, state, {
      size: 48,
      pixelRatio: window.devicePixelRatio || 1,
    });
  };
  const close = (applied: boolean) => {
    root.remove();
    source.dispose();
    const restoreTarget = restoreFocusTo.isConnected
      ? restoreFocusTo
      : previousActiveElement;
    restoreTarget?.focus?.();
    if (!applied) {
      onCancel?.();
    }
  };

  previewFrame.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    previewFrame.setPointerCapture(event.pointerId);
    previewFrame.style.cursor = 'grabbing';
    dragStart = { x: event.clientX, y: event.clientY, state };
  });
  previewFrame.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    event.preventDefault();
    state = dragImageCropState(
      dragStart.state,
      {
        deltaX: event.clientX - dragStart.x,
        deltaY: event.clientY - dragStart.y,
      },
      source,
      { viewportSize: PREVIEW_SIZE },
    );
    render();
  });
  previewFrame.addEventListener('pointerup', (event) => {
    previewFrame.releasePointerCapture(event.pointerId);
    previewFrame.style.cursor = 'grab';
    dragStart = null;
  });
  previewFrame.addEventListener('pointercancel', () => {
    previewFrame.style.cursor = 'grab';
    dragStart = null;
  });
  zoomInput.addEventListener('input', () => {
    state = zoomImageCropState(state, Number(zoomInput.value), source);
    render();
  });
  rotateLeftButton.addEventListener('click', () => {
    state = rotateImageCropState(state, 'left', source);
    render();
  });
  rotateRightButton.addEventListener('click', () => {
    state = rotateImageCropState(state, 'right', source);
    render();
  });
  cancelButton.addEventListener('click', () => close(false));
  applyButton.addEventListener('click', () => {
    if (isApplying) return;
    isApplying = true;
    applyButton.disabled = true;
    applyButton.textContent = 'Applying...';
    setError('');
    void encodeImageCrop(source, state)
      .then((result) =>
        onApply({
          data: result.data,
          mime: result.mime,
        }),
      )
      .then(() => close(true))
      .catch((error) => {
        isApplying = false;
        applyButton.disabled = false;
        applyButton.textContent = 'Apply';
        setError(getCropperErrorMessage(error));
      });
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(false);
      return;
    }
    trapModalFocus(event, dialog);
  });

  render();
  dialog.focus();
};

const createModalButton = (
  label: string,
  muted: boolean,
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.style.height = '34px';
  button.style.border = '1px solid rgba(15, 23, 42, 0.16)';
  button.style.borderRadius = '8px';
  button.style.background = muted ? '#f8fafc' : '#111827';
  button.style.color = muted ? '#111827' : '#ffffff';
  button.style.fontSize = '12px';
  button.style.fontWeight = '700';
  button.style.cursor = 'pointer';
  return button;
};

const trapModalFocus = (event: KeyboardEvent, container: HTMLElement) => {
  if (event.key !== 'Tab') return;

  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled'));
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const getCropperErrorMessage = (error: unknown): string => {
  if (isImageCropperError(error)) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Failed to process image.';
};
