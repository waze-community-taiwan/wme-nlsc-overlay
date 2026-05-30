# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.5.0) — 2026-05-30

[Compare `v0.4.0...v0.5.0`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/compare/v0.4.0...v0.5.0)

### Bug Fixes

- **ci:** restore committed root userscript for Greasy Fork sync ([`1a939fd`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/1a939fd0417d4385a0e08b68ba9f1a35c9097f29))

**Install:** [`wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/download/v0.5.0/wme-nlsc-overlay.user.js) — open with Tampermonkey/Violentmonkey/Greasemonkey to install.
Always-latest link: [`releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js).
## [0.4.0](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.4.0) — 2026-05-30

[Compare `v0.3.0...v0.4.0`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/compare/v0.3.0...v0.4.0)

### Features

- **floatbox:** add draggable floating layer box overlay ([`b2cba99`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/b2cba9940c95e47e51ba9d2fea25485cfff874af))

### Bug Fixes

- **ci:** pin wme-sdk-typings to immutable versioned URL ([`9ceea91`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/9ceea91efd83dfb61a5ed30957ed4bd0406472e7))
- **floatbox:** update title text from Chinese to English ([`1d87ab0`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/1d87ab0c997647977e7420640428e5c340a8e122))

### Refactors

- **README:** update project description and features for clarity ([`bcf1e6d`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/bcf1e6dcd1b941ee77f0ce9a8ba69ce29cbf2b3c))

### Chores

- **ci:** publish userscript via release asset only, not repo root ([`a4d6167`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/a4d61674ae6f7cc97f88b4877f118caf09185466))
- stop tracking .kiro files and add to gitignore ([`b8b3dee`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/b8b3deef7cc046c597477343ffc1b37692a41045))
- **.kiro:** add development environment hooks ([`bbb0b62`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/bbb0b6256e1665202877319568746b05eec29658))

### Other

- Refactor code structure for improved readability and maintainability ([`8e2436b`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/8e2436b195303bc23e232c22b2b562d2fb2bd157))

**Install:** [`wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/download/v0.4.0/wme-nlsc-overlay.user.js) — open with Tampermonkey/Violentmonkey/Greasemonkey to install.
Always-latest link: [`releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js).
## [0.3.0](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.3.0) — 2026-05-25

[Compare `v0.2.2...v0.3.0`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/compare/v0.2.2...v0.3.0)

### Features

