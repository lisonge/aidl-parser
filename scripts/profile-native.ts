import { Session } from "node:inspector/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { allocate } from "../aidl-parser/src/runtime.ts";

// Build with `node aidl-cpp/scripts/build.ts --profile` first. Function names
// belong only to that artifact. Sampling excludes JS wire/AST decoding.
const root = new URL("../", import.meta.url);
const factory = (
  await import(new URL("aidl-cpp/build/wasm-profile/aidl.mjs", root).href)
).default;
const module = await factory();
const name = process.env.PROFILE_CASE ?? "methods5000";
const cases: Record<string, () => string | Promise<string>> = {
  methods5000: () =>
    `interface I {\n${Array.from({ length: 5000 }, (_, i) => `int method${i}(in int value, out String text);`).join("\n")}\n}`,
  chains20x500: () =>
    `interface I {\n${Array.from({ length: 20 }, (_, i) => `const int VALUE${i} = ${Array.from({ length: 500 }, (_, j) => String(j + 1)).join(" + ")};`).join("\n")}\n}`,
  official: () =>
    readFile(
      new URL(
        "aidl-cpp/upstream/aidl/tests/android/aidl/tests/ITestService.aidl",
        root,
      ),
      "utf8",
    ),
};
if (!cases[name]) throw new Error(`Unknown PROFILE_CASE: ${name}`);
const source = await cases[name]();
const input = allocate(module, source),
  filename = allocate(module, "input.aidl");
const parse = () => {
  const result = module._aidl_parse(input, filename);
  module._aidl_free(result);
};
const iterations = Number(process.env.PROFILE_ITERATIONS ?? 200);
for (let i = 0; i < 25; i++) parse();
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 100 });
await session.post("Profiler.start");
for (let i = 0; i < iterations; i++) parse();
const { profile } = await session.post("Profiler.stop");
session.disconnect();
module._free(input);
module._free(filename);
const output = new URL(
  process.env.PROFILE_OUTPUT ?? `build/benchmarks/native-${name}.cpuprofile`,
  root,
);
await mkdir(new URL("./", output), { recursive: true });
await writeFile(output, JSON.stringify(profile));
const nodes = profile.nodes as {
  id: number;
  callFrame: { functionName: string };
  hitCount?: number;
  children?: number[];
}[];
const total = (profile.samples as number[]).length;
const byId = new Map(nodes.map((node) => [node.id, node]));
const inclusive = (id: number): number => {
  const node = byId.get(id)!;
  return (
    (node.hitCount ?? 0) +
    (node.children ?? []).reduce((sum, child) => sum + inclusive(child), 0)
  );
};
const summary = {
  case: name,
  iterations,
  samples: total,
  note: "Sample counts, not exact timings; inclusive counts overlap. Native call includes parsing, serialization and cleanup. CPU sampling perturbs execution.",
  functions: nodes
    .filter((node) => (node.hitCount ?? 0) > 0)
    .map((node) => ({
      name: node.callFrame.functionName,
      selfSamples: node.hitCount ?? 0,
      inclusiveSamples: inclusive(node.id),
    }))
    .sort((a, b) => b.selfSamples - a.selfSamples),
};
await writeFile(
  new URL(output.href + ".json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { ...summary, functions: summary.functions.slice(0, 25) },
    null,
    2,
  ),
);
