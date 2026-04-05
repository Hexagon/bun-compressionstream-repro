# Bun CompressionStream hang reproduction

Reproduces the `CompressionStream` / `DecompressionStream` hang seen in
[cross-org/image PR #100](https://github.com/cross-org/image/pull/100) CI
(Bun v1.3.11, job [70009490278](https://github.com/cross-org/image/actions/runs/...)).

## Root cause

The hang requires **two conditions** to occur simultaneously:

1. **The `readStream` + `CompressionStream` pattern**: reading a piped
   `CompressionStream` output via a manual `reader.read()` loop from a
   `ReadableStream` created inline.

2. **Concurrent shared-module imports**: multiple Bun test workers (processes)
   ALL importing from the SAME TypeScript source files
   (`png_base.ts` → `tiff_deflate.ts`) at startup. This synchronizes workers
   so they all call `readStream()` → `new CompressionStream("deflate")` at
   roughly the same instant. Under this concurrent load, Bun v1.3.11's
   `TransformStream`/`ReadableStream` implementation deadlocks.

**Why the previous repro attempts all passed**: they had inline code in each
test file — no shared TypeScript source imports. Without the module-loading
synchronization point, workers started at different times and never competed
for the CompressionStream simultaneously.

## Evidence from cross-org/image CI

The failing CI (merge commit `cc9261e7`, job `70009490278`) already had
the `readStream` fix applied. PNG tests **passed** because the png.test.ts
worker ran with lighter module loading. ICO/TIFF/APNG tests **failed** because:

- `ico.test.ts` → imports `ico.ts` → `png.ts` → `png_base.ts`
- `tiff.test.ts` → imports `tiff_deflate.ts` → `png_base.ts`
- Multiple other workers also import `png_base.ts`

When 20+ workers all load `png_base.ts` in parallel and immediately call
`deflate()` / `inflate()`, the `CompressionStream` hangs.

## Repository structure

```
src/
  formats/
    png_base.ts         ← exact copy of cross-org/image PNGBase (cc9261e7)
    png.ts              ← PNGFormat extends PNGBase
    ico.ts              ← ICOFormat delegates to PNGFormat
  utils/
    tiff_deflate.ts     ← exact copy of cross-org/image tiff_deflate.ts (cc9261e7)

delegation.test.ts      ← imports ICOFormat from src/formats/ico.ts
tiff_deflate.test.ts    ← imports deflateCompress from src/utils/tiff_deflate.ts
deflate_worker_01-20.test.ts  ← 20 files, each importing tiff_deflate.ts
compression.test.ts     ← bun:test baseline (inline, always passes)
```

## Reproduce locally

```bash
bun x jsr add @cross/test @std/assert
bun test
```

Tests importing from `src/` should time out after 5 000 ms.

## Reproduce in CI

Push to GitHub. The workflow at `.github/workflows/test.yml` runs `bun test` on push/PR.

## Expected behaviour (if fixed)

All tests pass quickly (< 100 ms each).

## Actual behaviour

Tests in files that import from `src/formats/png_base.ts` or
`src/utils/tiff_deflate.ts` hang at `reader.read()` inside `readStream()`,
timing out after 5 000 ms.