- **sidebar:** TOS dialog, above-objects pin, and removable defaults (#6) ([`b1955d5`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/b1955d5037232631ae2fa15976d5457eec075aa2))

**Install:** [`wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/download/v0.3.0/wme-nlsc-overlay.user.js) — open with Tampermonkey/Violentmonkey/Greasemonkey to install.
Always-latest link: [`releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js).
## [Unreleased]

### Features

- **terms:** add a 服務使用條款 link in the NLSC sidebar that opens a modal with the full Traditional Chinese TOS (mirrors NLSC's own service terms; covers attribution, no-bulk-download, copyright, disclaimers, governing law). New `TERMS.md` at the repo root + `src/terms.ts` carry the canonical text.
- **sidebar:** add an "above WME objects" radio-style pin (orange square button) so a single NLSC layer can be promoted above editor vector objects (roads, places, hazards) instead of always sitting between imagery and editor layers. State is preserved when the layer is hidden and the button is hidden on invisible layers.
- **sidebar:** every layer row is now removable via the ✕ button, including the hardcoded seed defaults. Removed defaults are tracked in `state.removedDefaults` and stay un-registered across reloads until the user re-adds them from the catalog dropdown.
- **sidebar:** show the script version next to the heading (e.g. "NLSC Overlay v0.2.2"). Version is baked into the bundle by Rollup at build time so it does not depend on `GM_info`.
- **layers:** trim hardcoded seed defaults to EMAP5, TOWN, CITY (EMAP2 and LANDSECT2 are still re-addable from the catalog dropdown).
- **metablock:** extend `@match` to also include `https://beta.waze.com/*editor*` so the script runs on the WME beta editor.

### Bug Fixes

- **sidebar:** catalog dropdown now filters against the live registered layer set instead of `userLayers` alone, so a removed seed default reappears in the picker and stays addable offline (catalog-fetch failures no longer hide it).
- **restack:** split overlays into a below-band (above imagery, below editor objects) and an above-band (above editor objects), with at most one layer in the above-band at a time (controller enforces radio semantics).
- **state:** migrate legacy `above: Record<string, boolean>` storage to the new single-slot `aboveCode: string | null` model. If multiple layers were previously pinned above, the one highest in `layerOrder` wins.

### Tests

- New `tests/unit/terms.test.ts` covers the TOS link → modal flow, close button, backdrop/ESC dismissal, and double-open guard.
- Expanded `tests/unit/sidebar.test.ts`, `tests/unit/restack.test.ts`, `tests/unit/state.test.ts`, and `tests/unit/add-user-layer.test.ts` for the new above-objects pin, removable defaults, and state migration.

## [0.2.2](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.2.2) — 2026-05-24

[Compare `v0.2.1...v0.2.2`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/compare/v0.2.1...v0.2.2)

### CI

- **release:** stage userscript at repo root for Greasy Fork webhook ([`d6f46e6`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/d6f46e668443afcd2ba2d77f10b482b4df285ce8))

**Install:** [`wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/download/v0.2.2/wme-nlsc-overlay.user.js) — open with Tampermonkey/Violentmonkey/Greasemonkey to install.
Always-latest link: [`releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js).
## [0.2.1](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.2.1) — 2026-05-24

[Compare `v0.2.0...v0.2.1`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/compare/v0.2.0...v0.2.1)

_No user-facing commits since the previous release._

**Install:** [`wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/download/v0.2.1/wme-nlsc-overlay.user.js) — open with Tampermonkey/Violentmonkey/Greasemonkey to install.
Always-latest link: [`releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js).
## [0.2.0](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.2.0) — 2026-05-24

[Compare `v0.0.2...v0.2.0`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/compare/v0.0.2...v0.2.0)

### Bug Fixes

- **restack:** keep satellite_imagery + earthengine-legacy aerials below NLSC band ([`b1f4c97`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/b1f4c972a764471c5852557af4ae78d9b7f30503))

### CI

- **release:** fix auto-bump collision and generate changelog (#5) ([`6e7819a`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/6e7819a44a7efbd0004b386e3f58c76fdf8c9043))

**Install:** [`wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/download/v0.2.0/wme-nlsc-overlay.user.js) — open with Tampermonkey/Violentmonkey/Greasemonkey to install.
Always-latest link: [`releases/latest/download/wme-nlsc-overlay.user.js`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js).
## [0.0.2](https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/tag/v0.0.2) — 2026-05-23

_Initial tracked release._

### Features

- **phase-1:** gate to top frame, bootstrap WME SDK, define NLSC_LAYERS ([`071e2b9`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/071e2b9))
- **phase-2:** register NLSC WMTS tile layers on WME OpenLayers map ([`7193c14`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/7193c14))
- **phase-3:** sidebar UI with persisted visibility and opacity ([`bf7d242`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/bf7d242))
- **phase-4:** LayerSwitcher integration with bidirectional sync ([`f3fc4e1`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/f3fc4e1))
- dynamic NLSC catalog layers, README, and OL 2.x integration ([`6b2156b`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/6b2156b))
- enhance sidebar UI with new styles and functionality ([`896c3e9`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/896c3e9))
- add MIT License file and update license information in package.json and metablock.json ([`ca15554`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/ca15554))
- per-layer color tint with preset and custom picker ([`6b0b5a6`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/6b0b5a6))
- add GitHub Actions workflow for automated releases and update README with release instructions ([`d43d6f3`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/d43d6f3))

### Bug Fixes

- update XML parsing to handle prefixed &lt;wmts:Layer&gt; and &lt;wmts:TileMatrixSet&gt; elements ([`124ac13`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/124ac13))

### Documentation

- update installation instructions in README for userscript managers ([`60891ca`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/60891ca))
- update README and metablock.json with Greasy Fork mirroring instructions and URLs ([`c4add05`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/c4add05))

### CI

- **release:** auto-bump version on workflow_dispatch ([`6491b43`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/6491b43))

### Chores

- scaffold phase 0 (build, test, MCP) ([`14d9597`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/14d9597))
- update vitest and coverage-v8 dependencies to latest versions ([`d2a6021`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/d2a6021))
- **release:** v0.0.2 ([`e9c204a`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/e9c204a))

> Note: tag `v0.1.0` was created during early CI bring-up, points at
> [`d43d6f3`](https://github.com/waze-community-taiwan/wme-nlsc-overlay/commit/d43d6f3),
> and was never published as a release. It is preserved for history; the next
> released version after `v0.0.2` is `v0.2.0` or later (the release workflow
> bumps from the highest known version to avoid colliding with this orphan
> tag).
