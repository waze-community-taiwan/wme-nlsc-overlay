/**
 * The Floating Layer Box — a draggable, partially-transparent in-page panel
 * that lists the currently-visible NLSC layers and gives each a one-click
 * "put on top" control. It is a *second view* over the existing
 * [[NlscController]]: it introduces no new layer logic and reads/writes layer
 * state exclusively through the controller and the shared [[NlscState]].
 *
 * Mirrors the structure of `sidebar.ts` / `terms.ts`: a module-private style
 * block injected once, a public factory function, and internal helpers.
 *
 * This module owns mount/unmount, opacity, and the enable/disable lifecycle.
 * Row rendering, controller subscriptions, and drag handling are layered on by
 * later tasks; the box element is built with the structural anchors they need
 * (a header drag handle and a row container).
 */
import type { NlscLayer } from "./layers";
import type { NlscState } from "./state";
import { saveState } from "./state";
import type { NlscController } from "./controller";

export interface FloatingBoxDeps {
  controller: NlscController;
  state: NlscState;
  /** Resolve display metadata for a layer code (NLSC_LAYERS ∪ catalog). */
  getLayer: (code: string) => NlscLayer | undefined;
  /** Where to attach. Defaults to document.body. Injectable for tests. */
  root?: HTMLElement;
}

/** Imperative handle the settings panel drives. */
export interface BoxControls {
  setEnabled: (enabled: boolean) => void;
  setOpacity: (opacity: number) => void;
  isEnabled: () => boolean;
  getOpacity: () => number;
  /**
   * Subscribe to enabled-state changes. Fires for every transition regardless
   * of origin (sidebar toggle, the box's own close button, or programmatic),
   * letting the sidebar toggle stay in sync when the box is closed via its × .
   * Returns an unsubscribe function.
   */
  onEnabledChange: (listener: (enabled: boolean) => void) => () => void;
}

export interface FloatingBoxHandle {
  controls: BoxControls;
  /** Tear down DOM + listeners (used by tests; not needed in production). */
  destroy: () => void;
}

const STYLE_ID = "nlsc-floatbox-styles";

/** Default floating-box opacity, used when the stored value is non-finite. */
const DEFAULT_OPACITY = 0.9;

/** Default top-left position (px), clear of WME's left sidebar. */
const DEFAULT_X = 80;
const DEFAULT_Y = 100;

/** Deferred-attach budget: retry attaching at most this often, for this long. */
const ATTACH_RETRY_INTERVAL_MS = 1000;
const ATTACH_RETRY_DEADLINE_MS = 30_000;

/** Message shown in place of the row list when no layer is currently visible. */
const EMPTY_MESSAGE = "目前沒有顯示中的圖層";

