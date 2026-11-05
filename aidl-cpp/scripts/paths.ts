import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const cpp = resolve(root, "aidl-cpp");
export const build = resolve(cpp, "build");
