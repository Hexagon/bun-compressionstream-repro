/**
 * Exact copy of tiff_deflate.ts from cross-org/image at merge commit cc9261e7.
 * https://github.com/cross-org/image/blob/cc9261e7c1412265872a6020135002bc8cd5c92d/src/utils/tiff_deflate.ts
 *
 * This module is imported by tiff_deflate.test.ts and by the deflate_worker_*.test.ts
 * files — replicating the pattern where many Bun test workers simultaneously import
 * and execute code from the same TypeScript source file.
 */
import { readStream } from "../formats/png_base.ts";

/**
 * Compress data using Deflate.
 * Exact replica of deflateCompress() from tiff_deflate.ts at cc9261e7.
 */
export function deflateCompress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }).pipeThrough(new CompressionStream("deflate")),
  );
}

/**
 * Decompress Deflate data.
 * Exact replica of deflateDecompress() from tiff_deflate.ts at cc9261e7.
 */
export function deflateDecompress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }).pipeThrough(new DecompressionStream("deflate")),
  );
}
