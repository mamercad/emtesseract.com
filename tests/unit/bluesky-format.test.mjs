/**
 * Unit tests for workers/lib/bluesky-format.mjs.
 * Format functions match Bluesky API response shapes per docs:
 * - getAuthorFeed: { post: { record, author, uri, likeCount, replyCount, repostCount } }
 * - listNotifications: { author, reason, record }
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatFeedPost, formatNotification } from "../../workers/lib/bluesky-format.mjs";

describe("formatFeedPost", () => {
  it("formats feed item with full post data", () => {
    const item = {
      post: {
        record: { text: "Hello Bluesky!" },
        author: { displayName: "Alice", handle: "alice.bsky.social" },
        uri: "at://did:plc:abc/app.bsky.feed.post/xyz",
        likeCount: 5,
        replyCount: 2,
        repostCount: 1,
      },
    };
    const out = formatFeedPost(item);
    assert.ok(out.includes("## Alice (@alice.bsky.social)"));
    assert.ok(out.includes("Hello Bluesky!"));
    assert.ok(out.includes("👍 5"));
    assert.ok(out.includes("💬 2"));
    assert.ok(out.includes("🔁 1"));
  });

  it("handles missing optional fields", () => {
    const item = { post: { record: { text: "Minimal" } } };
    const out = formatFeedPost(item);
    assert.ok(out.includes("## ?"));
    assert.ok(out.includes("Minimal"));
    assert.ok(out.includes("👍 0"));
  });

  it("handles null/undefined post gracefully", () => {
    const out = formatFeedPost({});
    assert.ok(out.includes("## ?"));
    assert.strictEqual(out.includes("undefined"), false);
  });
});

describe("formatNotification", () => {
  it("formats notification with mention reason", () => {
    const n = {
      author: { displayName: "Bob", handle: "bob.bsky.social" },
      reason: "mention",
      record: { text: "Hey @you!" },
    };
    const out = formatNotification(n);
    assert.ok(out.includes("## Bob (@bob.bsky.social)"));
    assert.ok(out.includes("[mention]"));
    assert.ok(out.includes("Hey @you!"));
  });

  it("handles reply notification (handle used as author when no displayName)", () => {
    const n = {
      author: { handle: "charlie.bsky.social" },
      reason: "reply",
      record: { text: "Great point!" },
    };
    const out = formatNotification(n);
    assert.ok(out.includes("charlie.bsky.social"));
    assert.ok(out.includes("[reply]"));
    assert.ok(out.includes("Great point!"));
  });

  it("handles missing optional fields", () => {
    const out = formatNotification({});
    assert.ok(out.includes("## ?"));
    assert.strictEqual(out.includes("undefined"), false);
  });
});
