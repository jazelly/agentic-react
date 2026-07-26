export type ImageCropperInputMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif';

export type ImageCropperOutputMime = 'image/webp' | 'image/png';

export type ImageCropperRotation = 0 | 90 | 180 | 270;

export type ImageCropperErrorCode =
  | 'unsupported_type'
  | 'source_too_large'
  | 'image_too_large'
  | 'decode_failed'
  | 'encode_failed';

export interface ImageCropperStructuredError {
  code: ImageCropperErrorCode;
  message: string;
  detail?: string;
}

export interface ImageCropperDimensions {
  width: number;
  height: number;
}

export interface ImageCropState {
  offsetX: number;
  offsetY: number;
  zoom: number;
  rotation: ImageCropperRotation;
}

export interface ImageCropperSource {
  image: ImageBitmap | HTMLCanvasElement;
  width: number;
  height: number;
  mime: ImageCropperInputMime;
  dispose: () => void;
}

export interface DecodeImageCropperSourceOptions {
  maxBytes?: number;
  maxDimension?: number;
  maxPixels?: number;
}

export interface CreateImageCropStateOptions {
  outputSize?: number;
  rotation?: ImageCropperRotation;
}

export interface ImageCropDragDelta {
  deltaX: number;
  deltaY: number;
}

export interface ImageCropViewportOptions {
  viewportSize?: number;
  outputSize?: number;
}

export interface ImageCropRenderOptions {
  size?: number;
  pixelRatio?: number;
  smoothingQuality?: ImageSmoothingQuality;
}

export interface ImageCropEncodeOptions {
  size?: number;
  maxBytes?: number;
  webpQuality?: number;
  pngQuality?: number;
}

export interface ImageCropEncodeResult {
  data: string;
  mime: ImageCropperOutputMime;
  previewUrl: string;
}

const DEFAULT_OUTPUT_SIZE = 256;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 8192;
const MAX_SOURCE_PIXELS = 40 * 1000 * 1000;
const MAX_ENCODED_BYTES = 1024 * 1024;
const SVG_SNIFF_BYTES = 1024;
const BASE64_CHUNK_SIZE = 0x8000;

const SUPPORTED_INPUT_MIMES: ImageCropperInputMime[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export class ImageCropperError
  extends Error
  implements ImageCropperStructuredError
{
  readonly code: ImageCropperErrorCode;
  readonly detail?: string;

  constructor(error: ImageCropperStructuredError) {
    super(error.message);
    this.name = 'ImageCropperError';
    this.code = error.code;
    this.detail = error.detail;
  }
}

export const isImageCropperError = (
  error: unknown,
): error is ImageCropperError =>
  error instanceof ImageCropperError ||
  (!!error &&
    typeof error === 'object' &&
    typeof (error as Partial<ImageCropperError>).code === 'string' &&
    typeof (error as Partial<ImageCropperError>).message === 'string');

export const createImageCropperError = (
  code: ImageCropperErrorCode,
  message: string,
  detail?: string,
): ImageCropperError =>
  new ImageCropperError({
    code,
    message,
    ...(detail ? { detail } : {}),
  });

export const validateImageCropperInput = async (
  input: Blob,
  options: DecodeImageCropperSourceOptions = {},
): Promise<ImageCropperInputMime> => {
  const maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  if (input.size <= 0) {
    throw createImageCropperError(
      'unsupported_type',
      'Choose a PNG, JPEG, WebP, or GIF image.',
    );
  }
  if (input.size > maxBytes) {
    throw createImageCropperError(
      'source_too_large',
      'Image must be 20 MB or smaller.',
    );
  }

  const head = new Uint8Array(
    await input.slice(0, SVG_SNIFF_BYTES).arrayBuffer(),
  );
  if (isSvgInput(input, head)) {
    throw createImageCropperError(
      'unsupported_type',
      'SVG images are not supported. Choose a raster PNG, JPEG, WebP, or GIF.',
    );
  }

  const mime = detectRasterMime(input, head);
  if (!mime) {
    throw createImageCropperError(
      'unsupported_type',
      'Choose a PNG, JPEG, WebP, or GIF image.',
    );
  }

  return mime;
};

export const decodeImageCropperSource = async (
  input: Blob,
  options: DecodeImageCropperSourceOptions = {},
): Promise<ImageCropperSource> => {
  const mime = await validateImageCropperInput(input, options);
  let bitmapDecodeError: unknown;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(input, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions);
      try {
        validateDecodedDimensions(bitmap, options);
      } catch (error) {
        bitmap.close();
        throw error;
      }
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        mime,
        dispose: () => bitmap.close(),
      };
    } catch (error) {
      if (isImageCropperError(error)) {
        throw error;
      }
      bitmapDecodeError = error;
    }
  }

  try {
    return await decodeImageWithElement(input, mime, options);
  } catch (error) {
    if (isImageCropperError(error)) {
      throw error;
    }
    throw createImageCropperError(
      'decode_failed',
      'Image could not be decoded. Choose a different PNG, JPEG, WebP, or GIF.',
      getDecodeFailureDetail(error, bitmapDecodeError),
    );
  }
};

