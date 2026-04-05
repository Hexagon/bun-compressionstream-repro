import type { ImageMetadata } from "../types/index.ts";

interface IFDEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
}

const EXIF_TAGS: Record<number, string> = {
  0x010E: "ImageDescription",
  0x010F: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011A: "XResolution",
  0x011B: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x0213: "YCbCrPositioning",
  0x8769: "ExifIFDPointer",
  0x8825: "GPSInfoIFDPointer",
  0x829A: "ExposureTime",
  0x829D: "FNumber",
  0x8827: "ISOSpeedRatings",
  0x9000: "ExifVersion",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9101: "ComponentsConfiguration",
  0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue",
  0x9204: "ExposureBiasValue",
  0x9207: "MeteringMode",
  0x9209: "Flash",
  0x920A: "FocalLength",
  0xA001: "ColorSpace",
  0xA002: "PixelXDimension",
  0xA003: "PixelYDimension",
  0xA405: "FocalLengthIn35mmFilm",
};

export class ExifParser {
  private data: Uint8Array;
  private littleEndian: boolean = true;

  constructor(data: Uint8Array) {
    this.data = data;
    this.littleEndian = true;
  }

  getTagName(tag: number): string {
    return EXIF_TAGS[tag] || `Unknown(0x${tag.toString(16).padStart(4, '0')})`;
  }

  parseIFDEntry(offset: number): IFDEntry | null {
    if (offset + 12 > this.data.length) return null;
    const dv = new DataView(this.data.buffer, this.data.byteOffset + offset, 12);
    return {
      tag: dv.getUint16(0, this.littleEndian),
      type: dv.getUint16(2, this.littleEndian),
      count: dv.getUint32(4, this.littleEndian),
      valueOffset: dv.getUint32(8, this.littleEndian),
    };
  }

  simulateHeavyParsing(): Map<string, string> {
    const result = new Map<string, string>();
    // Simulate scanning through all possible EXIF tags
    for (const [tagNum, tagName] of Object.entries(EXIF_TAGS)) {
      const tag = parseInt(tagNum);
      result.set(tagName, `tag_${tag}_value`);
    }
    return result;
  }
}
