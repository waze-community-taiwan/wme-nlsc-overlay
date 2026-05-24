// ==UserScript==
// @name        WME NLSC Overlay
// @description Overlay Taiwan NLSC WMTS tiles in Waze Map Editor
// @namespace   https://github.com/waze-community-taiwan/wme-nlsc-overlay
// @version     0.2.2
// @author      Waze Community Taiwan
// @license     MIT
// @match       https://www.waze.com/*editor*
// @connect     wmts.nlsc.gov.tw
// @run-at      document-idle
// @downloadURL https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js
// @updateURL   https://github.com/waze-community-taiwan/wme-nlsc-overlay/releases/latest/download/wme-nlsc-overlay.user.js
// @supportURL  https://github.com/waze-community-taiwan/wme-nlsc-overlay/issues
// @homepageURL https://github.com/waze-community-taiwan/wme-nlsc-overlay
// @grant       unsafeWindow
// @grant       GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // NLSC WMTS template: https://wmts.nlsc.gov.tw/wmts/{LAYER}/default/GoogleMapsCompatible/{z}/{y}/{x}  (note: {y} before {x} — WMTS axis order, NOT slippy)
    const NLSC_ATTRIBUTION = "© 內政部國土測繪中心 NLSC";
    /** Default NLSC WMTS layers — always present, not removable. */
    const NLSC_LAYERS = [
        {
            code: "EMAP5",
            title: "臺灣通用電子地圖(等高線+門牌)",
            format: "jpeg",
            name: "EMAP5 · jpeg · 臺灣通用電子地圖(等高線+門牌)",
            minZoom: 0,
            maxZoom: 19,
            attribution: NLSC_ATTRIBUTION,
            defaultOpacity: 0.5,
        },
        {
            code: "EMAP2",
            title: "臺灣通用電子地圖透明",
            format: "png",
            name: "EMAP2 · png · 臺灣通用電子地圖透明",
            minZoom: 0,
            maxZoom: 19,
            attribution: NLSC_ATTRIBUTION,
            defaultOpacity: 0.5,
        },
        {
            code: "TOWN",
            title: "鄉鎮區界",
            format: "png",
            name: "TOWN · png · 鄉鎮區界",
            minZoom: 0,
            maxZoom: 19,
            attribution: NLSC_ATTRIBUTION,
            defaultOpacity: 0.7,
        },
        {
            code: "CITY",
            title: "縣市界",
            format: "png",
            name: "CITY · png · 縣市界",
            minZoom: 0,
            maxZoom: 19,
            attribution: NLSC_ATTRIBUTION,
            defaultOpacity: 0.7,
        },
        {
            code: "LANDSECT2",
            title: "地段外圍圖(段籍圖)(類別)",
            format: "png",
            name: "LANDSECT2 · png · 地段外圍圖(段籍圖)(類別)",
            minZoom: 0,
            maxZoom: 19,
            attribution: NLSC_ATTRIBUTION,
            defaultOpacity: 0.7,
        },
    ];

    const CAPABILITIES_URL = "https://wmts.nlsc.gov.tw/wmts/1.0.0/WMTSCapabilities.xml";
    /** Fetch the NLSC WMTS GetCapabilities document and return its <Layer> entries. */
    async function fetchCatalog() {
        return parseCapabilities(await fetchCapabilitiesXml());
    }
    // Waze's editor CSP blocks plain fetch() to wmts.nlsc.gov.tw, so prefer
    // GM_xmlhttpRequest (runs in the Tampermonkey extension context, bypasses
    // page CSP, requires @connect wmts.nlsc.gov.tw in the metablock). Fall back
    // to fetch() for non-Tampermonkey environments (unit tests, harnesses that
    // install their own GM_xmlhttpRequest polyfill).
    function fetchCapabilitiesXml() {
        const gm = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : undefined;
        if (gm) {
            return new Promise((resolve, reject) => {
                gm({
                    method: "GET",
                    url: CAPABILITIES_URL,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300)
                            resolve(res.responseText);
                        else
                            reject(new Error(`NLSC GetCapabilities ${res.status}`));
                    },
                    onerror: () => reject(new Error("NLSC GetCapabilities request failed")),
                    ontimeout: () => reject(new Error("NLSC GetCapabilities timed out")),
                });
            });
        }
        return fetch(CAPABILITIES_URL, { credentials: "omit" }).then(async (res) => {
            if (!res.ok)
                throw new Error(`NLSC GetCapabilities ${res.status}`);
            return res.text();
        });
    }
    // NLSC publishes a single shared `GoogleMapsCompatible` set defining z=0..19,
    // so 19 is the right last-resort fallback when the XML is missing both per-
    // layer limits and matrix-set definitions.
    const FALLBACK_MAX_ZOOM = 19;
    /** Parse a WMTS Capabilities XML string into NlscLayer entries. Exported for tests. */
    function parseCapabilities(xml) {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        if (doc.getElementsByTagName("parsererror").length > 0)
            return [];
        const matrixSetMax = indexTileMatrixSets(doc);
        const seen = new Set();
        const out = [];
        // `getElementsByTagNameNS("*", localName)` matches by localName across any
        // namespace, so prefixed forms like `<wmts:Layer>` are also picked up.
        for (const el of Array.from(doc.getElementsByTagNameNS("*", "Layer"))) {
            const code = directChildText(el, "Identifier");
            if (!code || seen.has(code))
                continue;
            seen.add(code);
            const title = directChildText(el, "Title") ?? code;
            const rawFormat = directChildText(el, "Format") ?? "";
            const format = rawFormat.toLowerCase().endsWith("/png") ? "png" : "jpeg";
            out.push({
                code,
                title,
                format,
                name: `${code} · ${format} · ${title}`,
                minZoom: 0,
                maxZoom: resolveMaxZoom(el, matrixSetMax),
                attribution: NLSC_ATTRIBUTION,
                defaultOpacity: 0.7,
            });
        }
        return out;
    }
    // Walk all <TileMatrixSet> *definitions* under <Contents> and record each
    // set's highest TileMatrix index. The matching <TileMatrixSet> *references*
    // inside <TileMatrixSetLink> have no <Identifier>/<TileMatrix> children, so
    // they're naturally skipped by the filter below.
    function indexTileMatrixSets(doc) {
        const out = new Map();
        for (const set of Array.from(doc.getElementsByTagNameNS("*", "TileMatrixSet"))) {
            const id = directChildText(set, "Identifier");
            if (!id)
                continue;
            let max = -1;
            for (const tm of directChildren(set, "TileMatrix")) {
                const z = parseTileMatrixIndex(directChildText(tm, "Identifier"));
                if (z !== null && z > max)
                    max = z;
            }
            if (max >= 0)
                out.set(id, max);
        }
        return out;
    }
    // Resolve a layer's effective max zoom, preferring per-layer limits over the
    // referenced matrix set's intrinsic max. Returns FALLBACK_MAX_ZOOM if neither
    // source is available.
    function resolveMaxZoom(layerEl, matrixSetMax) {
        for (const link of directChildren(layerEl, "TileMatrixSetLink")) {
            const limits = directChildren(link, "TileMatrixSetLimits")[0];
            if (limits) {
                let max = -1;
                for (const lim of directChildren(limits, "TileMatrixLimits")) {
                    const z = parseTileMatrixIndex(directChildText(lim, "TileMatrix"));
                    if (z !== null && z > max)
                        max = z;
                }
                if (max >= 0)
                    return max;
            }
            const setRef = directChildText(link, "TileMatrixSet");
            if (setRef) {
                const setMax = matrixSetMax.get(setRef);
                if (setMax !== undefined)
                    return setMax;
            }
        }
        return FALLBACK_MAX_ZOOM;
    }
    // Accept both bare numeric identifiers ("19") and prefixed forms commonly
    // emitted by some WMTS servers ("GoogleMapsCompatible:19").
    function parseTileMatrixIndex(id) {
        if (!id)
            return null;
        const tail = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
        const n = Number.parseInt(tail, 10);
        return Number.isFinite(n) ? n : null;
    }
    // Direct-child match (by localName, namespace-agnostic) — avoids matching
    // nested <Identifier> elements inside TileMatrixSetLink/Style/etc.
    function directChildText(parent, localName) {
        for (const child of Array.from(parent.children)) {
            if (child.localName === localName)
                return child.textContent?.trim() ?? null;
        }
        return null;
    }
    function directChildren(parent, localName) {
        return Array.from(parent.children).filter((c) => c.localName === localName);
    }

    const STORAGE_KEY = "wme-nlsc-overlay:state";
    const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
    function emptyState() {
        return { visible: {}, opacity: {}, userLayers: [], color: {}, layerOrder: [] };
    }
    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw)
                return emptyState();
            const parsed = JSON.parse(raw);
            const color = {};
            if (parsed && typeof parsed.color === "object" && parsed.color !== null) {
                for (const [k, v] of Object.entries(parsed.color)) {
                    if (typeof v === "string" && HEX_COLOR_RE.test(v))
                        color[k] = v;
                }
            }
            return {
                visible: parsed && typeof parsed.visible === "object" && parsed.visible !== null
                    ? parsed.visible
                    : {},
                opacity: parsed && typeof parsed.opacity === "object" && parsed.opacity !== null
                    ? parsed.opacity
                    : {},
                color,
                userLayers: parsed && Array.isArray(parsed.userLayers)
                    ? parsed.userLayers.filter((c) => typeof c === "string")
                    : [],
                layerOrder: parsed && Array.isArray(parsed.layerOrder)
                    ? parsed.layerOrder.filter((c) => typeof c === "string")
                    : [],
            };
        }
        catch {
            return emptyState();
        }
    }
    function saveState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
        catch {
            // localStorage may be unavailable (quota / privacy mode) — drop silently.
        }
    }

    const STYLE_ID = "nlsc-styles";
    const NLSC_STYLES = `
.nlsc-panel { font-size: 13px; }
.nlsc-panel h4 { margin: 8px 0 12px; font-size: 14px; font-weight: 600; letter-spacing: 0.01em; }

.nlsc-add-row { display: flex; gap: 8px; margin: 0 0 12px; padding-bottom: 12px; border-bottom: 1px solid var(--hairline, rgba(128,128,128,0.2)); }
.nlsc-select { flex: 1; min-width: 0; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--hairline, rgba(128,128,128,0.3)); background: var(--background_default, transparent); color: inherit; font-size: 13px; outline: none; }
.nlsc-select:focus { border-color: #2d6cdf; box-shadow: 0 0 0 3px rgba(45,108,223,0.18); }

.nlsc-btn-primary { padding: 6px 14px; background: #2d6cdf; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background-color 0.15s, transform 0.05s; }
.nlsc-btn-primary:hover { background: #2558b5; }
.nlsc-btn-primary:active { background: #1f4895; transform: scale(0.97); }

.nlsc-card { position: relative; margin: 6px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--hairline, rgba(128,128,128,0.2)); transition: opacity 0.15s, box-shadow 0.15s; }
.nlsc-card.nlsc-dragging { opacity: 0.45; }
.nlsc-card.nlsc-drop-above { box-shadow: 0 -3px 0 0 #2d6cdf inset, 0 -3px 0 0 #2d6cdf; }
.nlsc-card.nlsc-drop-below { box-shadow: 0 3px 0 0 #2d6cdf inset, 0 3px 0 0 #2d6cdf; }
.nlsc-grip { cursor: grab; user-select: none; padding: 0 2px; opacity: 0.45; font-size: 16px; line-height: 1; letter-spacing: -3px; color: inherit; }
.nlsc-grip:hover { opacity: 0.85; }
.nlsc-grip:active { cursor: grabbing; }
.nlsc-row-header { display: flex; align-items: center; gap: 10px; }
.nlsc-name { display: flex; flex-direction: column; flex: 1; min-width: 0; word-break: break-word; line-height: 1.25; }
.nlsc-name-title { font-weight: 600; }
.nlsc-name-sub { font-size: 0.82em; opacity: 0.65; margin-top: 1px; }

.nlsc-toggle { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer; }
.nlsc-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.nlsc-toggle-slider { position: absolute; inset: 0; background-color: rgba(120,120,128,0.32); border-radius: 22px; transition: background-color 0.2s; }
.nlsc-toggle-slider::before { content: ""; position: absolute; height: 18px; width: 18px; left: 2px; top: 2px; background-color: #fff; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.nlsc-toggle input:checked + .nlsc-toggle-slider { background-color: #34c759; }
.nlsc-toggle input:checked + .nlsc-toggle-slider::before { transform: translateX(16px); }
.nlsc-toggle input:focus-visible + .nlsc-toggle-slider { box-shadow: 0 0 0 3px rgba(52,199,89,0.35); }

.nlsc-remove { background: transparent; border: none; color: inherit; cursor: pointer; padding: 2px 7px; border-radius: 6px; opacity: 0.55; font-size: 14px; line-height: 1; transition: opacity 0.15s, background-color 0.15s, color 0.15s; }
.nlsc-remove:hover { opacity: 1; background: rgba(255,59,48,0.12); color: #ff3b30; }

.nlsc-slider-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.nlsc-slider { flex: 1; -webkit-appearance: none; appearance: none; height: 4px; background: rgba(120,120,128,0.3); border-radius: 2px; outline: none; }
.nlsc-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; }
.nlsc-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; }
.nlsc-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(45,108,223,0.3); }
.nlsc-value { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; opacity: 0.75; }

.nlsc-swatch { width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; border: 1px solid rgba(128,128,128,0.4); background: transparent; cursor: pointer; padding: 0; position: relative; transition: transform 0.05s, box-shadow 0.15s; }
.nlsc-swatch:hover { box-shadow: 0 0 0 3px rgba(45,108,223,0.18); }
.nlsc-swatch:active { transform: scale(0.94); }
.nlsc-swatch[data-original="true"]::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: linear-gradient(135deg, transparent 45%, rgba(128,128,128,0.7) 47%, rgba(128,128,128,0.7) 53%, transparent 55%); }

.nlsc-popover { position: absolute; right: 10px; top: 38px; z-index: 10; padding: 10px; border-radius: 10px; background: var(--background_default, #fff); border: 1px solid var(--hairline, rgba(128,128,128,0.3)); box-shadow: 0 6px 20px rgba(0,0,0,0.18); display: none; }
.nlsc-popover.open { display: block; }
.nlsc-popover-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.nlsc-popover-row + .nlsc-popover-row { margin-top: 8px; }
.nlsc-chip { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(128,128,128,0.35); cursor: pointer; padding: 0; transition: transform 0.05s, box-shadow 0.15s; }
.nlsc-chip:hover { box-shadow: 0 0 0 3px rgba(45,108,223,0.18); }
.nlsc-chip:active { transform: scale(0.92); }
.nlsc-chip.selected { box-shadow: 0 0 0 2px var(--background_default, #fff), 0 0 0 4px #2d6cdf; }
.nlsc-chip-original { background: transparent; position: relative; }
.nlsc-chip-original::after { content: ""; position: absolute; inset: 2px; border-radius: 50%; background: linear-gradient(135deg, transparent 45%, rgba(128,128,128,0.7) 47%, rgba(128,128,128,0.7) 53%, transparent 55%); }
.nlsc-popover-label { font-size: 11px; opacity: 0.7; margin-right: 4px; }
.nlsc-color-input { width: 28px; height: 22px; border: 1px solid rgba(128,128,128,0.35); border-radius: 4px; padding: 0; background: transparent; cursor: pointer; }

[wz-theme="dark"] .nlsc-toggle-slider { background-color: rgba(120,120,128,0.5); }
[wz-theme="dark"] .nlsc-card { border-color: rgba(255,255,255,0.1); }
[wz-theme="dark"] .nlsc-popover { background: #1f2024; border-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-chip.selected { box-shadow: 0 0 0 2px #1f2024, 0 0 0 4px #2d6cdf; }
`;
    function injectStyles() {
        if (typeof document === "undefined")
            return;
        if (document.getElementById(STYLE_ID))
            return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = NLSC_STYLES;
        document.head.appendChild(style);
        // One global listener closes any open color popover on outside click.
        document.addEventListener("click", () => {
            for (const el of document.querySelectorAll(".nlsc-popover.open")) {
                el.classList.remove("open");
            }
        });
    }
    function renderSidebar(tabLabel, tabPane, defaults, controller, state, callbacks) {
        injectStyles();
        tabLabel.textContent = "NLSC";
        tabPane.classList.add("nlsc-panel");
        const heading = document.createElement("h4");
        heading.textContent = "NLSC Overlay";
        tabPane.appendChild(heading);
        // Catalog picker — placed *above* the layer rows so it's never hidden
        // below the fold inside WME's fixed-height tab pane.
        const addRow = document.createElement("div");
        addRow.className = "nlsc-add-row";
        const select = document.createElement("select");
        select.className = "nlsc-select";
        const placeholderOpt = document.createElement("option");
        placeholderOpt.value = "";
        placeholderOpt.textContent = "選擇圖層…";
        placeholderOpt.disabled = true;
        placeholderOpt.selected = true;
        select.appendChild(placeholderOpt);
        // Tracks <option> nodes by code so we can pull/restore them as layers are added/removed.
        const optionByCode = new Map();
        const addOption = (layer) => {
            const opt = document.createElement("option");
            opt.value = layer.code;
            opt.textContent = layer.name;
            select.appendChild(opt);
            optionByCode.set(layer.code, opt);
        };
        for (const layer of callbacks.catalog) {
            if (!state.userLayers.includes(layer.code))
                addOption(layer);
        }
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.textContent = "新增";
        addBtn.className = "nlsc-btn-primary";
        addRow.appendChild(select);
        addRow.appendChild(addBtn);
        tabPane.appendChild(addRow);
        // One flat container in `state.layerOrder` (= controller order). Rows for
        // defaults and user-added layers interleave freely; their visual order in
        // this container drives both the sidebar list and the OL stacking order.
        const layerList = document.createElement("div");
        tabPane.appendChild(layerList);
        const defaultCodes = new Set(defaults.map((l) => l.code));
        const rowByCode = new Map();
        const layerByCode = new Map();
        for (const l of defaults)
            layerByCode.set(l.code, l);
        for (const l of callbacks.catalog)
            if (!layerByCode.has(l.code))
                layerByCode.set(l.code, l);
        // Drag-and-drop on the ⋮⋮ grip. We keep `draggable=false` on rows by default
        // so clicks on the slider / checkbox / color picker never accidentally
        // initiate a drag; the grip flips draggable on mousedown.
        let draggingCode = null;
        const clearDropTargets = () => {
            for (const el of layerList.querySelectorAll(".nlsc-drop-above, .nlsc-drop-below")) {
                el.classList.remove("nlsc-drop-above", "nlsc-drop-below");
            }
        };
        const wireDnD = (row, grip, code) => {
            grip.addEventListener("mousedown", () => {
                row.draggable = true;
            });
            grip.addEventListener("mouseup", () => {
                row.draggable = false;
            });
            row.addEventListener("dragstart", (e) => {
                if (!row.draggable) {
                    e.preventDefault();
                    return;
                }
                draggingCode = code;
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", code);
                }
                row.classList.add("nlsc-dragging");
            });
            row.addEventListener("dragover", (e) => {
                if (!draggingCode || draggingCode === code)
                    return;
                e.preventDefault();
                if (e.dataTransfer)
                    e.dataTransfer.dropEffect = "move";
                const rect = row.getBoundingClientRect();
                const above = e.clientY < rect.top + rect.height / 2;
                clearDropTargets();
                row.classList.add(above ? "nlsc-drop-above" : "nlsc-drop-below");
            });
            row.addEventListener("dragleave", () => {
                row.classList.remove("nlsc-drop-above", "nlsc-drop-below");
            });
            row.addEventListener("drop", (e) => {
                e.preventDefault();
                if (!draggingCode || draggingCode === code)
                    return;
                const rect = row.getBoundingClientRect();
                const above = e.clientY < rect.top + rect.height / 2;
                const filtered = state.layerOrder.filter((c) => c !== draggingCode);
                let idx = filtered.indexOf(code);
                if (idx === -1)
                    return;
                if (!above)
                    idx += 1;
                filtered.splice(idx, 0, draggingCode);
                controller.setOrder(filtered);
                clearDropTargets();
            });
            row.addEventListener("dragend", () => {
                row.classList.remove("nlsc-dragging");
                row.draggable = false;
                draggingCode = null;
                clearDropTargets();
            });
        };
        const buildRow = (layer) => {
            const isUserAdded = !defaultCodes.has(layer.code);
            let refs;
            refs = renderLayerRow(layer, controller, state, isUserAdded
                ? () => {
                    callbacks.removeUserLayer(layer.code);
                    if (refs.row.parentNode === layerList)
                        layerList.removeChild(refs.row);
                    rowByCode.delete(layer.code);
                    addOption(layer);
                }
                : null);
            wireRowListeners(layer, controller, refs);
            wireDnD(refs.row, refs.grip, layer.code);
            rowByCode.set(layer.code, refs.row);
            return refs.row;
        };
        // Initial render in current order.
        for (const code of controller.getOrder()) {
            const layer = layerByCode.get(code);
            if (!layer)
                continue;
            layerList.appendChild(buildRow(layer));
        }
        // Re-arrange existing rows when the order changes (DnD drop, programmatic).
        // appendChild on an attached node moves it, so iterating top→bottom and
        // appending each row in turn ends up with them in the requested order.
        controller.onOrderChange((order) => {
            for (const code of order) {
                const row = rowByCode.get(code);
                if (row)
                    layerList.appendChild(row);
            }
        });
        addBtn.addEventListener("click", () => {
            const code = select.value;
            if (!code)
                return;
            const layer = callbacks.addUserLayer(code);
            if (!layer)
                return;
            const row = buildRow(layer);
            // New layers land at the top of the stack — see addUserLayer in index.ts.
            layerList.insertBefore(row, layerList.firstChild);
            const opt = optionByCode.get(code);
            if (opt) {
                select.removeChild(opt);
                optionByCode.delete(code);
            }
            placeholderOpt.selected = true;
        });
    }
    /** High-contrast presets chosen to remain readable over Waze's dark satellite imagery. */
    const PRESET_COLORS = [
        "#ff3b30", // red
        "#ff9500", // orange
        "#ffcc00", // yellow
        "#34c759", // lime
        "#00c7ff", // cyan
        "#ff2d92", // magenta
    ];
    function normalizeHex(value) {
        const m = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
        return m ? `#${m[1].toLowerCase()}` : null;
    }
    function renderColorControl(layer, state, controller) {
        const initial = state.color[layer.code] ?? null;
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "nlsc-swatch";
        swatch.title = "顏色";
        const popover = document.createElement("div");
        popover.className = "nlsc-popover";
        const chipRow = document.createElement("div");
        chipRow.className = "nlsc-popover-row";
        const originalChip = document.createElement("button");
        originalChip.type = "button";
        originalChip.className = "nlsc-chip nlsc-chip-original";
        originalChip.title = "原色";
        originalChip.dataset.color = "";
        chipRow.appendChild(originalChip);
        const presetChips = [];
        for (const hex of PRESET_COLORS) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "nlsc-chip";
            chip.style.backgroundColor = hex;
            chip.title = hex;
            chip.dataset.color = hex;
            chipRow.appendChild(chip);
            presetChips.push(chip);
        }
        popover.appendChild(chipRow);
        const customRow = document.createElement("div");
        customRow.className = "nlsc-popover-row";
        const customLabel = document.createElement("span");
        customLabel.className = "nlsc-popover-label";
        customLabel.textContent = "自訂";
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.className = "nlsc-color-input";
        colorInput.value = initial ?? "#ff3b30";
        customRow.appendChild(customLabel);
        customRow.appendChild(colorInput);
        popover.appendChild(customRow);
        const allChips = [originalChip, ...presetChips];
        const updateUi = (color) => {
            const normalized = color ? color.toLowerCase() : null;
            if (normalized) {
                swatch.style.backgroundColor = normalized;
                swatch.removeAttribute("data-original");
            }
            else {
                swatch.style.backgroundColor = "transparent";
                swatch.setAttribute("data-original", "true");
            }
            for (const chip of allChips) {
                const chipColor = chip.dataset.color || null;
                chip.classList.toggle("selected", (chipColor || null) === normalized);
            }
            if (normalized)
                colorInput.value = normalized;
        };
        updateUi(initial);
        const setAndClose = (color) => {
            controller.setColor(layer.code, color);
            popover.classList.remove("open");
        };
        for (const chip of allChips) {
            chip.addEventListener("click", () => {
                const value = chip.dataset.color || "";
                setAndClose(value ? value : null);
            });
        }
        // Native color input fires `input` continuously while dragging; commit on
        // `change` (release / popover close) to avoid hammering localStorage.
        colorInput.addEventListener("input", () => {
            const normalized = normalizeHex(colorInput.value);
            if (normalized)
                controller.setColor(layer.code, normalized);
        });
        // Stop clicks inside the popover from bubbling to the document-level closer.
        popover.addEventListener("click", (e) => e.stopPropagation());
        swatch.addEventListener("click", (e) => {
            e.stopPropagation();
            const willOpen = !popover.classList.contains("open");
            // Close any other open popovers in the panel.
            for (const el of document.querySelectorAll(".nlsc-popover.open")) {
                el.classList.remove("open");
            }
            if (willOpen)
                popover.classList.add("open");
        });
        return { swatch, popover, updateUi };
    }
    function renderLayerRow(layer, controller, state, onRemove) {
        const row = document.createElement("div");
        row.className = "nlsc-card";
        const headerRow = document.createElement("div");
        headerRow.className = "nlsc-row-header";
        const grip = document.createElement("span");
        grip.className = "nlsc-grip";
        grip.textContent = "⋮⋮";
        grip.title = "拖曳調整順序";
        headerRow.appendChild(grip);
        const nameWrap = document.createElement("div");
        nameWrap.className = "nlsc-name";
        const titleLine = document.createElement("span");
        titleLine.textContent = layer.title;
        titleLine.className = "nlsc-name-title";
        const codeFormatLine = document.createElement("span");
        codeFormatLine.textContent = `${layer.code} · ${layer.format}`;
        codeFormatLine.className = "nlsc-name-sub";
        nameWrap.appendChild(titleLine);
        nameWrap.appendChild(codeFormatLine);
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "nlsc-toggle";
        toggleLabel.title = "顯示／隱藏";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.visible[layer.code] ?? false;
        const toggleSlider = document.createElement("span");
        toggleSlider.className = "nlsc-toggle-slider";
        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(toggleSlider);
        headerRow.appendChild(toggleLabel);
        headerRow.appendChild(nameWrap);
        const colorCtl = renderColorControl(layer, state, controller);
        headerRow.appendChild(colorCtl.swatch);
        if (onRemove) {
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.textContent = "✕";
            removeBtn.title = "移除圖層";
            removeBtn.className = "nlsc-remove";
            removeBtn.addEventListener("click", onRemove);
            headerRow.appendChild(removeBtn);
        }
        row.appendChild(headerRow);
        row.appendChild(colorCtl.popover);
        const sliderRow = document.createElement("div");
        sliderRow.className = "nlsc-slider-row";
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.step = "1";
        slider.className = "nlsc-slider";
        const initialOpacity = state.opacity[layer.code] ?? layer.defaultOpacity;
        slider.value = String(Math.round(initialOpacity * 100));
        const valueLabel = document.createElement("span");
        valueLabel.textContent = `${slider.value}%`;
        valueLabel.className = "nlsc-value";
        sliderRow.appendChild(slider);
        sliderRow.appendChild(valueLabel);
        row.appendChild(sliderRow);
        checkbox.addEventListener("change", () => {
            controller.setVisible(layer.code, checkbox.checked);
        });
        slider.addEventListener("input", () => {
            valueLabel.textContent = `${slider.value}%`;
            controller.setOpacity(layer.code, Number(slider.value) / 100);
        });
        return { row, grip, checkbox, slider, valueLabel, updateColorUi: colorCtl.updateUi };
    }
    function wireRowListeners(layer, controller, refs) {
        controller.onVisibleChange((code, visible) => {
            if (code !== layer.code)
                return;
            if (refs.checkbox.checked !== visible)
                refs.checkbox.checked = visible;
        });
        controller.onOpacityChange((code, opacity) => {
            if (code !== layer.code)
                return;
            const pct = Math.round(opacity * 100);
            if (Number(refs.slider.value) !== pct) {
                refs.slider.value = String(pct);
                refs.valueLabel.textContent = `${pct}%`;
            }
        });
        controller.onColorChange((code, color) => {
            if (code !== layer.code)
                return;
            refs.updateColorUi(color);
        });
    }

    /**
     * Single source of truth for layer visibility/opacity/color. Both the sidebar
     * and the WME LayerSwitcher route their user actions through this controller;
     * listeners fan changes back out so each UI surface mirrors the others.
     */
    class NlscController {
        constructor(state, bindings) {
            this.state = state;
            this.visListeners = [];
            this.opListeners = [];
            this.colorListeners = [];
            this.orderListeners = [];
            this.byCode = new Map(bindings.map((b) => [b.layer.code, b]));
        }
        setVisible(code, visible) {
            const b = this.byCode.get(code);
            if (!b)
                return;
            // Idempotent guard: prevents echo loops when one UI surface broadcasts to the other.
            if ((this.state.visible[code] ?? false) === visible)
                return;
            b.setLayerVisible(visible);
            this.state.visible[code] = visible;
            saveState(this.state);
            for (const fn of this.visListeners)
                fn(code, visible);
        }
        setOpacity(code, opacity) {
            const b = this.byCode.get(code);
            if (!b)
                return;
            b.setLayerOpacity(opacity);
            this.state.opacity[code] = opacity;
            saveState(this.state);
            for (const fn of this.opListeners)
                fn(code, opacity);
        }
        setColor(code, color) {
            const b = this.byCode.get(code);
            if (!b)
                return;
            if ((this.state.color[code] ?? null) === color)
                return;
            b.setLayerColor(color);
            this.state.color[code] = color;
            saveState(this.state);
            for (const fn of this.colorListeners)
                fn(code, color);
        }
        addBinding(binding) {
            this.byCode.set(binding.layer.code, binding);
        }
        removeBinding(code) {
            this.byCode.delete(code);
        }
        getOrder() {
            return this.state.layerOrder;
        }
        /**
         * Replace the stacking order. Unknown codes (no registered binding) are
         * dropped. No-op if the resulting array matches the current order, which
         * keeps DnD drop events from looping back through onOrderChange.
         */
        setOrder(order) {
            const cleaned = order.filter((c) => this.byCode.has(c));
            if (arraysEqual(cleaned, this.state.layerOrder))
                return;
            this.state.layerOrder = [...cleaned];
            saveState(this.state);
            for (const fn of this.orderListeners)
                fn(this.state.layerOrder);
        }
        onVisibleChange(handler) {
            this.visListeners.push(handler);
        }
        onOpacityChange(handler) {
            this.opListeners.push(handler);
        }
        onColorChange(handler) {
            this.colorListeners.push(handler);
        }
        onOrderChange(handler) {
            this.orderListeners.push(handler);
        }
    }
    function arraysEqual(a, b) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (a[i] !== b[i])
                return false;
        return true;
    }

    /**
     * Per-layer color tinting via SVG `<feColorMatrix>`.
     *
     * NLSC's TOWN/CITY/etc. boundary tiles are pre-rendered PNGs with black
     * strokes on a transparent background — server-side recoloring is impossible
     * and canvas pixel manipulation would require CORS headers NLSC does not send
     * (tainted canvas, broken tiles). Applying an SVG filter to the OpenLayers
     * layer `<div>` recolors every visible pixel while preserving alpha, so
     * anti-aliased edges stay smooth and only the stroke color changes.
     *
     * The matrix `[0 0 0 0 R; 0 0 0 0 G; 0 0 0 0 B; 0 0 0 1 0]` discards the input
     * RGB and emits the constant chosen color; the alpha row is identity, so
     * transparent pixels stay transparent.
     */
    const SVG_NS = "http://www.w3.org/2000/svg";
    const DEFS_ID = "nlsc-tint-defs";
    let defsEl = null;
    function ensureDefs() {
        if (defsEl && defsEl.isConnected)
            return defsEl;
        const existing = document.getElementById(DEFS_ID);
        if (existing && existing instanceof SVGSVGElement) {
            const defs = existing.querySelector("defs");
            if (defs) {
                defsEl = defs;
                return defsEl;
            }
        }
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.id = DEFS_ID;
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.setAttribute("aria-hidden", "true");
        svg.style.position = "absolute";
        svg.style.width = "0";
        svg.style.height = "0";
        svg.style.overflow = "hidden";
        const defs = document.createElementNS(SVG_NS, "defs");
        svg.appendChild(defs);
        document.body.appendChild(svg);
        defsEl = defs;
        return defsEl;
    }
    function filterId(code) {
        return `nlsc-tint-${code.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    }
    function hexToRgbFloat(hex) {
        const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
        if (!m)
            return null;
        const n = parseInt(m[1], 16);
        return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    }
    /**
     * Returns the CSS `filter` value to apply (e.g., `url(#nlsc-tint-TOWN)`) for
     * the given color, or an empty string when no tint should be applied. The
     * SVG `<filter>` node is created/updated as a side effect.
     */
    function filterForColor(code, color) {
        if (!color)
            return "";
        const rgb = hexToRgbFloat(color);
        if (!rgb)
            return "";
        const id = filterId(code);
        const defs = ensureDefs();
        let filter = defs.querySelector(`#${CSS.escape(id)}`);
        let matrix = null;
        if (!filter) {
            filter = document.createElementNS(SVG_NS, "filter");
            filter.id = id;
            filter.setAttribute("color-interpolation-filters", "sRGB");
            matrix = document.createElementNS(SVG_NS, "feColorMatrix");
            matrix.setAttribute("type", "matrix");
            filter.appendChild(matrix);
            defs.appendChild(filter);
        }
        else {
            matrix = filter.querySelector("feColorMatrix");
        }
        if (matrix) {
            const [r, g, b] = rgb;
            matrix.setAttribute("values", `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0`);
        }
        return `url(#${id})`;
    }

    /**
     * Decide whether `layer` belongs in the bottom imagery band.
     *
     * Heuristic intentionally broad — any new aerial source WME ships will most
     * likely land in `earthengine-legacy` or carry isBaseLayer, so this stays
     * useful without per-layer maintenance.
     */
    function isImageryLayer(layer, base) {
        if (layer === base)
            return true;
        const l = layer;
        if (l && l.isBaseLayer === true)
            return true;
        if (l && l.name === "satellite_imagery")
            return true;
        if (l && l.project === "earthengine-legacy")
            return true;
        return false;
    }
    function restackLayers(olMap, tileLayersByCode, order) {
        const base = olMap.baseLayer;
        const snapshot = [...olMap.layers];
        const nlscSet = new Set(Array.from(tileLayersByCode.values()));
        // Resolve `order` codes to actual layer instances, in sidebar order.
        const bandTopFirst = [];
        for (const code of order) {
            const layer = tileLayersByCode.get(code);
            if (layer && snapshot.includes(layer))
                bandTopFirst.push(layer);
        }
        // Array end = visually top, so reverse before writing: the bottom-of-band
        // layer goes first (lowest index), the top-of-band layer last (highest).
        const bandLowestFirst = bandTopFirst.slice().reverse();
        // Imagery first (preserve existing relative order so toggling one aerial
        // on/off doesn't shuffle the others), then our band, then everything else.
        const imagery = snapshot.filter((l) => !nlscSet.has(l) && isImageryLayer(l, base));
        const others = snapshot.filter((l) => !nlscSet.has(l) && !isImageryLayer(l, base));
        const target = [...imagery, ...bandLowestFirst, ...others];
        // Skip no-op writes — each setLayerIndex re-applies CSS z-indexes across
        // every layer in olMap.layers, so suppressing redundant calls matters.
        for (let i = 0; i < target.length; i++) {
            if (olMap.getLayerIndex(target[i]) !== i) {
                olMap.setLayerIndex(target[i], i);
            }
        }
    }

    /// <reference types="wme-sdk-typings" />
    /**
     * WME NLSC Overlay — Entry point
     *
     * Phases 1–4: gate to top frame, await SDK, register NLSC tile layers on the WME
     * OpenLayers map, render sidebar UI with visibility + opacity controls persisted to
     * localStorage, and integrate with the WME LayerSwitcher panel (bidirectional sync).
     */
    const SCRIPT_ID = "wme-nlsc-overlay";
    const SCRIPT_NAME = "WME NLSC Overlay";
    (async () => {
        // WME SDK is never in nested frames; bail to avoid noise.
        if (window.top !== window.self)
            return;
        if (window.location.hostname !== "www.waze.com")
            return;
        console.log(`[${SCRIPT_ID}] loaded`);
        // Under Tampermonkey, `window` is a sandboxed proxy and the WME globals
        // (`SDK_INITIALIZED`, `getWmeSdk`, `OL`, `W`) only live on the real page
        // window, which `@grant unsafeWindow` exposes as `unsafeWindow`. Direct
        // `window.SDK_INITIALIZED` returns `undefined` in the sandbox, so the
        // script awaits `undefined` (resolves to `undefined`), then `getWmeSdk`
        // is `undefined` and the script throws before reaching `registerScriptTab`
        // — the userscript silently fails to add its tab.
        const uw = window.unsafeWindow ?? window;
        await uw.SDK_INITIALIZED;
        const sdk = uw.getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });
        console.log(`[${SCRIPT_ID}] wme ready`, sdk);
        const OL = uw.OL;
        const olMap = uw.W?.map?.olMap;
        if (!OL || !olMap) {
            console.warn(`[${SCRIPT_ID}] OpenLayers or W.map.olMap unavailable; skipping tile registration`);
            return;
        }
        const state = loadState();
        // Web-mercator ground resolution (m/pixel) at z=0 for 256px tiles. This is
        // the OL 2.x spherical-mercator default and matches NLSC's GoogleMapsCompatible
        // ScaleDenominator at z=0 (≈ 559082264 * 0.00028 m).
        const WEB_MERCATOR_RES_Z0 = 156543.0339280410;
        // OL 2.x XYZ keys `serverResolutions[i]` to OL zoom `i` (0-based) and fills
        // the URL's `${z}` placeholder with that same index. So the array must always
        // start at z=0 — if we started at `minZoom`, OL would render the server's
        // z=minZoom tile at OL zoom 0 and request URL `…/0/y/x`, scrambling tiles.
        const buildServerResolutions = (maxZoom) => {
            const out = [];
            for (let z = 0; z <= maxZoom; z++) {
                out.push(WEB_MERCATOR_RES_Z0 / Math.pow(2, z));
            }
            return out;
        };
        // OL 2.x layers create `this.div` during initialize, so `.div` is available
        // immediately after construction — we can apply the SVG tint filter before
        // the layer is even added to the map.
        const applyFilter = (tileLayer, code, color) => {
            const div = tileLayer.div;
            if (!div)
                return;
            div.style.filter = filterForColor(code, color);
        };
        // OL tile layers indexed by NLSC code so the restacker can look them up
        // without scanning olMap.layers. Defaults + user-added entries both register
        // here via createTileLayer.
        const tileLayersByCode = new Map();
        // Re-stack every NLSC overlay just above the base layer (algorithm lives in
        // ./restack so it can be unit-tested). Called at startup, on order changes,
        // and on olMap addlayer/removelayer events further below.
        const restackAll = () => {
            restackLayers(olMap, tileLayersByCode, state.layerOrder);
        };
        // NLSC WMTS axis order is /{z}/{y}/{x} — not slippy /{z}/{x}/{y}. OL 2.x
        // XYZ expands `${z}` / `${x}` / `${y}` placeholders verbatim, so swapping
        // x and y in the template handles the axis order naturally.
        const createTileLayer = (layer, visible, opacity, color) => {
            const urlTemplate = `https://wmts.nlsc.gov.tw/wmts/${layer.code}/default/GoogleMapsCompatible/\${z}/\${y}/\${x}`;
            const tileLayer = new OL.Layer.XYZ(layer.name, urlTemplate, {
                sphericalMercator: true,
                isBaseLayer: false,
                opacity,
                visibility: visible,
                attribution: layer.attribution,
                // `serverResolutions` lists the resolutions the server actually publishes.
                // When WME's map zooms past the layer's real cap, OL clamps to the highest
                // server resolution and upscales that tile, avoiding 404s on non-existent
                // deeper zoom levels. `transitionEffect: 'resize'` smooths the upscale.
                serverResolutions: buildServerResolutions(layer.maxZoom),
                transitionEffect: "resize",
            });
            tileLayer.nlscCode = layer.code;
            olMap.addLayer(tileLayer);
            tileLayersByCode.set(layer.code, tileLayer);
            applyFilter(tileLayer, layer.code, color);
            return tileLayer;
        };
        const bindingFor = (layer, tileLayer) => ({
            layer,
            setLayerVisible: (v) => tileLayer.setVisibility(v),
            setLayerOpacity: (o) => tileLayer.setOpacity(o),
            setLayerColor: (c) => applyFilter(tileLayer, layer.code, c),
        });
        const defaultEntries = NLSC_LAYERS.map((layer) => {
            const initialVisible = state.visible[layer.code] ?? false;
            const initialOpacity = state.opacity[layer.code] ?? layer.defaultOpacity;
            const initialColor = state.color[layer.code] ?? null;
            const tileLayer = createTileLayer(layer, initialVisible, initialOpacity, initialColor);
            return { layer, tileLayer };
        });
        uw.__nlscLayers = defaultEntries;
        console.log(`[${SCRIPT_ID}] registered ${defaultEntries.length} default NLSC tile layers`);
        const controller = new NlscController(state, defaultEntries.map(({ layer, tileLayer }) => bindingFor(layer, tileLayer)));
        // Track which checkbox names we successfully registered with the SDK, so
        // remove/setChecked calls don't blow up on names the SDK never accepted.
        const registeredCheckboxes = new Set();
        const safeAddCheckbox = (name, isChecked) => {
            try {
                sdk.LayerSwitcher.addLayerCheckbox({ name, isChecked });
                registeredCheckboxes.add(name);
            }
            catch (err) {
                // Most common cause: InvalidStateError on a duplicate name. The sidebar
                // row is the primary UI surface, so we keep going rather than aborting.
                console.warn(`[${SCRIPT_ID}] addLayerCheckbox(${name}) failed`, err);
            }
        };
        for (const layer of NLSC_LAYERS) {
            safeAddCheckbox(layer.name, state.visible[layer.code] ?? false);
        }
        // Fetch the NLSC WMTS layer catalog. Defaults already cover the common
        // cases, so a fetch failure is non-fatal — the dropdown just shows empty.
        const defaultCodes = new Set(NLSC_LAYERS.map((l) => l.code));
        let catalog = [];
        try {
            catalog = (await fetchCatalog()).filter((l) => !defaultCodes.has(l.code));
            console.log(`[${SCRIPT_ID}] fetched ${catalog.length} layers from NLSC capabilities`);
        }
        catch (err) {
            console.warn(`[${SCRIPT_ID}] NLSC catalog fetch failed`, err);
        }
        // User-added catalog layers — restored from localStorage. Keep a handle to
        // each OL layer so we can remove it when the user deletes the row.
        const userTileLayers = new Map();
        const registerCatalogLayer = (layer, visible, opacity, color) => {
            const tileLayer = createTileLayer(layer, visible, opacity, color);
            userTileLayers.set(layer.code, tileLayer);
            controller.addBinding(bindingFor(layer, tileLayer));
            safeAddCheckbox(layer.name, visible);
        };
        for (const code of state.userLayers) {
            const layer = catalog.find((l) => l.code === code);
            if (!layer)
                continue;
            const visible = state.visible[code] ?? false;
            const opacity = state.opacity[code] ?? layer.defaultOpacity;
            const color = state.color[code] ?? null;
            registerCatalogLayer(layer, visible, opacity, color);
        }
        // Resolve a layer (default or catalog) by checkbox name / code for bidirectional sync.
        const allKnownLayers = () => [...NLSC_LAYERS, ...catalog];
        sdk.Events.on({
            eventName: "wme-layer-checkbox-toggled",
            eventHandler: ({ checked, name }) => {
                const layer = allKnownLayers().find((l) => l.name === name);
                if (!layer)
                    return;
                controller.setVisible(layer.code, checked);
            },
        });
        controller.onVisibleChange((code, visible) => {
            const layer = allKnownLayers().find((l) => l.code === code);
            if (!layer || !registeredCheckboxes.has(layer.name))
                return;
            try {
                sdk.LayerSwitcher.setLayerCheckboxChecked({ name: layer.name, isChecked: visible });
            }
            catch {
                // checkbox may have been removed; ignore.
            }
        });
        const addUserLayer = (code) => {
            if (userTileLayers.has(code))
                return null;
            const layer = catalog.find((l) => l.code === code);
            if (!layer)
                return null;
            const visible = state.visible[code] ?? true;
            const opacity = state.opacity[code] ?? layer.defaultOpacity;
            const color = state.color[code] ?? null;
            registerCatalogLayer(layer, visible, opacity, color);
            if (!state.userLayers.includes(code))
                state.userLayers.push(code);
            state.visible[code] = visible;
            state.opacity[code] = opacity;
            // New layers slot in at the top of the stack (sidebar top).
            state.layerOrder = [code, ...state.layerOrder.filter((c) => c !== code)];
            saveState(state);
            restackAll();
            return layer;
        };
        const removeUserLayer = (code) => {
            const tileLayer = userTileLayers.get(code);
            if (!tileLayer)
                return;
            olMap.removeLayer(tileLayer);
            userTileLayers.delete(code);
            tileLayersByCode.delete(code);
            const layer = catalog.find((l) => l.code === code);
            if (layer && registeredCheckboxes.has(layer.name)) {
                try {
                    sdk.LayerSwitcher.removeLayerCheckbox({ name: layer.name });
                }
                catch {
                    // ignore — checkbox may have been cleared already.
                }
                registeredCheckboxes.delete(layer.name);
            }
            controller.removeBinding(code);
            state.userLayers = state.userLayers.filter((c) => c !== code);
            state.layerOrder = state.layerOrder.filter((c) => c !== code);
            delete state.visible[code];
            delete state.opacity[code];
            delete state.color[code];
            saveState(state);
            restackAll();
        };
        // Reconcile persisted order against what's actually registered. Drop any
        // stale codes (catalog layer that no longer exists), and prepend newly-
        // registered codes (e.g. a newly-added default) at the top of the stack.
        // Migration default for users whose state predates this field: user-added
        // layers on top (matches the previous registration-order stacking), then
        // defaults below in declared order — first-declared sits at the bottom.
        const registeredCodes = new Set(tileLayersByCode.keys());
        if (state.layerOrder.length === 0) {
            state.layerOrder = [
                ...state.userLayers.filter((c) => registeredCodes.has(c)).slice().reverse(),
                ...NLSC_LAYERS.map((l) => l.code).slice().reverse(),
            ];
        }
        else {
            const existing = new Set(state.layerOrder);
            const missing = [...registeredCodes].filter((c) => !existing.has(c));
            state.layerOrder = [
                ...missing, // new registrations appear at the top
                ...state.layerOrder.filter((c) => registeredCodes.has(c)),
            ];
        }
        // Re-entry guard: every `setLayerIndex` call we make inside restackAll
        // fires a `changelayer` event, which we also subscribe to below. Without
        // this flag we'd loop forever as soon as the first restack runs.
        let restacking = false;
        const guardedRestack = () => {
            if (restacking)
                return;
            restacking = true;
            try {
                restackAll();
            }
            finally {
                restacking = false;
            }
        };
        saveState(state);
        guardedRestack();
        controller.onOrderChange(() => guardedRestack());
        // What we observed in real WME: toggling "Satellite imagery" in the layer
        // panel does NOT fire `addlayer`/`removelayer` on olMap. Instead WME
        // shuffles the existing satellite layer's array position via
        // `setLayerIndex` and/or flips its visibility, both of which fire
        // `changelayer`. So we subscribe to a broader set of layer-mutation
        // events and coalesce bursts into a single restack via a short setTimeout.
        // The restack itself is idempotent (no setLayerIndex calls when already
        // ordered correctly), so the periodic safety net below is essentially free.
        let restackScheduled = false;
        const scheduleRestack = (label) => {
            if (restackScheduled)
                return;
            restackScheduled = true;
            setTimeout(() => {
                restackScheduled = false;
                console.debug(`[${SCRIPT_ID}] restack: ${label}`);
                guardedRestack();
            }, 50);
        };
        const olEventNames = ["addlayer", "removelayer", "changelayer", "changebaselayer"];
        for (const name of olEventNames) {
            try {
                olMap.events.register(name, null, () => scheduleRestack(`ol:${name}`));
            }
            catch (err) {
                console.warn(`[${SCRIPT_ID}] could not subscribe to olMap '${name}'`, err);
            }
        }
        // Defensive: WME may also mutate layers through paths we haven't traced
        // (e.g. internal Backbone events that don't propagate to olMap.events).
        // Re-stack every 2s as a safety net — idempotent, so it's a cheap diff.
        // Stops walking the layer list once the user navigates away by clearing
        // on `pagehide`.
        const safetyTimer = setInterval(() => scheduleRestack("safety-tick"), 2000);
        window.addEventListener("pagehide", () => clearInterval(safetyTimer));
        const { tabLabel, tabPane } = await sdk.Sidebar.registerScriptTab();
        renderSidebar(tabLabel, tabPane, NLSC_LAYERS, controller, state, {
            catalog,
            addUserLayer,
            removeUserLayer,
        });
    })();

})();
