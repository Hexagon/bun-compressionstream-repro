import type { ImageData, ImageMetadata } from "../types/index.ts";

interface VP8Header {
  width: number;
  height: number;
  isKeyframe: boolean;
  version: number;
}

interface VP8LHeader {
  width: number;
  height: number;
  alphaIsUsed: boolean;
  version: number;
}

const VP8_SIGNATURE = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF
const WEBP_MAGIC = new Uint8Array([0x57, 0x45, 0x42, 0x50]); // WEBP

export class WebPDecoder {
  canDecode(data: Uint8Array): boolean {
    if (data.length < 12) return false;
    return data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
           data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50;
  }

  private parseVP8Header(data: Uint8Array): VP8Header | null {
    if (data.length < 10) return null;
    const frameTag = data[0] | (data[1] << 8) | (data[2] << 16);
    const isKeyframe = !(frameTag & 1);
    const version = (frameTag >> 1) & 7;
    
    if (isKeyframe) {
      if (data[3] !== 0x9D || data[4] !== 0x01 || data[5] !== 0x2A) return null;
      const width = ((data[7] << 8) | data[6]) & 0x3FFF;
      const height = ((data[9] << 8) | data[8]) & 0x3FFF;
      return { width, height, isKeyframe, version };
    }
    return null;
  }

  parseChunks(data: Uint8Array): Map<string, Uint8Array> {
    const chunks = new Map<string, Uint8Array>();
    let offset = 12; // Skip RIFF header + WEBP magic
    while (offset + 8 <= data.length) {
      const fourCC = String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
      const size = data[offset+4] | (data[offset+5] << 8) | (data[offset+6] << 16) | (data[offset+7] << 24);
      if (offset + 8 + size > data.length) break;
      chunks.set(fourCC, data.subarray(offset + 8, offset + 8 + size));
      offset += 8 + size + (size & 1); // pad to even
    }
    return chunks;
  }
}
