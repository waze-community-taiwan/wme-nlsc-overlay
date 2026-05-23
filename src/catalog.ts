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

/** Parse a WMTS Capabilities XML string into NlscLayer entries. Exported for tests. */
export function parseCapabilities(xml: string): NlscLayer[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return [];

  const seen = new Set<string>();
  const out: NlscLayer[] = [];
  for (const el of Array.from(doc.getElementsByTagName("Layer"))) {
    const code = directChildText(el, "Identifier");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const title = directChildText(el, "Title");
    out.push({
      code,
      name: title ? `${title} (${code})` : code,
      minZoom: 0,
      maxZoom: 22,
      attribution: NLSC_ATTRIBUTION,
      defaultOpacity: 0.7,
    });
  }
  return out;
}

// Direct-child match (by localName, namespace-agnostic) — avoids matching
// nested <Identifier> elements inside TileMatrixSetLink/Style/etc.
function directChildText(parent: Element, localName: string): string | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child.textContent?.trim() ?? null;
  }
  return null;
}