export const getRotatedImageDimensions = (
  dimensions: ImageCropperDimensions,
  rotation: ImageCropperRotation,
): ImageCropperDimensions =>
  rotation === 90 || rotation === 270
    ? { width: dimensions.height, height: dimensions.width }
    : { width: dimensions.width, height: dimensions.height };

export const getImageCropCoverZoom = (
  dimensions: ImageCropperDimensions,
  rotation: ImageCropperRotation = 0,
  outputSize = DEFAULT_OUTPUT_SIZE,
): number => {
  const rotated = getRotatedImageDimensions(dimensions, rotation);
  return Math.max(outputSize / rotated.width, outputSize / rotated.height);
};

export const createDefaultImageCropState = (
  dimensions: ImageCropperDimensions,
  options: CreateImageCropStateOptions = {},
): ImageCropState => {
  const outputSize = options.outputSize ?? DEFAULT_OUTPUT_SIZE;
  const rotation = normalizeRotation(options.rotation ?? 0);
  return {
    offsetX: 0,
    offsetY: 0,
    zoom: getImageCropCoverZoom(dimensions, rotation, outputSize),
    rotation,
  };
};

export const normalizeImageCropState = (
  state: ImageCropState,
  dimensions: ImageCropperDimensions,
  outputSize = DEFAULT_OUTPUT_SIZE,
): ImageCropState => {
  const rotation = normalizeRotation(state.rotation);
  const coverZoom = getImageCropCoverZoom(dimensions, rotation, outputSize);
  const zoom = Math.max(
    Number.isFinite(state.zoom) ? state.zoom : coverZoom,
    coverZoom,
  );
  const limits = getImageCropOffsetLimits(
    dimensions,
    rotation,
    zoom,
    outputSize,
  );

  return {
    offsetX: clampFinite(state.offsetX, -limits.x, limits.x),
    offsetY: clampFinite(state.offsetY, -limits.y, limits.y),
    zoom,
    rotation,
  };
};

export const dragImageCropState = (
  state: ImageCropState,
  delta: ImageCropDragDelta,
  dimensions: ImageCropperDimensions,
  options: ImageCropViewportOptions = {},
): ImageCropState => {
  const outputSize = options.outputSize ?? DEFAULT_OUTPUT_SIZE;
  const viewportSize = options.viewportSize ?? outputSize;
  const scale = outputSize / viewportSize;
  return normalizeImageCropState(
    {
      ...state,
      offsetX: state.offsetX + delta.deltaX * scale,
      offsetY: state.offsetY + delta.deltaY * scale,
    },
    dimensions,
    outputSize,
  );
};

export const zoomImageCropState = (
  state: ImageCropState,
  zoom: number,
  dimensions: ImageCropperDimensions,
  outputSize = DEFAULT_OUTPUT_SIZE,
): ImageCropState =>
  normalizeImageCropState(
    {
      ...state,
      zoom,
    },
    dimensions,
    outputSize,
  );

