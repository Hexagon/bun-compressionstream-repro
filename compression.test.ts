/**
 * Baseline CompressionStream / DecompressionStream tests.
 *
 * This file tests the compression patterns IN ISOLATION — no shared module
 * imports from src/. In cross-org/image CI (job 70009490278), the inline
 * CompressionStream tests pass, but tests that import from shared TypeScript
 * source files (ico.ts → png.ts → png_base.ts) all time out at 5000 ms.
 *
 * Pattern A — "double Response" (cross-org/image main @ b16127ef):
 *   new Response(data).body!.pipeThrough(new CompressionStream("deflate"))
 *   → await new Response(stream).arrayBuffer()
 *
 * Pattern B — "readStream" (cross-org/image fix @ cc9261e7):
 *   readStream(new ReadableStream({start(c){c.enqueue(data);c.close()}})
 *       .pipeThrough(new CompressionStream("deflate")))
 *
 * Both patterns hung in cross-org/image CI. The fix that actually worked
 * was replacing CompressionStream entirely with synchronous node:zlib
 * (src/utils/deflate.ts @ 0201dc61).
 */
import { describe, expect, test } from "bun:test";
import { deflateSync, inflateSync } from "node:zlib";

/** Collect all chunks from a ReadableStream (Pattern B helper). */
async function readStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function makePayload(size = 65_536): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = i & 0xff;
  return buf;
}

describe("CompressionStream / DecompressionStream", () => {
  const original = makePayload();

  test("baseline: deflateSync / inflateSync roundtrip", () => {
    const compressed = deflateSync(original);
    const decompressed = inflateSync(compressed);
    expect(new Uint8Array(decompressed)).toEqual(original);
  });

  // ── Pattern A: double Response (original cross-org/image base code) ──
  test("Pattern A: deflate via double Response wrapping", async () => {
    const stream = new Response(original as unknown as BodyInit).body!
      .pipeThrough(new CompressionStream("deflate"));
    const compressed = await new Response(stream).arrayBuffer();
    const result = new Uint8Array(inflateSync(new Uint8Array(compressed)));
    expect(result).toEqual(original);
  });

  test("Pattern A: inflate via double Response wrapping", async () => {
    const zlibCompressed = deflateSync(original);
    const stream = new Response(
      new Uint8Array(zlibCompressed) as unknown as BodyInit,
    ).body!.pipeThrough(new DecompressionStream("deflate"));
    const decompressed = await new Response(stream).arrayBuffer();
    expect(new Uint8Array(decompressed)).toEqual(original);
  });

  // ── Pattern B: readStream (cross-org/image PR #100 fix attempt) ──
  test("Pattern B: deflate via readStream + ReadableStream", async () => {
    const compressed = await readStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(original);
          controller.close();
        },
      }).pipeThrough(new CompressionStream("deflate")),
    );
    const result = new Uint8Array(inflateSync(compressed));
    expect(result).toEqual(original);
  });

  test("Pattern B: inflate via readStream + ReadableStream", async () => {
    const zlibCompressed = deflateSync(original);
    const decompressed = await readStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(zlibCompressed));
          controller.close();
        },
      }).pipeThrough(new DecompressionStream("deflate")),
    );
    expect(decompressed).toEqual(original);
  });

  // ── Full roundtrip pipe chain ──
  test("Pattern B: deflate + inflate pipe chain", async () => {
    const result = await readStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(original);
          controller.close();
        },
      })
        .pipeThrough(new CompressionStream("deflate"))
        .pipeThrough(new DecompressionStream("deflate")),
    );
    expect(result).toEqual(original);
  });
});
