# Bun CompressionStream hang reproduction

Minimal reproduction of tests hanging in `bun test` on GitHub Actions CI.
Mirrors the patterns from [cross-org/image PR #100](https://github.com/cross-org/image/pull/100).

## Root cause (discovered)

The hang in cross-org/image is caused by a **lazy `await import("node:zlib")` race condition**
across parallel Bun test workers — NOT a `CompressionStream` bug.

`utils/deflate.ts` (introduced in PR #100) defers the `node:zlib` import to the first call:

```typescript
let _zlib: NodeZlib | null | undefined;

async function getZlib(): Promise<NodeZlib | null> {
  if (_zlib !== undefined) return _zlib;
  try {
    const m = await import("node:zlib"); // ← hangs when called concurrently
    _zlib = m as unknown as NodeZlib;
  } catch { _zlib = null; }
  return _zlib;
}
```

With 55 parallel Bun v1.3.11 test workers all hitting `deflateData()` in their first test
simultaneously, the concurrent `await import("node:zlib")` deadlocks intermittently.

The hang is intermittent (first CI attempt failed, second passed with identical code).

## Call chain

```
ICOFormat.encode() → PNGFormat.encode() → PNGBase.deflate()
  → deflateData()  → getZlib()  → await import("node:zlib")  ← hangs
```

The double-`Response` wrapping pattern (`new Response(data).body → CompressionStream →
new Response(stream).arrayBuffer()`) from **before** PR #100 also hangs in Bun, but
always (not intermittently). PR #100 replaced it with `deflateData`/`inflateData`, which
introduced the intermittent lazy-import race condition instead.

## Test files in this repo

- **`compression.test.ts`** — `bun:test` directly; includes the double-`Response` pattern  
- **`delegation.test.ts`** — `ICO → PNG → deflateData()` delegation chain, `@cross/test`
- **`tiff_deflate.test.ts`** — TIFF Deflate pattern via `deflateData/inflateData`, `@cross/test`
- **`deflate_worker_01.test.ts` – `deflate_worker_20.test.ts`** — 20 files, each an exact copy
  of `utils/deflate.ts`'s `getZlib()` + `deflateData/inflateData` pattern with `@cross/test`.
  Together with the other 3 files, this is 23 parallel workers all doing
  `await import("node:zlib")` simultaneously — matching cross-org/image's 55-worker scale.

## Reproduce locally

```bash
bun x jsr add @cross/test @std/assert
bun test
```

## Reproduce in CI

Push to GitHub. The workflow at `.github/workflows/test.yml` runs `bun test` on push/PR.

## Expected behaviour (if fixed)

All tests pass quickly.

## Actual behaviour

Intermittently, workers that simultaneously execute `await import("node:zlib")` for the
first time hang indefinitely, causing the 5 000 ms default timeout to fire.
