/**
 * Exact copy of png_base.ts deflate/inflate from cross-org/image at cc9261e7.
 * Uses the readStream + ReadableStream pattern — the actual code that hangs.
 *
 * Source: https://github.com/cross-org/image/blob/cc9261e7/src/formats/png_base.ts
 * CI:    job 70009490278, run 23989940910 (15 tests timed out @ 5000 ms)
 */

/**
 * Collect all chunks from a ReadableStream<Uint8Array> into a single Uint8Array.
 * Using ReadableStream directly (instead of new Response(data).body) avoids a hang
 * in certain Bun versions when feeding Uint8Array data into CompressionStream/
 * DecompressionStream via the Response body wrapper.
 */
export async function readStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
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
 * Base class for PNG/APNG format handlers.
 * Uses exact readStream pattern from cc9261e7.
 */
export abstract class PNGBase {
  /**
   * Decompress PNG data using deflate — exact pattern from cc9261e7.
   */
  protected inflate(data: Uint8Array): Promise<Uint8Array> {
    return readStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }).pipeThrough(new DecompressionStream("deflate")),
    );
  }

  /**
   * Compress PNG data using deflate — exact pattern from cc9261e7.
   */
  protected deflate(data: Uint8Array): Promise<Uint8Array> {
    return readStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }).pipeThrough(new CompressionStream("deflate")),
    );
  }

  /** Apply PNG None-filter (type 0) to each row of RGBA pixel data. */
  protected filterData(
    data: Uint8Array,
    width: number,
    height: number,
  ): Uint8Array {
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

  /** Reverse the None-filter: strip the filter byte from each row. */
  protected unfilterData(
    data: Uint8Array,
    width: number,
    height: number,
  ): Uint8Array {
    const bytesPerRow = width * 4;
    const out = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      out.set(
        data.subarray(y * (1 + bytesPerRow) + 1, (y + 1) * (1 + bytesPerRow)),
        y * bytesPerRow,
      );
    }
    return out;
  }
}
