/// <reference types="wme-sdk-typings" />
/**
 * WME NLSC Overlay — Entry point
 *
 * Phase 1: gate to top frame, await SDK, acquire WmeSDK handle.
 * Phase 2: tile layer registration via unsafeWindow.W.map.olMap.
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

  // Phase 2 extension point: register NLSC tile layers on unsafeWindow.W.map.olMap.
  // Phase 3 extension point: sidebar panel, LayerSwitcher integration, localStorage settings.
})();
