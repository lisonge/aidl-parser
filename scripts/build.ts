import { run } from "./process.ts";
await run(process.execPath, ["aidl-parser/scripts/build.ts"]);
await run(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "build",
  "aidl-website",
]);
