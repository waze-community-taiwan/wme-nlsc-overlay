# WME NLSC Overlay — Project Context

## Overview

Personal-use Tampermonkey userscript that overlays Taiwan NLSC WMTS tiles in the Waze Map Editor (WME) as a visual reference layer. This is **not** a Waze-official tool and is provided as-is for personal use.

## Critical Knowledge

**NLSC WMTS Axis Order:** The NLSC WMTS API uses `{z}/{y}/{x}` tile indexing, **not** the standard Web Mercator `{z}/{x}/{y}`. This is a known regression vector; ensure tile URL builders in Phase 2 implement the correct order.

## Four-Phase Roadmap

- **Phase 0 (DONE):** Repo scaffold, build tooling, test harness, MCP registration.
- **Phase 1:** WME SDK initialization, config loading, NLSC layer definitions.
- **Phase 2:** Tile layer registration with WME, rendering on map.
- **Phase 3:** Sidebar UI, LayerSwitcher integration, user settings.

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

- **src/index.ts** — Main userscript entry. Comments mark Phases 1–3 tasks.
- **src/layers.ts** (TBD) — NLSC layer codes and metadata. User supplies canonical codes from NLSC WMTS provider.
- **tests/fixtures/mock-wme.html** — Standalone OpenLayers harness for fixture-based testing (Phase 2+).

## Dependencies

- **TypeScript 5+**, **Rollup 4+** — Build pipeline.
- **Vitest** — Unit tests.
- **Playwright** — E2E tests, fixture server, MCP integration.
- **rollup-plugin-userscript-metablock** — Generates Tampermonkey metablock.
- **wme-sdk-typings** — WME type definitions (from Waze).

## Git Workflow

- One initial commit per phase.
- Use feature branches for multi-commit work within a phase.
- No force-pushes to main (when applicable).

## Notes for Next Phase

- Layer codes live in `src/layers.ts` (TBD).
- NLSC provider URL and authentication (if needed) TBD.
- WME Layer registration API documented in WME SDK.
