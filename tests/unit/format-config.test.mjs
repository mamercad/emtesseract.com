/**
 * Unit tests for workers/lib/format-config.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getFormatConfig } from "../../workers/lib/format-config.mjs";

describe("getFormatConfig", () => {
  it("returns watercooler config", () => {
    const cfg = getFormatConfig("watercooler");
    assert.strictEqual(cfg.minTurns, 2);
    assert.strictEqual(cfg.maxTurns, 5);
    assert.strictEqual(cfg.temperature, 0.9);
  });

  it("returns standup config", () => {
    const cfg = getFormatConfig("standup");
    assert.strictEqual(cfg.minTurns, 4);
    assert.strictEqual(cfg.maxTurns, 8);
    assert.strictEqual(cfg.temperature, 0.6);
  });

  it("returns debate config", () => {
    const cfg = getFormatConfig("debate");
    assert.strictEqual(cfg.minTurns, 4);
    assert.strictEqual(cfg.maxTurns, 8);
    assert.strictEqual(cfg.temperature, 0.8);
  });

  it("returns default for unknown format", () => {
    const cfg = getFormatConfig("unknown");
    assert.strictEqual(cfg.minTurns, 2);
    assert.strictEqual(cfg.maxTurns, 5);
    assert.strictEqual(cfg.temperature, 0.9);
  });

  it("returns default for undefined", () => {
    const cfg = getFormatConfig(undefined);
    assert.strictEqual(cfg.minTurns, 2);
  });
});