const NLSC_FLOATBOX_STYLES = `
.nlsc-floatbox { position: fixed; z-index: 2147483000; min-width: 200px; max-width: 320px; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--hairline, rgba(128,128,128,0.3)); background: var(--background_default, #fff); color: inherit; box-shadow: 0 6px 24px rgba(0,0,0,0.28); font-size: 13px; overflow: hidden; }
.nlsc-floatbox-header { display: flex; align-items: center; gap: 8px; padding: 2px 12px; cursor: move; user-select: none; border-bottom: 1px solid var(--hairline, rgba(128,128,128,0.2)); background: rgba(128,128,128,0.08); }
.nlsc-floatbox-title { flex: 1; min-width: 0; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Close_Control: a top-right × that hides the box (persisting enabled=false).
   Lives inside the draggable header but is excluded from drag (see wireDrag). */
.nlsc-floatbox-close { flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent; color: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.15s, background-color 0.15s, transform 0.05s; }
.nlsc-floatbox-close:hover { opacity: 1; background: rgba(128,128,128,0.18); }
.nlsc-floatbox-close:active { transform: scale(0.92); }
.nlsc-floatbox-close:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,149,0,0.35); }
.nlsc-floatbox-close svg { width: 13px; height: 13px; display: block; pointer-events: none; }
.nlsc-floatbox-rows { padding: 6px 8px; max-height: 320px; overflow-y: auto; }
.nlsc-floatbox-empty { padding: 8px 4px; opacity: 0.65; text-align: center; }
.nlsc-floatbox-row { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 6px; }
.nlsc-floatbox-row + .nlsc-floatbox-row { border-top: 1px solid var(--hairline, rgba(128,128,128,0.12)); }
.nlsc-floatbox-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* On_Top_Control: mirrors the sidebar's .nlsc-above-btn "bring to front" glyph.
   Muted by default; orange + opaque when this layer holds the above slot. The
   active look is keyed on both .is-active and aria-pressed="true" so either
   stays visually correct. */
.nlsc-floatbox-top { flex-shrink: 0; width: 26px; height: 22px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.35); background: transparent; color: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.15s, background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.05s; }
.nlsc-floatbox-top:hover { opacity: 1; }
.nlsc-floatbox-top:active { transform: scale(0.94); }
.nlsc-floatbox-top.is-active, .nlsc-floatbox-top[aria-pressed="true"] { background: #ff9500; border-color: #ff9500; color: #fff; opacity: 1; }
.nlsc-floatbox-top:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,149,0,0.35); }
.nlsc-floatbox-top svg { width: 14px; height: 14px; display: block; pointer-events: none; }

[wz-theme="dark"] .nlsc-floatbox { background: #1f2024; border-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-floatbox-header { border-bottom-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); }
`;

/**
 * Inline "bring to front" glyph (dim back square + filled front square),
 * reused from the sidebar's above-button so the two views read identically.
 * Inline SVG lets it inherit the button's `currentColor` (muted off, white on
 * the orange active background).
 */
const ABOVE_GLYPH_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true">' +
  '<rect x="2" y="5.5" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>' +
  '<rect x="6.5" y="2" width="7.5" height="7.5" rx="1.4" fill="currentColor"/>' +
  "</svg>";

/** Inline "close" glyph (an ×) for the header's Close_Control. */
const CLOSE_GLYPH_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
  "</svg>";

function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = NLSC_FLOATBOX_STYLES;
  document.head.appendChild(style);
}

/**
 * Clamp an opacity value to the renderable range. Non-finite input (missing /
 * `NaN` / `Infinity`) falls back to the default; everything else is clamped to
 * the inclusive `[0.1, 1.0]` band so the box can never vanish entirely.
 */
function clampOpacity(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_OPACITY;
  return Math.min(1.0, Math.max(0.1, v));
}

