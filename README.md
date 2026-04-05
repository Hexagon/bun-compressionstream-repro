# Bun CompressionStream hang reproduction

Minimal reproduction of `CompressionStream` / `DecompressionStream` hanging in `bun test` on GitHub
Actions CI, as observed in [cross-org/image PR #100](https://github.com/cross-org/image/pull/100).

## Observed failure

In [cross-org/image CI job 70009490278](https://github.com/cross-org/image/actions/runs/23989940910)
(merge commit `cc9261e7`), **15 tests timed out** at 5000 ms — every test that calls
`CompressionStream("deflate")` or `DecompressionStream("deflate")` through the shared
`png_base.ts` module. Tests that don't use compression (JPEG, WebP, BMP, etc.) all passed.

Failing tests:
- `ICO: encode and decode` (5 tests × 5 000 ms)
- `TIFF: Deflate compression` (3 tests × 5 000 ms)
- `APNG: encode` (4 tests × 5 000 ms)
- `Image: composite and save / processing pipeline / filter` (3 tests × 5 000 ms)

## Code pattern (exact from cc9261e7)

The actual failing code uses the `readStream` + `ReadableStream` + `CompressionStream` pattern:

```typescript
async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  // ... concatenate chunks
}

function deflateCompress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(
    new ReadableStream({
      start(controller) { controller.enqueue(data); controller.close(); }
    }).pipeThrough(new CompressionStream("deflate")),
  );
}
```

This is the exact code from `src/utils/tiff_deflate.ts` and `src/formats/png_base.ts` at
commit `cc9261e7`. The code works correctly in isolation but hangs when 55 Bun test workers
all execute it concurrently.

## Reproduction strategy

Cross-org/image ran **55 test files** (626 tests) in parallel, all importing from the same
shared TypeScript source tree. This repo replicates that scale with:

- 52 test files importing from `src/utils/tiff_deflate.ts` or `src/formats/ico.ts`
- All files use `@cross/test` and `@std/assert` (same as cross-org/image)
- Same Bun setup: `antongolub/action-setup-bun@v1.13.2` with `bun-version: v1.x`

## Structure

| File | Description |
|------|-------------|
| `delegation.test.ts` | ICO → PNG → PNGBase delegation chain (mirrors `ico.test.ts`) |
| `tiff_deflate.test.ts` | TIFF Deflate roundtrip (mirrors `tiff.test.ts`) |
| `deflate_worker_01.test.ts` – `deflate_worker_50.test.ts` | 50 parallel workers importing `tiff_deflate.ts` |
| `src/formats/png_base.ts` | PNGBase with readStream + CompressionStream (exact from cc9261e7) |
| `src/formats/png.ts` | PNGFormat extends PNGBase |
| `src/formats/ico.ts` | ICOFormat delegates to PNGFormat |
| `src/utils/tiff_deflate.ts` | deflateCompress/deflateDecompress (exact from cc9261e7) |

## Reproduce

```bash
bun test
```

If the bug is present, tests will time out at 5000 ms (default `@cross/test` timeout).

## CI configuration

Matches `cross-org/workflows/.github/workflows/bun-ci.yml` exactly:
- `antongolub/action-setup-bun@v1.13.2` with `bun-version: v1.x`
- Same JSR dependencies
- Plain `bun test`

## Status

⚠️ **Attempting to reproduce.** The hang occurs under heavy concurrent load (55 parallel workers)
and may be timing-dependent.
