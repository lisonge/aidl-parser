import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAidl, sourceText } from "../dist/index.js";

test("wire strings preserve ASCII, escaping, controls and Unicode", () => {
  const controls = Array.from({ length: 31 }, (_, i) =>
    String.fromCharCode(i + 1),
  ).join("");
  for (const text of [
    "plain ASCII 0123456789 / < > & ' ~ \u007f",
    'quotes " and backslash \\',
    controls,
    "中文 😀 é € 𐐀",
  ]) {
    const comment = `/* ${text} */`;
    const source = `${comment}\ninterface ASCII_Name123 { void call(); }`;
    const result = parseAidl(source);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.document!.declarations[0]!.comments[0], comment);
    assert.equal(result.document!.declarations[0]!.name, "ASCII_Name123");
  }
  const token = JSON.stringify('quote " slash \\ tab\t newline\n');
  const source = `@Descriptor("sample.I") interface I { const String TEXT = ${token}; }`;
  const result = parseAidl(source);
  assert.deepEqual(result.diagnostics, []);
  const node = result.document!.declarations[0]!.members[0]!;
  if (node.kind !== "constant" || node.value.kind !== "literal") assert.fail();
  assert.equal(node.value.token, token);
  assert.equal(sourceText(source, node.value), token);
});
