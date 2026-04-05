/**
 * Replicates cross-org/image tiff_deflate.ts — ORIGINAL "double Response"
 * pattern from main (b16127ef) that hangs in certain Bun versions.
 *
 * Base:  https://github.com/cross-org/image/blob/b16127ef/src/utils/tiff_deflate.ts
 * Fix:   https://github.com/cross-org/image/blob/cc9261e7/src/utils/tiff_deflate.ts
 */

/**
 * Compress data using Deflate — ORIGINAL pattern from b16127ef.
 */
export async function deflateCompress(
  data: Uint8Array,
): Promise<Uint8Array> {
  const stream = new Response(data as unknown as BodyInit).body!
    .pipeThrough(new CompressionStream("deflate"));
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}

/**
 * Decompress Deflate data — ORIGINAL pattern from b16127ef.
 */
export async function deflateDecompress(
  data: Uint8Array,
): Promise<Uint8Array> {
  const stream = new Response(data as unknown as BodyInit).body!
    .pipeThrough(new DecompressionStream("deflate"));
  const decompressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(decompressed);
}
