/**
 * Heavy parallel worker — imports the full module tree (14 source files).
 * Simulates cross-org/image's test workload: deep module imports, CPU-intensive
 * image processing, multiple concurrent CompressionStream operations.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";

// Core compression modules (the ones that hang)
import { deflateCompress, deflateDecompress } from "./src/utils/tiff_deflate.ts";
import { ICOFormat } from "./src/formats/ico.ts";
import { PNGFormat } from "./src/formats/png.ts";

// Heavy module tree imports (matching cross-org/image's deep import chains)
import type { ImageData, ImageMetadata, CompressionOptions } from "./src/types/index.ts";
import { validateDimensions } from "./src/types/index.ts";
import { crc32, crc32Combine } from "./src/utils/crc32.ts";
import { brightness, grayscale, invert, blur } from "./src/processing/filters.ts";
import { resizeNearest } from "./src/processing/resize.ts";
import { rgbToHSL, hslToRGB, rgbToCMYK, adjustHue } from "./src/processing/color.ts";
import { JPEGCodec } from "./src/codecs/jpeg.ts";
import { BMPCodec } from "./src/codecs/bmp.ts";
import { WebPDecoder } from "./src/decoders/webp.ts";
import { GIFDecoder } from "./src/decoders/gif.ts";
import { ExifParser } from "./src/metadata/exif.ts";

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

test("Deflate roundtrip - worker 10", async () => {
  // Heavy CPU work before compression (like cross-org/image tests)
  const img = makeImage(64, 64);
  const processed = blur(adjustHue(grayscale(brightness(img, 20)), 45), 2);
  const checksum = crc32(processed.data);
  
  // JPEG codec simulation
  const jpeg = new JPEGCodec(85);
  jpeg.simulateHeavyWork(processed.data);
  
  // BMP encode for comparison
  const bmp = new BMPCodec();
  const bmpData = bmp.encode(processed);
  
  // CompressionStream call (the one that hangs)
  const compressed = await deflateCompress(processed.data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, processed.data);
  assertEquals(crc32(decompressed), checksum);
});

test("ICO encode/decode - worker 10", async () => {
  const format = new ICOFormat();
  const img = makeImage(32, 32);
  const processed = invert(blur(img, 1));
  
  // Color analysis
  for (let i = 0; i < processed.data.length; i += 4) {
    rgbToHSL(processed.data[i], processed.data[i+1], processed.data[i+2]);
    rgbToCMYK(processed.data[i], processed.data[i+1], processed.data[i+2]);
  }
  
  const encoded = await format.encode(processed);
  assertEquals(format.canDecode(encoded), true);
  
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 32);
  assertEquals(decoded.height, 32);
});

test("PNG pipeline - worker 10", async () => {
  const format = new PNGFormat();
  const img = makeImage(48, 48);
  const resized = resizeNearest(img, 24, 24);
  const filtered = adjustHue(brightness(resized, -30), 90);
  
  // EXIF simulation
  const exif = new ExifParser(new Uint8Array(100));
  exif.simulateHeavyParsing();
  
  const encoded = await format.encode(filtered);
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 24);
  assertEquals(decoded.height, 24);
  assertEquals(decoded.data.length, 24 * 24 * 4);
});

test("Concurrent deflate ops - worker 10", async () => {
  const img1 = makeImage(16, 16);
  const img2 = makeImage(32, 32);
  const img3 = makeImage(64, 64);
  
  // Process each image differently
  const p1 = grayscale(img1);
  const p2 = blur(img2, 1);
  const p3 = adjustHue(img3, 180);
  
  const [c1, c2, c3] = await Promise.all([
    deflateCompress(p1.data),
    deflateCompress(p2.data),
    deflateCompress(p3.data),
  ]);
  
  const [d1, d2, d3] = await Promise.all([
    deflateDecompress(c1),
    deflateDecompress(c2),
    deflateDecompress(c3),
  ]);
  
  assertEquals(d1, p1.data);
  assertEquals(d2, p2.data);
  assertEquals(d3, p3.data);
});

test("Full image pipeline - worker 10", async () => {
  const format = new PNGFormat();
  const img = makeImage(128, 128);
  
  // Heavy processing chain
  const step1 = grayscale(img);
  const step2 = brightness(step1, 40);
  const step3 = blur(step2, 2);
  const step4 = adjustHue(step3, 120);
  const step5 = resizeNearest(step4, 64, 64);
  const step6 = invert(step5);
  
  const jpeg = new JPEGCodec(90);
  jpeg.simulateHeavyWork(step6.data);
  
  const bmp = new BMPCodec();
  bmp.encode(step6);
  
  const encoded = await format.encode(step6);
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 64);
  assertEquals(decoded.height, 64);
});

test("Large image deflate - worker 10", async () => {
  const img = makeImage(256, 256);  // 262144 bytes — real image size
  const processed = blur(grayscale(img), 1);
  
  const compressed = await deflateCompress(processed.data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed.length, 256 * 256 * 4);
  assertEquals(decompressed, processed.data);
});
