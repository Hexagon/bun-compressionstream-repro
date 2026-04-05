/**
 * Replicates cross-org/image test/formats/ico.test.ts structure exactly.
 *
 * KEY DIFFERENCE from previous attempts: this file IMPORTS FROM TypeScript
 * source files (src/formats/ico.ts → src/formats/png.ts → src/formats/png_base.ts),
 * just as the cross-org/image ico.test.ts does. When 20+ Bun test workers all
 * simultaneously import and execute code from these shared TypeScript modules,
 * the CompressionStream + ReadableStream operations hang.
 *
 * The failing tests in cross-org/image PR #100 CI (commit cc9261e7) showed:
 *   ICO: encode and decode - small image [5000.98ms] — timeout
 *   ICO: encode - single pixel [5000.99ms] — timeout
 * while PNG tests using the same pattern passed (they ran in a different worker
 * without competing module-load synchronization).
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { ICOFormat } from "./src/formats/ico.ts";

test("ICO: canDecode - valid ICO signature", () => {
  const validICO = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  const format = new ICOFormat();
  assertEquals(format.canDecode(validICO), true);
});

test("ICO: canDecode - invalid signature", () => {
  const format = new ICOFormat();
  assertEquals(format.canDecode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])), false);
});

test("ICO: encode and decode - small image", async () => {
  const format = new ICOFormat();
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ]),
  };

  const encoded = await format.encode(imageData);
  assertEquals(encoded[2], 0x01); // ICO type

  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 2);
  assertEquals(decoded.height, 2);
  assertEquals(decoded.data[0], 255);
  assertEquals(decoded.data[1], 0);
  assertEquals(decoded.data[2], 0);
});

test("ICO: encode - single pixel", async () => {
  const format = new ICOFormat();
  const encoded = await format.encode({
    width: 1,
    height: 1,
    data: new Uint8Array([128, 128, 128, 255]),
  });
  assertEquals(format.canDecode(encoded), true);
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, 1);
  assertEquals(decoded.height, 1);
});

test("ICO: encode and decode - larger image", async () => {
  const format = new ICOFormat();
  const width = 16, height = 16;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.floor((x / width) * 255);
      data[i + 1] = Math.floor((y / height) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  const encoded = await format.encode({ width, height, data });
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, width);
  assertEquals(decoded.height, height);
  assertEquals(decoded.data.length, width * height * 4);
});

test("ICO: encode and decode - 32x32 image", async () => {
  const format = new ICOFormat();
  const width = 32, height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 0; data[i * 4 + 1] = 0; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
  }
  const encoded = await format.encode({ width, height, data });
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, width);
  assertEquals(decoded.height, height);
  assertEquals(decoded.data[2], 255);
});

test("ICO: encode and decode - with transparency", async () => {
  const format = new ICOFormat();
  const width = 4, height = 4;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0;
    data[i * 4 + 3] = (i % 2 === 0) ? 255 : 128;
  }
  const encoded = await format.encode({ width, height, data });
  const decoded = await format.decode(encoded);
  assertEquals(decoded.width, width);
  assertEquals(decoded.height, height);
  assertEquals(decoded.data.length, width * height * 4);
});
