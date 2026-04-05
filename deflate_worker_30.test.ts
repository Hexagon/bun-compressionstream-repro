/**
 * Heavy parallel worker — matches cross-org/image's test workload.
 * Each worker imports the full module tree and does real image processing
 * work before and during CompressionStream calls.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { deflateCompress, deflateDecompress } from "./src/utils/tiff_deflate.ts";
import { ICOFormat } from "./src/formats/ico.ts";
import { PNGFormat } from "./src/formats/png.ts";
import type { ImageData } from "./src/types/index.ts";
import { crc32 } from "./src/utils/crc32.ts";
import { brightness, grayscale, invert, blur } from "./src/processing/filters.ts";
import { resizeNearest } from "./src/processing/resize.ts";

/** Generate a test image with gradient pattern */
function makeImage(width: number, height: number): ImageData {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.floor((x / width) * 255);
      data[i + 1] = Math.floor((y / height) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

test("Deflate roundtrip - worker 30", async () => {
  // Process a 64x64 image through filters then compress
  const img = makeImage(64, 64);
  const processed = blur(grayscale(brightness(img, 20)), 2);
  const checksum = crc32(processed.data);
  
  const compressed = await deflateCompress(processed.data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, processed.data);
  assertEquals(crc32(decompressed), checksum);
});

test("ICO encode/decode - worker 30", async () => {
  const format = new ICOFormat();
  const img = makeImage(32, 32);
  const inverted = invert(img);
  
  const encoded = await format.encode(inverted);
  assertEquals(format.canDecode(encoded), true);
  
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 32);
  assertEquals(decoded.height, 32);
});

test("PNG encode/decode - worker 30", async () => {
  const format = new PNGFormat();
  const img = makeImage(48, 48);
  const resized = resizeNearest(img, 24, 24);
  const filtered = brightness(resized, -30);
  
  const encoded = await format.encode(filtered);
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 24);
  assertEquals(decoded.height, 24);
  assertEquals(decoded.data.length, 24 * 24 * 4);
});

test("Multiple deflate ops - worker 30", async () => {
  // Multiple sequential compression operations (like cross-org/image tests)
  const img1 = makeImage(16, 16);
  const img2 = makeImage(32, 32);
  const img3 = makeImage(64, 64);
  
  const [c1, c2, c3] = await Promise.all([
    deflateCompress(img1.data),
    deflateCompress(img2.data),
    deflateCompress(img3.data),
  ]);
  
  const [d1, d2, d3] = await Promise.all([
    deflateDecompress(c1),
    deflateDecompress(c2),
    deflateDecompress(c3),
  ]);
  
  assertEquals(d1, img1.data);
  assertEquals(d2, img2.data);
  assertEquals(d3, img3.data);
});

test("Image pipeline - worker 30", async () => {
  // Full image processing pipeline like cross-org/image integration tests
  const format = new PNGFormat();
  const img = makeImage(64, 64);
  
  // Process
  const step1 = grayscale(img);
  const step2 = brightness(step1, 40);
  const step3 = blur(step2, 1);
  const step4 = resizeNearest(step3, 32, 32);
  
  // Encode (uses CompressionStream via PNGBase.deflate)
  const encoded = await format.encode(step4);
  
  // Decode (uses DecompressionStream via PNGBase.inflate)
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 32);
  assertEquals(decoded.height, 32);
});

test("Large image deflate - worker 30", async () => {
  // Larger data sizes matching real image workloads
  const img = makeImage(128, 128);  // 65536 bytes of RGBA
  const blurred = blur(img, 1);
  
  const compressed = await deflateCompress(blurred.data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed.length, 128 * 128 * 4);
  assertEquals(decompressed, blurred.data);
});
