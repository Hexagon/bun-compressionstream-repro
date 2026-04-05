import type { ImageData } from "../types/index.ts";

interface GIFHeader {
  width: number;
  height: number;
  hasGlobalColorTable: boolean;
  colorResolution: number;
  sortFlag: boolean;
  globalColorTableSize: number;
  backgroundColorIndex: number;
  pixelAspectRatio: number;
}

interface GraphicsControlExtension {
  disposalMethod: number;
  userInputFlag: boolean;
  transparentColorFlag: boolean;
  delayTime: number;
  transparentColorIndex: number;
}

export class GIFDecoder {
  canDecode(data: Uint8Array): boolean {
    if (data.length < 6) return false;
    const sig = String.fromCharCode(data[0], data[1], data[2], data[3], data[4], data[5]);
    return sig === "GIF87a" || sig === "GIF89a";
  }

  parseHeader(data: Uint8Array): GIFHeader | null {
    if (data.length < 13) return null;
    return {
      width: data[6] | (data[7] << 8),
      height: data[8] | (data[9] << 8),
      hasGlobalColorTable: !!(data[10] & 0x80),
      colorResolution: ((data[10] >> 4) & 7) + 1,
      sortFlag: !!(data[10] & 8),
      globalColorTableSize: 2 << (data[10] & 7),
      backgroundColorIndex: data[11],
      pixelAspectRatio: data[12],
    };
  }

  // LZW decompression (simplified)
  decompressLZW(data: Uint8Array, minCodeSize: number): Uint8Array {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    const output: number[] = [];
    
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    let bitBuffer = 0;
    let bitsInBuffer = 0;
    let pos = 0;

    const table: number[][] = [];
    
    // Initialize table
    for (let i = 0; i < clearCode; i++) {
      table[i] = [i];
    }
    table[clearCode] = [];
    table[endCode] = [];

    let prevCode = -1;

    while (pos < data.length) {
      // Read next code
      while (bitsInBuffer < codeSize && pos < data.length) {
        bitBuffer |= data[pos++] << bitsInBuffer;
        bitsInBuffer += 8;
      }
      
      const code = bitBuffer & ((1 << codeSize) - 1);
      bitBuffer >>= codeSize;
      bitsInBuffer -= codeSize;

      if (code === endCode) break;
      if (code === clearCode) {
        codeSize = minCodeSize + 1;
        nextCode = endCode + 1;
        table.length = endCode + 1;
        for (let i = 0; i < clearCode; i++) table[i] = [i];
        table[clearCode] = [];
        table[endCode] = [];
        prevCode = -1;
        continue;
      }

      let entry: number[];
      if (code < nextCode) {
        entry = table[code];
      } else if (code === nextCode && prevCode >= 0) {
        entry = [...table[prevCode], table[prevCode][0]];
      } else {
        break;
      }

      output.push(...entry);

      if (prevCode >= 0 && nextCode < 4096) {
        table[nextCode] = [...table[prevCode], entry[0]];
        nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      }

      prevCode = code;
    }

    return new Uint8Array(output);
  }
}
