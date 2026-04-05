/**
 * Exact copy of png_base.ts from cross-org/image at merge commit cc9261e7
 * (PR #100 branch merged into main — the code that still caused CI hangs).
 * https://github.com/cross-org/image/blob/cc9261e7c1412265872a6020135002bc8cd5c92d/src/formats/png_base.ts
 */

/**
 * Collect all chunks from a ReadableStream<Uint8Array> into a single Uint8Array.
 * Using ReadableStream directly (instead of new Response(data).body) avoids a hang
 * in certain Bun versions when feeding Uint8Array data into CompressionStream/
 * DecompressionStream via the Response body wrapper.
 */
export async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Base class for PNG/APNG format handlers — exact replica of cross-org/image PNGBase.
 * Contains the readStream-based deflate/inflate methods that still hang in Bun
 * when called concurrently across many test workers that all import this file.
 */
export abstract class PNGBase {
  /**
   * Compress PNG scanline data using deflate.
   * Exact replica of PNGBase.deflate() at cc9261e7.
   */
  protected deflate(data: Uint8Array): Promise<Uint8Array> {
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
   * Decompress deflated PNG data.
   * Exact replica of PNGBase.inflate() at cc9261e7.
   */
  protected inflate(data: Uint8Array): Promise<Uint8Array> {
    return readStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }).pipeThrough(new DecompressionStream("deflate")),
    );
  }

  /**
   * Apply PNG None-filter (type 0) to each row of RGBA pixel data.
   * Prepends a 0x00 filter byte before each row.
   */
  protected filterData(data: Uint8Array, width: number, height: number): Uint8Array {
    const bytesPerRow = width * 4;
    const filtered = new Uint8Array(height * (1 + bytesPerRow));
    for (let y = 0; y < height; y++) {
      filtered[y * (1 + bytesPerRow)] = 0; // filter type: None
      filtered.set(
        data.subarray(y * bytesPerRow, (y + 1) * bytesPerRow),
        y * (1 + bytesPerRow) + 1,
      );
    }
    return filtered;
  }

  /**
   * Reverse the None-filter: strip the filter byte from each row.
   */
  protected unfilterData(data: Uint8Array, width: number, height: number): Uint8Array {
    const bytesPerRow = width * 4;
    const out = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      // data[y*(1+bytesPerRow)] is the filter byte; skip it
      out.set(
        data.subarray(y * (1 + bytesPerRow) + 1, (y + 1) * (1 + bytesPerRow)),
        y * bytesPerRow,
      );
    }
    return out;
  }
}
