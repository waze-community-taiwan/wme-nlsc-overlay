# WME NLSC Overlay — Project Context

## Overview

Personal-use Tampermonkey userscript that overlays Taiwan NLSC WMTS tiles in the Waze Map Editor (WME) as a visual reference layer. This is **not** a Waze-official tool and is provided as-is for personal use.

## Critical Knowledge

**NLSC WMTS Axis Order:** The NLSC WMTS API uses `{z}/{y}/{x}` tile indexing, **not** the standard Web Mercator `{z}/{x}/{y}`. This is a known regression vector — see the URL template in `src/layers.ts` and the builder in `src/index.ts`. Preserve `{y}` before `{x}` if you touch either.

## Status

Shipping on semver (current: v0.2.2 in `package.json`). The original four-phase roadmap (scaffold → SDK init → tile rendering → sidebar UI) is fully delivered. Current feature surface:

- WME SDK init and tile-layer registration (`src/index.ts`).
- NLSC layer definitions with seed defaults EMAP5 / TOWN / CITY (`src/layers.ts`).
- Sidebar UI with toggles, opacity sliders, drag-reorder, per-layer color tinting, "above objects" pin, removable defaults (`src/sidebar.ts`).
- LayerSwitcher bidirectional sync (`src/index.ts`).
- WMTS capabilities catalog fetch for adding more layers (`src/catalog.ts`).
- Layer re-stacking around the editor band (`src/restack.ts`).
- TOS dialog (`src/terms.ts`).

## Build & Test

```bash
npm run build          # Compile TS → dist/wme-nlsc-overlay.user.js
npm run build:watch   # Watch mode
npm test              # Unit tests (Vitest)
npm run test:watch    # Unit tests, interactive
npm run test:e2e      # E2E tests (Playwright)
npm run serve:fixtures # Start fixture server on :8765
```

## Playwright MCP (Headed Browser Debugging)

For visual debugging of E2E tests and manual fixture testing:

```bash
# Run Playwright in headed mode with MCP
# (requires .mcp.json registration)
npx playwright test --headed --project=chromium
```

Or use Claude Code's Playwright MCP tool directly (available at project scope).

## Extension Points

- **src/index.ts** — Main userscript entry: top-frame gate, SDK await, tile layer registration, LayerSwitcher wiring.
- **src/layers.ts** — Seed NLSC layer definitions (EMAP5, TOWN, CITY) and the WMTS URL template constant.
- **src/catalog.ts** — Fetches `https://wmts.nlsc.gov.tw/wmts/1.0.0/WMTSCapabilities.xml` to populate the "add layer" picker.
- **src/sidebar.ts** — Sidebar UI rendering and event wiring.
- **src/state.ts** — `localStorage`-backed user settings.
- **tests/fixtures/mock-wme.html** — Standalone OpenLayers harness for fixture-based testing.

## Dependencies

- **TypeScript 5+**, **Rollup 4+** — Build pipeline.
- **Vitest** — Unit tests.
- **Playwright** — E2E tests, fixture server, MCP integration.
- **rollup-plugin-userscript-metablock** — Generates Tampermonkey metablock.
- **wme-sdk-typings** — WME type definitions (from Waze).

## Git Workflow

- Feature branches for non-trivial work; PR into `main`.
- Releases are tagged via `chore(release): vX.Y.Z` commits; the built userscript is published only as a GitHub Release asset (not committed to the repo). Point Greasy Fork's sync URL at `.../releases/latest/download/wme-nlsc-overlay.user.js`.
- No force-pushes to `main`.

## Notes

- NLSC WMTS base: `https://wmts.nlsc.gov.tw/wmts/` — public, no auth (`credentials: "omit"` in `src/catalog.ts`).
- Built userscript is produced at `dist/wme-nlsc-overlay.user.js` and shipped only as a GitHub Release asset; it is not committed to the repo root (gitignored).
