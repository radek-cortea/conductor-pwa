# Security review — 2026-10-01

## Scope and findings

Reviewed Git history, tracked files (including historical test screenshots), the production Pages bundle, credential/request handling, transcript rendering, local persistence, outbound links, and deployment permissions.

- Gitleaks 8.30.1 (release SHA-256 verified) found no credentials in Git history or the production bundle. Manual inspection found synthetic test data, not real message transcripts or keys. Generated failure screenshots are excluded from new commits. Public history retains ordinary commit author identity and synthetic test fixtures.
- `pnpm audit` and production-only dependency audits reported no known vulnerabilities at review time. This is not a guarantee against undisclosed vulnerabilities.
- Credentials go only in the Authorization header to `https://api.conductor.build`. The Conductor transport rejects redirects and other origins, omits cookies/referrers, and disables HTTP caching. Known credential echoes are redacted from API errors. A stale 401 cannot invalidate a replacement credential.
- Production HTML has a restrictive meta CSP (self-hosted scripts, no inline scripts/eval, restricted connections, no objects/base tags/native form submissions) and a no-referrer policy. Inline styles remain allowed because UI positioning depends on them. Production startup refuses framing before reading credentials or fetching private data; meta CSP cannot supply `frame-ancestors` on GitHub Pages.
- Markdown is sanitized and element/URL constrained. Script/frame/form content cannot execute, and remote images are replaced with inert placeholders rather than loaded. Web and Mac action URLs are validated. Diagnostics redact unknown object keys as well as private scalar values.
- Only successful transcript/read-position queries are persisted in IndexedDB, in credential-hashed namespaces. Identity, auth headers and mutations are excluded. Logout removes the active transcript cache and cancels pending writes; staged hydration prevents stale restoration after logout/account changes.
- Deployment actions are pinned to commit hashes. The dependency/build job has read-only permissions; only the separate deployment job can write Pages and request an OIDC token. No Conductor key is required by CI.

## Verification

- Unit and phone/desktop browser regressions cover hostile Markdown, URL validation, request transport settings, error redaction, stale/current 401 behavior, diagnostics, account isolation and logout races.
- `scripts/security-smoke.mjs` exercises the production Pages build: login/navigation/refresh with mocked API responses, active service-worker scope, blocked inline-script injection and off-origin fetch, and blocked framed startup before API access.
- Authenticated real-Conductor behavior is not certified by mocked responses; backend authorization remains authoritative. The frontend is a public static client, not an access-control boundary.

## GitHub PR status checks

- While a project is open, a repository-matching PR link discovered in fetched chat/tool data is checked on open, every minute while visible, and on returning to the app. The merged banner archives only when the user presses **Archive**.
- Requests use a separate anonymous transport to fixed `https://api.github.com/repos/{owner}/{repo}/pulls/{number}` URLs: no Conductor key, cookies or referrer, no HTTP caching, no redirects, and a ten-second timeout. CSP permits this API origin; the service worker uses NetworkOnly. Status queries are not persisted.
- GitHub sees the repository/PR identifiers and the device's IP. Private repositories and anonymous rate limits can make status unavailable; these errors never imply a PR is merged. Authenticated private-repository support requires a backend integration, not forwarding a Conductor credential.
- Synthetic unit/browser regressions cover transport isolation, unavailable/malformed responses, minute polling, unmount/reopen, project isolation, banner placement and archiving. Production smoke verifies the banner and archive path with mocked APIs and an active service worker; it is not authenticated live GitHub/Conductor verification.

## Unread project indicators

- Home shows a dot when any non-archived chat has conversation content newer than this PWA's locally saved read cursor. Never-opened chats count as unread if they contain conversation content; empty chats and protocol-only activity do not. Opening a project does not mark it read: existing viewport-based, monotonic cursors remain authoritative.
- Checks start only for visible/near-visible rows while the document is visible. A shared three-request limiter bounds background API traffic. Checks start with `after=<read message id>&limit=1` (or offset zero for new chats), skip protocol noise in small pages, and stop at 64 events rather than downloading whole histories. Incomplete scans and unavailable chats are unknown, not read. The main list never waits for these checks.
- Checks refresh on activity changes, every minute while mounted, and on resume/focus. They use the existing fixed-origin Conductor transport and abort on unmount/logout. Discovery/results are short-lived memory-only queries; only existing transcript/read-position queries are persisted in credential-isolated IndexedDB. No new identity or credential persistence is introduced.
- Synthetic phone/desktop regressions cover local read cursors, multiple chats, archived chats, slow/unavailable checks, visibility/resume, bounded/lazy traffic, minute polling, actual viewing and logout/late-response isolation. Packaged production smoke covers unread dots and read-cursor checks with mocked APIs and an active service worker, not authenticated live API behavior.

## Residual risks and operational requirements

- Remembered API keys in localStorage and transcripts in IndexedDB are **not encrypted at rest**. Users requested this persistence. Only use a trusted device/browser; **Forget saved key** removes the saved credential, and sign-out removes the active chat cache. Browser extensions, local device access or compromised same-origin scripts can read browser storage.
- Repositories on the same `<owner>.github.io` hostname share an origin. At review time no other active Pages sites were reported for this owner. A dedicated custom domain is recommended if any other site on that hostname becomes untrusted. Path names or hashed cache keys do not create an origin security boundary.
- Credential hashing provides cache namespacing, not encryption. Clearing inaccessible browser storage can fail; the application falls back to memory and warns without printing private values.
- Meta CSP is less flexible than server response headers. A dedicated host/custom domain with server-managed CSP and `frame-ancestors 'none'` is preferable for stricter deployment policies.
- No absolute claim that “nothing can ever leak” is possible. Re-run scans, audits and production smoke checks after dependency, rendering, persistence or hosting changes. Use scoped/revocable Conductor API keys and revoke a key if compromise is suspected.

## Re-running checks

```bash
pnpm check
pnpm exec oxlint src scripts/*.mjs
pnpm test
pnpm audit --prod --audit-level moderate
PAGES_BASE_PATH=/conductor-pwa/ VITE_PAGES_HASH_ROUTING=true pnpm build
PAGES_BASE_PATH=/conductor-pwa/ node scripts/security-smoke.mjs
# With a trusted Gitleaks installation:
gitleaks git . --redact
gitleaks dir dist --redact
```
