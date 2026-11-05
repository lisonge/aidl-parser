// Adapt only the build-local sources used by the syntax-only entry point.
export function syntaxPerformance(sources: Map<string, string>) {
  const edit = (file: string, from: string, to: string) => {
    const text = sources.get(file)!;
    if (!text.includes(from))
      throw new Error(`Syntax performance patch mismatch: ${file}: ${from}`);
    sources.set(file, text.replace(from, to));
  };
  // ParseSource never runs the semantic visitor-completeness check. Recording
  // every unvisited node on destruction only to clear the list is wasted work.
  edit(
    "aidl_language.cpp",
    `AidlNode::~AidlNode() {
  if (!visited_) {
    unvisited_locations_.push_back(location_);
  }
}`,
    "AidlNode::~AidlNode() = default;",
  );
  edit(
    "aidl_language.cpp",
    `void AidlNode::MarkVisited() const {
  visited_ = true;
}`,
    "void AidlNode::MarkVisited() const {}",
  );
  edit("aidl_language.h", "  mutable bool visited_ = false;\n", "");
  // Parameter/field constructors synthesize primitive defaults for codegen.
  // Syntax output excludes those defaults and only keeps explicit initializers.
  edit(
    "aidl_language.cpp",
    "AidlVariableDeclaration(location, type, name, AidlConstantValue::Default(*type))",
    "AidlVariableDeclaration(location, type, name, nullptr)",
  );
}
