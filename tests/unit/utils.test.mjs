/**
 * Unit tests for workers/lib/utils.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { sanitize, hash } from "../../workers/lib/utils.mjs";

describe("sanitize", () => {
  it("returns empty string for null/undefined", () => {
    assert.strictEqual(sanitize(null), "");
    assert.strictEqual(sanitize(undefined), "");
  });

  it("trims whitespace", () => {
    assert.strictEqual(sanitize("  hello  "), "hello");
  });

  it("truncates to maxChars (default 120)", () => {
    const long = "a".repeat(200);
    assert.strictEqual(sanitize(long).length, 120);
  });

  it("replaces URLs with [link]", () => {
    assert.strictEqual(sanitize("check https://example.com/foo"), "check [link]");
    assert.strictEqual(sanitize("visit http://test.org"), "visit [link]");
  });

  it("returns ... for empty result after sanitization", () => {
    assert.strictEqual(sanitize("   "), "...");
  });

  it("respects custom maxChars", () => {
    assert.strictEqual(sanitize("hello world", 5), "hello");
  });
});

describe("hash", () => {
  it("returns deterministic alphanumeric string", () => {
    const a = hash("hello");
    const b = hash("hello");
    assert.strictEqual(a, b);
    assert.match(a, /^[a-z0-9]+$/);
  });

  it("returns different hashes for different inputs", () => {
    assert.notStrictEqual(hash("a"), hash("b"));
  });

  it("handles empty string", () => {
    assert.strictEqual(hash(""), "0");
  });
});
