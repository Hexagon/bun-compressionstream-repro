import type { ImageData } from "../types/index.ts";

export function resizeNearest(image: ImageData, newWidth: number, newHeight: number): ImageData {
  const { width, height, data: src } = image;
  const out = new Uint8Array(newWidth * newHeight * 4);
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x * width / newWidth);
      const srcY = Math.floor(y * height / newHeight);
      const si = (srcY * width + srcX) * 4;
      const di = (y * newWidth + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return { width: newWidth, height: newHeight, data: out };
}
