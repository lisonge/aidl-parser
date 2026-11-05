# Optimization verification — 2026-11-05

The public TypeScript result is unchanged. Numeric enums, abbreviated keys, omitted defaults and location tuples are private to the C++ → TypeScript transport. Downloaded/public JSON still contains the readable API fields. AOSP remains `android-17.0.0_r1`; compilation and linking remain `-O3`.

## Measurements

Windows, Intel Core i9-14900HX, Node 26.12.1. Sizes are uncompressed bytes. Before/after public parse samples alternate order in the same process, with an event-loop yield between iterations. Native/UTF-8/JSON/decoder stages are sampled separately, so their medians must not be added to reproduce the public median.

| Case                                |  Old wire |  New wire | Reduction |
| ----------------------------------- | --------: | --------: | --------: |
| Small interface                     |     1,007 |       240 |     76.2% |
| Official `ITestService.aidl`        |   169,346 |    56,719 |     66.5% |
| 1,000 methods, 47,905 source bytes  | 1,027,981 |   269,727 |     73.8% |
| 5,000 methods, 243,905 source bytes | 5,195,981 | 1,405,727 |     72.9% |

The focused 1,000-method comparison used 20 warmups and 30 measured samples per version:

| Stage                                                 | Before p50 | After p50 |
| ----------------------------------------------------- | ---------: | --------: |
| Public parse                                          |  490.36 ms |  38.05 ms |
| Native call                                           |  435.60 ms |  27.98 ms |
| UTF-8 output decoding                                 |    2.87 ms |   0.68 ms |
| `JSON.parse`                                          |   16.32 ms |   5.05 ms |
| Old position normalization / new full result decoding |   70.78 ms |   5.40 ms |

Public p95 was 526.12 → 47.24 ms. The official fixture in the wider 10-warmup/15-sample run measured 16.23 → 1.82 ms p50; 5,000 methods measured 2,634.98 → 219.48 ms p50.

**Absolute timing varied considerably across runs.** A separate optimized-only 1,000-method run measured 6.26 ms public p50, with native parsing 2.32 ms, wire writing 1.62 ms, AST cleanup 0.10 ms and final copy 0.006 ms. This is a separate run, not an additional speedup over the paired comparison. The numbers establish a substantial improvement on this host, not a universal latency guarantee. The initial compact JSON DOM still spent most native time constructing JSON objects; the final implementation streams containers and numbers directly, retaining nlohmann's string escaping and UTF-8 replacement.

WASM shrank from 682,050 to 668,691 bytes. With Node's default `gzipSync`, compressed size is 189,551 → 185,100 bytes. JS glue remains approximately 42.55 kB. These sizes exclude the website's editor/UI bundle.

Raw reports are retained locally in `build/benchmarks/optimized-all.json`, `optimized.json` and `profile.json`. Reports include process-wide GC and memory totals; these combine multiple parser instances and do not measure isolated per-parse allocation or retained-memory savings.

## Reproduction

```powershell
pnpm build
$env:BENCH_CASE = 'methods1000'
$env:BENCH_WARMUP = '20'
$env:BENCH_ITERATIONS = '30'
pnpm benchmark --baseline
node aidl-cpp/scripts/build.ts --profile
pnpm benchmark --profile
```

`--baseline` needs the locally preserved pre-change `build/benchmarks/baseline/dist/` and `runtime.ts`; it is optional and not part of a fresh checkout. Without it, the command benchmarks the current package. Profiling outputs are separate from shipping assets.

## Verification

- Field-by-field old/new comparison of 52 pinned AOSP fixtures plus 10 supplemental cases; canonical SHA-256 snapshots retained in `aidl-parser/test/compatibility.json`.
- 14 tests passed, covering source positions, Chinese/emoji/CRLF, invalid literals, expressions, public defaults, private enum IDs, production export separation and latest-request queuing.
- Build, TypeScript checks, npm pack/extract/import/typecheck passed.
- Browser development and production `/verify/` preview passed: Worker/WASM loading, lazy tree expansion, readable JSON, syntax errors, recovery and latest-edit display. No browser console errors or warnings were observed.
- Upstream AOSP checkout remained unmodified.

## Profiling commands

`node aidl-cpp/scripts/build.ts --profile` creates separate instrumented assets under `aidl-cpp/build/wasm-profile/`; `pnpm benchmark --profile` reports native parsing, wire writing, cleanup and final buffer-copy timings. Profiling exports are absent from the npm assets. `BENCH_CASE`, `BENCH_WARMUP` and `BENCH_ITERATIONS` select a case and sample counts. Reports are written to `build/benchmarks/`. Optional `--baseline` compares the retained pre-optimization artifacts in `build/benchmarks/baseline/`, when available. Timing depends on runtime warmup and host load; process-wide memory/GC figures are not per-parse allocation measurements.
