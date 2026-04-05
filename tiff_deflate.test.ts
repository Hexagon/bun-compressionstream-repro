/**
 * Replicates cross-org/image test/formats/tiff.test.ts (Deflate compression tests).
 *
 * KEY DIFFERENCE from previous attempts: imports from src/utils/tiff_deflate.ts,
 * which in turn imports from src/formats/png_base.ts. Multiple Bun test workers
 * simultaneously importing and executing code from these shared TypeScript modules
 * triggers the CompressionStream hang in Bun v1.3.11.
 *
 * Failing tests from cross-org/image CI (cc9261e7):
 *   TIFF: encode and decode with Deflate compression [5000.98ms] — timeout
 *   TIFF: Deflate compression roundtrip [5000.98ms] — timeout
 *   TIFF: encode CMYK with compression [5000.99ms] — timeout
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { deflateCompress, deflateDecompress } from "./src/utils/tiff_deflate.ts";

test("TIFF: encode and decode with Deflate compression", async () => {
  const imageData = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255,
  ]);
  const compressed = await deflateCompress(imageData);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, imageData);
});

test("TIFF: Deflate compression roundtrip", async () => {
  const data = new Uint8Array(400);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor((i / data.length) * 255);
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});

test("TIFF: encode CMYK with compression", async () => {
  const cmykData = new Uint8Array([0, 255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255]);
  const compressed = await deflateCompress(cmykData);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, cmykData);
});

test("TIFF: deflate and inflate small data", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});

test("TIFF: large image Deflate roundtrip", async () => {
  const data = new Uint8Array(10000);
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});
