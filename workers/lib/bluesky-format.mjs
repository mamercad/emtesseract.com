/**
 * Bluesky feed/notification formatting for scan_bluesky artifacts.
 * Per Bluesky docs: getAuthorFeed returns feed items with post.record, post.author;
 * listNotifications returns notifications with author, reason, record.
 * @see https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed
 * @see https://docs.bsky.app/docs/api/app-bsky-notification-list-notifications
 */

/**
 * Format a feed item from getAuthorFeed.
 * Response shape: { post: { record, author, uri, likeCount, replyCount, repostCount } }
 */
export function formatFeedPost(p) {
  const rec = p.post?.record;
  const text = rec?.text || "";
  const author = p.post?.author?.displayName || p.post?.author?.handle || "?";
  const handleStr = p.post?.author?.handle ? ` (@${p.post.author.handle})` : "";
  const uri = p.post?.uri || "";
  const likeCount = p.post?.likeCount ?? 0;
  const replyCount = p.post?.replyCount ?? 0;
  const repostCount = p.post?.repostCount ?? 0;
  return `## ${author}${handleStr}\n${text}\n\n` + `[${uri}] · 👍 ${likeCount}  💬 ${replyCount}  🔁 ${repostCount}\n`;
}

/**
 * Format a notification from listNotifications.
 * Response shape: { author, reason, record }
 */
export function formatNotification(n) {
  const text = n.record?.text || "";
  const author = n.author?.displayName || n.author?.handle || "?";
  const handleStr = n.author?.handle ? ` (@${n.author.handle})` : "";
  const reason = n.reason ? ` [${n.reason}]` : "";
  return `## ${author}${handleStr}${reason}\n${text}\n\n`;
}
