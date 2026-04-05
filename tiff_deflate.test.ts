/**
 * Mimics the cross-org/image TIFF Deflate compression tests that hung in Bun CI.
 *
 * Uses the ORIGINAL BROKEN pattern from png_base.ts before PR #100's fix:
 * https://github.com/cross-org/image/pull/100/files
 *
 * The broken code: new Response(data).body → CompressionStream → new Response(stream).arrayBuffer()
 * This double-Response wrapping hangs in Bun when run under @cross/test.
 *
 * This file uses @cross/test to replicate the exact framework used in cross-org/image.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { inflateSync, deflateSync } from "node:zlib";

/**
 * Original broken deflateCompress pattern from png_base.ts before the fix:
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/png_base.ts
 *
 * Feeds a Uint8Array as BodyInit through new Response().body,
 * then consumes the piped output via new Response(stream).arrayBuffer().
 */
async function deflateCompress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as unknown as BodyInit).body!
    .pipeThrough(new CompressionStream("deflate"));
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}

/**
 * Original broken deflateDecompress pattern from png_base.ts before the fix:
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/png_base.ts
 */
async function deflateDecompress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data as unknown as BodyInit).body!
    .pipeThrough(new DecompressionStream("deflate"));
  const decompressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(decompressed);
}

// ── Reproduce cross-org/image: TIFF Deflate compression tests ──

test("TIFF-like: encode and decode with Deflate compression", async () => {
  const imageData = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255,
  ]);
  const compressed = await deflateCompress(imageData);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, imageData);
});

test("TIFF-like: Deflate compression roundtrip", async () => {
  const width = 10;
  const height = 10;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor((i / data.length) * 255);
  }
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});

test("TIFF-like: encode CMYK with Deflate compression", async () => {
  // Mimics TIFF CMYK encode + deflate
  const cmykData = new Uint8Array([0, 255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255]);
  const compressed = await deflateCompress(cmykData);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, cmykData);
});

test("TIFF-like: Deflate with DecompressionStream only", async () => {
  // Compress with node:zlib, decompress with DecompressionStream
  const data = new Uint8Array(40).fill(42);
  const nodeCompressed = deflateSync(data);
  const decompressed = await deflateDecompress(new Uint8Array(nodeCompressed));
  assertEquals(decompressed, data);
});

test("TIFF-like: CompressionStream only (no roundtrip)", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const compressed = await deflateCompress(data);
  // Verify via node:zlib
  const decompressed = inflateSync(compressed);
  assertEquals(new Uint8Array(decompressed), data);
});

test("TIFF-like: large image with Deflate", async () => {
  const width = 50;
  const height = 50;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});
