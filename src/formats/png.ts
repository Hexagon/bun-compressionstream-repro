/**
 * Minimal PNGFormat replicating cross-org/image's PNGFormat class structure.
 * https://github.com/cross-org/image/blob/cc9261e7/src/formats/png.ts
 *
 * PNGFormat extends PNGBase. encode() calls this.deflate() (from PNGBase).
 * decode() calls this.inflate() (from PNGBase).
 * These use the readStream + CompressionStream pattern that hangs in Bun CI.
 */

import { PNGBase } from "./png_base.ts";
import type { ImageData } from "../types/index.ts";
import { crc32 } from "../utils/crc32.ts";

export type { ImageData } from "../types/index.ts";

export class PNGFormat extends PNGBase {
  readonly name = "png";
  readonly mimeType = "image/png";

  /**
   * Encode RGBA image data to a minimal PNG-like format.
   * Mirrors the cross-org/image PNGFormat.encode() call chain:
   * filterData() → this.deflate() (PNGBase.deflate → readStream → CompressionStream)
   */
  async encode(imageData: ImageData): Promise<Uint8Array> {
    const { width, height, data } = imageData;
    const filtered = this.filterData(data, width, height);
    const compressed = await this.deflate(filtered);

    // Minimal PNG-like container: 4-byte width + 4-byte height + compressed data
    const result = new Uint8Array(8 + compressed.length);
    new DataView(result.buffer).setUint32(0, width, false);
    new DataView(result.buffer).setUint32(4, height, false);
    result.set(compressed, 8);
    return result;
  }

  /**
   * Decode a PNG-like blob back to RGBA.
   * Mirrors the cross-org/image PNGFormat.decode() call chain:
   * this.inflate() (PNGBase.inflate → readStream → DecompressionStream)
   *
   * NOTE: Must use data.byteOffset when constructing DataView because `data`
   * may be a subarray (e.g. ICOFormat passes data.subarray(22)), meaning
   * data.buffer is the full parent buffer starting at byte 0, not at the
   * subarray's logical byte 0. Without byteOffset the read would pull width/
   * height from the wrong position and produce fast assertion failures rather
   * than the actual Bun CompressionStream hang we are trying to reproduce.
   */
  async decode(data: Uint8Array): Promise<ImageData> {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = dv.getUint32(0, false);
    const height = dv.getUint32(4, false);
    const compressed = data.subarray(8);
    const filtered = await this.inflate(compressed);
    const rgba = this.unfilterData(filtered, width, height);
    return { width, height, data: rgba };
  }
}
