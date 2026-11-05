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
              p: [0, 0],
              dc: [
                {
                  k: wire.kinds.interface,
                  p: [0, 0],
                  np: [0, 0],
                  n: "I",
                  a: [
                    {
                      n: "nullable",
                      ps: {},
                      ...(p === undefined ? {} : { p }),
                    },
                  ],
                },
              ],
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
        { severity: "error", message: "File-level diagnostic", range: null },
      ],
    },
  );
});

test("byte offsets convert to UTF-16 positions with all newline forms", () => {
  const source = "中😀\r\n\tA\rB\n";
  const convert = positionDecoder(source);
  assert.deepEqual(convert([7, 7]), {
    start: { offset: 3, line: 1, column: 4 },
    end: { offset: 3, line: 1, column: 4 },
  });
  assert.deepEqual(convert([10, 11]), {
    start: { offset: 6, line: 2, column: 2 },
    end: { offset: 7, line: 2, column: 3 },
  });
  assert.deepEqual(convert([12, 13]), {
    start: { offset: 8, line: 3, column: 1 },
    end: { offset: 9, line: 3, column: 2 },
  });
  assert.throws(() => convert([-1, 0]), /outside input/);
});

test("mismatched private protocol reports an error", () => {
  assert.throws(
    () => decode({ version: 999 }, ""),
    /Unsupported AIDL wire version/,
  );
});

test("sparse positions match a byte-by-byte oracle, including interior bytes", () => {
  for (const source of [
    "",
    "ASCII\ttext\r\nlast\r",
    "aé中😀z\r\n\t€𐐀\rb\n",
    "\u0080\u07ff\u0800\uffff\ud800x\udc00",
    "// 中文 😀\r\n".repeat(100),
  ]) {
    const expected = [0];
    let units = 0;
    for (const character of source) {
      const bytes = new TextEncoder().encode(character).length;
      for (let i = 1; i < bytes; i++) expected.push(units);
      units += character.length;
      expected.push(units);
    }
    const starts = [
      0,
      ...Array.from(
        source.matchAll(/\r\n|\r|\n/g),
        (match) => match.index + match[0].length,
      ),
    ];
    const convert = positionDecoder(source);
    for (let byte = 0; byte < expected.length; byte++) {
      const offset = expected[byte]!;
      const line = starts.findLastIndex((start) => start <= offset);
      const point = {
        offset,
        line: line + 1,
        column: offset - starts[line]! + 1,
      };
      assert.deepEqual(convert([byte, byte]), { start: point, end: point });
    }
    assert.throws(() => convert([0, expected.length]), /outside input/);
  }
});
