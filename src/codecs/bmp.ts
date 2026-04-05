import type { ImageData, ImageMetadata } from "../types/index.ts";

interface BMPFileHeader {
  fileSize: number;
  reserved: number;
  dataOffset: number;
}

interface BMPInfoHeader {
  headerSize: number;
  width: number;
  height: number;
  planes: number;
  bitsPerPixel: number;
  compression: number;
  imageSize: number;
  xPixelsPerMeter: number;
  yPixelsPerMeter: number;
  colorsUsed: number;
  importantColors: number;
}

export class BMPCodec {
  canDecode(data: Uint8Array): boolean {
    return data.length >= 2 && data[0] === 0x42 && data[1] === 0x4D; // "BM"
  }

  parseFileHeader(data: Uint8Array): BMPFileHeader | null {
    if (data.length < 14) return null;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
      fileSize: dv.getUint32(2, true),
      reserved: dv.getUint32(6, true),
      dataOffset: dv.getUint32(10, true),
    };
  }

  parseInfoHeader(data: Uint8Array): BMPInfoHeader | null {
    if (data.length < 54) return null;
    const dv = new DataView(data.buffer, data.byteOffset + 14, data.byteLength - 14);
    return {
      headerSize: dv.getUint32(0, true),
      width: dv.getInt32(4, true),
      height: dv.getInt32(8, true),
      planes: dv.getUint16(12, true),
      bitsPerPixel: dv.getUint16(14, true),
      compression: dv.getUint32(16, true),
      imageSize: dv.getUint32(20, true),
      xPixelsPerMeter: dv.getInt32(24, true),
      yPixelsPerMeter: dv.getInt32(28, true),
      colorsUsed: dv.getUint32(32, true),
      importantColors: dv.getUint32(36, true),
    };
  }

  encode(imageData: ImageData): Uint8Array {
    const { width, height, data } = imageData;
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelDataSize = rowSize * height;
    const fileSize = 54 + pixelDataSize;
    
    const result = new Uint8Array(fileSize);
    const dv = new DataView(result.buffer);
    
    // File header
    result[0] = 0x42; result[1] = 0x4D; // "BM"
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, 54, true);
    
    // Info header
    dv.setUint32(14, 40, true);
    dv.setInt32(18, width, true);
    dv.setInt32(22, -height, true); // top-down
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, pixelDataSize, true);
    
    // Pixel data (BGR, bottom-up)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = 54 + y * rowSize + x * 3;
        result[di] = data[si + 2];     // B
        result[di + 1] = data[si + 1]; // G
        result[di + 2] = data[si];     // R
      }
    }
    return result;
  }
}
