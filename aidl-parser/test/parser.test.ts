import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAidl, upstream } from "../dist/index.js";
import { samples } from "../../aidl-website/src/samples.ts";

test("unspecified parameter direction is null and distinct from explicit in", () => {
  const result = parseAidl(
    "interface I { void f(int a, in int b, out int[] c, inout int[] d); }",
  );
  assert.deepEqual(result.diagnostics, []);
  const method = result.document!.declarations[0]!.members[0]!;
  if (method.kind !== "method") assert.fail();
  assert.deepEqual(
    method.parameters.map((parameter) => parameter.direction),
    [null, "in", "out", "inout"],
  );
});

test("pinned Android 17, declarations, imports and unresolved references", () => {
  assert.equal(upstream.tag, "android-17.0.0_r1");
  const result = parseAidl(samples["Service interface"]!);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.document!.package, "example.library");
  assert.deepEqual(result.document!.imports, ["example.library.Book"]);
  const service = result.document!.declarations[0]!;
  assert.equal(service.kind, "interface");
  assert.equal(service.name, "ILibrary");
  assert.equal(service.members[0]!.kind, "constant");
  const method = service.members[2]!;
  assert.equal(method.kind, "method");
  if (method.kind !== "method") assert.fail();
  assert.equal(method.returnType.arguments[0]!.name, "Book");
  assert.equal(method.parameters[0]!.direction, "in");
});
test("parcelable defaults, fixed arrays, expressions and annotations", () => {
  const result = parseAidl(samples["Data and expressions"]!);
  assert.deepEqual(result.diagnostics, []);
  const declaration = result.document!.declarations[0]!;
  assert.equal(declaration.annotations[0]!.parameters.equals!.literal, "true");
  const field = declaration.members[0]!;
  assert.equal(field.kind, "field");
  if (field.kind !== "field") assert.fail();
  assert.equal(field.defaultValue, null);
  const constant = declaration.members.at(-1)!;
  if (constant.kind !== "constant" || constant.value.kind !== "binary")
    assert.fail();
  assert.equal(constant.value.operator, "|");
  assert.equal(constant.value.left.kind, "binary");
  const dimensions = declaration.members[3]!;
  if (dimensions.kind !== "field" || dimensions.type.array?.kind !== "fixed")
    assert.fail();
  assert.equal(dimensions.type.array.dimensions[0]!.literal, "3");
});
test("union does not synthesize Tag, enum keeps implicit values absent", () => {
  const result = parseAidl(
    "union U { int x; String y; } enum E { A, B = 1 << 2, }",
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.document!.declarations[0]!.members.length, 2);
  const enumeration = result.document!.declarations[1]!;
  if (enumeration.kind !== "enum") assert.fail();
  assert.equal(enumeration.enumerators[0]!.value, null);
  assert.equal(enumeration.enumerators[1]!.value!.kind, "binary");
});
test("forward parcelables and array expressions", () => {
  const result = parseAidl(
    'parcelable External cpp_header "External.h"; parcelable Data { int[] values = {1, 2, 3}; }',
  );
  assert.deepEqual(result.diagnostics, []);
  const forward = result.document!.declarations[0]!;
  if (forward.kind !== "parcelable") assert.fail();
  assert.equal(forward.forward, true);
  assert.equal(forward.cppHeader, "External.h");
  const field = result.document!.declarations[1]!.members[0]!;
  if (field.kind !== "field" || field.defaultValue?.kind !== "array")
    assert.fail();
  assert.equal(field.defaultValue.elements.length, 3);
});
test("UTF-8 byte columns convert to UTF-16 with CRLF, Chinese and emoji", () => {
  const source = "// 中文 😀\r\ninterface I { /* 中文 😀 */ void hello(); }";
  const result = parseAidl(source);
  assert.deepEqual(result.diagnostics, []);
  const location = result.document!.declarations[0]!.members[0]!.location!;
  assert.equal(
    source.slice(location.start.offset, location.end.offset).trim(),
    "hello",
  );
  assert.equal(location.start.line, 2);
});
test("syntax diagnostics recover on the next parse", () => {
  const result = parseAidl(samples["Syntax diagnostics"]!);
  assert.equal(result.document, null);
  assert.match(result.diagnostics[0]!.message, /syntax error/);
  assert.equal(result.diagnostics[0]!.location!.start.line, 5);
  assert.ok(parseAidl("interface I { void ok(); }").document);
});
test("invalid non-ASCII literals yield diagnostics, not broken JSON", () => {
  const result = parseAidl('parcelable P { String title = "中文"; }');
  assert.equal(result.document, null);
  assert.ok(result.diagnostics.length);
  assert.ok(parseAidl('parcelable P { String title = "ASCII"; }').document);
});
test("shared instance repeated parse ownership", () => {
  for (let i = 0; i < 300; i++) {
    assert.ok(parseAidl("interface I { int f(in String s); }").document);
    assert.equal(parseAidl("interface {").document, null);
  }
});
