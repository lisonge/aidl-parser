import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "../../scripts/process.ts";
import { cpp } from "./paths.ts";
interface Source {
  repository: string;
  tag: string;
  commit: string;
}
const aidl: Source = JSON.parse(
  await readFile(resolve(cpp, "upstream/metadata.json"), "utf8"),
);
const dependencies: Record<string, Source> = JSON.parse(
  await readFile(resolve(cpp, "upstream/dependencies.json"), "utf8"),
);
for (const [name, source] of Object.entries({ aidl, ...dependencies })) {
  const target = resolve(cpp, "upstream", name);
  if (name === "json") {
    await mkdir(resolve(target, "nlohmann"), { recursive: true });
    for (const [remote, local] of [
      ["single_include/nlohmann/json.hpp", "nlohmann/json.hpp"],
      ["LICENSE.MIT", "LICENSE.MIT"],
    ]) {
      const response = await fetch(
        `https://raw.githubusercontent.com/nlohmann/json/${source.commit}/${remote}`,
      );
      if (!response.ok)
        throw new Error(`Download failed: ${response.status} ${remote}`);
      await writeFile(
        resolve(target, local!),
        new Uint8Array(await response.arrayBuffer()),
      );
    }
  } else {
    const exists = await access(resolve(target, ".git")).then(
      () => true,
      () => false,
    );
    if (!exists)
      await run("git", [
        "clone",
        "--depth",
        "1",
        "--branch",
        source.tag,
        source.repository,
        target,
      ]);
    const head = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (head !== source.commit)
      throw new Error(
        `${name}: expected ${source.commit}, got ${head}; keep local changes and update explicitly`,
      );
  }
  console.log(`${name}: ${source.tag} (${source.commit})`);
}
