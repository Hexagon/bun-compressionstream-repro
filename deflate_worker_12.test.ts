/**
 * Worker file 12/20 — sustained CompressionStream load using crypto-random,
 * incompressible 2MB payloads. Each deflate takes ~100-400ms on Bun v1.3.11,
 * creating seconds of true parallel overlap across the 20 Bun test workers.
 *
 * This reproduces the concurrent CompressionStream conditions from cross-org/image
 * (55 parallel workers, each running heavy encode/decode operations for ~80s).
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";

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

/** 2MB crypto-random payload: incompressible, forces maximum deflate work. */
const PAYLOAD = crypto.getRandomValues(new Uint8Array(2097152));

test("worker-12: deflate + inflate roundtrip (2MB random)", async () => {
  const c = await deflate(PAYLOAD);
  const r = await inflate(c);
  assertEquals(r.length, PAYLOAD.length);
  assertEquals(r[0], PAYLOAD[0]);
  assertEquals(r[PAYLOAD.length - 1], PAYLOAD[PAYLOAD.length - 1]);
});

test("worker-12: deflate roundtrip first half", async () => {
  const s = PAYLOAD.subarray(0, 1048576);
  const c = await deflate(s);
  const r = await inflate(c);
  assertEquals(r.length, s.length);
});

test("worker-12: deflate roundtrip second half", async () => {
  const s = PAYLOAD.subarray(1048576);
  const c = await deflate(s);
  const r = await inflate(c);
  assertEquals(r.length, s.length);
});

test("worker-12: two sequential full-payload deflates", async () => {
  const c1 = await deflate(PAYLOAD);
  const c2 = await deflate(PAYLOAD);
  assertEquals(c1.length, c2.length);
  const r = await inflate(c1);
  assertEquals(r.length, PAYLOAD.length);
});

test("worker-12: concurrent deflate via Promise.all (4 × 512KB)", async () => {
  const slices = [
    PAYLOAD.subarray(0, 524288),
    PAYLOAD.subarray(524288, 1048576),
    PAYLOAD.subarray(1048576, 1572864),
    PAYLOAD.subarray(1572864),
  ];
  const compressed = await Promise.all(slices.map(deflate));
  const decompressed = await Promise.all(compressed.map(inflate));
  for (let k = 0; k < 4; k++) {
    assertEquals(decompressed[k].length, slices[k].length);
  }
});
