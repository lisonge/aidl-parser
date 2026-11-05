import { readFile } from "node:fs/promises";

const { version } = JSON.parse(
  await readFile(
    new URL("../aidl-parser/package.json", import.meta.url),
    "utf8",
  ),
) as { version: string };

if (process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`Release tag must be v${version}`);
}

const changelog = await readFile(
  new URL("../aidl-parser/CHANGELOG.md", import.meta.url),
  "utf8",
);
if (!changelog.trim())
  throw new Error("CHANGELOG.md must contain the current release notes");
