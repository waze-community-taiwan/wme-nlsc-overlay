import { NLSC_ATTRIBUTION, type NlscLayer } from "./layers";

const CAPABILITIES_URL = "https://wmts.nlsc.gov.tw/wmts/1.0.0/WMTSCapabilities.xml";

interface GmResponse {
  status: number;
  responseText: string;
}
interface GmRequestOptions {
  method: string;
  url: string;
  onload?: (res: GmResponse) => void;
  onerror?: (res: unknown) => void;
  ontimeout?: (res: unknown) => void;
}
declare const GM_xmlhttpRequest: ((opts: GmRequestOptions) => unknown) | undefined;

/** Fetch the NLSC WMTS GetCapabilities document and return its <Layer> entries. */
export async function fetchCatalog(): Promise<NlscLayer[]> {
  return parseCapabilities(await fetchCapabilitiesXml());
}

// Waze's editor CSP blocks plain fetch() to wmts.nlsc.gov.tw, so prefer
// GM_xmlhttpRequest (runs in the Tampermonkey extension context, bypasses
// page CSP, requires @connect wmts.nlsc.gov.tw in the metablock). Fall back
// to fetch() for non-Tampermonkey environments (unit tests, harnesses that
// install their own GM_xmlhttpRequest polyfill).
function fetchCapabilitiesXml(): Promise<string> {
  const gm = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : undefined;
  if (gm) {
    return new Promise((resolve, reject) => {
      gm({
        method: "GET",
        url: CAPABILITIES_URL,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error(`NLSC GetCapabilities ${res.status}`));
        },
        onerror: () => reject(new Error("NLSC GetCapabilities request failed")),
        ontimeout: () => reject(new Error("NLSC GetCapabilities timed out")),
      });
    });
  }
  return fetch(CAPABILITIES_URL, { credentials: "omit" }).then(async (res) => {
    if (!res.ok) throw new Error(`NLSC GetCapabilities ${res.status}`);
    return res.text();
  });
}

// NLSC publishes a single shared `GoogleMapsCompatible` set defining z=0..19,
// so 19 is the right last-resort fallback when the XML is missing both per-
// layer limits and matrix-set definitions.
const FALLBACK_MAX_ZOOM = 19;

/** Parse a WMTS Capabilities XML string into NlscLayer entries. Exported for tests. */
export function parseCapabilities(xml: string): NlscLayer[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return [];

  const matrixSetMax = indexTileMatrixSets(doc);

  const seen = new Set<string>();
  const out: NlscLayer[] = [];
  for (const el of Array.from(doc.getElementsByTagName("Layer"))) {
    const code = directChildText(el, "Identifier");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const title = directChildText(el, "Title") ?? code;
    const rawFormat = directChildText(el, "Format") ?? "";
    const format: "jpeg" | "png" = rawFormat.toLowerCase().endsWith("/png") ? "png" : "jpeg";
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
function indexTileMatrixSets(doc: Document): Map<string, number> {
  const out = new Map<string, number>();
  for (const set of Array.from(doc.getElementsByTagName("TileMatrixSet"))) {
    const id = directChildText(set, "Identifier");
    if (!id) continue;
    let max = -1;
    for (const tm of directChildren(set, "TileMatrix")) {
      const z = parseTileMatrixIndex(directChildText(tm, "Identifier"));
      if (z !== null && z > max) max = z;
    }
    if (max >= 0) out.set(id, max);
  }
  return out;
}

// Resolve a layer's effective max zoom, preferring per-layer limits over the
// referenced matrix set's intrinsic max. Returns FALLBACK_MAX_ZOOM if neither
// source is available.
function resolveMaxZoom(
  layerEl: Element,
  matrixSetMax: ReadonlyMap<string, number>,
): number {
  for (const link of directChildren(layerEl, "TileMatrixSetLink")) {
    const limits = directChildren(link, "TileMatrixSetLimits")[0];
    if (limits) {
      let max = -1;
      for (const lim of directChildren(limits, "TileMatrixLimits")) {
        const z = parseTileMatrixIndex(directChildText(lim, "TileMatrix"));
        if (z !== null && z > max) max = z;
      }
      if (max >= 0) return max;
    }
    const setRef = directChildText(link, "TileMatrixSet");
    if (setRef) {
      const setMax = matrixSetMax.get(setRef);
      if (setMax !== undefined) return setMax;
    }
  }
  return FALLBACK_MAX_ZOOM;
}

// Accept both bare numeric identifiers ("19") and prefixed forms commonly
// emitted by some WMTS servers ("GoogleMapsCompatible:19").
function parseTileMatrixIndex(id: string | null): number | null {
  if (!id) return null;
  const tail = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
  const n = Number.parseInt(tail, 10);
  return Number.isFinite(n) ? n : null;
}

// Direct-child match (by localName, namespace-agnostic) — avoids matching
// nested <Identifier> elements inside TileMatrixSetLink/Style/etc.
function directChildText(parent: Element, localName: string): string | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child.textContent?.trim() ?? null;
  }
  return null;
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((c) => c.localName === localName);
}