export function createFloatingBox(deps: FloatingBoxDeps): FloatingBoxHandle {
  const { state } = deps;
  const { controller, getLayer } = deps;

  injectStyles();

  // Built once on first mount and reused thereafter: unmount() detaches it
  // from the DOM but keeps the reference, so re-enabling re-attaches the same
  // element with its persisted opacity/position.
  let element: HTMLElement | null = null;
  // Structural anchors the later tasks build on (row rendering / drag).
  let headerEl: HTMLElement | null = null;
  let rowsEl: HTMLElement | null = null;
  // Deferred-attach interval handle, active only while document.body is absent.
  let attachTimer: ReturnType<typeof setInterval> | null = null;
  // Enabled-state subscribers (e.g. the sidebar toggle), notified on every
  // transition so the views stay in sync when the box closes via its × button.
  const enabledListeners = new Set<(enabled: boolean) => void>();

  // Drag state. `dragging` gates pointermove/up so a stray move (or a move
  // after the pointer was released) is ignored. The offset is the distance from
  // the pointer to the box's top-left captured at pointerdown, kept constant
  // across the drag so the corner tracks the pointer 1:1 (Req 3.1).
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragPointerId: number | null = null;

  function resolveRoot(): HTMLElement | null {
    if (deps.root) return deps.root;
    if (typeof document !== "undefined" && document.body) return document.body;
    return null;
  }

  function buildElement(): HTMLElement {
    const el = document.createElement("div");
    el.className = "nlsc-floatbox";

    // Header doubles as the drag handle (task 6.1 wires the pointer handlers).
    const header = document.createElement("div");
    header.className = "nlsc-floatbox-header";

    const title = document.createElement("span");
    title.className = "nlsc-floatbox-title";
    title.textContent = "NLSC Overlay";
    header.appendChild(title);

    // Close_Control: hides the box (enabled=false). Reopened from the sidebar's
    // "顯示懸浮視窗" toggle, which mirrors this via onEnabledChange.
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "nlsc-floatbox-close";
    closeBtn.title = "關閉懸浮視窗";
    closeBtn.setAttribute("aria-label", "關閉懸浮視窗");
    closeBtn.innerHTML = CLOSE_GLYPH_SVG;
    closeBtn.addEventListener("click", () => setEnabled(false));
    header.appendChild(closeBtn);

    // Row container; populated by renderRows() in task 4.1.
    const rows = document.createElement("div");
    rows.className = "nlsc-floatbox-rows";

    el.appendChild(header);
    el.appendChild(rows);

    headerEl = header;
    rowsEl = rows;
    wireDrag(header);
    return el;
  }

  function ensureElement(): HTMLElement {
    if (!element) element = buildElement();
    return element;
  }

  /** Set `element.style.opacity` from the (clamped) stored opacity. */
  function applyOpacity(): void {
    if (!element) return;
    element.style.opacity = String(clampOpacity(state.floatBox.opacity));
  }

  /**
   * Apply the resolved top-left position to the element's inline style. Resolved
   * means: persisted x/y (or the default when null) clamped into the viewport so
   * the whole box — and therefore the drag handle — stays reachable (Req 7.5).
   */
  function applyPosition(): void {
    if (!element) return;
    const { x, y } = resolvePosition();
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  /** Default top-left position, clear of WME's left sidebar. */
  function defaultPosition(): { x: number; y: number } {
    return { x: DEFAULT_X, y: DEFAULT_Y };
  }

  /**
   * The box's rendered size. jsdom (and an unattached element) reports 0 for
   * layout, so a measured 0 means "size unknown" — we treat it as 0 and let the
   * clamp lower-bound (0) keep the position valid rather than producing a
   * negative upper bound.
   */
  function boxSize(): { width: number; height: number } {
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.offsetWidth || 0;
    const height = rect.height || element.offsetHeight || 0;
    return { width, height };
  }

  /** Clamp `v` into `[0, max]`, guarding `max < 0` (box larger than viewport). */
  function clampAxis(v: number, max: number): number {
    return Math.max(0, Math.min(Math.max(0, max), v));
  }

  /**
   * Resolve the position to apply on mount / after a drag: persisted x/y, or the
   * default when either is null, clamped into
   * `[0, innerWidth − boxWidth] × [0, innerHeight − boxHeight]` (Req 7.5).
   */
  function resolvePosition(): { x: number; y: number } {
    let { x, y } = state.floatBox;
    if (x == null || y == null) ({ x, y } = defaultPosition());
    const { width, height } = boxSize();
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    return {
      x: clampAxis(x, vw - width),
      y: clampAxis(y, vh - height),
    };
  }

  /**
   * Bind pointer-based drag to the header handle (Req 3). Handlers live on the
   * handle only, so a pointerdown on a row button never starts a drag (Req 3.5).
   * `setPointerCapture`/`releasePointerCapture` are guarded for jsdom, where
   * they may be undefined.
   */
  function wireDrag(handle: HTMLElement): void {
    handle.addEventListener("pointerdown", (e: PointerEvent) => {
      if (!element) return;
      // A pointerdown on an interactive header control (e.g. the close button)
      // must not start a drag, so its click fires cleanly (Req 3.5).
      if ((e.target as HTMLElement | null)?.closest("button")) return;
      const rect = element.getBoundingClientRect();
      // Distance from pointer to the box top-left, held constant for the drag.
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      dragging = true;
      dragPointerId = e.pointerId;
      if (typeof handle.setPointerCapture === "function") {
        handle.setPointerCapture(e.pointerId);
      }
      // Suppress text selection during the drag (Req 3.3).
      handle.style.userSelect = "none";
      e.preventDefault();
    });

    handle.addEventListener("pointermove", (e: PointerEvent) => {
      if (!dragging || !element) return;
      const { width, height } = boxSize();
      const vw = typeof window !== "undefined" ? window.innerWidth : 0;
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      const left = clampAxis(e.clientX - dragOffsetX, vw - width);
      const top = clampAxis(e.clientY - dragOffsetY, vh - height);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    });

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (
        dragPointerId !== null &&
        typeof handle.releasePointerCapture === "function"
      ) {
        handle.releasePointerCapture(dragPointerId);
      }
      dragPointerId = null;
      handle.style.userSelect = "";
      // Persist the resting position (Req 3.4, 7.3). parseInt tolerates the
      // trailing "px"; fall back to the resolved position if style is unset.
      if (element) {
        const left = parseInt(element.style.left, 10);
        const top = parseInt(element.style.top, 10);
        const resolved = resolvePosition();
        state.floatBox.x = Number.isFinite(left) ? left : resolved.x;
        state.floatBox.y = Number.isFinite(top) ? top : resolved.y;
        saveState(state);
      }
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  /**
   * Rebuild the visible-layer list. The box is a stateless view: every call
   * reads the live `state` + `getOrder()` rather than caching, so a full
   * rebuild (the list is at most a handful of rows) keeps the logic trivial
   * and free of per-row listener bookkeeping. Task 5 calls this from the
   * controller's onVisibleChange / onAboveChange / onOrderChange subscriptions.
   */
  function renderRows(): void {
    if (!rowsEl) return;
    rowsEl.textContent = "";

    // List = visible layers, in getOrder() order. Catalog misses (no display
    // metadata to render a name) are skipped (Req 2.1, 2.2).
    const codes = controller
      .getOrder()
      .filter((code) => state.visible[code]);

    let rendered = 0;
    for (const code of codes) {
      const layer = getLayer(code);
      if (!layer) continue;
      rowsEl.appendChild(buildRow(code, layer));
      rendered++;
    }

    // Empty state: no visible layer resolved to a row (Req 2.9).
    if (rendered === 0) {
      const empty = document.createElement("div");
      empty.className = "nlsc-floatbox-empty";
      empty.textContent = EMPTY_MESSAGE;
      rowsEl.appendChild(empty);
    }
  }

  /**
   * Build a single row: the layer's title plus one On_Top_Control. The control
   * reflects whether this layer holds the above slot via `aria-pressed` and an
   * `is-active` class (Req 2.3, 2.6). Because rows are always rebuilt from the
   * live `state.aboveCode`, at most one control is ever active (Req 2.7).
   */
  function buildRow(code: string, layer: NlscLayer): HTMLElement {
    const row = document.createElement("div");
    row.className = "nlsc-floatbox-row";

    const label = document.createElement("span");
    label.className = "nlsc-floatbox-label";
    label.textContent = layer.title;
    label.title = layer.title;
    row.appendChild(label);

    const active = state.aboveCode === code;
    const topBtn = document.createElement("button");
    topBtn.type = "button";
    topBtn.className = active ? "nlsc-floatbox-top is-active" : "nlsc-floatbox-top";
    topBtn.title = "置於物件之上";
    topBtn.setAttribute("aria-pressed", active ? "true" : "false");
    topBtn.innerHTML = ABOVE_GLYPH_SVG;

    topBtn.addEventListener("click", () => {
      // Defensive guard: ignore activations targeting a layer that is no longer
      // visible — leave the above slot and the list unchanged (Req 2.10).
      if (!state.visible[code]) return;
      // Toggle: pin when this layer isn't the pinned one, release when it is.
      // The controller's radio logic demotes any previously-pinned layer; the
      // box repaints purely off onAboveChange (Req 2.4, 2.5).
      controller.setAbove(code, state.aboveCode !== code);
    });

    row.appendChild(topBtn);
    return row;
  }

  /**
   * Build (once) and attach the box to its root. Idempotent: re-calling while
   * already attached is a no-op beyond re-applying opacity/position. Returns
   * `false` when the root (document.body) is not yet available.
   */
  function mount(): boolean {
    ensureElement();
    const target = resolveRoot();
    if (!target) return false;
    if (element!.parentNode !== target) target.appendChild(element!);
    applyOpacity();
    applyPosition();
    renderRows();
    return true;
  }

  /** Remove the box from the DOM entirely (not merely hidden). */
  function unmount(): void {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  function stopRetry(): void {
    if (attachTimer !== null) {
      clearInterval(attachTimer);
      attachTimer = null;
    }
  }

  /**
   * Retry attaching when the page content isn't ready yet: poll at a ≤1s
   * interval for up to 30s, stopping as soon as the box attaches or the
   * deadline passes (Req 1.5).
   */
  function scheduleRetry(): void {
    if (attachTimer !== null) return;
    if (typeof setInterval === "undefined") return;
    const deadline = Date.now() + ATTACH_RETRY_DEADLINE_MS;
    attachTimer = setInterval(() => {
      if (mount() || Date.now() >= deadline) stopRetry();
    }, ATTACH_RETRY_INTERVAL_MS);
  }

  function setEnabled(enabled: boolean): void {
    const changed = state.floatBox.enabled !== enabled;
    state.floatBox.enabled = enabled;
    saveState(state);
    if (enabled) {
      if (!mount()) scheduleRetry();
    } else {
      stopRetry();
      unmount();
    }
    if (changed) {
      for (const listener of enabledListeners) listener(enabled);
    }
  }

  function setOpacity(opacity: number): void {
    state.floatBox.opacity = clampOpacity(opacity);
    saveState(state);
    applyOpacity();
  }

  function isEnabled(): boolean {
    return state.floatBox.enabled;
  }

  function getOpacity(): number {
    return state.floatBox.opacity;
  }

  function onEnabledChange(listener: (enabled: boolean) => void): () => void {
    enabledListeners.add(listener);
    return () => enabledListeners.delete(listener);
  }

  function destroy(): void {
    stopRetry();
    unmount();
    enabledListeners.clear();
    element = null;
    headerEl = null;
    rowsEl = null;
  }

  // Live sync (Req 8): the box and the sidebar are peer views over the same
  // controller, so every change broadcasts to both regardless of origin. A full
  // renderRows() rebuild keeps each view honest:
  //   • onVisibleChange — add/remove rows as layers show/hide (Req 8.1, 8.2),
  //     and restore the pinned row's active look when a hidden pinned layer
  //     reappears (Req 8.5, 8.6).
  //   • onAboveChange   — repaint active/inactive controls; a pin from either
  //     view is mirrored in the other (Req 8.3, 8.4).
  //   • onOrderChange   — keep row order matching getOrder() (Req 2.1).
  // These fire whether or not the box is mounted; renderRows() no-ops when the
  // row container is absent, so an unmounted box stays inert.
  controller.onVisibleChange(() => renderRows());
  controller.onAboveChange(() => renderRows());
  controller.onOrderChange(() => renderRows());

  // Mount immediately when enabled so the box appears without opening the
  // settings panel (Req 1.4). If document.body isn't ready, defer with retry.
  if (state.floatBox.enabled) {
    if (!mount()) scheduleRetry();
  }

  const controls: BoxControls = {
    setEnabled,
    setOpacity,
    isEnabled,
    getOpacity,
    onEnabledChange,
  };
  return { controls, destroy };
}
