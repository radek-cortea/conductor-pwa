# Security review — 2026-10-01

## Scope and findings

Reviewed Git history, tracked files (including historical test screenshots), the production Pages bundle, credential/request handling, transcript rendering, local persistence, outbound links, and deployment permissions.

- Gitleaks 8.30.1 (release SHA-256 verified) found no credentials in Git history or the production bundle. Manual inspection found synthetic test data, not real message transcripts or keys. Generated failure screenshots are excluded from new commits. Public history retains ordinary commit author identity and synthetic test fixtures.
- `pnpm audit` and production-only dependency audits reported no known vulnerabilities at review time. This is not a guarantee against undisclosed vulnerabilities.
- Credentials go only in the Authorization header to `https://api.conductor.build`. The transport rejects redirects and other origins, omits cookies/referrers, and disables HTTP caching. Known credential echoes are redacted from API errors. A stale 401 cannot invalidate a replacement credential.
- Production HTML has a restrictive meta CSP (self-hosted scripts, no inline scripts/eval, restricted connections, no objects/base tags/native form submissions) and a no-referrer policy. Inline styles remain allowed because UI positioning depends on them. Production startup refuses framing before reading credentials or fetching private data; meta CSP cannot supply `frame-ancestors` on GitHub Pages.
- Markdown is sanitized and element/URL constrained. Script/frame/form content cannot execute, and remote images are replaced with inert placeholders rather than loaded. Web and Mac action URLs are validated. Diagnostics redact unknown object keys as well as private scalar values.
- Only successful transcript/read-position queries are persisted in IndexedDB, in credential-hashed namespaces. Identity, auth headers and mutations are excluded. Logout removes the active transcript cache and cancels pending writes; staged hydration prevents stale restoration after logout/account changes.
- Deployment actions are pinned to commit hashes. The dependency/build job has read-only permissions; only the separate deployment job can write Pages and request an OIDC token. No Conductor key is required by CI.

## Verification

- Unit and phone/desktop browser regressions cover hostile Markdown, URL validation, request transport settings, error redaction, stale/current 401 behavior, diagnostics, account isolation and logout races.
- `scripts/security-smoke.mjs` exercises the production Pages build: login/navigation/refresh with mocked API responses, active service-worker scope, blocked inline-script injection and off-origin fetch, and blocked framed startup before API access.
- Authenticated real-Conductor behavior is not certified by mocked responses; backend authorization remains authoritative. The frontend is a public static client, not an access-control boundary.

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
