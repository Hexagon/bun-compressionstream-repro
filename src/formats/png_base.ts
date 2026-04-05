/**
 * Replicates cross-org/image png_base.ts deflate/inflate patterns.
 *
 * ORIGINAL pattern (cross-org/image main @ b16127ef):
 *   new Response(data).body!.pipeThrough(new CompressionStream("deflate"))
 *   → await new Response(stream).arrayBuffer()
 *   Commit message of fix (4ca2578d) confirms: "The Response body wrapping
 *   hangs in certain Bun versions".
 *
 * FIX pattern (cross-org/image PR #100 @ cc9261e7):
 *   readStream(new ReadableStream({start(c){c.enqueue(data);c.close()}})
 *       .pipeThrough(new CompressionStream("deflate")))
 *   CI at cc9261e7 still timed out → both patterns hang.
 *
 * References:
 *   Base:  https://github.com/cross-org/image/blob/b16127ef/src/formats/png_base.ts
 *   Fix:   https://github.com/cross-org/image/blob/cc9261e7/src/formats/png_base.ts
 *   CI:    job 70009490278, run 23989940910 (15 tests timed out @ 5000 ms)
 */

// ─── readStream helper (from cc9261e7 fix attempt) ────────────────────────
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
 *
 * Uses the ORIGINAL "double Response" pattern from cross-org/image main
 * (b16127ef) — the pattern that is confirmed to hang in Bun CI.
 */
export abstract class PNGBase {
  /**
   * Compress data using deflate — ORIGINAL pattern from b16127ef.
   * `new Response(data).body → CompressionStream → new Response(stream).arrayBuffer()`
   */
  protected async deflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(data as unknown as BodyInit).body!
      .pipeThrough(new CompressionStream("deflate"));
    const compressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressed);
  }

  /**
   * Decompress deflated data — ORIGINAL pattern from b16127ef.
   * `new Response(data).body → DecompressionStream → new Response(stream).arrayBuffer()`
   */
  protected async inflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(data as unknown as BodyInit).body!
      .pipeThrough(new DecompressionStream("deflate"));
    const decompressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(decompressed);
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
