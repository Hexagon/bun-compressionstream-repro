/**
 * Worker file 16/20 — replicates the structure of cross-org/image test files
 * that import from shared TypeScript source files.
 *
 * KEY: This file imports from src/utils/tiff_deflate.ts, which imports from
 * src/formats/png_base.ts. When 20+ Bun test workers simultaneously import
 * and execute these shared TypeScript modules with CompressionStream, the
 * concurrent module loading synchronizes them — triggering the Bun hang seen
 * in cross-org/image CI (commit cc9261e7, job 70009490278).
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { deflateCompress, deflateDecompress } from "./src/utils/tiff_deflate.ts";

const PAYLOAD = new Uint8Array(4096);
for (let j = 0; j < PAYLOAD.length; j++) PAYLOAD[j] = (j * 16) & 0xff;

test("worker-16: deflate + inflate roundtrip", async () => {
  const compressed = await deflateCompress(PAYLOAD);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed.length, PAYLOAD.length);
  assertEquals(decompressed[0], PAYLOAD[0]);
});

test("worker-16: deflate compress small payload", async () => {
  const data = new Uint8Array([16, 32, 48, 255]);
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});

test("worker-16: deflate roundtrip partial payload", async () => {
  const slice = PAYLOAD.subarray(0, Math.max(1, PAYLOAD.length >> 1));
  const compressed = await deflateCompress(slice);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed.length, slice.length);
});
