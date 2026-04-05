/**
 * Replicates the cross-org/image ICO → PNG → deflateData delegation pattern
 * that caused intermittent test hangs in Bun CI (PR #100, first attempt).
 *
 * Root cause (discovered from utils/deflate.ts @ commit 0201dc61):
 * deflateData() does a LAZY `await import("node:zlib")` on its first call.
 * When 55 parallel Bun test workers all hit this simultaneously during their
 * first test, the concurrent dynamic import deadlocks intermittently.
 *
 * ICOFormat.encode() → PNGFormat.encode() → PNGBase.deflate() → deflateData()
 * → getZlib() → await import("node:zlib")   ← this is where it hangs
 *
 * Uses @cross/test to match cross-org/image's test framework exactly.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";

// ── Exact copy of utils/deflate.ts from cross-org/image @ 0201dc61 ──
// https://raw.githubusercontent.com/cross-org/image/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/utils/deflate.ts

type NodeZlib = {
  deflateSync(buf: Uint8Array): Uint8Array;
  inflateSync(buf: Uint8Array): Uint8Array;
};

let _zlib: NodeZlib | null | undefined;

async function getZlib(): Promise<NodeZlib | null> {
  if (_zlib !== undefined) return _zlib;
  try {
    const m = await import("node:zlib");
    _zlib = m as unknown as NodeZlib;
  } catch {
    _zlib = null;
  }
  return _zlib;
}

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

async function deflateData(data: Uint8Array): Promise<Uint8Array> {
  const zlib = await getZlib();
  if (zlib) {
    const r = zlib.deflateSync(data);
    return r instanceof Uint8Array ? r : new Uint8Array(r);
  }
  return readStream(
    new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } })
      .pipeThrough(new CompressionStream("deflate")),
  );
}

async function inflateData(data: Uint8Array): Promise<Uint8Array> {
  const zlib = await getZlib();
  if (zlib) {
    const r = zlib.inflateSync(data);
    return r instanceof Uint8Array ? r : new Uint8Array(r);
  }
  return readStream(
    new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } })
      .pipeThrough(new DecompressionStream("deflate")),
  );
}

// ── Mimics PNGBase with deflateData/inflateData (post-PR-#100 pattern) ──

/**
 * Mimics PNGBase (the base class for PNG/APNG in cross-org/image after PR #100).
 * deflate() and inflate() delegate to deflateData/inflateData from utils/deflate.ts,
 * which perform a lazy await import("node:zlib") on first call.
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/png_base.ts
 */
class PNGLikeEncoder {
  protected async deflate(data: Uint8Array): Promise<Uint8Array> {
    return deflateData(data);
  }

  protected async inflate(data: Uint8Array): Promise<Uint8Array> {
    return inflateData(data);
  }

  async encode(imageData: { width: number; height: number; data: Uint8Array }): Promise<Uint8Array> {
    const { width, height, data } = imageData;
    const bytesPerRow = width * 4;
    const filtered = new Uint8Array(height * (1 + bytesPerRow));
    for (let y = 0; y < height; y++) {
      filtered[y * (1 + bytesPerRow)] = 0;
      filtered.set(data.subarray(y * bytesPerRow, (y + 1) * bytesPerRow), y * (1 + bytesPerRow) + 1);
    }
    return this.deflate(filtered);
  }
}

/**
 * Mimics ICOFormat (holds a PNGFormat instance and delegates encode).
 * This is the exact delegation chain from cross-org/image:
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/ico.ts
 */
class ICOLikeEncoder {
  private pngEncoder = new PNGLikeEncoder();

  async encode(imageData: { width: number; height: number; data: Uint8Array }): Promise<Uint8Array> {
    const pngData = await this.pngEncoder.encode(imageData);
    const result = new Uint8Array(6 + pngData.length);
    result[2] = 1;
    result[4] = 1;
    result.set(pngData, 6);
    return result;
  }
}

/**
 * Mimics APNGFormat (extends PNGBase, calls this.deflate() directly).
 * https://github.com/cross-org/image/blob/0201dc61f7f5646c22c8f3f6e9bd32f3e1bf78b3/src/formats/apng.ts
 */
class APNGLikeEncoder extends PNGLikeEncoder {
  async encodeFrame(data: Uint8Array): Promise<Uint8Array> {
    return this.deflate(data);
  }
}

// ── Tests: first call in each worker triggers the lazy getZlib() ──

test("delegation: ICO-like encode (small 2x2 image)", async () => {
  const encoder = new ICOLikeEncoder();
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
  };
  const encoded = await encoder.encode(imageData);
  const deflated = encoded.subarray(6);
  const decompressed = await inflateData(deflated);
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
  const decompressed = await inflateData(deflated);
  assertEquals(decompressed.length, 1 * (1 + 1 * 4));
});

test("delegation: ICO-like encode (larger 32x32 image)", async () => {
  const encoder = new ICOLikeEncoder();
  const width = 32, height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
  const encoded = await encoder.encode({ width, height, data });
  const deflated = encoded.subarray(6);
  const decompressed = await inflateData(deflated);
  assertEquals(decompressed.length, height * (1 + width * 4));
});

test("delegation: APNG-like frame encode", async () => {
  const encoder = new APNGLikeEncoder();
  const frameData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const compressed = await encoder.encodeFrame(frameData);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed, frameData);
});

test("delegation: composite and save (image processing pipeline)", async () => {
  const encoder = new PNGLikeEncoder();
  const imageData = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(128) };
  const compressed = await encoder.encode(imageData);
  const decompressed = await inflateData(compressed);
  assertEquals(decompressed.length, imageData.height * (1 + imageData.width * 4));
});
