// NLSC WMTS template: https://wmts.nlsc.gov.tw/wmts/{LAYER}/default/GoogleMapsCompatible/{z}/{y}/{x}  (note: {y} before {x} — WMTS axis order, NOT slippy)

/** Metadata for a single NLSC WMTS layer. */
export interface NlscLayer {
  /** NLSC WMTS layer identifier (e.g., "EMAP"). */
  code: string;
  /** Human-readable display name shown in the WME sidebar dropdown. */
  name: string;
  /** WMTS layer Title (display only). */
  title: string;
  /** Tile image format, lowercase short form: "jpeg" or "png". */
  format: "jpeg" | "png";
  /** Minimum zoom level the server publishes tiles for. */
  minZoom: number;
  /**
   * Maximum zoom level the server publishes tiles for. WME's editor map zooms
   * past this on close-up views; the OL layer is configured with matching
   * `serverResolutions` so it upscales the deepest tile instead of issuing
   * 404s for non-existent zoom levels.
   *
   * NLSC's shared `GoogleMapsCompatible` TileMatrixSet currently defines
   * z=0..19, so defaults below use 19. Catalog layers inherit the real cap
   * from `WMTSCapabilities.xml` at fetch time.
   */
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

export { NLSC_ATTRIBUTION };
