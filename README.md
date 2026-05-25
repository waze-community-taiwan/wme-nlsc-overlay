# WME NLSC Overlay

A Tampermonkey userscript that overlays Taiwan **NLSC (National Land Surveying and Mapping Center)** WMTS tiles inside the Waze Map Editor (WME) as a visual reference layer. It is intended to help Taiwan-based Waze editors cross-check road geometry, place names, and administrative boundaries against authoritative cadastral imagery.

This is **not** a Waze-official tool and is provided as-is.

## Install

> **Install from Greasy Fork:** [https://greasyfork.org/en/scripts/579472-wme-nlsc-overlay](https://greasyfork.org/en/scripts/579472-wme-nlsc-overlay)

You need a userscript manager first — [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox), [Violentmonkey](https://violentmonkey.github.io/), or [Greasemonkey](https://www.greasespot.net/) (Firefox). Once installed, open the Greasy Fork link and click **Install this script**; updates are delivered automatically on your userscript manager's check schedule.

## Features

- **NLSC sidebar tab** in the WME right sidebar with per-layer controls.
- **Seed layers** — EMAP5, TOWN, and CITY pre-configured out of the box.
- **Opacity sliders** — adjust transparency independently per layer.
- **Drag to reorder** layers, and pin them **above WME objects** when you need the imagery on top.
- **Per-layer color tinting** for quick visual differentiation.
- **Catalog picker** — browse the full NLSC WMTS capabilities catalog and add any additional layer on demand.
- **LayerSwitcher sync** so NLSC layers also appear in WME's native layer menu.
- **Persisted settings** — visibility, opacity, order, and color choices are saved to `localStorage` across sessions.
- **Top-frame gated** — runs only in the main WME editor, never in nested iframes.

## Usage

After installing, open **[https://www.waze.com/editor](https://www.waze.com/editor)**. The script attaches an **NLSC Overlay** tab to the WME right sidebar where you can toggle layers, change opacity, reorder, and add more layers from the NLSC catalog.

By installing or using this script you agree to the **[Terms of Service](TERMS.md)**, which also incorporate the NLSC's own [Terms of Use](https://maps.nlsc.gov.tw).

## Notes

- NLSC WMTS uses non-standard tile axis order `{z}/{y}/{x}` instead of the usual Web Mercator `{z}/{x}/{y}`. The script handles this internally.
- Tile data is served by the Taiwan National Land Surveying and Mapping Center (NLSC); please refer to NLSC's own terms for the data itself.
- Not affiliated with or endorsed by Waze.

## License

[MIT](LICENSE) © Waze Community Taiwan.
