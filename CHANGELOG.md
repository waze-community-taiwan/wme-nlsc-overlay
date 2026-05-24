# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
