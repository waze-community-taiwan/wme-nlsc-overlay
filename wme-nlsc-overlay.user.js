// ==UserScript==
// @name        WME NLSC Overlay
// @description Overlay Taiwan NLSC WMTS tiles in Waze Map Editor
// @namespace   https://github.com/waze-community-taiwan/wme-nlsc-overlay
// @version     0.5.0
// @author      Waze Community Taiwan
// @license     MIT
// @match       https://www.waze.com/*editor*
// @match       https://beta.waze.com/*editor*
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

    const __SCRIPT_VERSION__ = "0.5.0";

    // NLSC WMTS template: https://wmts.nlsc.gov.tw/wmts/{LAYER}/default/GoogleMapsCompatible/{z}/{y}/{x}  (note: {y} before {x} — WMTS axis order, NOT slippy)
    const NLSC_ATTRIBUTION = "© 內政部國土測繪中心 NLSC";
    /**
     * First-install seed layers. Pre-registered on a fresh state, but user-removable
     * via the sidebar ✕ button. Once removed, they can be re-added from the catalog
     * dropdown like any other catalog layer.
     */
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
    /** Default floating-box settings, used on fresh installs and as fallbacks. */
    function defaultFloatBox() {
        return { enabled: true, opacity: 0.9, x: null, y: null };
    }
    /**
     * Validate the persisted `floatBox` defensively, matching the tolerant style of
     * the rest of [[loadState]]. Missing key or invalid fields fall back to the
     * defaults so older states (no `floatBox`) and corrupt values stay safe.
     */
    function parseFloatBox(value) {
        if (typeof value !== "object" || value === null)
            return defaultFloatBox();
        const raw = value;
        const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
        const opacity = typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
            ? Math.min(1.0, Math.max(0.1, raw.opacity))
            : 0.9;
        const x = typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : null;
        const y = typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : null;
        return { enabled, opacity, x, y };
    }
    function emptyState() {
        return {
            visible: {},
            opacity: {},
            userLayers: [],
            removedDefaults: [],
            color: {},
            aboveCode: null,
            layerOrder: [],
            floatBox: defaultFloatBox(),
        };
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
            const layerOrder = parsed && Array.isArray(parsed.layerOrder)
                ? parsed.layerOrder.filter((c) => typeof c === "string")
                : [];
            // `aboveCode` is the new single-slot model. If the persisted state was
            // written by a previous version that used `above: Record<string, boolean>`,
            // migrate: pick whichever true-entry is highest in layerOrder (= topmost
            // in the sidebar) so the user's most-recent intent survives. Falls back
            // to the first true key if no order is recorded.
            let aboveCode = null;
            const parsedAny = parsed;
            if (typeof parsedAny?.aboveCode === "string") {
                aboveCode = parsedAny.aboveCode;
            }
            else if (parsedAny?.aboveCode === null) {
                aboveCode = null;
            }
            else if (parsedAny?.above && typeof parsedAny.above === "object") {
                const truthy = [];
                for (const [k, v] of Object.entries(parsedAny.above)) {
                    if (v === true)
                        truthy.push(k);
                }
                if (truthy.length === 1) {
                    aboveCode = truthy[0];
                }
                else if (truthy.length > 1) {
                    const set = new Set(truthy);
                    aboveCode = layerOrder.find((c) => set.has(c)) ?? truthy[0];
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
                aboveCode,
                userLayers: parsed && Array.isArray(parsed.userLayers)
                    ? parsed.userLayers.filter((c) => typeof c === "string")
                    : [],
                removedDefaults: parsed && Array.isArray(parsed.removedDefaults)
                    ? parsed.removedDefaults.filter((c) => typeof c === "string")
                    : [],
                layerOrder,
                floatBox: parseFloatBox(parsed?.floatBox),
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

    /**
     * Terms-of-service dialog. Adds a "服務使用條款" footer link to the sidebar
     * that opens a modal with the full TOS text. Content mirrors TERMS.md in the
     * repo root; keep both in sync when editing.
     */
    const STYLE_ID$2 = "nlsc-terms-styles";
    const STYLES = `
.nlsc-terms-footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--hairline, rgba(128,128,128,0.18)); text-align: center; }
.nlsc-terms-link { background: none; border: none; padding: 2px 6px; color: #2d6cdf; cursor: pointer; font-size: 12px; opacity: 0.85; text-decoration: underline; text-underline-offset: 2px; }
.nlsc-terms-link:hover { opacity: 1; }
.nlsc-terms-link:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(45,108,223,0.3); border-radius: 4px; }

.nlsc-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 24px; }
.nlsc-modal { background: var(--background_default, #fff); color: inherit; border-radius: 12px; max-width: 720px; width: 100%; max-height: 100%; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,0.32); }
.nlsc-modal-header { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--hairline, rgba(128,128,128,0.2)); }
.nlsc-modal-title { flex: 1; font-size: 15px; font-weight: 600; margin: 0; }
.nlsc-modal-close { background: transparent; border: none; color: inherit; cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 16px; line-height: 1; opacity: 0.6; }
.nlsc-modal-close:hover { opacity: 1; background: rgba(255,59,48,0.12); color: #ff3b30; }
.nlsc-modal-body { padding: 14px 18px 18px; overflow-y: auto; font-size: 13px; line-height: 1.65; }
.nlsc-modal-body h3 { font-size: 13.5px; font-weight: 600; margin: 16px 0 6px; }
.nlsc-modal-body h3:first-child { margin-top: 0; }
.nlsc-modal-body p { margin: 0 0 8px; }
.nlsc-modal-body ol, .nlsc-modal-body ul { margin: 4px 0 8px; padding-left: 22px; }
.nlsc-modal-body li { margin: 3px 0; }
.nlsc-modal-body a { color: #2d6cdf; }
.nlsc-modal-body strong { font-weight: 600; }
.nlsc-modal-body .nlsc-terms-meta { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--hairline, rgba(128,128,128,0.2)); font-size: 11.5px; opacity: 0.7; }

[wz-theme="dark"] .nlsc-modal { background: #1f2024; }
[wz-theme="dark"] .nlsc-modal-header { border-bottom-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-modal-body .nlsc-terms-meta { border-top-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-terms-footer { border-top-color: rgba(255,255,255,0.1); }
`;
    function injectStyles$2() {
        if (typeof document === "undefined")
            return;
        if (document.getElementById(STYLE_ID$2))
            return;
        const style = document.createElement("style");
        style.id = STYLE_ID$2;
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
    const TERMS_HTML = `
<p><strong>WME NLSC Overlay</strong>（以下簡稱「本套件」）是由 Waze Community Taiwan 開發的個人使用 Tampermonkey 使用者腳本，於 Waze Map Editor（WME）中疊加內政部國土測繪中心（以下簡稱「國土測繪中心」）所提供之國土測繪圖資服務雲 (<a href="https://maps.nlsc.gov.tw" target="_blank" rel="noopener">https://maps.nlsc.gov.tw</a>) WMTS 圖磚作為視覺參考圖層。當您安裝、啟用或使用本套件時，即代表您無條件同意本使用條款：</p>

<h3>一、服務性質</h3>
<ol>
  <li>本套件係指由本專案維護者所發佈之 Tampermonkey 使用者腳本，其唯一功能為：在使用者本機瀏覽器內，向國土測繪中心 OGC WMTS 圖磚服務請求圖磚，並將其顯示於 Waze Map Editor 地圖畫面上。</li>
  <li>本套件不儲存、不轉售、不重新散布國土測繪中心之任何圖資內容；所有圖磚皆由使用者本機瀏覽器直接向國土測繪中心取得。</li>
  <li>本套件並非 Waze 或國土測繪中心之官方產品，亦未與任一方建立合作、贊助、背書或代理關係。</li>
</ol>

<h3>二、與國土測繪中心條款之關係</h3>
<ol>
  <li>本套件實際使用之圖磚資料來源為國土測繪中心國土測繪圖資服務雲。當您使用本套件時，等同於透過本套件使用該服務，<strong>您必須一併遵守國土測繪中心所公告之《服務使用條款》</strong>。</li>
  <li>若本條款與國土測繪中心《服務使用條款》就同一事項規範有所衝突，<strong>就圖資使用之部分，以國土測繪中心《服務使用條款》為準</strong>。</li>
  <li>國土測繪中心《服務使用條款》中關於下列事項之規範，對使用者具有完整拘束力，本套件僅就重點摘錄如下，使用者仍應以國土測繪中心公告之原文為準：
    <ul>
      <li><strong>合法用途：</strong>得於網路、影片、宣導用印刷品或論文發表等合法用途中公開顯示內容並附上來源資訊，<strong>但不得大量下載內容</strong>。</li>
      <li><strong>著作權保護：</strong>圖磚中可能包含國土測繪中心之識別資料、版權或著作權聲明等註記或符號，<strong>不得以任何方式改變、移除或遮蔽</strong>。</li>
      <li><strong>使用限制：</strong>國土測繪中心得隨時根據系統設定限制使用次數、資料量或網路頻寬，無須事先聲明。</li>
      <li><strong>服務變動：</strong>國土測繪中心保留未來中止服務、改成付費服務、在地圖上放置廣告等權利，並得隨時修改、暫停或終止服務。</li>
    </ul>
  </li>
  <li>本套件維護者得配合國土測繪中心服務之異動，隨時調整本套件圖層設定、預設來源網址或停用相關功能，無須事先通知。</li>
</ol>

<h3>三、與 Waze 之關係</h3>
<ol>
  <li>本套件並非 Waze 官方工具，亦未經 Waze, Inc. 或其關係企業審查、認可或背書。</li>
  <li>使用本套件時，您仍須遵守 Waze Map Editor 之服務條款、編輯規範與當地社群守則。因使用本套件造成 Waze 帳號權益受損（包含但不限於編輯權限調整、停權等），由使用者自行承擔，本套件維護者不負任何責任。</li>
</ol>

<h3>四、合理使用與禁止行為</h3>
<p>使用本套件時，您不得從事下列行為：</p>
<ol>
  <li>大量、自動化或批次下載國土測繪中心圖磚至本機儲存、再散布或商業利用。</li>
  <li>改造本套件以繞過國土測繪中心對於使用次數、資料量、頻寬之限制。</li>
  <li>移除、改變或遮蔽圖磚上之版權聲明、識別資料或浮水印。</li>
  <li>將本套件取得之圖磚作為付費服務、登入會員才可瀏覽之圖資、或其他違反國土測繪中心《服務使用條款》之用途。</li>
  <li>將圖磚或衍生內容用於違反中華民國法令、Waze 服務條款或公共秩序善良風俗之用途。</li>
</ol>

<h3>五、免責聲明</h3>
<ol>
  <li>本套件以「現狀」（AS IS）提供，本套件維護者<strong>不就</strong>本套件之可用性、及時性、安全性、正確性或可靠性提供任何明示或默示擔保。</li>
  <li>國土測繪中心對其服務之可用性、及時性、安全性、可靠性及圖資正確性不負任何責任；同理，本套件維護者就因國土測繪中心服務異常、圖資錯誤、服務中斷或變動所造成之任何損失，亦不負任何責任。</li>
  <li>您因使用、無法使用、或誤用本套件所造成之任何直接、間接、附隨、特別或衍生性損害（包含但不限於 Waze 編輯錯誤、帳號權益損失、資料遺失），由使用者自行承擔全部風險。</li>
  <li>您經由本套件、本套件維護者或其相關討論管道所取得之任何建議或資訊，無論口頭或書面，若造成任何損失，本套件維護者均不承擔任何責任。</li>
</ol>

<h3>六、服務變動與終止</h3>
<ol>
  <li>本套件維護者得隨時於未事前通知之情況下，修改、暫停、終止或下架本套件之全部或部分功能。</li>
  <li>國土測繪中心若中止、變更或對 WMTS 服務增列收費或其他條件，本套件得隨之停用相關圖層或整體功能，使用者不得異議。</li>
  <li>本套件將持續更新；您可能需要配合升級至最新版本以維持正常運作，更新訊息將於本專案 <a href="https://github.com/waze-community-taiwan/wme-nlsc-overlay" target="_blank" rel="noopener">GitHub 頁面</a> 公布。</li>
</ol>

<h3>七、智慧財產權</h3>
<ol>
  <li>本套件原始碼依 MIT License 授權釋出，著作權人為 Waze Community Taiwan。</li>
  <li>國土測繪中心圖磚（包含但不限於 EMAP、TOWN、CITY、LANDSECT 等系列）之著作權、識別標誌及相關權利，<strong>全部歸屬於國土測繪中心或其原始權利人</strong>，本套件不主張任何權利，亦未取得任何授權，您透過本套件取得圖磚並不代表您取得任何著作權。</li>
</ol>

<h3>八、條款修改</h3>
<p>本套件維護者保留隨時修改本使用條款之權利，修改後之條款於本專案 GitHub 倉庫公告時生效。您於條款修改後繼續使用本套件，即視為同意修改後之條款。</p>

<h3>九、準據法與管轄</h3>
<p>本使用條款之解釋與適用以中華民國法令為準據法。因本條款所生之爭議，以臺灣臺北地方法院為第一審管轄法院。</p>

<h3>十、解釋權</h3>
<p>本使用條款若有疑義或未盡事宜，本套件維護者保留最終解釋權；涉及國土測繪中心圖資使用之部分，以國土測繪中心公告之解釋為準。</p>

<p class="nlsc-terms-meta">聯絡方式：<a href="https://github.com/waze-community-taiwan/wme-nlsc-overlay/issues" target="_blank" rel="noopener">GitHub Issues</a>　·　最後更新日期：2026 年 5 月 25 日</p>
`;
    function openTermsDialog() {
        injectStyles$2();
        if (document.querySelector(".nlsc-modal-backdrop"))
            return;
        const backdrop = document.createElement("div");
        backdrop.className = "nlsc-modal-backdrop";
        const modal = document.createElement("div");
        modal.className = "nlsc-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "nlsc-terms-title");
        const header = document.createElement("div");
        header.className = "nlsc-modal-header";
        const title = document.createElement("h2");
        title.id = "nlsc-terms-title";
        title.className = "nlsc-modal-title";
        title.textContent = "服務使用條款";
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "nlsc-modal-close";
        closeBtn.title = "關閉";
        closeBtn.setAttribute("aria-label", "關閉");
        closeBtn.textContent = "✕";
        header.appendChild(title);
        header.appendChild(closeBtn);
        const body = document.createElement("div");
        body.className = "nlsc-modal-body";
        body.innerHTML = TERMS_HTML;
        modal.appendChild(header);
        modal.appendChild(body);
        backdrop.appendChild(modal);
        const close = () => {
            backdrop.remove();
            document.removeEventListener("keydown", onKey);
        };
        const onKey = (e) => {
            if (e.key === "Escape")
                close();
        };
        closeBtn.addEventListener("click", close);
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop)
                close();
        });
        modal.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("keydown", onKey);
        document.body.appendChild(backdrop);
        closeBtn.focus();
    }
    function renderTermsLink(container) {
        injectStyles$2();
        const footer = document.createElement("div");
        footer.className = "nlsc-terms-footer";
        const link = document.createElement("button");
        link.type = "button";
        link.className = "nlsc-terms-link";
        link.textContent = "服務使用條款";
        link.addEventListener("click", () => openTermsDialog());
        footer.appendChild(link);
        container.appendChild(footer);
        return link;
    }

    const STYLE_ID$1 = "nlsc-styles";
    const NLSC_STYLES = `
/* WME's registered script tab pane is a bare container with no inner padding,
   so our content would otherwise hug both sidebar edges. Add our own gutter. */
.nlsc-panel { font-size: 13px; padding: 0 12px; }
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

/* "Above WME objects" icon button — distinctly different SHAPE (square)
   from the pill toggle on the left, so the two cannot be visually confused.
   SVG glyph depicts a "bring to front" stack: a dim back square + a
   filled front square. The button itself becomes orange when active. */
.nlsc-above-btn { flex-shrink: 0; width: 26px; height: 22px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.35); background: transparent; color: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.15s, background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.05s; }
.nlsc-above-btn:hover { opacity: 1; }
.nlsc-above-btn:active { transform: scale(0.94); }
.nlsc-above-btn[aria-pressed="true"] { background: #ff9500; border-color: #ff9500; color: #fff; opacity: 1; }
.nlsc-above-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,149,0,0.35); }
.nlsc-above-btn svg { width: 14px; height: 14px; display: block; pointer-events: none; }

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
    function injectStyles$1() {
        if (typeof document === "undefined")
            return;
        if (document.getElementById(STYLE_ID$1))
            return;
        const style = document.createElement("style");
        style.id = STYLE_ID$1;
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
        injectStyles$1();
        tabLabel.textContent = "NLSC Overlay";
        tabPane.classList.add("nlsc-panel");
        const heading = document.createElement("h4");
        heading.textContent = callbacks.version
            ? `NLSC Overlay v${callbacks.version}`
            : "NLSC Overlay";
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
        // Filter against the live registered set (state.layerOrder) rather than
        // userLayers alone, so defaults that have been removed reappear in the picker.
        const registeredCodes = new Set(state.layerOrder);
        for (const layer of callbacks.catalog) {
            if (!registeredCodes.has(layer.code))
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
            // All rows (defaults + user-added) are removable. Removing a hardcoded
            // default also persists a `removedDefaults` flag on the index.ts side so
            // it doesn't auto-reinstate on the next reload.
            let refs;
            refs = renderLayerRow(layer, controller, state, () => {
                callbacks.removeUserLayer(layer.code);
                if (refs.row.parentNode === layerList)
                    layerList.removeChild(refs.row);
                rowByCode.delete(layer.code);
                if (!optionByCode.has(layer.code))
                    addOption(layer);
            });
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
        if (callbacks.boxControls) {
            renderFloatBoxSection(tabPane, callbacks.boxControls);
        }
        renderTermsLink(tabPane);
    }
    /**
     * "懸浮視窗" settings section: an enable toggle and an opacity slider that
     * drive the Floating Layer Box through its [[BoxControls]] handle. Reuses the
     * existing `.nlsc-toggle` pill switch and `.nlsc-slider` / `.nlsc-value`
     * styles, so no new CSS is required.
     */
    function renderFloatBoxSection(tabPane, boxControls) {
        const section = document.createElement("div");
        section.className = "nlsc-floatbox-settings";
        const heading = document.createElement("h4");
        heading.textContent = "懸浮視窗";
        section.appendChild(heading);
        // Enable row: pill toggle + label. Mirrors the per-layer `.nlsc-toggle`.
        const enableRow = document.createElement("div");
        enableRow.className = "nlsc-row-header";
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "nlsc-toggle";
        toggleLabel.title = "顯示／隱藏懸浮視窗";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = boxControls.isEnabled();
        const toggleSlider = document.createElement("span");
        toggleSlider.className = "nlsc-toggle-slider";
        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(toggleSlider);
        const enableText = document.createElement("span");
        enableText.className = "nlsc-name";
        enableText.textContent = "顯示懸浮視窗";
        enableRow.appendChild(toggleLabel);
        enableRow.appendChild(enableText);
        section.appendChild(enableRow);
        checkbox.addEventListener("change", () => {
            boxControls.setEnabled(checkbox.checked);
        });
        // Keep the toggle in sync when the box is closed from its own × button (or
        // any other origin), so reopening from here always reflects the live state.
        boxControls.onEnabledChange((enabled) => {
            checkbox.checked = enabled;
        });
        // Opacity row: range slider (step 5 → ≤0.05 increments) + percentage label.
        const sliderRow = document.createElement("div");
        sliderRow.className = "nlsc-slider-row";
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "10";
        slider.max = "100";
        slider.step = "5";
        slider.className = "nlsc-slider";
        slider.title = "懸浮視窗透明度";
        slider.value = String(Math.round(boxControls.getOpacity() * 100));
        const valueLabel = document.createElement("span");
        valueLabel.className = "nlsc-value";
        valueLabel.textContent = `${slider.value}%`;
        sliderRow.appendChild(slider);
        sliderRow.appendChild(valueLabel);
        section.appendChild(sliderRow);
        slider.addEventListener("input", () => {
            valueLabel.textContent = `${slider.value}%`;
            boxControls.setOpacity(Number(slider.value) / 100);
        });
        tabPane.appendChild(section);
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
        // "Above WME objects" icon button — flips this layer between the default
        // below-objects band and the above-objects band. Radio-style: only one
        // layer can hold the slot at a time, so this button reflects whether THIS
        // layer is the one currently pinned above. Hidden entirely when the layer
        // is not visible (the action would be a no-op anyway).
        const aboveBtn = document.createElement("button");
        aboveBtn.type = "button";
        aboveBtn.className = "nlsc-above-btn";
        aboveBtn.title = "置於物件之上";
        const initialAbove = state.aboveCode === layer.code;
        aboveBtn.setAttribute("aria-pressed", initialAbove ? "true" : "false");
        if (!(state.visible[layer.code] ?? false))
            aboveBtn.style.display = "none";
        // Inline SVG so the glyph picks up the button's `currentColor` (muted when
        // off, white-on-orange when on). Two squares: dim back, filled front =
        // canonical "bring to front" iconography.
        aboveBtn.innerHTML =
            '<svg viewBox="0 0 16 16" aria-hidden="true">' +
                '<rect x="2" y="5.5" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>' +
                '<rect x="6.5" y="2" width="7.5" height="7.5" rx="1.4" fill="currentColor"/>' +
                "</svg>";
        headerRow.appendChild(aboveBtn);
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
        aboveBtn.addEventListener("click", () => {
            const next = aboveBtn.getAttribute("aria-pressed") !== "true";
            controller.setAbove(layer.code, next);
        });
        slider.addEventListener("input", () => {
            valueLabel.textContent = `${slider.value}%`;
            controller.setOpacity(layer.code, Number(slider.value) / 100);
        });
        return { row, grip, checkbox, aboveBtn, slider, valueLabel, updateColorUi: colorCtl.updateUi };
    }
    function wireRowListeners(layer, controller, refs) {
        controller.onVisibleChange((code, visible) => {
            if (code !== layer.code)
                return;
            if (refs.checkbox.checked !== visible)
                refs.checkbox.checked = visible;
            // "Above WME objects" is meaningless on a hidden layer — hide the button
            // so the row stays uncluttered. Persisted aboveCode survives so re-enabling
            // visibility restores the pinned state without an extra click.
            refs.aboveBtn.style.display = visible ? "" : "none";
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
        controller.onAboveChange((code, above) => {
            if (code !== layer.code)
                return;
            const want = above ? "true" : "false";
            if (refs.aboveBtn.getAttribute("aria-pressed") !== want) {
                refs.aboveBtn.setAttribute("aria-pressed", want);
            }
        });
    }

    const STYLE_ID = "nlsc-floatbox-styles";
    /** Default floating-box opacity, used when the stored value is non-finite. */
    const DEFAULT_OPACITY = 0.9;
    /** Default top-left position (px), clear of WME's left sidebar. */
    const DEFAULT_X = 80;
    const DEFAULT_Y = 100;
    /** Deferred-attach budget: retry attaching at most this often, for this long. */
    const ATTACH_RETRY_INTERVAL_MS = 1000;
    const ATTACH_RETRY_DEADLINE_MS = 30000;
    /** Message shown in place of the row list when no layer is currently visible. */
    const EMPTY_MESSAGE = "目前沒有顯示中的圖層";
    const NLSC_FLOATBOX_STYLES = `
.nlsc-floatbox { position: fixed; z-index: 2147483000; min-width: 200px; max-width: 320px; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--hairline, rgba(128,128,128,0.3)); background: var(--background_default, #fff); color: inherit; box-shadow: 0 6px 24px rgba(0,0,0,0.28); font-size: 13px; overflow: hidden; }
.nlsc-floatbox-header { display: flex; align-items: center; gap: 8px; padding: 2px 12px; cursor: move; user-select: none; border-bottom: 1px solid var(--hairline, rgba(128,128,128,0.2)); background: rgba(128,128,128,0.08); }
.nlsc-floatbox-title { flex: 1; min-width: 0; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Close_Control: a top-right × that hides the box (persisting enabled=false).
   Lives inside the draggable header but is excluded from drag (see wireDrag). */
.nlsc-floatbox-close { flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent; color: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.15s, background-color 0.15s, transform 0.05s; }
.nlsc-floatbox-close:hover { opacity: 1; background: rgba(128,128,128,0.18); }
.nlsc-floatbox-close:active { transform: scale(0.92); }
.nlsc-floatbox-close:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,149,0,0.35); }
.nlsc-floatbox-close svg { width: 13px; height: 13px; display: block; pointer-events: none; }
.nlsc-floatbox-rows { padding: 6px 8px; max-height: 320px; overflow-y: auto; }
.nlsc-floatbox-empty { padding: 8px 4px; opacity: 0.65; text-align: center; }
.nlsc-floatbox-row { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 6px; }
.nlsc-floatbox-row + .nlsc-floatbox-row { border-top: 1px solid var(--hairline, rgba(128,128,128,0.12)); }
.nlsc-floatbox-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* On_Top_Control: mirrors the sidebar's .nlsc-above-btn "bring to front" glyph.
   Muted by default; orange + opaque when this layer holds the above slot. The
   active look is keyed on both .is-active and aria-pressed="true" so either
   stays visually correct. */
.nlsc-floatbox-top { flex-shrink: 0; width: 26px; height: 22px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.35); background: transparent; color: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.15s, background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.05s; }
.nlsc-floatbox-top:hover { opacity: 1; }
.nlsc-floatbox-top:active { transform: scale(0.94); }
.nlsc-floatbox-top.is-active, .nlsc-floatbox-top[aria-pressed="true"] { background: #ff9500; border-color: #ff9500; color: #fff; opacity: 1; }
.nlsc-floatbox-top:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,149,0,0.35); }
.nlsc-floatbox-top svg { width: 14px; height: 14px; display: block; pointer-events: none; }

