# Bun CompressionStream hang reproduction

Minimal reproduction of `CompressionStream` / `DecompressionStream` hanging in `bun test` on GitHub
Actions CI. Mirrors the patterns from [cross-org/image PR #100](https://github.com/cross-org/image/pull/100).

## Issue

When consuming a `CompressionStream` output via `new Response(stream).arrayBuffer()` in Bun, the
Promise never resolves and the test times out. This is the **double `Response` wrapping** pattern:

```typescript
// BROKEN — hangs in Bun
const stream = new Response(data as unknown as BodyInit).body!
  .pipeThrough(new CompressionStream("deflate"));
const compressed = await new Response(stream).arrayBuffer(); // ← never resolves
```

The workaround (used by PR #100's fix) is to read the stream directly:

```typescript
// FIXED — works in Bun
async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  // ... concat chunks ...
}
const compressed = await readStream(
  new ReadableStream({ start(c) { c.enqueue(data); c.close(); } })
    .pipeThrough(new CompressionStream("deflate"))
);
```

The hang reproduces reliably in GitHub Actions CI with `antongolub/action-setup-bun@v1.13.2` using
`bun-version: v1.x` (Bun v1.3.11).

## Context — cross-org/image investigation

In [cross-org/image PR #100](https://github.com/cross-org/image/pull/100), `bun test` ran 626 tests
across 55 files. Tests using `CompressionStream` / `DecompressionStream` with the double-`Response`
pattern all timed out:

- `test/formats/ico.test.ts` — `ICOFormat.encode()` → `PNGFormat.encode()` → double-`Response` deflate → **hung at 5000ms**
- `test/formats/tiff.test.ts` — Deflate compression → **hung at 5000ms**
- `test/formats/apng.test.ts` — frame encoding → **hung at 5000ms**

The **fix** in PR #100 replaced the double-`Response` wrapping with a direct `ReadableStream`
reader loop, which works correctly.

## Test files in this repo

- **`compression.test.ts`** — `bun:test` directly; includes both working and broken patterns
- **`delegation.test.ts`** — replicates the `ICO → PNG → CompressionStream` class delegation
  using `@cross/test` and the double-`Response` pattern from before PR #100
- **`tiff_deflate.test.ts`** — replicates the TIFF Deflate pattern using `@cross/test` and the
  double-`Response` pattern
- **`deflate_worker_01.test.ts` – `deflate_worker_20.test.ts`** — 20 files each running 5
  CompressionStream roundtrip tests with `@cross/test`, using the exact `readStream` helper
  from cross-org/image after PR #100. These create the parallel-worker CompressionStream load
  (~100 ops across 20 Bun worker processes) that triggers the intermittent deadlock.

## Reproduce locally

```bash
bun x jsr add @cross/test @std/assert
bun test
```

Tests using `new Response(stream).arrayBuffer()` will time out after 5 000 ms.

## Reproduce in CI

Push this repo to GitHub. The workflow at `.github/workflows/test.yml` will run `bun test`
automatically on push / PR.

## Expected behaviour (if fixed)

All tests pass quickly.

## Actual behaviour (affected Bun versions)

Tests using `await new Response(piped_stream).arrayBuffer()` hang indefinitely and are killed by
the 5 000 ms default timeout.