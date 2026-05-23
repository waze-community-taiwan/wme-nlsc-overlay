# WME NLSC Overlay

A personal-use Tampermonkey userscript that overlays Taiwan NLSC WMTS tiles in the Waze Map Editor (WME) as a visual reference layer. This is **not** a Waze-official tool and is provided as-is for personal use.

## Features

- **NLSC sidebar tab** in the WME right sidebar with layer controls
- **Default layers** — EMAP5, EMAP2, TOWN, CITY, LANDSECT2 pre-configured
- **Opacity control** — adjust transparency per layer with slider
- **Catalog dropdown** — browse and add additional layers from the NLSC catalog
- **Persisted settings** — visibility and opacity settings automatically saved to browser localStorage
- **Top-frame gating** — runs only in the main WME editor, not nested iframes

## Prerequisites

- **Node.js 18+** and npm
- **A userscript manager** browser extension:
  - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Edge, Firefox)
  - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Edge, Firefox)
  - [Greasemonkey](https://www.greasespot.net/) (Firefox)

## Build

```bash
npm install              # Install dependencies (required first time)
npm run build            # Compile TypeScript → dist/wme-nlsc-overlay.user.js
npm run build:watch     # Watch mode during development
```

The build pipeline (Rollup 4 + TypeScript 5) compiles `src/index.ts` to an IIFE bundle with a Tampermonkey metablock prepended.

## Test

```bash
npm test                # Run Vitest unit tests (single pass, tests/ in tests/unit/)
npm run test:watch     # Vitest interactive watch mode
npm run test:e2e       # Run Playwright E2E tests (Chromium, tests/ in tests/e2e/)
npm run serve:fixtures # Start fixture server on http://localhost:8765
```

For manual testing:
- **Fixture harness:** `npm run serve:fixtures` runs http://localhost:8765/tests/fixtures/mock-wme.html, a standalone OpenLayers map for visual debugging
- **Real editor:** `node tests/manual/launch-wme.mjs` launches Microsoft Edge with the built userscript injected (requires `npm run build` first and Microsoft Edge installed)
- **E2E headed mode:** Set `HEADLESS=false` before running `npm run test:e2e`

## Install on Browser

Install one of the userscript managers from **Prerequisites** above first. Then pick a method below.

### Method 1 — GitHub Release (one-click, recommended for users)

Click the link below; Tampermonkey/Violentmonkey/Greasemonkey detects the `.user.js` URL, opens a confirmation tab showing the script source and `@grant` permissions, and asks you to confirm.

> **Install:** [`https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js)

The `/releases/latest/download/<asset>` path always resolves to the latest published release, so this link does not need to change for new versions. Wire `@updateURL` / `@downloadURL` in the script metablock to the same URL and userscript managers will check for updates automatically (Tampermonkey re-checks on its own schedule, daily by default).

> If the link returns 404, no release has been cut yet — use **Method 3** in the meantime. Maintainers: see [Cutting a release](#cutting-a-release).

### Method 2 — Greasy Fork (community mirror)

[Greasy Fork](https://greasyfork.org) is the canonical hosting site for Tampermonkey userscripts and the de-facto distribution channel for the [WME script community](https://greasyfork.org/en/scripts/by-site/waze.com). It provides a script page with a green "Install this script" button, version history, ratings, and auto-update — no infrastructure on your side.

The Greasy Fork mirror is kept in sync with GitHub Releases via **Sync from URL**: Greasy Fork periodically re-fetches `releases/latest/download/wme-nlsc-overlay.user.js` and republishes any version change automatically. See [Mirroring to Greasy Fork](#mirroring-to-greasy-fork) for the one-time setup.

Acceptance rules (per [Greasy Fork code rules](https://greasyfork.org/en/help/code-rules)): no minified or obfuscated code, ≤2 MB. The Rollup build emits a non-minified IIFE — compatible.

### Method 3 — Build from source (developers, or until a release is published)

1. `npm install && npm run build` — generates `dist/wme-nlsc-overlay.user.js`.
2. With a userscript manager installed, either:
   - **Drag-and-drop:** drag `dist/wme-nlsc-overlay.user.js` onto a browser tab, or open `file:///<path-to-repo>/dist/wme-nlsc-overlay.user.js`. The userscript manager detects the metablock and prompts for installation.
   - **Dashboard paste:** open the Tampermonkey dashboard → "Create a new script" → replace all contents with the file contents → save (Ctrl/Cmd+S).

## Usage

After installation, visit **https://www.waze.com/editor** to open WME. The script runs automatically. You will see:

- **NLSC tab** in the WME right sidebar with toggles for default layers (EMAP5, EMAP2, TOWN, CITY, LANDSECT2)
- **Opacity slider** for each layer to adjust transparency
- **Catalog dropdown** to browse and add additional layers from the NLSC provider
- Visibility and opacity settings **persist** to localStorage across sessions

## Cutting a release

Releases are produced by `.github/workflows/release.yml` and uploaded as a `wme-nlsc-overlay.user.js` asset to a GitHub Release. The latest asset is always reachable at the install URL in **Method 1**.

**Option A — push a tag (recommended):**

```bash
git tag v0.1.0          # tag must match v*.*.*
git push origin v0.1.0
```

**Option B — manual dispatch:** run the **Release** workflow from the Actions tab and provide the version (without the leading `v`, e.g. `0.1.0`).

In both cases the workflow:

1. Runs `npm test` (unit tests must pass).
2. Rewrites `metablock.json` `version` field to match the tag — the tag is the source of truth, so you do not need to bump `metablock.json` by hand.
3. Builds `dist/wme-nlsc-overlay.user.js`.
4. Creates the GitHub Release and uploads the built file as the release asset.

Tampermonkey auto-update is wired through `downloadURL` / `updateURL` in `metablock.json`, both pointing at the `releases/latest/download/...` URL. Users who installed directly from GitHub get updates automatically on Tampermonkey's check schedule.

## Mirroring to Greasy Fork

A Greasy Fork listing auto-syncs from the GitHub release asset — no per-release work needed. **One-time setup:**

1. Cut the first GitHub release (push a `v*.*.*` tag) so `https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js` resolves.
2. Sign in to [greasyfork.org](https://greasyfork.org) → **Post a new script** → paste the built `.user.js` contents → publish. Use the snippet below for the "Additional info" field.
3. On the new script's page → **Tools** tab → **Sync script from URL** → set the sync URL to the same `releases/latest/download/...` URL → save.

From this point on, every `v*.*.*` tag pushed to the repo produces a new GitHub Release, and Greasy Fork picks it up automatically on its next sync cycle (usually within a few hours). You can also click **Sync now** on the script's *Sync* page to force an immediate pull.

## Notes

- The script is gated to the top frame only for WME SDK safety — it does not run in nested iframes
- NLSC WMTS uses non-standard tile axis order `{z}/{y}/{x}` instead of standard Web Mercator `{z}/{x}/{y}`. The script handles this internally
- For architecture notes and development tips, see **CLAUDE.md**
- Personal-use software provided as-is; not affiliated with or endorsed by Waze

## License

[MIT](LICENSE) © Waze Community Taiwan. Tile data is served by the Taiwan National Land Surveying and Mapping Center (NLSC); refer to NLSC's own terms for the data itself.
