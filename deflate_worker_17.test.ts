/**
 * Worker file 17/20 — replicates the EXACT deflateData/inflateData pattern
 * from cross-org/image utils/deflate.ts at commit 0201dc61:
 * https://raw.githubusercontent.com/cross-org/image/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/utils/deflate.ts
 *
 * Key: deflateData() does a LAZY await import("node:zlib") on first call.
 * With 20 parallel Bun test workers all hitting this simultaneously, the
 * concurrent dynamic import can trigger the intermittent Bun deadlock seen
 * in cross-org/image CI (first attempt failed, second passed).
 *
 * Uses @cross/test to match cross-org/image's test framework exactly.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";

// ── Exact copy of utils/deflate.ts from cross-org/image @ 0201dc61 ──

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

// ── Tests: each triggers the lazy getZlib() → await import("node:zlib") ──

const PAYLOAD = (() => {
  const buf = new Uint8Array(65536);
  for (let j = 0; j < buf.length; j++) buf[j] = j & 0xff;
  return buf;
})();

test("worker-17: deflateData + inflateData roundtrip (first call triggers dynamic import)", async () => {
  const compressed = await deflateData(PAYLOAD);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed.length, PAYLOAD.length);
  assertEquals(decompressed[0], PAYLOAD[0]);
});

test("worker-17: deflateData small payload", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const c = await deflateData(data);
  const r = await inflateData(c);
  assertEquals(r, data);
});

test("worker-17: inflateData only (zlib pre-cached after first test)", async () => {
  const data = new Uint8Array(128).fill(42);
  const c = await deflateData(data);
  const r = await inflateData(c);
  assertEquals(r, data);
});

test("worker-17: sequential deflate calls", async () => {
  const a = await deflateData(PAYLOAD.subarray(0, 16384));
  const b = await deflateData(PAYLOAD.subarray(16384, 32768));
  assertEquals((await inflateData(a)).length, 16384);
  assertEquals((await inflateData(b)).length, 16384);
});

test("worker-17: deflateData large payload", async () => {
  const c = await deflateData(PAYLOAD);
  const r = await inflateData(c);
  assertEquals(r[r.length - 1], PAYLOAD[PAYLOAD.length - 1]);
});
