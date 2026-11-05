import { wire } from "./generated/wire.ts";
import type { AidlParseResult, Position, SourceRange } from "./types.ts";

type Value =
  null | boolean | number | string | Value[] | { [key: string]: Value };
export interface WireResult {
  version: number;
  doc?: Value;
  dg?: Value[];
  err?: string;
}
const kinds = Object.fromEntries(
  Object.entries(wire.kinds).map(([name, id]) => [id, name]),
);
const directions = {
  [wire.directions.unspecified]: null,
  [wire.directions.in]: "in",
  [wire.directions.out]: "out",
  [wire.directions.inout]: "inout",
};

// ASCII byte offsets already equal UTF-16 offsets. Store corrections only for
// multibyte characters, alongside line starts (CRLF occupies two code units).
export function positionDecoder(source: string) {
  const starts = [0];
  const byteEnds: number[] = [];
  const corrections: number[] = [];
  const characterStarts: number[] = [];
  let byteLength = 0;
  for (let i = 0; i < source.length;) {
    const code = source.charCodeAt(i);
    if (code < 0x80) {
      if (code === 13)
        starts.push(i + (source.charCodeAt(i + 1) === 10 ? 2 : 1));
      else if (code === 10 && source.charCodeAt(i - 1) !== 13)
        starts.push(i + 1);
      byteLength++;
      i++;
    } else {
      const point = source.codePointAt(i)!;
      const units = point > 0xffff ? 2 : 1;
      byteLength += point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
      byteEnds.push(byteLength);
      corrections.push(byteLength - i - units);
      characterStarts.push(i);
      i += units;
    }
  }
  const point = (byte: number): Position => {
    if (!Number.isInteger(byte) || byte < 0 || byte > byteLength)
      throw new Error(`Source offset outside input: ${byte}`);
    let offset = byte;
    if (byteEnds.length) {
      let low = 0,
        high = byteEnds.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (byteEnds[middle]! <= byte) low = middle + 1;
        else high = middle;
      }
      if (low) offset -= corrections[low - 1]!;
      // A diagnostic may point inside a UTF-8 sequence; use its character start.
      if (low < byteEnds.length && offset > characterStarts[low]!)
        offset = characterStarts[low]!;
    }
    let low = 0,
      high = starts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle]! <= offset) low = middle;
      else high = middle;
    }
    return { offset, line: low + 1, column: offset - starts[low]! + 1 };
  };
  return (range: Value): SourceRange | null => {
    if (!range) return null;
    const p = range as number[];
    return { start: point(p[0]!), end: point(p[1]!) };
  };
}

export function decode(result: WireResult, source: string): AidlParseResult {
  if (result.version !== wire.version)
    throw new Error(`Unsupported AIDL wire version: ${result.version}`);
  if (result.err) throw new Error(result.err);
  const location = positionDecoder(source);
  const list = (value: Value | undefined): unknown[] =>
    value ? (value as Value[]).map(node) : [];
  function node(input: Value): unknown {
    const value = input as Record<string, Value>;
    const kind = kinds[value.k as number];
    if (value.k === wire.kinds.dynamic) return { kind };
    if (value.k === wire.kinds.fixed)
      return { kind, dimensions: list(value.ds) };
    const range = location(value.p ?? null);
    if (!range)
      throw new Error(
        `Missing source location for AIDL ${kind ?? "annotation"}`,
      );
    const comments = value.c ?? [];
    // Construct each node once, with a stable field layout. The private wire
    // schema is emitted by the bundled WASM; strings need no recursive decode.
    switch (value.k) {
      case wire.kinds.document:
        return {
          range,
          comments,
          kind,
          packageDeclaration: value.pk ? node(value.pk) : null,
          imports: list(value.im),
          declarations: list(value.dc),
        };
      case wire.kinds.type:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          arguments: list(value.g),
          array: value.ar ? node(value.ar) : null,
          name: value.n,
        };
      case wire.kinds.method:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          parameters: list(value.ps),
          oneway: value.w ?? false,
          id: value.i ?? null,
          nameRange: location(value.np!),
          name: value.n,
          returnType: node(value.r!),
        };
      case wire.kinds.parameter:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          direction: directions[value.d as keyof typeof directions] ?? null,
          nameRange: location(value.np!),
          name: value.n,
          type: node(value.t!),
        };
      case wire.kinds.field:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          defaultValue: value.dv ? node(value.dv) : null,
          nameRange: location(value.np!),
          name: value.n,
          type: node(value.t!),
        };
      case wire.kinds.constant:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          nameRange: location(value.np!),
          name: value.n,
          type: node(value.t!),
          value: node(value.v!),
        };
      case wire.kinds.enumerator:
        return {
          range,
          comments,
          kind,
          value: value.v ? node(value.v) : null,
          nameRange: location(value.np!),
          name: value.n,
        };
      case wire.kinds.interface:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          members: list(value.m),
          oneway: value.w ?? false,
          nameRange: location(value.np!),
          name: value.n,
        };
      case wire.kinds.parcelable:
      case wire.kinds.union:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          members: list(value.m),
          forward: value.f ?? false,
          typeParameters: value.tp ?? [],
          cppHeader: value.ch ?? "",
          ndkHeader: value.nh ?? "",
          rustType: value.rt ?? "",
          nameRange: location(value.np!),
          name: value.n,
        };
      case wire.kinds.enum:
        return {
          range,
          comments,
          kind,
          annotations: list(value.a),
          members: list(value.m),
          enumerators: list(value.es),
          nameRange: location(value.np!),
          name: value.n,
        };
      case wire.kinds.literal:
        return { range, comments, kind, token: value.l };
      case wire.kinds.reference:
        return {
          range,
          comments,
          kind,
          nameRange: location(value.np!),
          name: value.n,
        };
      case wire.kinds.parenthesized:
        return { range, comments, kind, expression: node(value.ex!) };
      case wire.kinds.unary:
        return {
          range,
          comments,
          kind,
          operator: value.o,
          operand: node(value.u!),
        };
      case wire.kinds.binary:
        return {
          range,
          comments,
          kind,
          operator: value.o,
          left: node(value.x!),
          right: node(value.y!),
        };
      case wire.kinds.array:
        return { range, comments, kind, elements: list(value.e) };
      case wire.kinds.package:
      case wire.kinds.import:
        return {
          range,
          comments,
          kind,
          name: value.n,
          nameRange: location(value.np!),
        };
      default:
        return {
          range,
          comments,
          name: value.n,
          parameters: Object.fromEntries(
            Object.entries(value.ps as Record<string, Value>).map(
              ([name, expression]) => [name, node(expression)],
            ),
          ),
        };
    }
  }
  return {
    document: result.doc ? node(result.doc) : null,
    diagnostics: (result.dg ?? []).map((item) => {
      const value = item as Record<string, Value>;
      return {
        range: location(value.p ?? null),
        severity: value.s === wire.severities.warning ? "warning" : "error",
        message: value.msg,
      };
    }),
  } as AidlParseResult;
}
