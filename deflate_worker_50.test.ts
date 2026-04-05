/**
 * Parallel worker test file — imports from shared TypeScript modules.
 * cross-org/image had 55 test files running in parallel, all importing from
 * the same source tree. This replicates that scale.
 */

import { test } from "@cross/test";
import { assertEquals } from "@std/assert";
import { deflateCompress, deflateDecompress } from "./src/utils/tiff_deflate.ts";

test("Deflate roundtrip - worker 50", async () => {
  const data = new Uint8Array(1024);
  for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});

test("Deflate small data - worker 50", async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});

test("Deflate larger data - worker 50", async () => {
  const data = new Uint8Array(4096);
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
  const compressed = await deflateCompress(data);
  const decompressed = await deflateDecompress(compressed);
  assertEquals(decompressed, data);
});
