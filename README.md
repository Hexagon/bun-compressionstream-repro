# Bun CompressionStream hang reproduction

Minimal reproduction of `CompressionStream` / `DecompressionStream` hanging in `bun test` on GitHub
Actions CI. Mirrors the patterns from [cross-org/image PR #100](https://github.com/cross-org/image/pull/100).

## Issue

When using `CompressionStream("deflate")` or `DecompressionStream("deflate")` via `.pipeThrough()`
inside a `bun test` run, the reader blocks indefinitely and the test times out. This occurs
regardless of how data is fed into the stream (via `new Response(data).body`, or a manual
`ReadableStream` with `controller.enqueue`).

The hang reproduces reliably in GitHub Actions CI with `antongolub/action-setup-bun@v1.13.2` using
`bun-version: v1.x`.

## Context — cross-org/image investigation

In [cross-org/image PR #100](https://github.com/cross-org/image/pull/100), `bun test` ran 626 tests
across 55 files with `@cross/test` as the test framework. Tests that used `CompressionStream`
through a **class delegation chain** (e.g. `ICOFormat.encode()` → `PNGFormat.encode()` →
`CompressionStream`) timed out with the 5 000 ms default, while tests that called
`PNGFormat.encode()` directly passed.

Key observations:

- Both repos use Bun v1.3.11 (confirmed from CI logs).
- `png.test.ts` tests calling `PNGFormat.encode()` directly **passed**.
- `ico.test.ts` tests calling `ICOFormat.encode()` (which delegates to `PNGFormat.encode()`)
  **hung** with 5 000 ms timeouts.
- `tiff.test.ts` Deflate compression tests (same `ReadableStream → CompressionStream` pattern)
  **hung** as well.
- `@cross/test` (a cross-runtime test wrapper backed by `bun:test`) was used in all test files.

## Test files in this repo

- **`compression.test.ts`** — baseline tests using `bun:test` directly; these pass.
- **`delegation.test.ts`** — replicates the `ICO → PNG → CompressionStream` delegation pattern
  using `@cross/test`; these are the tests expected to hang.
- **`tiff_deflate.test.ts`** — replicates the TIFF Deflate compression pattern from
  `tiff_deflate.ts` using `@cross/test`; also expected to hang.

## Reproduce locally

```bash
bun x jsr add @cross/test @std/assert
bun test
```

If the issue is present in your Bun version, the `CompressionStream` and `DecompressionStream` tests
in `delegation.test.ts` and `tiff_deflate.test.ts` will time out (5 s default).

## Reproduce in CI

Push this repo to GitHub. The workflow at `.github/workflows/test.yml` will run `bun test`
automatically on push / PR.

## Expected behaviour (if fixed)

All tests should pass in under 100 ms each.

## Actual behaviour (affected versions)

Tests in `delegation.test.ts` and `tiff_deflate.test.ts` hang until the 5 000 ms timeout and fail.