export const rotateImageCropState = (
  state: ImageCropState,
  direction: 'left' | 'right',
  dimensions: ImageCropperDimensions,
  outputSize = DEFAULT_OUTPUT_SIZE,
): ImageCropState => {
  const nextRotation = normalizeRotation(
    state.rotation + (direction === 'left' ? -90 : 90),
  );
  return normalizeImageCropState(
    {
      ...state,
      rotation: nextRotation,
    },
    dimensions,
    outputSize,
  );
};

export const renderImageCropToCanvas = (
  canvas: HTMLCanvasElement,
  source: ImageCropperSource,
  state: ImageCropState,
  options: ImageCropRenderOptions = {},
): void => {
  const logicalSize = options.size ?? DEFAULT_OUTPUT_SIZE;
  const pixelRatio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1;
  const backingSize = Math.max(1, Math.round(logicalSize * pixelRatio));

  if (canvas.width !== backingSize) {
    canvas.width = backingSize;
  }
  if (canvas.height !== backingSize) {
    canvas.height = backingSize;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    throw createImageCropperError(
      'encode_failed',
      'Canvas rendering is unavailable in this browser.',
    );
  }

  const normalized = normalizeImageCropState(
    state,
    source,
    DEFAULT_OUTPUT_SIZE,
  );
  const previewScale = logicalSize / DEFAULT_OUTPUT_SIZE;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, logicalSize, logicalSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = options.smoothingQuality ?? 'high';

  context.save();
  context.translate(
    logicalSize / 2 + normalized.offsetX * previewScale,
    logicalSize / 2 + normalized.offsetY * previewScale,
  );
  context.rotate((normalized.rotation * Math.PI) / 180);
  context.scale(normalized.zoom * previewScale, normalized.zoom * previewScale);
  context.drawImage(
    source.image,
    -source.width / 2,
    -source.height / 2,
    source.width,
    source.height,
  );
  context.restore();
};

export const encodeImageCrop = async (
  source: ImageCropperSource,
  state: ImageCropState,
  options: ImageCropEncodeOptions = {},
): Promise<ImageCropEncodeResult> => {
  const size = options.size ?? DEFAULT_OUTPUT_SIZE;
  const maxBytes = options.maxBytes ?? MAX_ENCODED_BYTES;
  const canvas = document.createElement('canvas');
  renderImageCropToCanvas(canvas, source, state, {
    size,
    pixelRatio: 1,
    smoothingQuality: 'high',
  });

  const webp = await canvasToBlob(
    canvas,
    'image/webp',
    options.webpQuality ?? 0.92,
  );
  if (webp && webp.type === 'image/webp' && webp.size <= maxBytes) {
    return blobToEncodeResult(webp, 'image/webp');
  }

  const png = await canvasToBlob(
    canvas,
    'image/png',
    options.pngQuality ?? undefined,
  );
  if (png && png.size <= maxBytes) {
    return blobToEncodeResult(png, 'image/png');
  }

  throw createImageCropperError(
    'encode_failed',
    'Cropped image must encode to 1 MB or smaller.',
  );
};

const validateDecodedDimensions = (
  dimensions: ImageCropperDimensions,
  options: DecodeImageCropperSourceOptions,
) => {
  const maxDimension = options.maxDimension ?? MAX_SOURCE_DIMENSION;
  const maxPixels = options.maxPixels ?? MAX_SOURCE_PIXELS;
  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > maxDimension ||
    dimensions.height > maxDimension ||
    dimensions.width * dimensions.height > maxPixels
  ) {
    throw createImageCropperError(
      'image_too_large',
      'Image dimensions must be 8192px or smaller on each side and 40 megapixels or less.',
    );
  }
};

