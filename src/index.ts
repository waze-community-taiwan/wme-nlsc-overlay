/// <reference types="wme-sdk-typings" />
import { NLSC_LAYERS, type NlscLayer } from "./layers";
import { fetchCatalog } from "./catalog";
import { loadState, saveState } from "./state";
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
  const OL = uw.OL;
  const olMap = uw.W?.map?.olMap;
  if (!OL || !olMap) {
    console.warn(`[${SCRIPT_ID}] OpenLayers or W.map.olMap unavailable; skipping tile registration`);
    return;
  }

  const state = loadState();

  // NLSC WMTS axis order is /{z}/{y}/{x} — not slippy /{z}/{x}/{y}. OL 2.x
  // XYZ expands `${z}` / `${x}` / `${y}` placeholders verbatim, so swapping
  // x and y in the template handles the axis order naturally.
  const createTileLayer = (layer: NlscLayer, visible: boolean, opacity: number): any => {
    const urlTemplate =
      `https://wmts.nlsc.gov.tw/wmts/${layer.code}/default/GoogleMapsCompatible/\${z}/\${y}/\${x}`;
    const tileLayer = new OL.Layer.XYZ(layer.name, urlTemplate, {
      sphericalMercator: true,
      isBaseLayer: false,
      opacity,
      visibility: visible,
      attribution: layer.attribution,
    });
    tileLayer.nlscCode = layer.code;
    olMap.addLayer(tileLayer);
    return tileLayer;
  };

  const bindingFor = (layer: NlscLayer, tileLayer: any): LayerBinding => ({
    layer,
    setLayerVisible: (v) => tileLayer.setVisibility(v),
    setLayerOpacity: (o) => tileLayer.setOpacity(o),
  });

  const defaultEntries = NLSC_LAYERS.map((layer) => {
    const initialVisible = state.visible[layer.code] ?? false;
    const initialOpacity = state.opacity[layer.code] ?? layer.defaultOpacity;
    const tileLayer = createTileLayer(layer, initialVisible, initialOpacity);
    return { layer, tileLayer };
  });

  (uw as any).__nlscLayers = defaultEntries;
  console.log(`[${SCRIPT_ID}] registered ${defaultEntries.length} default NLSC tile layers`);

  const controller = new NlscController(
    state,
    defaultEntries.map(({ layer, tileLayer }) => bindingFor(layer, tileLayer)),
  );

  for (const layer of NLSC_LAYERS) {
    sdk.LayerSwitcher.addLayerCheckbox({
      name: layer.name,
      isChecked: state.visible[layer.code] ?? false,
    });
  }

  // Fetch the NLSC WMTS layer catalog. Defaults already cover the common
  // cases, so a fetch failure is non-fatal — the dropdown just shows empty.
  const defaultCodes = new Set(NLSC_LAYERS.map((l) => l.code));
  let catalog: NlscLayer[] = [];
  try {
    catalog = (await fetchCatalog()).filter((l) => !defaultCodes.has(l.code));
    console.log(`[${SCRIPT_ID}] fetched ${catalog.length} layers from NLSC capabilities`);
  } catch (err) {
    console.warn(`[${SCRIPT_ID}] NLSC catalog fetch failed`, err);
  }

  // User-added catalog layers — restored from localStorage. Keep a handle to
  // each OL layer so we can remove it when the user deletes the row.
  const userTileLayers = new Map<string, any>();

  const registerCatalogLayer = (layer: NlscLayer, visible: boolean, opacity: number): void => {
    const tileLayer = createTileLayer(layer, visible, opacity);
    userTileLayers.set(layer.code, tileLayer);
    controller.addBinding(bindingFor(layer, tileLayer));
    sdk.LayerSwitcher.addLayerCheckbox({ name: layer.name, isChecked: visible });
  };

  for (const code of state.userLayers) {
    const layer = catalog.find((l) => l.code === code);
    if (!layer) continue;
    const visible = state.visible[code] ?? false;
    const opacity = state.opacity[code] ?? layer.defaultOpacity;
    registerCatalogLayer(layer, visible, opacity);
  }

  // Resolve a layer (default or catalog) by checkbox name / code for bidirectional sync.
  const allKnownLayers = (): readonly NlscLayer[] => [...NLSC_LAYERS, ...catalog];

  sdk.Events.on({
    eventName: "wme-layer-checkbox-toggled",
    eventHandler: ({ checked, name }) => {
      const layer = allKnownLayers().find((l) => l.name === name);
      if (!layer) return;
      controller.setVisible(layer.code, checked);
    },
  });

  controller.onVisibleChange((code, visible) => {
    const layer = allKnownLayers().find((l) => l.code === code);
    if (!layer) return;
    try {
      sdk.LayerSwitcher.setLayerCheckboxChecked({ name: layer.name, isChecked: visible });
    } catch {
      // checkbox may have been removed; ignore.
    }
  });

  const addUserLayer = (code: string): NlscLayer | null => {
    if (userTileLayers.has(code)) return null;
    const layer = catalog.find((l) => l.code === code);
    if (!layer) return null;
    const visible = state.visible[code] ?? true;
    const opacity = state.opacity[code] ?? layer.defaultOpacity;
    registerCatalogLayer(layer, visible, opacity);
    if (!state.userLayers.includes(code)) state.userLayers.push(code);
    state.visible[code] = visible;
    state.opacity[code] = opacity;
    saveState(state);
    return layer;
  };

  const removeUserLayer = (code: string): void => {
    const tileLayer = userTileLayers.get(code);
    if (!tileLayer) return;
    olMap.removeLayer(tileLayer);
    userTileLayers.delete(code);
    const layer = catalog.find((l) => l.code === code);
    if (layer) {
      try {
        sdk.LayerSwitcher.removeLayerCheckbox({ name: layer.name });
      } catch {
        // ignore — checkbox may have been cleared already.
      }
    }
    controller.removeBinding(code);
    state.userLayers = state.userLayers.filter((c) => c !== code);
    delete state.visible[code];
    delete state.opacity[code];
    saveState(state);
  };

  const { tabLabel, tabPane } = await sdk.Sidebar.registerScriptTab();
  renderSidebar(tabLabel, tabPane, NLSC_LAYERS, controller, state, {
    catalog,
    addUserLayer,
    removeUserLayer,
  });
})();
