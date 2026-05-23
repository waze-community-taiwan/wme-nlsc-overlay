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

### Method 1 — Drag-and-Drop (Easiest)

1. Run `npm run build` to generate `dist/wme-nlsc-overlay.user.js`
2. With your userscript manager installed, open the file URL `file:///<path-to-repo>/dist/wme-nlsc-overlay.user.js` in the browser, or drag the file onto a browser tab
3. The userscript manager detects the metablock and prompts for installation — approve it

### Method 2 — Tampermonkey Dashboard

1. Run `npm run build`
2. Open the Tampermonkey dashboard → "Create a new script"
3. Replace all contents with the entire text of `dist/wme-nlsc-overlay.user.js`
4. Save (Ctrl+S or Cmd+S)

## Usage

After installation, visit **https://www.waze.com/editor** to open WME. The script runs automatically. You will see:

- **NLSC tab** in the WME right sidebar with toggles for default layers (EMAP5, EMAP2, TOWN, CITY, LANDSECT2)
- **Opacity slider** for each layer to adjust transparency
- **Catalog dropdown** to browse and add additional layers from the NLSC provider
- Visibility and opacity settings **persist** to localStorage across sessions

## Notes

- The script is gated to the top frame only for WME SDK safety — it does not run in nested iframes
- NLSC WMTS uses non-standard tile axis order `{z}/{y}/{x}` instead of standard Web Mercator `{z}/{x}/{y}`. The script handles this internally
- For architecture notes and development tips, see **CLAUDE.md**
- Personal-use software provided as-is; not affiliated with or endorsed by Waze
