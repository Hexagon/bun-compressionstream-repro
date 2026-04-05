export interface ImageMetadata {
  width: number;
  height: number;
  dpiX?: number;
  dpiY?: number;
  format?: string;
}

export interface ImageData {
  width: number;
  height: number;
  data: Uint8Array;
  metadata?: ImageMetadata;
}

export interface FormatHandler {
  name: string;
  mimeType: string;
  canDecode(data: Uint8Array): boolean;
  encode(imageData: ImageData): Promise<Uint8Array>;
  decode(data: Uint8Array): Promise<ImageData>;
}

export interface CompressionOptions {
  level?: number;
  strategy?: string;
}

export const MAX_IMAGE_DIMENSION = 65535;
export const MAX_PIXEL_COUNT = 268435456;
export const INCHES_PER_METER = 39.3701;

export function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) throw new Error("Invalid dimensions");
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) throw new Error("Dimensions too large");
  if (width * height > MAX_PIXEL_COUNT) throw new Error("Pixel count too large");
}
