export interface Position {
  offset: number;
  line: number;
  column: number;
}
/** Upstream diagnostic anchor (not a full node span). UTF-16 offsets; one-based line/column; exclusive end. */
export interface SourceLocation {
  start: Position;
  end: Position;
}
export interface NodeBase {
  location: SourceLocation;
  comments: string[];
}
export type Expression = NodeBase & { literal: string } & (
    | { kind: "literal" }
    | { kind: "reference"; name: string }
    | { kind: "unary"; operator: string; operand: Expression }
    | { kind: "binary"; operator: string; left: Expression; right: Expression }
    | { kind: "array"; elements: Expression[] }
  );
export interface Annotation {
  name: string;
  parameters: Record<string, Expression>;
  location: SourceLocation;
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
export interface Parameter extends Annotated {
  kind: "parameter";
  name: string;
  type: TypeReference;
  direction: null | "in" | "out" | "inout";
}
export interface Method extends Annotated {
  kind: "method";
  name: string;
  returnType: TypeReference;
  parameters: Parameter[];
  oneway: boolean;
  id: number | null;
}
export interface Field extends Annotated {
  kind: "field";
  name: string;
  type: TypeReference;
  defaultValue: Expression | null;
}
export interface Constant extends Annotated {
  kind: "constant";
  name: string;
  type: TypeReference;
  value: Expression;
}
export interface Enumerator extends NodeBase {
  kind: "enumerator";
  name: string;
  value: Expression | null;
}
interface DeclarationBase extends Annotated {
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
  package: string;
  imports: string[];
  declarations: Declaration[];
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  location: SourceLocation | null;
}
export interface AidlParseResult {
  document: AidlDocument | null;
  diagnostics: Diagnostic[];
}
