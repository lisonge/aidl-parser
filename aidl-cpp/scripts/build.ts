import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { run } from "../../scripts/process.ts";
import { cpp, build } from "./paths.ts";
import { prepare } from "./prepare.ts";
import { generateWire } from "../../scripts/generate-wire.ts";

const sdk = process.env.EMSDK;
if (!sdk) throw new Error("Run the build with mise exec -- pnpm build:parser.");

await generateWire();
await prepare();
await mkdir(resolve(build, "generated"), { recursive: true });
const generated = resolve(build, "generated");
const windows = process.platform === "win32";
for (const [tool, input, output, extra] of [
  [
    windows ? "win_bison" : "bison",
    "aidl_language_y.yy",
    "aidl_language_y.cpp",
    ["--defines=aidl_language_y.h"],
  ],
  [
    windows ? "win_flex" : "flex",
    "aidl_language_l.ll",
    "aidl_language_l.cpp",
    [],
  ],
] as const) {
  const source = resolve(build, "source", input);
  const existing = await stat(resolve(generated, output)).catch(() => null);
  if (!existing || existing.mtimeMs < (await stat(source)).mtimeMs)
    await run(tool, [...extra, "-o", output, source], {
      cwd: generated,
    });
}
await mkdir(resolve(build, "tmp"), { recursive: true });
const env = {
  ...process.env,
  TMP: resolve(build, "tmp"),
  TEMP: resolve(build, "tmp"),
  EMSDK_PYTHON: execFileSync(
    "python",
    ["-c", "import sys; print(sys.executable)"],
    {
      encoding: "utf8",
    },
  ).trim(),
  EM_CACHE: resolve(build, "emscripten-cache"),
};
const profile = process.argv.includes("--profile");
const cmake = resolve(build, profile ? "cmake-profile" : "cmake");
await run(
  "cmake",
  [
    "-S",
    cpp,
    "-B",
    cmake,
    "-G",
    "Ninja",
    `-DCMAKE_TOOLCHAIN_FILE=${resolve(sdk, "upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake")}`,
    "-DCMAKE_BUILD_TYPE=Release",
    `-DAIDL_PROFILE=${profile ? "ON" : "OFF"}`,
  ],
  { env },
);
await run("cmake", ["--build", cmake, "--parallel", "4"], { env });
