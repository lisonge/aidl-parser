import { wire } from "./generated/wire.ts";
import type { AidlParseResult, Position, SourceLocation } from "./types.ts";

type Value =
  null | boolean | number | string | Value[] | { [key: string]: Value };
export interface WireResult {
  version: number;
  doc?: Value;
  dg?: Value[];
  err?: string;
}
const keys = Object.fromEntries(
  Object.entries(wire.keys).map(([name, key]) => [key, name]),
);
const kinds = Object.fromEntries(
  Object.entries(wire.kinds).map(([name, id]) => [id, name]),
);
const directions = {
  [wire.directions.unspecified]: null,
  [wire.directions.in]: "in",
  [wire.directions.out]: "out",
  [wire.directions.inout]: "inout",
};

// ASCII columns are already UTF-16. Non-ASCII lines get a map only if referenced.
export function positionDecoder(source: string) {
  const lines = source.split("\n");
  const starts: number[] = [];
  const maps = new Map<number, number[]>();
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const ascii = lines.map((line) => !/[^\x00-\x7f]/.test(line));
  function point(lineNumber: number, byteColumn: number): Position {
    const line = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
    const text = lines[line]!;
    let column: number;
    if (ascii[line])
      column = Math.max(0, Math.min(text.length, byteColumn - 1));
    else {
      let map = maps.get(line);
      if (!map) {
        map = [0];
        let units = 0;
        for (const character of text) {
          const code = character.codePointAt(0)!;
          const bytes =
            code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
          for (let i = 1; i < bytes; i++) map.push(units);
          units += character.length;
          map.push(units);
        }
        maps.set(line, map);
      }
      column = map[Math.max(0, Math.min(map.length - 1, byteColumn - 1))]!;
    }
    return {
      offset: starts[line]! + column,
      line: line + 1,
      column: column + 1,
    };
  }
  return (location: Value): SourceLocation | null => {
    if (!location) return null;
    const p = location as number[];
    return { start: point(p[0]!, p[1]!), end: point(p[2]!, p[3]!) };
  };
}

export function decode(result: WireResult, source: string): AidlParseResult {
  if (result.version !== wire.version)
    throw new Error(`Unsupported AIDL wire version: ${result.version}`);
  if (result.err) throw new Error(result.err);
  const location = positionDecoder(source);
  function node(value: Value, diagnostic = false): unknown {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => node(item));
    const kind = typeof value.k === "number" ? kinds[value.k] : undefined;
    const out: Record<string, unknown> = {};
    if (kind !== "dynamic" && kind !== "fixed") {
      const decodedLocation = location(value.p ?? null);
      if (!diagnostic && !decodedLocation)
        throw new Error(
          `Missing source location for AIDL ${kind ?? "annotation"}`,
        );
      out.location = decodedLocation;
      if (kind) Object.assign(out, { kind, comments: [] });
    }
    switch (kind) {
      case "document":
        Object.assign(out, { package: "", imports: [], declarations: [] });
        break;
      case "type":
        Object.assign(out, { annotations: [], arguments: [], array: null });
        break;
      case "method":
        Object.assign(out, {
          annotations: [],
          parameters: [],
          oneway: false,
          id: null,
        });
        break;
      case "parameter":
        Object.assign(out, { annotations: [], direction: null });
        break;
      case "field":
        Object.assign(out, { annotations: [], defaultValue: null });
        break;
      case "constant":
        out.annotations = [];
        break;
      case "enumerator":
        out.value = null;
        break;
      case "interface":
        Object.assign(out, { annotations: [], members: [], oneway: false });
        break;
      case "parcelable":
      case "union":
        Object.assign(out, {
          annotations: [],
          members: [],
          forward: false,
          typeParameters: [],
          cppHeader: "",
          ndkHeader: "",
          rustType: "",
        });
        break;
      case "enum":
        Object.assign(out, { annotations: [], members: [], enumerators: [] });
        break;
      case "array":
        out.elements = [];
        break;
    }
    if (
      ["literal", "reference", "unary", "binary", "array"].includes(kind ?? "")
    )
      out.literal = "";
    for (const key in value) {
      const child = value[key]!;
      const name = keys[key]!;
      if (key === "p") continue;
      else if (key === "k") out.kind = kind;
      else if (key === "d")
        out.direction = directions[child as keyof typeof directions];
      else if (key === "s")
        out.severity = child === wire.severities.warning ? "warning" : "error";
      else if (key === "ps" && !Array.isArray(child))
        out.parameters = Object.fromEntries(
          Object.entries(child as Record<string, Value>).map(
            ([name, expression]) => [name, node(expression)],
          ),
        );
      else out[name] = node(child);
    }
    return out;
  }
  return {
    document: result.doc ? node(result.doc) : null,
    diagnostics: (result.dg ?? []).map((item) => node(item, true)),
  } as AidlParseResult;
}
