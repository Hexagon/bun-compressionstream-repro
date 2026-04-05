/**
 * Mimics the cross-org/image TIFF Deflate compression tests that hung in Bun CI.
 *
 * In cross-org/image, tiff_deflate.ts uses the same ReadableStream → CompressionStream
 * pattern but the tests timed out. This file uses @cross/test to replicate the
 * exact framework used in cross-org/image.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { inflateSync, deflateSync } from "node:zlib";

/** Collect all chunks from a ReadableStream into a single Uint8Array. */
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
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Exact replica of tiff_deflate.ts deflateCompress() after commit 4ca2578 in cross-org/image.
 */
function deflateCompress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }).pipeThrough(new CompressionStream("deflate")),
  );
}

/**
 * Exact replica of tiff_deflate.ts deflateDecompress() after commit 4ca2578.
 */
function deflateDecompress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }).pipeThrough(new DecompressionStream("deflate")),
  );
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
