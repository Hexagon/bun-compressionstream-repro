/**
 * Worker file 01/20 — heavy CompressionStream load to reproduce the
 * intermittent deadlock from cross-org/image (Bun v1.3.11, 55 parallel workers).
 *
 * Each test processes a ~512 KB payload so the operation takes ~50-200ms.
 * With 20 files running in parallel Bun workers, this creates sustained
 * concurrent CompressionStream pressure similar to cross-org/image's test suite.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";

/** Exact readStream helper from cross-org/image (post-PR #100 fix). */
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

function deflate(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } })
      .pipeThrough(new CompressionStream("deflate")),
  );
}

function inflate(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } })
      .pipeThrough(new DecompressionStream("deflate")),
  );
}

/** ~512 KB payload unique to this worker. */
const PAYLOAD = (() => {
  const buf = new Uint8Array(524288);
  for (let j = 0; j < buf.length; j++) buf[j] = (j * 1 + j) & 0xff;
  return buf;
})();

test("worker-01: deflate + inflate roundtrip A", async () => {
  const c = await deflate(PAYLOAD);
  const r = await inflate(c);
  assertEquals(r.length, PAYLOAD.length);
  assertEquals(r[0], PAYLOAD[0]);
  assertEquals(r[PAYLOAD.length - 1], PAYLOAD[PAYLOAD.length - 1]);
});

test("worker-01: deflate + inflate roundtrip B", async () => {
  const slice = PAYLOAD.subarray(0, 262144);
  const c = await deflate(slice);
  const r = await inflate(c);
  assertEquals(r.length, slice.length);
  assertEquals(r[0], slice[0]);
});

test("worker-01: deflate + inflate roundtrip C", async () => {
  const slice = PAYLOAD.subarray(262144);
  const c = await deflate(slice);
  const r = await inflate(c);
  assertEquals(r.length, slice.length);
});

test("worker-01: three sequential deflate calls", async () => {
  const a = await deflate(PAYLOAD.subarray(0, 131072));
  const b = await deflate(PAYLOAD.subarray(131072, 262144));
  const c2 = await deflate(PAYLOAD.subarray(262144, 393216));
  assertEquals((await inflate(a)).length, 131072);
  assertEquals((await inflate(b)).length, 131072);
  assertEquals((await inflate(c2)).length, 131072);
});

test("worker-01: concurrent deflate via Promise.all", async () => {
  const slices = [
    PAYLOAD.subarray(0, 131072),
    PAYLOAD.subarray(131072, 262144),
    PAYLOAD.subarray(262144, 393216),
    PAYLOAD.subarray(393216),
  ];
  const compressed = await Promise.all(slices.map(deflate));
  const results = await Promise.all(compressed.map(inflate));
  for (let k = 0; k < slices.length; k++) {
    assertEquals(results[k].length, slices[k].length);
  }
});
