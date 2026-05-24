/// <reference types="wme-sdk-typings" />
import { NLSC_LAYERS, type NlscLayer } from "./layers";
import { fetchCatalog } from "./catalog";
import { loadState, saveState } from "./state";
import { renderSidebar } from "./sidebar";
import { NlscController, type LayerBinding } from "./controller";
import { filterForColor } from "./tint";
import { restackLayers } from "./restack";

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

  // Under Tampermonkey, `window` is a sandboxed proxy and the WME globals
  // (`SDK_INITIALIZED`, `getWmeSdk`, `OL`, `W`) only live on the real page
  // window, which `@grant unsafeWindow` exposes as `unsafeWindow`. Direct
  // `window.SDK_INITIALIZED` returns `undefined` in the sandbox, so the
  // script awaits `undefined` (resolves to `undefined`), then `getWmeSdk`
  // is `undefined` and the script throws before reaching `registerScriptTab`
  // — the userscript silently fails to add its tab.
  const uw: any = (window as any).unsafeWindow ?? window;

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
  const buildServerResolutions = (maxZoom: number): number[] => {
    const out: number[] = [];
    for (let z = 0; z <= maxZoom; z++) {
      out.push(WEB_MERCATOR_RES_Z0 / Math.pow(2, z));
    }
    return out;
  };

  // OL 2.x layers create `this.div` during initialize, so `.div` is available
  // immediately after construction — we can apply the SVG tint filter before
  // the layer is even added to the map.
  const applyFilter = (tileLayer: any, code: string, color: string | null): void => {
    const div = tileLayer.div as HTMLElement | undefined;
    if (!div) return;
    div.style.filter = filterForColor(code, color);
  };

  // OL tile layers indexed by NLSC code so the restacker can look them up
  // without scanning olMap.layers. Defaults + user-added entries both register
  // here via createTileLayer.
  const tileLayersByCode = new Map<string, any>();

  // Re-stack every NLSC overlay just above the base layer (algorithm lives in
  // ./restack so it can be unit-tested). Called at startup, on order changes,
  // and on olMap addlayer/removelayer events further below.
  const restackAll = (): void => {
    restackLayers(olMap, tileLayersByCode, state.layerOrder);
  };

  // NLSC WMTS axis order is /{z}/{y}/{x} — not slippy /{z}/{x}/{y}. OL 2.x
  // XYZ expands `${z}` / `${x}` / `${y}` placeholders verbatim, so swapping
  // x and y in the template handles the axis order naturally.
  const createTileLayer = (
    layer: NlscLayer,
    visible: boolean,
    opacity: number,
    color: string | null,
  ): any => {
    const urlTemplate =
      `https://wmts.nlsc.gov.tw/wmts/${layer.code}/default/GoogleMapsCompatible/\${z}/\${y}/\${x}`;
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

  const bindingFor = (layer: NlscLayer, tileLayer: any): LayerBinding => ({
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

  (uw as any).__nlscLayers = defaultEntries;
  console.log(`[${SCRIPT_ID}] registered ${defaultEntries.length} default NLSC tile layers`);

  const controller = new NlscController(
    state,
    defaultEntries.map(({ layer, tileLayer }) => bindingFor(layer, tileLayer)),
  );

  // Track which checkbox names we successfully registered with the SDK, so
  // remove/setChecked calls don't blow up on names the SDK never accepted.
  const registeredCheckboxes = new Set<string>();
  const safeAddCheckbox = (name: string, isChecked: boolean): void => {
    try {
      sdk.LayerSwitcher.addLayerCheckbox({ name, isChecked });
      registeredCheckboxes.add(name);
    } catch (err) {
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

  const registerCatalogLayer = (
    layer: NlscLayer,
    visible: boolean,
    opacity: number,
    color: string | null,
  ): void => {
    const tileLayer = createTileLayer(layer, visible, opacity, color);
    userTileLayers.set(layer.code, tileLayer);
    controller.addBinding(bindingFor(layer, tileLayer));
    safeAddCheckbox(layer.name, visible);
  };

  for (const code of state.userLayers) {
    const layer = catalog.find((l) => l.code === code);
    if (!layer) continue;
    const visible = state.visible[code] ?? false;
    const opacity = state.opacity[code] ?? layer.defaultOpacity;
    const color = state.color[code] ?? null;
    registerCatalogLayer(layer, visible, opacity, color);
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
    if (!layer || !registeredCheckboxes.has(layer.name)) return;
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
    const color = state.color[code] ?? null;
    registerCatalogLayer(layer, visible, opacity, color);
    if (!state.userLayers.includes(code)) state.userLayers.push(code);
    state.visible[code] = visible;
    state.opacity[code] = opacity;
    // New layers slot in at the top of the stack (sidebar top).
    state.layerOrder = [code, ...state.layerOrder.filter((c) => c !== code)];
    saveState(state);
    restackAll();
    return layer;
  };

  const removeUserLayer = (code: string): void => {
    const tileLayer = userTileLayers.get(code);
    if (!tileLayer) return;
    olMap.removeLayer(tileLayer);
    userTileLayers.delete(code);
    tileLayersByCode.delete(code);
    const layer = catalog.find((l) => l.code === code);
    if (layer && registeredCheckboxes.has(layer.name)) {
      try {
        sdk.LayerSwitcher.removeLayerCheckbox({ name: layer.name });
      } catch {
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
  const registeredCodes = new Set<string>(tileLayersByCode.keys());
  if (state.layerOrder.length === 0) {
    state.layerOrder = [
      ...state.userLayers.filter((c) => registeredCodes.has(c)).slice().reverse(),
      ...NLSC_LAYERS.map((l) => l.code).slice().reverse(),
    ];
  } else {
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
  const guardedRestack = (): void => {
    if (restacking) return;
    restacking = true;
    try {
      restackAll();
    } finally {
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
  const scheduleRestack = (label: string): void => {
    if (restackScheduled) return;
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
    } catch (err) {
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
