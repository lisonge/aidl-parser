import { readdir, readFile } from "node:fs/promises";

export async function compatibilityCases() {
  const root = new URL(
    "../aidl-cpp/upstream/aidl/tests/android/aidl/tests/",
    import.meta.url,
  );
  const files = (await readdir(root, { recursive: true }))
    .filter((file) => file.endsWith(".aidl"))
    .sort();
  const cases = await Promise.all(
    files.map(async (file) => ({
      name: file.replaceAll("\\", "/"),
      source: await readFile(new URL(file.replaceAll("\\", "/"), root), "utf8"),
    })),
  );
  for (const [name, source] of Object.entries({
    unicode:
      "// 中文 😀\r\npackage demo;\r\n/* é€𐐀 */ interface I { void f(in int x, out int[] y, inout String z, int implicit); }",
    expressions:
      'parcelable P { const int A = 1 + 2 * 3; const int B = ~A; int x = -1; int[2] ys = {1, 2}; String s = "quote\\\" slash\\\\ newline\\n"; }',
    enum: "enum E { A, B = 0, C = 2 << 3 }",
    annotation:
      "@JavaDerive(equals=true, toString=true) parcelable P { @nullable String s; }",
    parameterKeys:
      "@UnsupportedAppUsage(maxTargetSdk=30, trackingBug=123) interface I { void f(); }",
    forward: 'parcelable P cpp_header "p.h";',
    empty: "",
    invalid: "interface I { void f( }",
    invalidUnicode: 'parcelable P { String s = "中文😀"; }',
    trailing: "/* 😀 */\n\ninterface I {",
  }))
    cases.push({ name: `${name}.aidl`, source });
  return cases;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
