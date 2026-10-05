# Conductor PWA — agent handoff

## Project and deployment

- React 19, TypeScript, Vite, TanStack Router/Query, pnpm. Use Node **24+** and the pnpm version in `package.json`.
- Repository: `https://github.com/radek-cortea/conductor-pwa` (`origin`, default branch `main`). It is now **public**.
- Live PWA: `https://radek-cortea.github.io/conductor-pwa/`.
- `.github/workflows/pages.yml` deploys pushes to `main`. Actions are commit-pinned; build permissions are read-only, deployment has Pages/OIDC permissions.
- Local dev uses port **43123**, normal browser paths. Pages builds use `PAGES_BASE_PATH=/conductor-pwa/` and `VITE_PAGES_HASH_ROUTING=true`; URLs use `#/workspaces/...` to avoid static-host deep-link 404s.
- Obtain the deployment base from `actions/configure-pages`, not a hardcoded repository name in the workflow. Custom domains can change the base.
- `src/routeTree.gen.ts` is generated. **Do not commit it.** Do not commit test failure screenshots, `.vitest-attachments`, build output, credentials or real conversation replays.

## Checks

```bash
pnpm check
pnpm exec oxlint src scripts/*.mjs
pnpm test
pnpm audit --prod --audit-level moderate
pnpm openapi:check
PAGES_BASE_PATH=/conductor-pwa/ VITE_PAGES_HASH_ROUTING=true pnpm build
rm -f dist/mockServiceWorker.js dist/example.svg
PAGES_BASE_PATH=/conductor-pwa/ node scripts/security-smoke.mjs
```

- Production smoke needs Playwright Chromium (`pnpm exec playwright install chromium`; CI installs browser dependencies too).
- Last complete suite: **213 passing tests**, including phone/desktop browser variants. Keep the StrictMode wrapper in `src/test/render-app.tsx`.
- Intentional malformed-message-page tests emit React route errors; these are expected negative cases, not happy-path success evidence.
- Existing non-blocking build warnings: router `replaceRouteChunk` circular dependency and large JS chunks.
- For publishing, inspect Git history and the final packaged bundle with a trusted secret scanner (e.g. `gitleaks git . --redact`, `gitleaks dir dist --redact`). Never print detected secret values.

## User-facing requirements to preserve

- List **only the current user's workspaces** using the API `creator` filter from `/me.userId`, including archived pagination.
- Home: compact borderless workspace rows, no repository/org labels or redundant headings. Full viewport flex column; **only the list scrolls**. Search, **Create** (no plus icon), and archive toggle stay at the bottom.
- Home header: small organization label and email-triggered account menu with Sign out. No app logo/name in the authenticated header.
- Home unread dots use this PWA's read cursors across all non-archived chats. `src/transcript/unread.ts` runs short-lived, non-persisted background checks for visible/near-visible rows, with a shared three-request limiter and 64-event scan budget. Check after the read message ID; never tail-seek or block the list. Refresh on activity change, every minute, and on resume/focus. Unknown/failed checks are not read; opening a project alone must not clear unread.
- Inside a workspace (the user also calls this a project): **one** top header with back icon, workspace name and three-dot actions. No account bar or duplicate name/actions row. Preview is in the actions menu.
- Chats are tabs with colored status dots; no duplicate chat heading. Remember last-selected chat. New-chat plus beside tabs; archived-chat control in tab menu.
- Chat composer is fixed-height, one row (40px at default root size), with 28px send/cancel buttons **inside** it. Enter sends; Shift+Enter remains supported within the fixed-height textarea. Composer must stay visible.
- System instructions, thinking and tools collapse by default; expanded bodies render lazily. Tool names/inputs/outputs/exit codes are inspectable when provided by the API.
- Tool summaries: 12px light gray, 16px line height, no border/padding; consecutive tool rows have an **8px gap** (half line height). Preserve normal spacing between other message types.
- Distinguish final replies, including an SDK result duplicating prior assistant text. Do not mutate input entries during deduplication.
- Sending/Queued/Processing/Sent must reflect progress, not remain stuck at the initial POST response. Reconcile API/SDK IDs and system-instruction-prefixed user echoes; don't match an old identical prompt.
- Create form has no “Pick a repository…” explanatory paragraph. Remember project, branch, agent, model and effort by user/organization; **not** workspace name or prompt. Validate restored choices against current projects/models. Reset branch when changing project.
- Use Lucide. App name remains **Conductor PWA** for sign-in, document title and install manifest. `public/favicon.svg` is editable artwork, not necessarily an exact copy of `public/example.svg`; keep square padding and regenerate icons with `pnpm icons:generate` after edits.

## History and persistence architecture

- `src/transcript/load.ts` uses sparse offset windows, **16-event pages**, and exponential/binary one-event probes to find the tail. The public API has ascending offset/after pagination but no tail/count/unread endpoint.
- Open at first locally unread message, otherwise latest. Automatically fill empty viewport space and fetch at scroll boundaries; **no Load more button** and no old 200-entry truncation cap.
- Read positions belong to this PWA, not the Mac app. Preserve monotonic cursors, prepend scroll anchoring, touch/wheel/keyboard boundaries, and concurrent polling/history changes.
- `src/storage/query-persistence.ts` uses official TanStack persistence APIs and IndexedDB (`idb-keyval`), seven-day expiry/GC, credential-hashed namespaces, ordered/coalesced writes, and staged hydration.
- Persist only successful transcript/read-position queries. **Never persist identity, auth headers or mutations.** Logout removes the active account's chat cache and cancels writes. Late restoration must not undo logout or hydrate another account.
- This is transcript persistence, **not full offline navigation**.

