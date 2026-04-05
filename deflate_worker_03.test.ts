/**
 * Worker file 03/20 — generates parallel CompressionStream load to reproduce
 * the intermittent deadlock seen in cross-org/image (Bun v1.3.11, 55 test files).
 *
 * Uses the exact readStream helper and CompressionStream pattern from cross-org/image
 * after PR #100 (commit 0201dc61), combined with @cross/test's async shim loader.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { deflateSync, inflateSync } from "node:zlib";

/** Exact readStream helper from cross-org/image src/formats/png_base.ts */
async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/** Exact deflate helper from cross-org/image after PR #100 */
function deflate(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(data); c.close(); },
    }).pipeThrough(new CompressionStream("deflate")),
  );
}

/** Exact inflate helper from cross-org/image after PR #100 */
function inflate(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(data); c.close(); },
    }).pipeThrough(new DecompressionStream("deflate")),
  );
}

const PAYLOAD_03 = (() => {
  const buf = new Uint8Array(4096);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 03) & 0xff;
  return buf;
})();

test("worker-03: deflate roundtrip (small)", async () => {
  const compressed = await deflate(PAYLOAD_03.subarray(0, 64));
  const result = await inflate(compressed);
  assertEquals(result, PAYLOAD_03.subarray(0, 64));
});

test("worker-03: deflate roundtrip (medium)", async () => {
  const compressed = await deflate(PAYLOAD_03.subarray(0, 512));
  const result = await inflate(compressed);
  assertEquals(result, PAYLOAD_03.subarray(0, 512));
});

test("worker-03: deflate roundtrip (full)", async () => {
  const compressed = await deflate(PAYLOAD_03);
  const result = await inflate(compressed);
  assertEquals(result, PAYLOAD_03);
});

test("worker-03: deflate → node:zlib decompress", async () => {
  const compressed = await deflate(PAYLOAD_03.subarray(0, 256));
  const result = inflateSync(compressed);
  assertEquals(new Uint8Array(result), PAYLOAD_03.subarray(0, 256));
});

test("worker-03: node:zlib compress → inflate", async () => {
  const compressed = deflateSync(PAYLOAD_03.subarray(0, 256));
  const result = await inflate(new Uint8Array(compressed));
  assertEquals(result, PAYLOAD_03.subarray(0, 256));
});
