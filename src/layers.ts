// NLSC WMTS template: https://wmts.nlsc.gov.tw/wmts/{LAYER}/default/GoogleMapsCompatible/{z}/{y}/{x}  (note: {y} before {x} — WMTS axis order, NOT slippy)

/** Metadata for a single NLSC WMTS layer. */
export interface NlscLayer {
  /** NLSC WMTS layer identifier (e.g., "EMAP"). */
  code: string;
  /** Human-readable display name shown in the WME sidebar dropdown. */
  name: string;
  /** Minimum zoom level the layer renders at. */
  minZoom: number;
  /** Maximum zoom level the layer renders at. */
  maxZoom: number;
  /** Attribution text shown on the map. */
  attribution: string;
  /** Initial opacity, 0.0–1.0. */
  defaultOpacity: number;
}

const NLSC_ATTRIBUTION = "© 內政部國土測繪中心 NLSC";

/** Default NLSC WMTS layers — always present, not removable. */
export const NLSC_LAYERS: readonly NlscLayer[] = [
  {
    code: "EMAP5",
    name: "台灣通用電子地圖 (EMAP5)",
    minZoom: 0,
    maxZoom: 22,
    attribution: NLSC_ATTRIBUTION,
    defaultOpacity: 0.5,
  },
  {
    code: "EMAP2",
    name: "台灣通用電子地圖 (EMAP2)",
    minZoom: 0,
    maxZoom: 22,
    attribution: NLSC_ATTRIBUTION,
    defaultOpacity: 0.5,
  },
  {
    code: "TOWN",
    name: "鄉鎮界 (TOWN)",
    minZoom: 0,
    maxZoom: 22,
    attribution: NLSC_ATTRIBUTION,
    defaultOpacity: 0.7,
  },
  {
    code: "CITY",
    name: "縣市界 (CITY)",
    minZoom: 0,
    maxZoom: 22,
    attribution: NLSC_ATTRIBUTION,
    defaultOpacity: 0.7,
  },
  {
    code: "LANDSECT2",
    name: "地段外圍圖 (LANDSECT2)",
    minZoom: 0,
    maxZoom: 22,
    attribution: NLSC_ATTRIBUTION,
    defaultOpacity: 0.7,
  },
];

export { NLSC_ATTRIBUTION };
