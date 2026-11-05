import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cpp, build } from "./paths.ts";

// Patch a build-local copy; the pinned upstream checkout stays pristine.
export async function prepare() {
  const out = resolve(build, "source");
  await mkdir(out, { recursive: true });
  const sources = new Map<string, string>();
  for (const file of await readdir(resolve(cpp, "upstream/aidl"))) {
    if (/\.(cpp|h|ll|yy)$/.test(file))
      sources.set(
        file,
        await readFile(resolve(cpp, "upstream/aidl", file), "utf8"),
      );
  }
  async function replace(file: string, from: string, to: string) {
    const text = sources.get(file)!;
    if (!text.includes(from))
      throw new Error(`Upstream patch no longer matches: ${file}`);
    sources.set(file, text.replace(from, to));
  }
  await replace(
    "parser.h",
    "  void AddError()",
    "  static std::unique_ptr<AidlDocument> ParseSource(const std::string& filename, std::string source);\n\n  void AddError()",
  );
  // Flex returns int. AOSP's void declarations disagree across translation units.
  await replace(
    "parser.cpp",
    "void yylex_init(void**);",
    "int yylex_init(void**);",
  );
  await replace(
    "parser.cpp",
    "void yylex_destroy(void*);",
    "int yylex_destroy(void*);",
  );
  await replace(
    "parser.cpp",
    "void Parser::SetTypeParameters",
    `std::unique_ptr<AidlDocument> Parser::ParseSource(const std::string& filename, std::string source) {
  source.append(2u, '\\0');
  Parser parser(filename, source, false);
  if (yy::parser(&parser).parse() != 0 || parser.HasError()) return nullptr;
  return std::move(parser.document_);
}

void Parser::SetTypeParameters`,
  );
  await replace(
    "location.h",
    "  bool IsInternal()",
    "  Point Begin() const { return begin_; }\n  Point End() const { return end_; }\n\n  bool IsInternal()",
  );
  await replace(
    "aidl_language.h",
    "  bool Repeatable()",
    "  const auto& Parameters() const { return parameters_; }\n  bool Repeatable()",
  );
  for (const [file, text] of sources) {
    const path = resolve(out, file);
    const old = await readFile(path, "utf8").catch(() => null);
    if (old !== text) await writeFile(path, text);
  }
}
