export const problems = [
  {
    slug: 'url-shortener',
    title: 'URL Shortener',
    difficulty: 'easy',
    prompt:
      'Design a URL shortener like bit.ly. Users submit a long URL and get back a short link. When someone visits the short link, they are redirected to the original URL. Walk me through how you would design this system.',
    hiddenRequirements: [
      'Target 100 million new URLs created per month and 10 billion redirects per month (read-heavy, ~100:1).',
      'Short links should support an optional custom alias and an optional expiry (default 5 years).',
      'Analytics: count of clicks per short link, broken down by day, with at most a few minutes of lag.',
      '99.9% availability for redirects; create can be slightly weaker (99.5%).',
      'Redirect p99 latency under 100ms within a region.',
    ],
    keyTopics: [
      'ID generation / encoding (base62, hash collision handling, vs sequential IDs)',
      'Read path caching (CDN / Redis) for hot short links',
      'Data model for mappings and analytics',
      'Horizontal scaling of redirect servers',
      'Consistency vs availability for create vs redirect',
      'Abuse prevention (spam, malware URLs)',
    ],
    commonPitfalls: [
      'Using a cryptographic hash of the URL as the only ID without a collision or overwrite strategy.',
      'Putting every redirect through a single relational DB with no cache, then claiming it handles billions of redirects.',
      'Ignoring custom aliases and treating them like random IDs (uniqueness + user ownership).',
      'Designing analytics as synchronous writes on the redirect hot path.',
    ],
    curveballs: [
      'A celebrity posts a short link and traffic spikes 100x for 30 minutes. What breaks first, and how do you survive it?',
      'Product wants QR codes that still work if the short domain changes in 2 years.',
      'Legal asks for takedown of malicious URLs within 5 minutes globally.',
    ],
  },
  {
    slug: 'rate-limiter',
    title: 'Rate Limiter',
    difficulty: 'medium',
    prompt:
      'Design a rate limiting service that other internal APIs can call (or that sits as a gateway middleware) to decide whether a request should be allowed. Cover how you would enforce limits fairly and at scale.',
    hiddenRequirements: [
      'Support at least three rule shapes: N requests per second, N per minute, and N per day per key (API key, user id, or IP).',
      'Decision latency p99 under 5ms for in-region callers; the limiter must not become the bottleneck.',
      'Target 500k decide() calls per second cluster-wide.',
      'Limits must be approximately correct across multiple limiter nodes (eventual consistency of counters is OK if overshoot stays under ~5%).',
      'Support a dry-run / shadow mode that records would-deny without blocking traffic.',
    ],
    keyTopics: [
      'Token bucket vs sliding window vs fixed window tradeoffs',
      'Redis (or similar) as a shared counter store',
      'Key design and rule configuration storage',
      'Distributed accuracy and clock skew',
      'Fail-open vs fail-closed behavior when the store is down',
      'Observability: allow/deny metrics and hot keys',
    ],
    commonPitfalls: [
      'Fixed windows that allow 2x burst at window boundaries without calling it out.',
      'Per-node in-memory counters with no shared state, then claiming global limits.',
      'Synchronous remote calls that add tens of ms to every API request.',
      'No plan for store outages (silently failing closed and taking down the product).',
    ],
    curveballs: [
      'A partner needs a temporary 10x limit increase for a 2-hour launch window, applied within 1 minute without redeploying gateways.',
      'You discover one tenant is fan-outs 50 sub-keys to bypass a per-user limit. How do you detect and stop it?',
      'Product wants different limits for authenticated vs anonymous traffic on the same endpoint, evaluated in one decide() call.',
    ],
  },
  {
    slug: 'chat-app',
    title: 'Chat Application',
    difficulty: 'medium',
    prompt:
      'Design a 1:1 and group chat application (think WhatsApp-lite). Users send text messages in conversations, see online/offline presence, and get near-real-time delivery. Focus on the backend architecture.',
    hiddenRequirements: [
      '100 million monthly active users; average 50 messages sent per MAU per day (~50M messages/day, with evening peaks of ~5x).',
      'Group chats up to 256 members; message fan-out must stay efficient.',
      'Delivery: show sent / delivered / read receipts for 1:1; delivered is enough for groups in v1.',
      'Unread counts and last-message previews on the conversation list must update within a couple of seconds when online.',
      'Messages are durable; once acknowledged by the server they must not be lost. Soft-delete and edit within 15 minutes are required.',
    ],
    keyTopics: [
      'WebSocket / long-lived connection tier and sticky routing',
      'Message fan-out (write-at-send vs read-time fan-out) for groups',
      'Storage model for conversations, messages, and receipts',
      'Presence and last-seen (TTL, ephemeral store)',
      'Push notifications for offline devices',
      'Ordering, idempotency, and client retries',
    ],
    commonPitfalls: [
      'Broadcasting every group message to all members via individual synchronous writes with no batching or inbox model.',
      'Storing presence only in the app server process memory with no shared store.',
      'No message id / idempotency key, so retries create duplicates.',
      'Using a single global ordered queue for all chats, creating a throughput ceiling.',
    ],
    curveballs: [
      'A 256-person group becomes suddenly viral and receives 200 messages/minute for an hour. How do online members and storage cope?',
      'Users in weak networks send the same message 3 times; the other side must see it once, in order.',
      'Product wants disappearing messages (24h TTL) without breaking read receipts or search in other chats.',
    ],
  },
];
