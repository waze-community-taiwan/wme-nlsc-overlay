/**
 * WME NLSC Overlay — Placeholder entry point
 *
 * This IIFE script bootstraps the userscript and waits for WME readiness.
 * Phase 0: proves the script loads and WME detection works.
 * Phase 1: SDK initialization and config.
 * Phase 2: tile layer registration and rendering.
 * Phase 3: UI (sidebar panel, LayerSwitcher integration).
 */

(() => {
  console.log("[wme-nlsc-overlay] loaded");

  /**
   * Phase 1 extension point: WME SDK initialization
   * TODO: call W.map.olMap, set up context, initialize tile layer list
   */

  /**
   * Phase 2 extension point: Tile layer registration
   * TODO: build NLSC layer sources, register with WME, attach to map
   */

  /**
   * Phase 3 extension point: UI integration
   * TODO: sidebar panel, LayerSwitcher, settings persistence
   */

  /**
   * WME readiness detection:
   * Waits for window.getWmeSdk or fires on wme-ready event.
   */
  const w = window as any;
  if (typeof w.getWmeSdk === "function") {
    console.log("[wme-nlsc-overlay] wme ready (immediate)");
  } else {
    const onWmeReady = () => {
      console.log("[wme-nlsc-overlay] wme ready (event)");
      document.removeEventListener("wme-ready", onWmeReady);
    };
    document.addEventListener("wme-ready", onWmeReady);

    // Fallback: poll for SDK availability
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      if (typeof w.getWmeSdk === "function") {
        console.log("[wme-nlsc-overlay] wme ready (poll)");
        clearInterval(pollInterval);
        document.removeEventListener("wme-ready", onWmeReady);
      }
      pollCount++;
      if (pollCount > 100) {
        // 10 seconds timeout
        clearInterval(pollInterval);
        console.warn("[wme-nlsc-overlay] timeout waiting for WME");
      }
    }, 100);
  }
})();
