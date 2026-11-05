export interface Position {
  /** Zero-based UTF-16 code-unit offset into the input. */
  offset: number;
  /** One-based; LF, CRLF and CR each count as one newline. */
  line: number;
  /** One-based UTF-16 column; a tab counts as one unit. */
  column: number;
}
/** Full source span. UTF-16 offsets; one-based line/column; exclusive end. */
export interface SourceRange {
  start: Position;
  end: Position;
}
export interface NodeBase {
  range: SourceRange;
  comments: string[];
}
export type Expression = NodeBase &
  (
    | { kind: "literal"; token: string }
    | { kind: "reference"; name: string; nameRange: SourceRange }
    | { kind: "parenthesized"; expression: Expression }
    | { kind: "unary"; operator: string; operand: Expression }
    | { kind: "binary"; operator: string; left: Expression; right: Expression }
    | { kind: "array"; elements: Expression[] }
  );
export interface Annotation extends NodeBase {
  name: string;
  parameters: Record<string, Expression>;
}
export interface NamedNode extends NodeBase {
  name: string;
  nameRange: SourceRange;
}
export interface Annotated extends NodeBase {
  annotations: Annotation[];
}
export interface TypeReference extends Annotated {
  kind: "type";
  name: string;
  arguments: TypeReference[];
  array:
    null | { kind: "dynamic" } | { kind: "fixed"; dimensions: Expression[] };
}
export interface Parameter extends Annotated, NamedNode {
  kind: "parameter";
  name: string;
  type: TypeReference;
  direction: null | "in" | "out" | "inout";
}
export interface Method extends Annotated, NamedNode {
  kind: "method";
  name: string;
  returnType: TypeReference;
  parameters: Parameter[];
  oneway: boolean;
  id: number | null;
}
export interface Field extends Annotated, NamedNode {
  kind: "field";
  name: string;
  type: TypeReference;
  defaultValue: Expression | null;
}
export interface Constant extends Annotated, NamedNode {
  kind: "constant";
  name: string;
  type: TypeReference;
  value: Expression;
}
export interface Enumerator extends NamedNode {
  kind: "enumerator";
  name: string;
  value: Expression | null;
}
interface DeclarationBase extends Annotated, NamedNode {
  name: string;
  members: Member[];
}
export interface InterfaceDeclaration extends DeclarationBase {
  kind: "interface";
  oneway: boolean;
}
export interface ParcelableDeclaration extends DeclarationBase {
  kind: "parcelable";
  forward: boolean;
  typeParameters: string[];
  cppHeader: string;
  ndkHeader: string;
  rustType: string;
}
export interface UnionDeclaration extends DeclarationBase {
  kind: "union";
  forward: false;
  typeParameters: string[];
  cppHeader: string;
  ndkHeader: string;
  rustType: string;
}
export interface EnumDeclaration extends DeclarationBase {
  kind: "enum";
  enumerators: Enumerator[];
}
export type Declaration =
  | InterfaceDeclaration
  | ParcelableDeclaration
  | UnionDeclaration
  | EnumDeclaration;
export type Member = Method | Field | Constant | Declaration;
export interface AidlDocument extends NodeBase {
  kind: "document";
  packageDeclaration: PackageDeclaration | null;
  imports: ImportDeclaration[];
  declarations: Declaration[];
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  range: SourceRange | null;
}
export interface AidlParseResult {
  document: AidlDocument | null;
  diagnostics: Diagnostic[];
}

export interface PackageDeclaration extends NamedNode {
  kind: "package";
}
export interface ImportDeclaration extends NamedNode {
  kind: "import";
}
