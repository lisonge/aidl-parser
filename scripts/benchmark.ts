import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { performance, PerformanceObserver } from "node:perf_hooks";
import { allocate } from "../aidl-parser/src/runtime.ts";
import type { WasmModule } from "../aidl-parser/src/runtime.ts";
import { decode } from "../aidl-parser/src/decode.ts";
import type { WireResult } from "../aidl-parser/src/decode.ts";
import { parseAidl } from "../aidl-parser/dist/index.js";

type Factory = (
  options?: object,
) => Promise<
  WasmModule & { _aidl_metric?: (index: number) => number; HEAPU8?: Uint8Array }
>;
const root = new URL("../", import.meta.url);
const profile = process.argv.includes("--profile");
const baseline = process.argv.includes("--baseline");
const iterations = Number(process.env.BENCH_ITERATIONS ?? 30);
const warmup = Number(process.env.BENCH_WARMUP ?? 25);
const variants: {
  name: string;
  module: Awaited<ReturnType<Factory>>;
  parse: (source: string) => unknown;
  convert: (value: unknown, source: string) => unknown;
}[] = [];
if (baseline) {
  const old = await import(
    new URL("build/benchmarks/baseline/dist/index.js", root).href
  );
  const oldRuntime = await import(
    new URL("build/benchmarks/baseline/runtime.ts", root).href
  );
  const factory: Factory = (
    await import(
      new URL("build/benchmarks/baseline/dist/wasm/aidl.mjs", root).href
    )
  ).default;
  variants.push({
    name: "before",
    module: await factory(),
    parse: (await old.createAidlParser()).parse,
    convert: oldRuntime.normalize,
  });
}
const factory: Factory = (
  await import(
    new URL(
      profile
        ? "aidl-cpp/build/wasm-profile/aidl.mjs"
        : "aidl-parser/dist/wasm/aidl.mjs",
      root,
    ).href
  )
).default;
variants.push({
  name: profile ? "profile" : "after",
  module: await factory(),
  parse: parseAidl,
  convert: (value, source) => decode(value as WireResult, source),
});
const cases = {
  small: "interface I { int f(in int a); }",
  official: await readFile(
    new URL(
      "aidl-cpp/upstream/aidl/tests/android/aidl/tests/ITestService.aidl",
      root,
    ),
    "utf8",
  ),
  methods1000: `interface I {\n${Array.from({ length: 1000 }, (_, i) => `  int method${i}(in int value, out String text);`).join("\n")}\n}`,
  methods5000: `interface I {\n${Array.from({ length: 5000 }, (_, i) => `  int method${i}(in int value, out String text);`).join("\n")}\n}`,
};
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * fraction))
  ]!;
const stats = (values: number[]) => ({
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
});
let gcCount = 0,
  gcMs = 0;
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcCount++;
    gcMs += entry.duration;
  }
});
observer.observe({ entryTypes: ["gc"] });
const report: Record<string, unknown> = {
  node: process.version,
  flags: process.execArgv,
  warmup,
  iterations,
  note: "Times in ms. Public parse and raw stages measured separately; phase medians are not additive. GC/memory are process-wide.",
  cases: {},
};
for (const [name, source] of Object.entries(cases)) {
  if (process.env.BENCH_CASE && name !== process.env.BENCH_CASE) continue;
  const results: Record<string, unknown> = {};
  for (let i = 0; i < warmup; i++) {
    for (const variant of variants) variant.parse(source);
    await setImmediate();
  }
  const totals = variants.map(() => [] as number[]);
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < variants.length; j++) {
      const index = (i + j) % variants.length;
      const start = performance.now();
      variants[index]!.parse(source);
      totals[index]!.push(performance.now() - start);
    }
    await setImmediate();
  }
  for (const [index, variant] of variants.entries()) {
    const module = variant.module;
    const input = allocate(module, source),
      filename = allocate(module, "input.aidl");
    const stages = Array.from({ length: 8 }, () => [] as number[]);
    let bytes = 0;
    for (let i = -warmup; i < iterations; i++) {
      const start = performance.now();
      const pointer = module._aidl_parse(input, filename);
      const native = performance.now();
      const json = module.UTF8ToString(pointer);
      const decoded = performance.now();
      const value = JSON.parse(json);
      const parsed = performance.now();
      variant.convert(value, source);
      const converted = performance.now();
      if (i >= 0) {
        stages[0]!.push(native - start);
        stages[1]!.push(decoded - native);
        stages[2]!.push(parsed - decoded);
        stages[3]!.push(converted - parsed);
        if (module._aidl_metric)
          for (let k = 0; k < 4; k++)
            stages[4 + k]!.push(module._aidl_metric(k));
      }
      bytes = Buffer.byteLength(json);
      module._aidl_free(pointer);
      await setImmediate();
    }
    module._free(input);
    module._free(filename);
    results[variant.name] = {
      publicParse: stats(totals[index]!),
      wireBytes: bytes,
      native: stats(stages[0]!),
      utf8: stats(stages[1]!),
      jsonParse: stats(stages[2]!),
      convert: stats(stages[3]!),
      ...(module._aidl_metric
        ? {
            cppParse: stats(stages[4]!),
            cppWire: stats(stages[5]!),
            cppCleanup: stats(stages[6]!),
            cppCopy: stats(stages[7]!),
          }
        : {}),
    };
  }
  (report.cases as Record<string, unknown>)[name] = {
    sourceBytes: Buffer.byteLength(source),
    ...results,
  };
  console.log(name, JSON.stringify(results));
}
await setImmediate();
observer.disconnect();
report.gc = { count: gcCount, durationMs: gcMs };
report.memory = process.memoryUsage();
await mkdir(new URL("build/benchmarks/", root), { recursive: true });
const output = new URL(
  `build/benchmarks/${profile ? "profile" : "optimized"}.json`,
  root,
);
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(output.pathname);
