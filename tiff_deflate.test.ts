/**
 * Replicates cross-org/image test/formats/tiff.test.ts (Deflate compression).
 *
 * Import chain: deflateCompress ← tiff_deflate.ts ← types/index.ts
 * Uses the same readStream + CompressionStream pattern from cc9261e7.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { deflateCompress, deflateDecompress } from "./src/utils/tiff_deflate.ts";
import { crc32 } from "./src/utils/crc32.ts";
import { brightness, grayscale } from "./src/processing/filters.ts";
import type { ImageData } from "./src/types/index.ts";

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
