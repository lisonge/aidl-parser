import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAidl } from "../dist/index.js";
import { compatibilityCases } from "../../scripts/compatibility-cases.ts";

test("all source AST nodes and annotations carry locations", async () => {
  let count = 0;
  function visit(
    value: unknown,
    source: string,
    parent?: { start: { offset: number }; end: { offset: number } },
  ): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, source, parent));
      return;
    }
    const record = value as Record<string, unknown>;
    const hasLocation =
      ("kind" in record &&
        !["dynamic", "fixed"].includes(String(record.kind))) ||
      ("name" in record && "parameters" in record);
    if (hasLocation) {
      const location = record.range as {
        start: { offset: number };
        end: { offset: number };
      };
      assert.ok(location, `Missing location for ${record.kind ?? record.name}`);
      assert.ok(
        location.start.offset >= 0 &&
          location.start.offset <= location.end.offset,
      );
      assert.ok(location.end.offset <= source.length);
      if (parent) {
        assert.ok(
          location.start.offset >= parent.start.offset,
          `Child starts before parent: ${record.kind ?? record.name}`,
        );
        assert.ok(
          location.end.offset <= parent.end.offset,
          `Child ends after parent: ${record.kind ?? record.name}`,
        );
      }
      parent = location;
      count++;
    }
    for (const [key, child] of Object.entries(record))
      if (key !== "range" && key !== "nameRange") visit(child, source, parent);
  }
  for (const { source } of await compatibilityCases())
    visit(parseAidl(source).document, source);
  assert.ok(count > 2600);
});
