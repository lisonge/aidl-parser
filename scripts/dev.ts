import { createServer } from "vite";
import { watch } from "chokidar";
import { run } from "./process.ts";
await run(process.execPath, ["aidl-parser/scripts/build.ts"]);
const server = await createServer({
  configFile: "aidl-website/vite.config.ts",
  root: "aidl-website",
});
await server.listen();
server.printUrls();
let running = false;
let pending = false;
let native = false;
let timer: ReturnType<typeof setTimeout>;
async function rebuild() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  const rebuildNative = native;
  native = false;
  try {
    console.log(`Rebuilding ${rebuildNative ? "WASM + package" : "package"}…`);
    await run(process.execPath, [
      "aidl-parser/scripts/build.ts",
      ...(rebuildNative ? [] : ["--skip-wasm"]),
    ]);
    server.moduleGraph.invalidateAll();
    server.ws.send({ type: "full-reload" });
  } catch (error) {
    console.error(error);
    server.ws.send({
      type: "error",
      err: { message: String(error), stack: "" },
    });
  } finally {
    running = false;
    if (pending) {
      pending = false;
      await rebuild();
    }
  }
}
const watcher = watch(
  [
    "scripts/generate-wire.ts",
    "aidl-cpp/src",
    "aidl-cpp/CMakeLists.txt",
    "aidl-cpp/scripts",
    "aidl-cpp/upstream/aidl",
    "aidl-parser/src",
    "aidl-parser/scripts",
  ],
  { ignoreInitial: true, ignored: /(^|[/\\])(?:\.git|generated)([/\\]|$)/ },
);
watcher.on("all", (_event, path) => {
  native ||=
    path.startsWith("aidl-cpp") ||
    path.replaceAll("\\", "/") === "scripts/generate-wire.ts";
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});
process.on("SIGINT", async () => {
  clearTimeout(timer);
  await watcher.close();
  await server.close();
  process.exit();
});
