/**
 * Unit tests for workers/lib/llm.mjs (normalizeMessages, toContentString)
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { normalizeMessages, toContentString } from "../../workers/lib/llm.mjs";

describe("toContentString", () => {
  it("returns string as-is", () => {
    assert.strictEqual(toContentString("hello"), "hello");
  });

  it("handles array of text parts", () => {
    assert.strictEqual(
      toContentString([{ text: "foo" }, { text: "bar" }]),
      "foo\nbar"
    );
  });

  it("filters empty parts", () => {
    assert.strictEqual(
      toContentString([{ text: "a" }, {}, { text: "b" }]),
      "a\nb"
    );
  });

  it("handles null/undefined", () => {
    assert.strictEqual(toContentString(null), "");
    assert.strictEqual(toContentString(undefined), "");
  });

  it("coerces non-string to string", () => {
    assert.strictEqual(toContentString(42), "42");
  });
});

describe("normalizeMessages", () => {
  it("returns default user message for empty array", () => {
    const out = normalizeMessages([]);
    assert.deepStrictEqual(out, [{ role: "user", content: "(no messages)" }]);
  });

  it("returns default for null/non-array", () => {
    assert.deepStrictEqual(normalizeMessages(null), [{ role: "user", content: "(no messages)" }]);
    assert.deepStrictEqual(normalizeMessages(undefined), [{ role: "user", content: "(no messages)" }]);
  });

  it("defaults role to user", () => {
    const out = normalizeMessages([{ content: "hi" }]);
    assert.strictEqual(out[0].role, "user");
    assert.strictEqual(out[0].content, "hi");
  });

  it("preserves role when provided", () => {
    const out = normalizeMessages([{ role: "assistant", content: "hello" }]);
    assert.strictEqual(out[0].role, "assistant");
  });

  it("normalizes content via toContentString", () => {
    const out = normalizeMessages([{ content: [{ text: "a" }, { text: "b" }] }]);
    assert.strictEqual(out[0].content, "a\nb");
  });
});
