/**
 * Minimal ICOFormat replicating cross-org/image's ICOFormat class structure.
 * https://github.com/cross-org/image/blob/cc9261e7c1412265872a6020135002bc8cd5c92d/src/formats/ico.ts
 *
 * ICOFormat holds a private PNGFormat instance (pngFormat) and delegates
 * encode/decode to it — exactly as cross-org/image does. This extra
 * level of async delegation is the key structural feature reproduced here.
 */

import { PNGFormat, type ImageData } from "./png.ts";

export class ICOFormat {
  readonly name = "ico";
  readonly mimeType = "image/x-icon";

  /** Exact replica: ICOFormat holds a private PNGFormat instance. */
  private pngFormat = new PNGFormat();

  canDecode(data: Uint8Array): boolean {
    return data.length >= 6 &&
      data[0] === 0 && data[1] === 0 &&
      (data[2] === 1 || data[2] === 2) && data[3] === 0 &&
      data[4] !== 0;
  }

  /**
   * Encode RGBA image to ICO format.
   * Exact delegation chain: ICOFormat.encode() → this.pngFormat.encode() → PNGBase.deflate()
   * This is the chain that timed out in cross-org/image CI.
   */
  async encode(imageData: ImageData): Promise<Uint8Array> {
    const pngData = await this.pngFormat.encode(imageData);

    // Minimal ICO structure: 6-byte ICONDIR + 16-byte ICONDIRENTRY + PNG data
    const result = new Uint8Array(6 + 16 + pngData.length);
    result[2] = 1; // type = icon
    result[4] = 1; // count = 1
    // ICONDIRENTRY
    result[6] = imageData.width >= 256 ? 0 : imageData.width;
    result[7] = imageData.height >= 256 ? 0 : imageData.height;
    result[14] = pngData.length & 0xff;
    result[15] = (pngData.length >> 8) & 0xff;
    result[16] = (pngData.length >> 16) & 0xff;
    result[17] = (pngData.length >> 24) & 0xff;
    result[18] = 22; // offset = 6 + 16
    result.set(pngData, 22);
    return result;
  }

  /**
   * Decode ICO to RGBA.
   * Exact delegation chain: ICOFormat.decode() → this.pngFormat.decode() → PNGBase.inflate()
   */
  async decode(data: Uint8Array): Promise<ImageData> {
    if (!this.canDecode(data)) throw new Error("Invalid ICO signature");
    const pngData = data.subarray(22);
    return this.pngFormat.decode(pngData);
  }
}
