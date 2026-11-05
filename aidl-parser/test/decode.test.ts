import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, positionDecoder } from "../src/decode.ts";
import { wire } from "../src/generated/wire.ts";

test("AST locations are required while diagnostics may have no location", () => {
  for (const p of [undefined, null]) {
    assert.throws(
      () =>
        decode(
          {
            version: wire.version,
            doc: { k: wire.kinds.document, ...(p === undefined ? {} : { p }) },
          },
          "",
        ),
      /Missing source location/,
    );
    assert.throws(
      () =>
        decode(
          {
            version: wire.version,
            doc: {
              k: wire.kinds.document,
              p: [1, 1, 1, 1],
              a: [{ n: "nullable", ps: {}, ...(p === undefined ? {} : { p }) }],
            },
          },
          "",
        ),
      /Missing source location.*annotation/,
    );
  }
  assert.deepEqual(
    decode(
      {
        version: wire.version,
        dg: [
          { s: wire.severities.error, msg: "File-level diagnostic", p: null },
        ],
      },
      "",
    ),
    {
      document: null,
      diagnostics: [
        { severity: "error", message: "File-level diagnostic", location: null },
      ],
    },
  );
});

test("position fast path and lazy Unicode maps match byte-based reference", () => {
  const lines = [
    "ASCII\ttext\r",
    "中文 😀 é € 𐐀",
    "a\ud800b\udc00c",
    "",
    "last",
  ];
  const convert = positionDecoder(lines.join("\n"));
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    const map = [0];
    let units = 0;
    for (const character of line) {
      const size = new TextEncoder().encode(character).length;
      for (let byte = 1; byte < size; byte++) map.push(units);
      units += character.length;
      map.push(units);
    }
    for (let byte = -1; byte <= map.length + 2; byte++) {
      const column = map[Math.max(0, Math.min(map.length - 1, byte - 1))]!;
      const point = {
        offset: offset + column,
        line: index + 1,
        column: column + 1,
      };
      assert.deepEqual(convert([index + 1, byte, index + 1, byte]), {
        start: point,
        end: point,
      });
    }
    offset += line.length + 1;
  }
});

test("mismatched private protocol reports an error", () => {
  assert.throws(
    () => decode({ version: 999 }, ""),
    /Unsupported AIDL wire version/,
  );
});
