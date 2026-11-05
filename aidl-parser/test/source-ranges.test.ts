import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAidl, sourceText, type Expression } from "../dist/index.js";

function constant(source: string) {
  const result = parseAidl(source);
  assert.deepEqual(result.diagnostics, []);
  const member = result.document!.declarations[0]!.members[0]!;
  assert.equal(member.kind, "constant");
  if (member.kind !== "constant") throw new Error("Expected constant");
  return member;
}

test("complete declaration, name, annotation, type and parameter spans", () => {
  const source =
    '// 😀 中文\r\n  @Descriptor("x")\r oneway interface\n I {\n @nullable String\n load(in @nullable List<List<String>> values) = 7;\n}  // end';
  const result = parseAidl(source);
  assert.deepEqual(result.diagnostics, []);
  const doc = result.document!;
  assert.equal(sourceText(source, doc), source);
  const declaration = doc.declarations[0]!;
  assert.equal(
    sourceText(source, declaration),
    '@Descriptor("x")\r oneway interface\n I {\n @nullable String\n load(in @nullable List<List<String>> values) = 7;\n}',
  );
  assert.equal(sourceText(source, { range: declaration.nameRange }), "I");
  assert.equal(declaration.nameRange.start.line, 4);
  assert.equal(
    sourceText(source, declaration.annotations[0]!),
    '@Descriptor("x")',
  );
  const method = declaration.members[0]!;
  if (method.kind !== "method") throw new Error("Expected method");
  assert.equal(
    sourceText(source, method),
    "@nullable String\n load(in @nullable List<List<String>> values) = 7;",
  );
  assert.equal(method.nameRange.start.line, 6);
  assert.equal(sourceText(source, method.returnType), "@nullable String");
  assert.equal(
    sourceText(source, method.parameters[0]!),
    "in @nullable List<List<String>> values",
  );
  const type = method.parameters[0]!.type;
  assert.equal(sourceText(source, type), "@nullable List<List<String>>");
  assert.equal(sourceText(source, type.arguments[0]!), "List<String>");
});

for (const expression of [
  "(1 + 2) * 3",
  "1 + 2 * 3",
  "((1))",
  "-(~(Missing.VALUE + 1))",
  "1 / 0",
  "1 /* note */ << 4",
  "0xffu8",
  "0x7fffffffffffffffL",
  "1.5e-2f",
  '"0xffu8"',
  "{}",
  "{{1, 2}, {3, 4}}",
  '"quote\\\";,// /* ()"',
]) {
  test(`expression source: ${expression}`, () => {
    const source = `interface I { const int X = ${expression}; }`;
    const node = constant(source).value;
    assert.equal(sourceText(source, node), expression);
    function check(value: Expression) {
      assert.ok(value.range.start.offset >= node.range.start.offset);
      assert.ok(value.range.end.offset <= node.range.end.offset);
      if (value.kind === "literal")
        assert.equal(value.token, sourceText(source, value));
      if (value.kind === "parenthesized") check(value.expression);
      if (value.kind === "binary") {
        check(value.left);
        check(value.right);
      }
      if (value.kind === "unary") check(value.operand);
      if (value.kind === "array") value.elements.forEach(check);
    }
    check(node);
    if (expression === "((1))") {
      assert.equal(node.kind, "parenthesized");
      if (node.kind === "parenthesized")
        assert.equal(node.expression.kind, "parenthesized");
    }
  });
}

test("long compound chains retain every operand and source span", () => {
  const expression = Array.from({ length: 500 }, (_, i) => String(i)).join(
    " + ",
  );
  const source = `interface I { const int X = ${expression}; }`;
  let node = constant(source).value;
  assert.equal(sourceText(source, node), expression);
  for (let i = 499; i > 0; --i) {
    if (node.kind !== "binary") assert.fail("Expected binary expression");
    assert.equal(node.operator, "+");
    if (node.right.kind !== "literal") assert.fail("Expected literal");
    assert.equal(node.right.token, String(i));
    assert.equal(sourceText(source, node.right), String(i));
    node = node.left;
  }
  if (node.kind !== "literal") assert.fail("Expected first literal");
  assert.equal(node.token, "0");
});

test("package and import declarations preserve syntax and order", () => {
  const source =
    "/* lead */ package outer; import a /* x */ . B; import c.D; parcelable Value;";
  const doc = parseAidl(source).document!;
  assert.equal(doc.packageDeclaration!.name, "outer");
  assert.equal(sourceText(source, doc.packageDeclaration!), "package outer;");
  assert.deepEqual(
    doc.imports.map((i) => i.name),
    ["a.B", "c.D"],
  );
  assert.equal(
    sourceText(source, { range: doc.imports[0]!.nameRange }),
    "a /* x */ . B",
  );
  const forward = parseAidl("parcelable outer.Value;").document!;
  assert.equal(forward.packageDeclaration, null);
  assert.equal(forward.declarations[0]!.name, "outer.Value");
});

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`UTF-16 and newline ${JSON.stringify(newline)}`, () => {
    const source = `// 中文 😀${newline}\tinterface${newline}\tI {}`;
    const node = parseAidl(source).document!.declarations[0]!;
    assert.deepEqual(node.nameRange.start, {
      offset: source.indexOf("I"),
      line: 3,
      column: 2,
    });
    assert.equal(sourceText(source, node), `interface${newline}\tI {}`);
  });
}

test("empty input, trailing comments, EOF and unterminated comments", () => {
  assert.deepEqual(parseAidl("").document!.range, {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 0, line: 1, column: 1 },
  });
  for (const source of [
    "interface I {",
    "interface I {} /* unterminated",
    "// 😀\rinterface I { void f( ; }",
  ]) {
    const result = parseAidl(source);
    assert.equal(result.document, null);
    assert.ok(result.diagnostics.length);
    for (const diagnostic of result.diagnostics)
      if (diagnostic.range) {
        assert.ok(diagnostic.range.start.offset >= 0);
        assert.ok(diagnostic.range.end.offset <= source.length);
      }
  }
});
