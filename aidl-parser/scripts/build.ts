import { build } from "tsdown";
import { fileURLToPath } from "node:url";
import { run } from "../../scripts/process.ts";
import { copyWasm } from "./copy-wasm.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
if (!process.argv.includes("--skip-wasm"))
  await run(process.execPath, ["aidl-cpp/scripts/build.ts"], { cwd: root });
await copyWasm();
await build({
  config: false,
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  entry: ["src/index.ts"],
  outDir: "dist",
  format: "esm",
  platform: "neutral",
  clean: false,
  dts: { generator: "oxc" },
  deps: { neverBundle: ["../dist/wasm/aidl.mjs"] },
  outputOptions: {
    paths: (id) => (/(?:^|[/\\])aidl\.mjs$/.test(id) ? "./wasm/aidl.mjs" : id),
  },
});