## Critical regression: real lifecycle, not just payloads

A previously reported happy-path crash was `CancelledError` from `Query.removeObserver` → `QueryObserver.destroy` → React passive unmount/disconnect effects. The app used StrictMode, but the original test harness did not; fast mocks missed router-pending transitions.

- `src/pages/loaders.ts` wraps loader query work in `whileRouteActive()`: retry/rejoin observer-cancelled queries while the route remains active; stop on route abort and propagate genuine API/programming failures.
- Do not broadly swallow errors or change router pending thresholds to hide this race.
- Keep **1,500ms slow-message and slow-status** regressions with StrictMode and console-error assertions. Test a cold cache and actual app entrypoint when changing loaders/observers/layout.
- Rendering a desktop cache replay or fast mocked response does **not** certify authenticated live API behavior. No authenticated real-Conductor happy path was verified in this handoff. Be explicit about what was tested.
- Real desktop-cache inspection was temporary; no actual cached conversations or credentials belong in Git. Existing fixtures and failure screenshots reviewed for publication were synthetic.

## Security boundaries

Read `SECURITY.md` before changing requests, rendering, storage or hosting.

- Credentials only travel in Authorization headers to the fixed HTTPS API origin. Reject redirects/other origins, omit cookies/referrers, disable HTTP caching. Redact known key echoes from errors/stacks.
- A **stale 401** for an old/candidate credential must not sign out a replacement account. Request-bound credential matching is intentional.
- Active vs remembered credentials are separate: sign-out marks the saved key inactive, sign-in offers it masked, Forget deletes it. Inactive keys cannot authorize requests/automatic sign-in.
- Remembered keys and IndexedDB transcripts are **unencrypted** on the device. Hashed namespaces are not encryption. Same-origin scripts/extensions/device access remain risks.
- Sites under the same `<owner>.github.io` hostname share storage. A dedicated custom domain is recommended if other sites on that hostname aren't fully trusted. No other active owner Pages sites were reported at review time; recheck if relevant.
- Markdown must not execute script/frame/form content or automatically load remote images. Preserve sanitization, allowed elements, URL checks, inert image placeholders and link safety.
- Validate API-supplied preview/Mac links. Diagnostics must not copy private values **or arbitrary object-key names**; unknown keys can themselves contain secrets.
- Production CSP is injected by Vite only for builds, to avoid breaking dev HMR. No inline scripts/eval; inline styles are intentionally allowed for UI positioning. Meta CSP cannot set `frame-ancestors`; production startup refuses framing before reading credentials or calling the API.
- Backend authorization is authoritative. Frontend routing and `creator` filtering are not server security boundaries. Public UI/source never imply public user data.

## API limitations and data handling

- Pinned OpenAPI: `openapi/conductor.json`, generated types in `src/api/generated/schema.ts`. Builds don't fetch the live spec. Use the pull/gen/check scripts deliberately when updating it.
- `/me` documents an organization ID but no organization display name. Header prefers an extra display name if supplied, otherwise the projects' common GitHub owner, otherwise `Organization`. **Never substitute the user's personal name for organization name.**
- Workspace API has no dedicated PR field. Offer a matching-repository GitHub PR URL found in fetched conversation/tool data, not an invented link.
- Message normalization supports wrapped JSON, arrays, NDJSON, Claude/Codex/Cursor events, successful results, thinking and tools. Suppress protocol/tool-result noise but associate tool outputs with calls.
- Malformed message pages raise a controlled 502; malformed Markdown falls back to plain text. Don't render arbitrary log strings as assistant text to hide unsupported payloads.
- Radix variable classes require Tailwind's explicit `var(...)` syntax (e.g. `max-h-[var(--radix-select-content-available-height)]`). A missing `var()` made long model menus overflow outside the viewport; the creation-options regression exercises this.

## PWA and update caveats

- Manifest has standalone display, 192/512/maskable icons, deployment-relative start URL and scope. HTTPS Pages sign-in, refresh and service-worker activation were verified at phone/desktop viewports; actual physical-phone installation was not tested.
- `registerType: "autoUpdate"` and immediate registration generate `skipWaiting`, `clientsClaim`, old-cache cleanup, revisioned precache assets and automatic reload on update. API requests use NetworkOnly.
- GitHub serves `sw.js` with a ten-minute HTTP cache header. Offline devices intentionally keep the last working shell; no promise of instantaneous updates is possible.
- **Open follow-up:** app registration currently happens at startup only. There are **no explicit resume/focus or periodic update checks** in `src/register-sw.ts`. The user asked about stale versions; adding those checks was suggested but **not implemented**. Don't claim otherwise. Consider draft-preserving update/reload UX.
- **Packaging lesson:** exclude removed files from Workbox precache. `example.svg` and `mockServiceWorker.js` are not deployed; both are excluded from precache. Removing an SVG _after_ precache generation initially broke live worker installation.
- Run production smoke **after packaging/removing dev artifacts**, against the exact uploaded output. A pre-packaging success isn't deployment verification.
- When mocking a production app with an active service worker, use Playwright **context.route**, not just page.route: service-worker-owned API requests can bypass page routes.
- After deployment, verify the actual HTTPS site in fresh browser contexts: assets, CSP, hash navigation/refresh, active worker, zero normal console errors. Use `navigator.serviceWorker.ready` or inspect registrations robustly; avoid transient registration races.