const decodeImageWithElement = async (
  input: Blob,
  mime: ImageCropperInputMime,
  options: DecodeImageCropperSourceOptions,
): Promise<ImageCropperSource> => {
  const objectUrl = URL.createObjectURL(input);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('Browser image element rejected the selected image.'));
      image.src = objectUrl;
    });
    if (typeof image.decode === 'function') {
      await image.decode();
    }

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    validateDecodedDimensions({ width, height }, options);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(objectUrl);

    return {
      image: canvas,
      width,
      height,
      mime,
      dispose: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

const getDecodeFailureDetail = (
  fallbackError: unknown,
  bitmapDecodeError: unknown,
): string => {
  const fallbackDetail =
    fallbackError instanceof Error
      ? fallbackError.message
      : String(fallbackError);
  if (!bitmapDecodeError) {
    return fallbackDetail;
  }

  const bitmapDetail =
    bitmapDecodeError instanceof Error
      ? bitmapDecodeError.message
      : String(bitmapDecodeError);
  return `createImageBitmap failed: ${bitmapDetail}; HTMLImageElement fallback failed: ${fallbackDetail}`;
};

const isSvgInput = (input: Blob, head: Uint8Array): boolean => {
  const type = input.type.toLowerCase();
  const fileName =
    typeof File !== 'undefined' && input instanceof File
      ? input.name.trim().toLowerCase()
      : '';
  if (
    type === 'image/svg+xml' ||
    fileName.endsWith('.svg') ||
    fileName.endsWith('.svgz')
  ) {
    return true;
  }

  const text = asciiHead(head)
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .trimStart();
  return (
    text.startsWith('<svg') ||
    (text.startsWith('<?xml') && text.slice(0, 512).includes('<svg'))
  );
};

const detectRasterMime = (
  input: Blob,
  head: Uint8Array,
): ImageCropperInputMime | null => {
  if (hasPngSignature(head)) {
    return 'image/png';
  }
  if (hasJpegSignature(head)) {
    return 'image/jpeg';
  }
  if (hasWebpSignature(head)) {
    return 'image/webp';
  }
  if (hasGifSignature(head)) {
    return 'image/gif';
  }

  const mime = input.type.toLowerCase();
  return SUPPORTED_INPUT_MIMES.includes(mime as ImageCropperInputMime)
    ? (mime as ImageCropperInputMime)
    : null;
};

const hasPngSignature = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a;

const hasJpegSignature = (bytes: Uint8Array): boolean =>
  bytes.length >= 3 &&
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[2] === 0xff;

const hasWebpSignature = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  asciiHead(bytes.slice(0, 4)) === 'RIFF' &&
  asciiHead(bytes.slice(8, 12)) === 'WEBP';

const hasGifSignature = (bytes: Uint8Array): boolean => {
  const signature = asciiHead(bytes.slice(0, 6));
  return signature === 'GIF87a' || signature === 'GIF89a';
};

const asciiHead = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

const getImageCropOffsetLimits = (
  dimensions: ImageCropperDimensions,
  rotation: ImageCropperRotation,
  zoom: number,
  outputSize: number,
): { x: number; y: number } => {
  const rotated = getRotatedImageDimensions(dimensions, rotation);
  return {
    x: Math.max(0, (rotated.width * zoom - outputSize) / 2),
    y: Math.max(0, (rotated.height * zoom - outputSize) / 2),
  };
};

const normalizeRotation = (rotation: number): ImageCropperRotation => {
  const normalized = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  return normalized as ImageCropperRotation;
};

const clampFinite = (value: number, min: number, max: number): number => {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, finite));
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mime: ImageCropperOutputMime,
  quality?: number,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, mime, quality);
  });

const blobToEncodeResult = async (
  blob: Blob,
  mime: ImageCropperOutputMime,
): Promise<ImageCropEncodeResult> => {
  const data = arrayBufferToBase64(await blob.arrayBuffer());
  return {
    data,
    mime,
    previewUrl: `data:${mime};base64,${data}`,
  };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + BASE64_CHUNK_SIZE),
    );
  }
  return btoa(binary);
};
