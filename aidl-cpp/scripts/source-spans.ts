// Applied only to the build-local copy of the pinned AOSP sources.
const replaceText = (text: string, from: string, to: string) =>
  text.replace(from, () => to);
export function sourceSpans(sources: Map<string, string>) {
  const edit = (file: string, from: string, to: string) => {
    const text = sources.get(file)!;
    if (!text.includes(from))
      throw new Error(`Source span patch mismatch: ${file}: ${from}`);
    sources.set(file, text.replace(from, to));
  };
  edit(
    "location.h",
    "    int column;",
    "    int column;\n    int offset = -1;",
  );
  edit(
    "location.h",
    "class AidlLocation {",
    `struct AidlSourceRange {
  int start = -1;
  int end = -1;
};

class AidlLocation {`,
  );
  // The lexer accepts escaped strings; preserve those tokens without treating
  // the escape introducer as an invalid literal character.
  edit(
    "aidl_const_expressions.cpp",
    "    if (!isValidLiteralChar(value[i])) {",
    `    if (value[i] == '\\\\' && i + 1 < value.length() - 1) { ++i; continue; }
    if (!isValidLiteralChar(value[i])) {`,
  );
  edit(
    "aidl_language.h",
    "class AidlNode {\n public:",
    `class AidlNode {
 public:
  AidlSourceRange source_range;
  AidlSourceRange name_range;
  void SetSourceRange(AidlSourceRange range) { source_range = range; }
  void SetNameRange(AidlSourceRange range) { name_range = range; }
`,
  );
  // ParseSource does not run semantic evaluation or value diagnostics. The
  // bridge serializes compound children, so rebuilding their text is unused
  // (and quadratic for long binary chains). Keep literal/reference text intact.
  edit(
    "aidl_const_expressions.cpp",
    `  // Reconstruct literal value
  std::vector<std::string> str_values;
  for (const auto& v : *values) {
    str_values.push_back(v->value_);
  }
  return new AidlConstantValue(location, Type::ARRAY, std::move(values),
                               "{" + Join(str_values, ", ") + "}");`,
    '  return new AidlConstantValue(location, Type::ARRAY, std::move(values), "");',
  );
  edit(
    "aidl_const_expressions.cpp",
    `      final_type_(type) {
  AIDL_FATAL_IF(value_.empty() && type_ != Type::ERROR, location);`,
    `      final_type_(type) {
  AIDL_FATAL_IF(value_.empty() && type_ != Type::ERROR &&
                type_ != Type::UNARY && type_ != Type::BINARY, location);`,
  );
  edit(
    "aidl_const_expressions.cpp",
    "Type::UNARY, op + rval->value_",
    'Type::UNARY, ""',
  );
  edit(
    "aidl_const_expressions.cpp",
    "Type::BINARY, lval->value_ + op + rval->value_",
    'Type::BINARY, ""',
  );
  edit(
    "aidl_language.h",
    "class AidlDefinedType : public AidlMember, public AidlScope {\n public:",
    "class AidlDefinedType : public AidlMember, public AidlScope {\n public:\n  std::string source_name;",
  );
  edit(
    "aidl_language.h",
    "  friend AidlUnaryConstExpression;",
    "  friend class AidlParenthesizedExpression;\n  friend AidlUnaryConstExpression;",
  );
  edit(
    "aidl_language.h",
    "class AidlUnaryConstExpression : public AidlConstantValue {",
    `class AidlParenthesizedExpression : public AidlConstantValue {
 public:
  AidlParenthesizedExpression(const AidlLocation& location, AidlConstantValue* value)
    : AidlConstantValue(location, Type::UNARY, ""), expression(value) {}
  std::unique_ptr<AidlConstantValue> expression;
  void TraverseChildren(std::function<void(const AidlNode&)> visit) const override { visit(*expression); }
};

class AidlUnaryConstExpression : public AidlConstantValue {`,
  );
  edit(
    "parser.h",
    "class Parser {",
    `struct SourceDeclaration {
  std::string name;
  AidlSourceRange range;
  AidlSourceRange name_range;
  Comments comments;
  bool is_package;
};
class Parser {`,
  );
  // The parse result retains declaration metadata after the parser is destroyed.
  edit(
    "parser.h",
    "  void AddError()",
    `  std::vector<SourceDeclaration> source_declarations;
  void AddError()`,
  );
  // Transfer declaration metadata separately from AOSP's package inference.
  edit(
    "parser.h",
    "std::string source);",
    "std::string source, std::vector<SourceDeclaration>& declarations);",
  );
  edit(
    "parser.cpp",
    "std::string source) {",
    "std::string source, std::vector<SourceDeclaration>& declarations) {",
  );
  edit(
    "parser.cpp",
    "  return std::move(parser.document_);",
    "  declarations = std::move(parser.source_declarations);\n  return std::move(parser.document_);",
  );

  let grammar = sources.get("aidl_language_y.yy")!;
  grammar = replaceText(
    grammar,
    "#define lex_scanner ps->Scanner()",
    `AidlSourceRange span(const yy::parser::location_type& location) {
  return {location.begin.offset, location.end.offset};
}

#define lex_scanner ps->Scanner()`,
  );
  grammar = replaceText(
    grammar,
    "%initial-action {",
    "%initial-action {\n    @$.begin = @$.end = {nullptr, 1, 1, 0, false};",
  );
  grammar = replaceText(
    grammar,
    "%locations",
    '%locations\n%define api.location.type {SourceLocation}\n%code requires {\n#include "source_location.h"\n}',
  );
  grammar = replaceText(
    grammar,
    ".column = begin.begin.column,",
    ".column = begin.begin.column,\n    .offset = begin.begin.offset,",
  );
  grammar = replaceText(
    grammar,
    ".column = end.end.column,",
    ".column = end.end.column,\n    .offset = end.end.offset,",
  );
  grammar = replaceText(
    grammar,
    "| '(' const_expr ')'\n  {\n    $$ = $2;",
    "| '(' const_expr ')'\n  {\n    $$ = new AidlParenthesizedExpression(loc(@$), $2);",
  );
  grammar = replaceText(
    grammar,
    "    ps->SetPackage($2->GetText());",
    "    ps->source_declarations.push_back({$2->GetText(), span(@$), span(@2), $1->GetComments(), true});\n    ps->SetPackage($2->GetText());",
  );
  grammar = replaceText(
    grammar,
    '// carry the comments before "import" token',
    'ps->source_declarations.push_back({$2->GetText(), span(@$), span(@2), $1->GetComments(), false});\n    // carry the comments before "import" token',
  );
  // Empty source is a valid syntax document.
  const declStart = grammar.indexOf("decls\n : decl");
  const declNext = grammar.indexOf(" | decls decl", declStart);
  grammar =
    grammar.slice(0, declStart) +
    "decls\n : { $$ = new std::vector<std::unique_ptr<AidlDefinedType>>(); }\n" +
    grammar.slice(declNext);
  grammar = replaceText(
    grammar,
    "if ($2 != nullptr) {\n      $1->emplace_back(std::unique_ptr<AidlAnnotation>($2));",
    "@$.begin = $1->empty() ? @2.begin : @1.begin;\n    if ($2 != nullptr) {\n      $1->emplace_back(std::unique_ptr<AidlAnnotation>($2));",
  );
  grammar = grammar.replaceAll(
    "$3->Annotate(std::move(*$1));",
    "/* annotations attach to the declaration below */",
  );
  const nodeRules = new Set([
    "decl",
    "type_parameter",
    "parcelable_decl",
    "variable_decl",
    "interface_decl",
    "const_expr",
    "constant_decl",
    "enumerator",
    "enum_decl",
    "union_decl",
    "method_decl",
    "arg",
    "non_array_type",
    "type",
    "annotation",
  ]);
  const parts = grammar.split("\n%%");
  const body = parts[1]!;
  // Locate action blocks without interpreting braces in C++ strings/comments.
  const tokens =
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]|^([a-z_]+)\s*$|^\s*[:|]/gm;
  let rule = "",
    prefixStart = 0,
    depth = 0,
    actionStart = 0,
    cursor = 0,
    output = "";
  for (const match of body.matchAll(tokens)) {
    const token = match[0],
      index = match.index!;
    if (depth === 0 && match[1]) {
      rule = match[1];
      continue;
    }
    if (depth === 0 && /^\s*[:|]$/.test(token)) {
      prefixStart = index + token.length;
      continue;
    }
    if (token === "{") {
      if (depth++ === 0) actionStart = index;
    }
    if (token !== "}" || --depth !== 0) continue;
    if (!nodeRules.has(rule)) continue;
    const symbols: string[] =
      body
        .slice(prefixStart, actionStart)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(/'[^']*'|[A-Za-z_]+/g) ?? [];
    let action = body.slice(actionStart + 1, index);
    if (
      ["constant_decl", "method_decl"].includes(rule) &&
      symbols[0] === "annotation_list"
    )
      action = replaceText(
        action,
        "delete $1;",
        "$$->Annotate(std::move(*$1)); delete $1;",
      );
    let begin = "@$.begin";
    if (symbols[0] === "annotation_list")
      begin = `($1->empty() ? @2.begin : @1.begin)`;
    if (["non_array_type", "type"].includes(symbols[0] ?? ""))
      begin = `@1.begin`;
    let name =
      symbols.findIndex((s) => s === "identifier" || s === "qualified_name") +
      1;
    if (
      ![
        "type_parameter",
        "parcelable_decl",
        "variable_decl",
        "interface_decl",
        "constant_decl",
        "enumerator",
        "enum_decl",
        "union_decl",
        "method_decl",
        "arg",
        "const_expr",
      ].includes(rule)
    )
      name = 0;
    if (rule === "const_expr" && symbols[0] !== "qualified_name") name = 0;
    const preserveName =
      name &&
      ["parcelable_decl", "interface_decl", "enum_decl", "union_decl"].includes(
        rule,
      );
    let tail = "\n    if ($$) { $$->SetSourceRange(span(source_span));";
    if (name) tail += ` $$->SetNameRange(span(@${name}));`;
    if (preserveName) tail += " $$->source_name = std::move(source_name);";
    // AOSP folds the two closing generic brackets into one RSHIFT token.
    if (symbols.at(-1) === "RSHIFT") {
      const inner = symbols.lastIndexOf("non_array_type") + 1;
      tail += ` auto inner_span = source_span; inner_span.begin = @${inner}.begin; --inner_span.end.offset; --inner_span.end.column; $${inner}->SetSourceRange(span(inner_span));`;
    }
    tail += " }\n    @$ = source_span;\n";
    output +=
      body.slice(cursor, actionStart + 1) +
      `\n    auto source_span = @$; source_span.begin = ${begin};\n${preserveName ? `    auto source_name = $${name}->GetText();\n` : ""}` +
      action +
      tail;
    cursor = index;
  }
  parts[1] = output + body.slice(cursor);
  sources.set("aidl_language_y.yy", parts.join("\n%%"));

  let lexer = sources.get("aidl_language_l.ll")!;
  lexer = lexer.replace(
    "#define YY_USER_ACTION yylloc->columns(yyleng);",
    "#define YY_USER_ACTION yylloc->consume(yytext, yyleng);",
  );
  lexer = lexer.replace("whitespace  ([ \\t\\r]+)", "whitespace  ([ \\t]+)");
  lexer = lexer.replaceAll("yylloc->lines(yyleng);", "");
  lexer = lexer.replace(
    "<LONG_COMMENT>\\n+",
    "<LONG_COMMENT>(\\r\\n|\\r|\\n)+",
  );
  lexer = lexer.replace("<LONG_COMMENT>[^*\\n]+", "<LONG_COMMENT>[^*\\r\\n]+");
  lexer = lexer.replace("\\/\\/.*", "\\/\\/[^\\r\\n]*");
  lexer = lexer.replace("\\n+                   ", "(\\r\\n|\\r|\\n)+      ");
  lexer = lexer.replace(
    "<<EOF>>               { yyterminate(); }",
    '<LONG_COMMENT><<EOF>> { AIDL_ERROR(AidlLocation(*yylloc->end.filename, {yylloc->end.line, yylloc->end.column, yylloc->end.offset}, {yylloc->end.line, yylloc->end.column, yylloc->end.offset}, AidlLocation::Source::EXTERNAL)) << "Unterminated comment"; yyterminate(); }\n<<EOF>> { yylloc->step(); yyterminate(); }',
  );
  sources.set("aidl_language_l.ll", lexer);
}
