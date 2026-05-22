/// <reference types="wme-sdk-typings" />
import { NLSC_LAYERS } from "./layers";

/**
 * WME NLSC Overlay — Entry point
 *
 * Phase 1 + 2: gate to top frame, await SDK, acquire WmeSDK handle, register NLSC tile layers on the WME OpenLayers map.
 * Phase 3: sidebar UI, settings persistence.
 */

const SCRIPT_ID = "wme-nlsc-overlay";
const SCRIPT_NAME = "WME NLSC Overlay";

(async () => {
  // WME SDK is never in nested frames; bail to avoid noise.
  if (window.top !== window.self) return;
  if (window.location.hostname !== "www.waze.com") return;

  console.log(`[${SCRIPT_ID}] loaded`);

  await window.SDK_INITIALIZED;
  const sdk = window.getWmeSdk!({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });
  console.log(`[${SCRIPT_ID}] wme ready`, sdk);

  const uw = (window as any).unsafeWindow ?? window;
  const ol = uw.ol;
  const olMap = uw.W?.map?.olMap;
  if (!ol || !olMap) {
    console.warn(`[${SCRIPT_ID}] OpenLayers or W.map.olMap unavailable; skipping tile registration`);
    return;
  }

  const wmeLayers = NLSC_LAYERS.map((layer) => {
    const tileLayer = new ol.layer.Tile({
      source: new ol.source.XYZ({
        // NLSC WMTS axis order is /{z}/{y}/{x} — not the standard /{z}/{x}/{y}.
        tileUrlFunction: ([z, x, y]: [number, number, number]) =>
          `https://wmts.nlsc.gov.tw/wmts/${layer.code}/default/GoogleMapsCompatible/${z}/${y}/${x}`,
        attributions: layer.attribution,
        projection: "EPSG:3857",
        crossOrigin: "anonymous",
      }),
      opacity: layer.defaultOpacity,
      visible: false,
      minZoom: layer.minZoom,
      maxZoom: layer.maxZoom,
    });
    tileLayer.set("nlscCode", layer.code);
    olMap.addLayer(tileLayer);
    return { layer, tileLayer };
  });

  // Dev handle for console debugging (remove in Phase 4).
  (uw as any).__nlscLayers = wmeLayers;
  console.log(`[${SCRIPT_ID}] registered ${wmeLayers.length} NLSC tile layers`);

  // Phase 3 extension point: sidebar panel, LayerSwitcher integration, localStorage settings.
})();
