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

## Patterns tested

### Pattern A — "double Response" (original base code @ `b16127ef`)

```typescript
const stream = new Response(data as unknown as BodyInit).body!
  .pipeThrough(new CompressionStream("deflate"));
const compressed = await new Response(stream).arrayBuffer();
```

This is the pattern that was on `main` when the hang was first observed. The commit message of
the fix attempt (`4ca2578d`) states: *"The Response body wrapping hangs in certain Bun versions."*

### Pattern B — "readStream" (fix attempt @ `cc9261e7`)

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

return readStream(
  new ReadableStream({ start(c) { c.enqueue(data); c.close(); } })
    .pipeThrough(new CompressionStream("deflate")),
);
```

This pattern was introduced by PR #100 to work around Pattern A. **CI still timed out** at
`cc9261e7`, confirming both patterns hang under the same conditions.

### Workaround — `node:zlib` (final fix @ `0201dc61`)

The fix that actually resolved the hang replaces `CompressionStream` entirely with synchronous
`node:zlib` (`deflateSync` / `inflateSync`), falling back to `CompressionStream` only in
browser environments.

## Structure

| File | Description |
|------|-------------|
| `compression.test.ts` | Baseline tests (Pattern A + B, inline, no shared imports) |
| `delegation.test.ts` | ICO → PNG → PNGBase delegation chain (mirrors `ico.test.ts`) |
| `tiff_deflate.test.ts` | TIFF Deflate roundtrip (mirrors `tiff.test.ts`) |
| `src/formats/png_base.ts` | PNGBase with deflate/inflate using Pattern A |
| `src/formats/png.ts` | PNGFormat extends PNGBase |
| `src/formats/ico.ts` | ICOFormat delegates to PNGFormat |
| `src/utils/tiff_deflate.ts` | deflateCompress/deflateDecompress using Pattern A |

## Reproduce

```bash
bun test
```

If the bug is present in your Bun version, tests in `delegation.test.ts` and
`tiff_deflate.test.ts` will time out (5 000 ms default for `@cross/test`).

## CI configuration

The workflow matches `cross-org/workflows/.github/workflows/bun-ci.yml` exactly:
- `antongolub/action-setup-bun@v1.13.2` with `bun-version: v1.x`
- Same JSR dependencies: `@cross/test @cross/fs @cross/dir @std/assert @std/path`
- Plain `bun test` (no `--timeout` flag)

## Status

⚠️ **Bug not yet reliably reproduced in this minimal repo.** The cross-org/image CI failure
involves 55 test files (626 tests) with heavy image processing workloads. The hang may require
conditions that are difficult to reproduce in isolation:

- Many concurrent test workers loading large TypeScript module graphs
- Specific timing of `CompressionStream` calls across worker processes
- Potential interaction with Bun's internal thread pool under heavy load

Bun version in both environments: **v1.3.11** (`antongolub/action-setup-bun` with `v1.x`).
