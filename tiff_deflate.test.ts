/**
 * Replicates the cross-org/image TIFF Deflate compression tests
 * that hung in Bun CI (PR #100 first attempt, commit 0201dc61).
 *
 * Root cause: deflateData/inflateData in utils/deflate.ts do a LAZY
 * `await import("node:zlib")` on their first call. When 55 parallel Bun
 * test workers all hit this simultaneously, the concurrent dynamic import
 * deadlocks intermittently in Bun v1.3.11.
 *
 * Uses @cross/test to match cross-org/image's test framework exactly.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";

// ── Exact copy of utils/deflate.ts from cross-org/image @ 0201dc61 ──
// https://raw.githubusercontent.com/cross-org/image/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/utils/deflate.ts

type NodeZlib = {
  deflateSync(buf: Uint8Array): Uint8Array;
  inflateSync(buf: Uint8Array): Uint8Array;
};

let _zlib: NodeZlib | null | undefined;

async function getZlib(): Promise<NodeZlib | null> {
  if (_zlib !== undefined) return _zlib;
  try {
    const m = await import("node:zlib");
    _zlib = m as unknown as NodeZlib;
  } catch {
    _zlib = null;
  }
  return _zlib;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/** deflateData from utils/deflate.ts: lazy node:zlib with CompressionStream fallback */
async function deflateData(data: Uint8Array): Promise<Uint8Array> {
  const zlib = await getZlib();
  if (zlib) {
    const r = zlib.deflateSync(data);
    return r instanceof Uint8Array ? r : new Uint8Array(r);
  }
  return readStream(
    new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } })
      .pipeThrough(new CompressionStream("deflate")),
  );
}

/** inflateData from utils/deflate.ts: lazy node:zlib with DecompressionStream fallback */
async function inflateData(data: Uint8Array): Promise<Uint8Array> {
  const zlib = await getZlib();
  if (zlib) {
    const r = zlib.inflateSync(data);
    return r instanceof Uint8Array ? r : new Uint8Array(r);
  }
  return readStream(
    new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } })
      .pipeThrough(new DecompressionStream("deflate")),
  );
}

// ── Tests: first deflate call triggers lazy getZlib() → await import("node:zlib") ──

test("TIFF-like: encode and decode with Deflate compression", async () => {
  const imageData = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
  const compressed = await deflateData(imageData);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed, imageData);
});

test("TIFF-like: Deflate compression roundtrip", async () => {
  const data = new Uint8Array(400);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor((i / data.length) * 255);
  const compressed = await deflateData(data);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed, data);
});

test("TIFF-like: encode CMYK with Deflate compression", async () => {
  const cmykData = new Uint8Array([0, 255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255]);
  const compressed = await deflateData(cmykData);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed, cmykData);
});

test("TIFF-like: deflate and inflate small data", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const compressed = await deflateData(data);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed, data);
});

test("TIFF-like: large image Deflate roundtrip", async () => {
  const data = new Uint8Array(10000);
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
  const compressed = await deflateData(data);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed, data);
});