[wz-theme="dark"] .nlsc-floatbox { background: #1f2024; border-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-floatbox-header { border-bottom-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); }
`;
    /**
     * Inline "bring to front" glyph (dim back square + filled front square),
     * reused from the sidebar's above-button so the two views read identically.
     * Inline SVG lets it inherit the button's `currentColor` (muted off, white on
     * the orange active background).
     */
    const ABOVE_GLYPH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<rect x="2" y="5.5" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>' +
        '<rect x="6.5" y="2" width="7.5" height="7.5" rx="1.4" fill="currentColor"/>' +
        "</svg>";
    /** Inline "close" glyph (an ×) for the header's Close_Control. */
    const CLOSE_GLYPH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>";
    function injectStyles() {
        if (typeof document === "undefined")
            return;
        if (document.getElementById(STYLE_ID))
            return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = NLSC_FLOATBOX_STYLES;
        document.head.appendChild(style);
    }
    /**
     * Clamp an opacity value to the renderable range. Non-finite input (missing /
     * `NaN` / `Infinity`) falls back to the default; everything else is clamped to
     * the inclusive `[0.1, 1.0]` band so the box can never vanish entirely.
     */
    function clampOpacity(v) {
        if (!Number.isFinite(v))
            return DEFAULT_OPACITY;
        return Math.min(1.0, Math.max(0.1, v));
    }
    function createFloatingBox(deps) {
        const { state } = deps;
        const { controller, getLayer } = deps;
        injectStyles();
        // Built once on first mount and reused thereafter: unmount() detaches it
        // from the DOM but keeps the reference, so re-enabling re-attaches the same
        // element with its persisted opacity/position.
        let element = null;
        let rowsEl = null;
        // Deferred-attach interval handle, active only while document.body is absent.
        let attachTimer = null;
        // Enabled-state subscribers (e.g. the sidebar toggle), notified on every
        // transition so the views stay in sync when the box closes via its × button.
        const enabledListeners = new Set();
        // Drag state. `dragging` gates pointermove/up so a stray move (or a move
        // after the pointer was released) is ignored. The offset is the distance from
        // the pointer to the box's top-left captured at pointerdown, kept constant
        // across the drag so the corner tracks the pointer 1:1 (Req 3.1).
        let dragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let dragPointerId = null;
        function resolveRoot() {
            if (deps.root)
                return deps.root;
            if (typeof document !== "undefined" && document.body)
                return document.body;
            return null;
        }
        function buildElement() {
            const el = document.createElement("div");
            el.className = "nlsc-floatbox";
            // Header doubles as the drag handle (task 6.1 wires the pointer handlers).
            const header = document.createElement("div");
            header.className = "nlsc-floatbox-header";
            const title = document.createElement("span");
            title.className = "nlsc-floatbox-title";
            title.textContent = "NLSC Overlay";
            header.appendChild(title);
            // Close_Control: hides the box (enabled=false). Reopened from the sidebar's
            // "顯示懸浮視窗" toggle, which mirrors this via onEnabledChange.
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "nlsc-floatbox-close";
            closeBtn.title = "關閉懸浮視窗";
            closeBtn.setAttribute("aria-label", "關閉懸浮視窗");
            closeBtn.innerHTML = CLOSE_GLYPH_SVG;
            closeBtn.addEventListener("click", () => setEnabled(false));
            header.appendChild(closeBtn);
            // Row container; populated by renderRows() in task 4.1.
            const rows = document.createElement("div");
            rows.className = "nlsc-floatbox-rows";
            el.appendChild(header);
            el.appendChild(rows);
            rowsEl = rows;
            wireDrag(header);
            return el;
        }
        function ensureElement() {
            if (!element)
                element = buildElement();
            return element;
        }
        /** Set `element.style.opacity` from the (clamped) stored opacity. */
        function applyOpacity() {
            if (!element)
                return;
            element.style.opacity = String(clampOpacity(state.floatBox.opacity));
        }
        /**
         * Apply the resolved top-left position to the element's inline style. Resolved
         * means: persisted x/y (or the default when null) clamped into the viewport so
         * the whole box — and therefore the drag handle — stays reachable (Req 7.5).
         */
        function applyPosition() {
            if (!element)
                return;
            const { x, y } = resolvePosition();
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
        }
        /** Default top-left position, clear of WME's left sidebar. */
        function defaultPosition() {
            return { x: DEFAULT_X, y: DEFAULT_Y };
        }
        /**
         * The box's rendered size. jsdom (and an unattached element) reports 0 for
         * layout, so a measured 0 means "size unknown" — we treat it as 0 and let the
         * clamp lower-bound (0) keep the position valid rather than producing a
         * negative upper bound.
         */
        function boxSize() {
            if (!element)
                return { width: 0, height: 0 };
            const rect = element.getBoundingClientRect();
            const width = rect.width || element.offsetWidth || 0;
            const height = rect.height || element.offsetHeight || 0;
            return { width, height };
        }
        /** Clamp `v` into `[0, max]`, guarding `max < 0` (box larger than viewport). */
        function clampAxis(v, max) {
            return Math.max(0, Math.min(Math.max(0, max), v));
        }
        /**
         * Resolve the position to apply on mount / after a drag: persisted x/y, or the
         * default when either is null, clamped into
         * `[0, innerWidth − boxWidth] × [0, innerHeight − boxHeight]` (Req 7.5).
         */
        function resolvePosition() {
            let { x, y } = state.floatBox;
            if (x == null || y == null)
                ({ x, y } = defaultPosition());
            const { width, height } = boxSize();
            const vw = typeof window !== "undefined" ? window.innerWidth : 0;
            const vh = typeof window !== "undefined" ? window.innerHeight : 0;
            return {
                x: clampAxis(x, vw - width),
                y: clampAxis(y, vh - height),
            };
        }
        /**
         * Bind pointer-based drag to the header handle (Req 3). Handlers live on the
         * handle only, so a pointerdown on a row button never starts a drag (Req 3.5).
         * `setPointerCapture`/`releasePointerCapture` are guarded for jsdom, where
         * they may be undefined.
         */
        function wireDrag(handle) {
            handle.addEventListener("pointerdown", (e) => {
                if (!element)
                    return;
                // A pointerdown on an interactive header control (e.g. the close button)
                // must not start a drag, so its click fires cleanly (Req 3.5).
                if (e.target?.closest("button"))
                    return;
                const rect = element.getBoundingClientRect();
                // Distance from pointer to the box top-left, held constant for the drag.
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                dragging = true;
                dragPointerId = e.pointerId;
                if (typeof handle.setPointerCapture === "function") {
                    handle.setPointerCapture(e.pointerId);
                }
                // Suppress text selection during the drag (Req 3.3).
                handle.style.userSelect = "none";
                e.preventDefault();
            });
            handle.addEventListener("pointermove", (e) => {
                if (!dragging || !element)
                    return;
                const { width, height } = boxSize();
                const vw = typeof window !== "undefined" ? window.innerWidth : 0;
                const vh = typeof window !== "undefined" ? window.innerHeight : 0;
                const left = clampAxis(e.clientX - dragOffsetX, vw - width);
                const top = clampAxis(e.clientY - dragOffsetY, vh - height);
                element.style.left = `${left}px`;
                element.style.top = `${top}px`;
            });
            const endDrag = (e) => {
                if (!dragging)
                    return;
                dragging = false;
                if (dragPointerId !== null &&
                    typeof handle.releasePointerCapture === "function") {
                    handle.releasePointerCapture(dragPointerId);
                }
                dragPointerId = null;
                handle.style.userSelect = "";
                // Persist the resting position (Req 3.4, 7.3). parseInt tolerates the
                // trailing "px"; fall back to the resolved position if style is unset.
                if (element) {
                    const left = parseInt(element.style.left, 10);
                    const top = parseInt(element.style.top, 10);
                    const resolved = resolvePosition();
                    state.floatBox.x = Number.isFinite(left) ? left : resolved.x;
                    state.floatBox.y = Number.isFinite(top) ? top : resolved.y;
                    saveState(state);
                }
            };
            handle.addEventListener("pointerup", endDrag);
            handle.addEventListener("pointercancel", endDrag);
        }
        /**
         * Rebuild the visible-layer list. The box is a stateless view: every call
         * reads the live `state` + `getOrder()` rather than caching, so a full
         * rebuild (the list is at most a handful of rows) keeps the logic trivial
         * and free of per-row listener bookkeeping. Task 5 calls this from the
         * controller's onVisibleChange / onAboveChange / onOrderChange subscriptions.
         */
        function renderRows() {
            if (!rowsEl)
                return;
            rowsEl.textContent = "";
            // List = visible layers, in getOrder() order. Catalog misses (no display
            // metadata to render a name) are skipped (Req 2.1, 2.2).
            const codes = controller
                .getOrder()
                .filter((code) => state.visible[code]);
            let rendered = 0;
            for (const code of codes) {
                const layer = getLayer(code);
                if (!layer)
                    continue;
                rowsEl.appendChild(buildRow(code, layer));
                rendered++;
            }
            // Empty state: no visible layer resolved to a row (Req 2.9).
            if (rendered === 0) {
                const empty = document.createElement("div");
                empty.className = "nlsc-floatbox-empty";
                empty.textContent = EMPTY_MESSAGE;
                rowsEl.appendChild(empty);
            }
        }
        /**
         * Build a single row: the layer's title plus one On_Top_Control. The control
         * reflects whether this layer holds the above slot via `aria-pressed` and an
         * `is-active` class (Req 2.3, 2.6). Because rows are always rebuilt from the
         * live `state.aboveCode`, at most one control is ever active (Req 2.7).
         */
        function buildRow(code, layer) {
            const row = document.createElement("div");
            row.className = "nlsc-floatbox-row";
            const label = document.createElement("span");
            label.className = "nlsc-floatbox-label";
            label.textContent = layer.title;
            label.title = layer.title;
            row.appendChild(label);
            const active = state.aboveCode === code;
            const topBtn = document.createElement("button");
            topBtn.type = "button";
            topBtn.className = active ? "nlsc-floatbox-top is-active" : "nlsc-floatbox-top";
            topBtn.title = "置於物件之上";
            topBtn.setAttribute("aria-pressed", active ? "true" : "false");
            topBtn.innerHTML = ABOVE_GLYPH_SVG;
            topBtn.addEventListener("click", () => {
                // Defensive guard: ignore activations targeting a layer that is no longer
                // visible — leave the above slot and the list unchanged (Req 2.10).
                if (!state.visible[code])
                    return;
                // Toggle: pin when this layer isn't the pinned one, release when it is.
                // The controller's radio logic demotes any previously-pinned layer; the
                // box repaints purely off onAboveChange (Req 2.4, 2.5).
                controller.setAbove(code, state.aboveCode !== code);
            });
            row.appendChild(topBtn);
            return row;
        }
        /**
         * Build (once) and attach the box to its root. Idempotent: re-calling while
         * already attached is a no-op beyond re-applying opacity/position. Returns
         * `false` when the root (document.body) is not yet available.
         */
        function mount() {
            ensureElement();
            const target = resolveRoot();
            if (!target)
                return false;
            if (element.parentNode !== target)
                target.appendChild(element);
            applyOpacity();
            applyPosition();
            renderRows();
            return true;
        }
        /** Remove the box from the DOM entirely (not merely hidden). */
        function unmount() {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }
        function stopRetry() {
            if (attachTimer !== null) {
                clearInterval(attachTimer);
                attachTimer = null;
            }
        }
        /**
         * Retry attaching when the page content isn't ready yet: poll at a ≤1s
         * interval for up to 30s, stopping as soon as the box attaches or the
         * deadline passes (Req 1.5).
         */
        function scheduleRetry() {
            if (attachTimer !== null)
                return;
            if (typeof setInterval === "undefined")
                return;
            const deadline = Date.now() + ATTACH_RETRY_DEADLINE_MS;
            attachTimer = setInterval(() => {
                if (mount() || Date.now() >= deadline)
                    stopRetry();
            }, ATTACH_RETRY_INTERVAL_MS);
        }
        function setEnabled(enabled) {
            const changed = state.floatBox.enabled !== enabled;
            state.floatBox.enabled = enabled;
            saveState(state);
            if (enabled) {
                if (!mount())
                    scheduleRetry();
            }
            else {
                stopRetry();
                unmount();
            }
            if (changed) {
                for (const listener of enabledListeners)
                    listener(enabled);
            }
        }
        function setOpacity(opacity) {
            state.floatBox.opacity = clampOpacity(opacity);
            saveState(state);
            applyOpacity();
        }
        function isEnabled() {
            return state.floatBox.enabled;
        }
        function getOpacity() {
            return state.floatBox.opacity;
        }
        function onEnabledChange(listener) {
            enabledListeners.add(listener);
            return () => enabledListeners.delete(listener);
        }
        function destroy() {
            stopRetry();
            unmount();
            enabledListeners.clear();
            element = null;
            rowsEl = null;
        }
        // Live sync (Req 8): the box and the sidebar are peer views over the same
        // controller, so every change broadcasts to both regardless of origin. A full
        // renderRows() rebuild keeps each view honest:
        //   • onVisibleChange — add/remove rows as layers show/hide (Req 8.1, 8.2),
        //     and restore the pinned row's active look when a hidden pinned layer
        //     reappears (Req 8.5, 8.6).
        //   • onAboveChange   — repaint active/inactive controls; a pin from either
        //     view is mirrored in the other (Req 8.3, 8.4).
        //   • onOrderChange   — keep row order matching getOrder() (Req 2.1).
        // These fire whether or not the box is mounted; renderRows() no-ops when the
        // row container is absent, so an unmounted box stays inert.
        controller.onVisibleChange(() => renderRows());
        controller.onAboveChange(() => renderRows());
        controller.onOrderChange(() => renderRows());
        // Mount immediately when enabled so the box appears without opening the
        // settings panel (Req 1.4). If document.body isn't ready, defer with retry.
        if (state.floatBox.enabled) {
            if (!mount())
                scheduleRetry();
        }
        const controls = {
            setEnabled,
            setOpacity,
            isEnabled,
            getOpacity,
            onEnabledChange,
        };
        return { controls, destroy };
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
            this.aboveListeners = [];
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
        /**
         * Radio-style: only one layer can be "above" at a time. Promoting layer X
         * automatically demotes whatever previously held the slot. Demoting X is
         * a no-op unless X currently holds the slot. Listeners fire once per
         * affected layer (the swap path fires twice: old=false, new=true) so each
         * sidebar row can update its own `aria-pressed` independently.
         */
        setAbove(code, above) {
            if (!this.byCode.has(code))
                return;
            const current = this.state.aboveCode;
            if (above) {
                if (current === code)
                    return;
                this.state.aboveCode = code;
                saveState(this.state);
                if (current !== null) {
                    for (const fn of this.aboveListeners)
                        fn(current, false);
                }
                for (const fn of this.aboveListeners)
                    fn(code, true);
            }
            else {
                if (current !== code)
                    return;
                this.state.aboveCode = null;
                saveState(this.state);
                for (const fn of this.aboveListeners)
                    fn(code, false);
            }
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
        onAboveChange(handler) {
            this.aboveListeners.push(handler);
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
    function restackLayers(olMap, tileLayersByCode, order, aboveCodes = new Set()) {
        const base = olMap.baseLayer;
        const snapshot = [...olMap.layers];
        const nlscSet = new Set(Array.from(tileLayersByCode.values()));
        // Resolve `order` codes to actual layer instances, split into the two bands
        // by `aboveCodes`. Each band preserves its sidebar top-to-bottom ordering.
        const belowTopFirst = [];
        const aboveTopFirst = [];
        for (const code of order) {
            const layer = tileLayersByCode.get(code);
            if (!layer || !snapshot.includes(layer))
                continue;
            if (aboveCodes.has(code))
                aboveTopFirst.push(layer);
            else
                belowTopFirst.push(layer);
        }
        // Array end = visually top, so reverse before writing: the bottom-of-band
        // layer goes first (lowest index), the top-of-band layer last (highest).
        const belowLowestFirst = belowTopFirst.slice().reverse();
        const aboveLowestFirst = aboveTopFirst.slice().reverse();
        // Imagery first (preserve existing relative order so toggling one aerial
        // on/off doesn't shuffle the others), then our below-band, then editor
        // layers, then our above-band on top of everything.
        const imagery = snapshot.filter((l) => !nlscSet.has(l) && isImageryLayer(l, base));
        const others = snapshot.filter((l) => !nlscSet.has(l) && !isImageryLayer(l, base));
        const target = [
            ...imagery,
            ...belowLowestFirst,
            ...others,
            ...aboveLowestFirst,
        ];
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
    const SCRIPT_VERSION = typeof __SCRIPT_VERSION__ === "string" ? __SCRIPT_VERSION__ : "";
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
        // Re-stack every NLSC overlay around the editor band (algorithm lives in
        // ./restack so it can be unit-tested). Called at startup, on order changes,
        // and on olMap addlayer/removelayer events further below. At most one layer
        // is promoted above editor objects (roads, places, hazards) at a time —
        // state.aboveCode holds that slot, enforced by the controller's radio
        // semantics.
        const aboveSet = () => state.aboveCode ? new Set([state.aboveCode]) : new Set();
        const restackAll = () => {
            restackLayers(olMap, tileLayersByCode, state.layerOrder, aboveSet());
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
        // Defaults the user has explicitly removed stay un-registered until they
        // re-add them via the catalog picker. Without this guard, every reload would
        // resurrect deleted rows.
        const removedDefaultCodes = new Set(state.removedDefaults);
        const defaultEntries = NLSC_LAYERS.filter((layer) => !removedDefaultCodes.has(layer.code)).map((layer) => {
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
        for (const { layer } of defaultEntries) {
            safeAddCheckbox(layer.name, state.visible[layer.code] ?? false);
        }
        // Fetch the NLSC WMTS layer catalog. Defaults already cover the common
        // cases, so a fetch failure is non-fatal — the dropdown just shows the
        // hardcoded seed defaults so removed ones remain re-addable offline.
        let catalog = [];
        try {
            catalog = await fetchCatalog();
            console.log(`[${SCRIPT_ID}] fetched ${catalog.length} layers from NLSC capabilities`);
        }
        catch (err) {
            console.warn(`[${SCRIPT_ID}] NLSC catalog fetch failed`, err);
        }
        // Prefer the hardcoded NLSC_LAYERS metadata (tuned defaultOpacity / display
        // name) when a code appears in both. Also ensures the seed defaults are
        // present in the picker even if the catalog fetch failed.
        const catalogByCode = new Map(catalog.map((l) => [l.code, l]));
        for (const l of NLSC_LAYERS)
            catalogByCode.set(l.code, l);
        catalog = [...catalogByCode.values()];
        // Display-name resolver for the floating box, over the final merged catalog
        // (NLSC_LAYERS ∪ catalog). Built after the merge so the box resolves names
        // for both seed defaults and catalog layers. User layers added at runtime via
        // addUserLayer are catalog layers and so are already present in this map.
        const layerByCode = new Map();
        for (const l of NLSC_LAYERS)
            layerByCode.set(l.code, l);
        for (const l of catalog)
            if (!layerByCode.has(l.code))
                layerByCode.set(l.code, l);
        // Construct the floating layer box. It mounts immediately when
        // state.floatBox.enabled is true (with a deferred-attach retry if
        // document.body isn't ready yet), so no explicit mount call is needed.
        const box = createFloatingBox({
            controller,
            state,
            getLayer: (code) => layerByCode.get(code),
        });
        const registerCatalogLayer = (layer, visible, opacity, color) => {
            const tileLayer = createTileLayer(layer, visible, opacity, color);
            controller.addBinding(bindingFor(layer, tileLayer));
            safeAddCheckbox(layer.name, visible);
        };
        for (const code of state.userLayers) {
            if (tileLayersByCode.has(code))
                continue; // already registered as a seed default
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
        const seedDefaultCodes = new Set(NLSC_LAYERS.map((l) => l.code));
        const addUserLayer = (code) => {
            if (tileLayersByCode.has(code))
                return null;
            const layer = catalog.find((l) => l.code === code);
            if (!layer)
                return null;
            const visible = state.visible[code] ?? true;
            const opacity = state.opacity[code] ?? layer.defaultOpacity;
            const color = state.color[code] ?? null;
            registerCatalogLayer(layer, visible, opacity, color);
            // Re-adding a previously-removed seed default clears its removal flag so
            // the next reload reinstates it via the normal default-registration loop.
            if (seedDefaultCodes.has(code)) {
                state.removedDefaults = state.removedDefaults.filter((c) => c !== code);
            }
            else if (!state.userLayers.includes(code)) {
                state.userLayers.push(code);
            }
            state.visible[code] = visible;
            state.opacity[code] = opacity;
            // New layers slot in at the top of the stack (sidebar top).
            state.layerOrder = [code, ...state.layerOrder.filter((c) => c !== code)];
            saveState(state);
            restackAll();
            return layer;
        };
        const removeUserLayer = (code) => {
            const tileLayer = tileLayersByCode.get(code);
            if (!tileLayer)
                return;
            olMap.removeLayer(tileLayer);
            tileLayersByCode.delete(code);
            const layer = catalog.find((l) => l.code === code) ??
                NLSC_LAYERS.find((l) => l.code === code);
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
            // Suppress auto-re-registration on next load for hardcoded seed defaults.
            if (seedDefaultCodes.has(code) && !state.removedDefaults.includes(code)) {
                state.removedDefaults.push(code);
            }
            saveState(state);
            restackAll();
        };
        // Reconcile persisted order against what's actually registered. Drop any
        // stale codes (catalog layer that no longer exists), and prepend newly-
        // registered codes (e.g. a newly-added default) at the top of the stack.
        // Fresh-install seed: user-added layers (newest on top) above defaults; the
        // seed defaults follow NLSC_LAYERS declaration order — first-declared sits
        // at the top of the sidebar (e.g. EMAP5, TOWN, CITY).
        const registeredCodes = new Set(tileLayersByCode.keys());
        if (state.layerOrder.length === 0) {
            state.layerOrder = [
                ...state.userLayers.filter((c) => registeredCodes.has(c)).slice().reverse(),
                ...NLSC_LAYERS.map((l) => l.code).filter((c) => registeredCodes.has(c)),
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
        // Promoting/demoting a layer between bands requires a re-stack; controller
        // already persisted state.above, so we just need to apply it visually.
        controller.onAboveChange(() => guardedRestack());
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
            version: SCRIPT_VERSION,
            boxControls: box.controls,
        });
    })();

})();
