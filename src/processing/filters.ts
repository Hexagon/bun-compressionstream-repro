import type { ImageData } from "../types/index.ts";

export function brightness(image: ImageData, amount: number): ImageData {
  const data = new Uint8Array(image.data);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + amount));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount));
  }
  return { ...image, data };
}

export function grayscale(image: ImageData): ImageData {
  const data = new Uint8Array(image.data);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  return { ...image, data };
}

export function invert(image: ImageData): ImageData {
  const data = new Uint8Array(image.data);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  return { ...image, data };
}

export function blur(image: ImageData, radius: number = 1): ImageData {
  const { width, height, data: src } = image;
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const i = (ny * width + nx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
          count++;
        }
      }
      const i = (y * width + x) * 4;
      out[i] = Math.round(r / count);
      out[i + 1] = Math.round(g / count);
      out[i + 2] = Math.round(b / count);
      out[i + 3] = Math.round(a / count);
    }
  }
  return { ...image, data: out };
}
