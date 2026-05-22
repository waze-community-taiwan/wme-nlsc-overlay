/// <reference types="wme-sdk-typings" />
import { NLSC_LAYERS } from "./layers";
import { loadState } from "./state";
import { renderSidebar } from "./sidebar";
import { NlscController, type LayerBinding } from "./controller";

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

  const state = loadState();

  const wmeLayers = NLSC_LAYERS.map((layer) => {
    const initialVisible = state.visible[layer.code] ?? false;
    const initialOpacity = state.opacity[layer.code] ?? layer.defaultOpacity;
    const tileLayer = new ol.layer.Tile({
      source: new ol.source.XYZ({
        // NLSC WMTS axis order is /{z}/{y}/{x} — not the standard /{z}/{x}/{y}.
        tileUrlFunction: ([z, x, y]: [number, number, number]) =>
          `https://wmts.nlsc.gov.tw/wmts/${layer.code}/default/GoogleMapsCompatible/${z}/${y}/${x}`,
        attributions: layer.attribution,
        projection: "EPSG:3857",
        crossOrigin: "anonymous",
      }),
      opacity: initialOpacity,
      visible: initialVisible,
      minZoom: layer.minZoom,
      maxZoom: layer.maxZoom,
    });
    tileLayer.set("nlscCode", layer.code);
    olMap.addLayer(tileLayer);
    return { layer, tileLayer };
  });

  (uw as any).__nlscLayers = wmeLayers;
  console.log(`[${SCRIPT_ID}] registered ${wmeLayers.length} NLSC tile layers`);

  const bindings: LayerBinding[] = wmeLayers.map(({ layer, tileLayer }) => ({
    layer,
    setLayerVisible: (v) => tileLayer.setVisible(v),
    setLayerOpacity: (o) => tileLayer.setOpacity(o),
  }));
  const controller = new NlscController(state, bindings);

  for (const layer of NLSC_LAYERS) {
    sdk.LayerSwitcher.addLayerCheckbox({
      name: layer.name,
      isChecked: state.visible[layer.code] ?? false,
    });
  }

  sdk.Events.on({
    eventName: "wme-layer-checkbox-toggled",
    eventHandler: ({ checked, name }) => {
      const layer = NLSC_LAYERS.find((l) => l.name === name);
      if (!layer) return;
      controller.setVisible(layer.code, checked);
    },
  });

  controller.onVisibleChange((code, visible) => {
    const layer = NLSC_LAYERS.find((l) => l.code === code);
    if (!layer) return;
    sdk.LayerSwitcher.setLayerCheckboxChecked({ name: layer.name, isChecked: visible });
  });

  const { tabLabel, tabPane } = await sdk.Sidebar.registerScriptTab();
  renderSidebar(tabLabel, tabPane, NLSC_LAYERS, controller, state);
})();
