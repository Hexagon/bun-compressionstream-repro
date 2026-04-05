/**
 * Mimics the cross-org/image ICO → PNG → CompressionStream delegation pattern
 * that caused tests to hang indefinitely in Bun CI.
 *
 * Uses the ORIGINAL BROKEN pattern from png_base.ts before PR #100's fix:
 * https://github.com/cross-org/image/pull/100/files
 *
 * The broken code fed a Uint8Array through new Response(data).body and consumed
 * the output via new Response(stream).arrayBuffer() — the double-Response wrapping
 * that hangs in Bun when run under @cross/test.
 *
 * Uses @cross/test (instead of bun:test) to replicate the exact test framework
 * used in cross-org/image.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { inflateSync } from "node:zlib";

/**
 * Mimics PNGBase (the base class for PNG/APNG in cross-org/image).
 * Uses the ORIGINAL BROKEN deflate/inflate pattern from png_base.ts before the fix:
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/png_base.ts
 *
 * The hang: feeding a Uint8Array as BodyInit through new Response().body,
 * then consuming the piped output via new Response(stream).arrayBuffer().
 */
class PNGLikeEncoder {
  async deflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(data as unknown as BodyInit).body!
      .pipeThrough(new CompressionStream("deflate"));
    const compressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressed);
  }

  async inflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(data as unknown as BodyInit).body!
      .pipeThrough(new DecompressionStream("deflate"));
    const decompressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(decompressed);
  }

  async encode(imageData: { width: number; height: number; data: Uint8Array }): Promise<Uint8Array> {
    // Mimics PNGFormat.encode(): filter then deflate the pixel data
    const { width, height, data } = imageData;
    // Simple filter: prepend a filter-type byte (0 = None) to each row
    const bytesPerRow = width * 4;
    const filtered = new Uint8Array(height * (1 + bytesPerRow));
    for (let y = 0; y < height; y++) {
      filtered[y * (1 + bytesPerRow)] = 0; // filter type: None
      filtered.set(data.subarray(y * bytesPerRow, (y + 1) * bytesPerRow), y * (1 + bytesPerRow) + 1);
    }
    return this.deflate(filtered);
  }
}

/**
 * Mimics ICOFormat (which holds a PNGFormat instance and delegates encode/decode).
 * This replicates the structural delegation pattern from cross-org/image:
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/ico.ts
 */
class ICOLikeEncoder {
  private pngEncoder = new PNGLikeEncoder();

  async encode(imageData: { width: number; height: number; data: Uint8Array }): Promise<Uint8Array> {
    // Mimics ICOFormat.encode(): delegate to pngFormat.encode()
    const pngData = await this.pngEncoder.encode(imageData);
    // Wrap the PNG data in a trivial container (ICO header is irrelevant here)
    const result = new Uint8Array(6 + pngData.length);
    result[2] = 1; // type = icon
    result[4] = 1; // count = 1
    result.set(pngData, 6);
    return result;
  }
}

/**
 * Mimics APNGFormat (which extends PNGBase and calls this.deflate() directly).
 * Replicates the pattern from src/formats/apng.ts in cross-org/image:
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/apng.ts
 */
class APNGLikeEncoder {
  private base = new PNGLikeEncoder();

  async encodeFrame(data: Uint8Array): Promise<Uint8Array> {
    return this.base.deflate(data);
  }
}

// ── Reproduce cross-org/image: ICO encode delegating to PNG → CompressionStream ──

test("delegation: ICO-like encode (small 2x2 image)", async () => {
  const encoder = new ICOLikeEncoder();
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
  };
  const encoded = await encoder.encode(imageData);
  // Extract the deflated data (skip 6-byte header) and verify it decompresses
  const deflated = encoded.subarray(6);
  const decompressed = inflateSync(deflated);
  assertEquals(decompressed.length, imageData.height * (1 + imageData.width * 4));
});

test("delegation: ICO-like encode (single pixel)", async () => {
  const encoder = new ICOLikeEncoder();
  const imageData = {
    width: 1,
    height: 1,
    data: new Uint8Array([128, 128, 128, 255]),
  };
  const encoded = await encoder.encode(imageData);
  const deflated = encoded.subarray(6);
  const decompressed = inflateSync(deflated);
  assertEquals(decompressed.length, 1 * (1 + 1 * 4));
});

test("delegation: ICO-like encode (larger 32x32 image)", async () => {
  const encoder = new ICOLikeEncoder();
  const width = 32;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
  const imageData = { width, height, data };
  const encoded = await encoder.encode(imageData);
  const deflated = encoded.subarray(6);
  const decompressed = inflateSync(deflated);
  assertEquals(decompressed.length, height * (1 + width * 4));
});

test("delegation: ICO-like encode with transparency", async () => {
  const encoder = new ICOLikeEncoder();
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 128, 0, 255, 0, 64, 0, 0, 255, 0, 255, 255, 0, 255]),
  };
  const encoded = await encoder.encode(imageData);
  const deflated = encoded.subarray(6);
  const decompressed = inflateSync(deflated);
  assertEquals(decompressed.length, imageData.height * (1 + imageData.width * 4));
});

test("delegation: APNG-like frame encode (small data)", async () => {
  const encoder = new APNGLikeEncoder();
  const frameData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const compressed = await encoder.encodeFrame(frameData);
  const decompressed = inflateSync(compressed);
  assertEquals(new Uint8Array(decompressed), frameData);
});

test("delegation: APNG-like encode multiple frames", async () => {
  const encoder = new APNGLikeEncoder();
  for (let frame = 0; frame < 3; frame++) {
    const frameData = new Uint8Array(16).fill(frame);
    const compressed = await encoder.encodeFrame(frameData);
    const decompressed = inflateSync(compressed);
    assertEquals(new Uint8Array(decompressed), frameData);
  }
});

test("delegation: composite and save (image processing pipeline)", async () => {
  // Mimics Image.composite() then encode("png") → PNGFormat.encode()
  const encoder = new PNGLikeEncoder();
  const imageData = {
    width: 4,
    height: 4,
    data: new Uint8Array(4 * 4 * 4).fill(128),
  };
  const compressed = await encoder.encode(imageData);
  const decompressed = inflateSync(compressed);
  assertEquals(decompressed.length, imageData.height * (1 + imageData.width * 4));
});
