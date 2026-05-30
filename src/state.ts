/**
 * Persisted preferences for the floating layer box — the draggable in-page
 * overlay that lists visible layers and provides a per-layer "put on top"
 * control. Grouped as a nested object so backward compatibility needs only a
 * single default-fill in [[loadState]].
 */
export interface FloatBoxState {
  /** Whether the floating box is shown. Defaults to `true`. */
  enabled: boolean;
  /** Box opacity in the inclusive range `0.1`–`1.0`. Defaults to `0.9`. */
  opacity: number;
  /** Last on-screen x position in px from the viewport left; `null` = default. */
  x: number | null;
  /** Last on-screen y position in px from the viewport top; `null` = default. */
  y: number | null;
}

/** Persisted user preferences for NLSC overlay layers. */
export interface NlscState {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
  /**
   * Per-layer tint as a `#RRGGBB` hex string. Missing or `null` means "original
   * tile colors" (no filter applied). Validated on load — any malformed value
   * is dropped silently.
   */
  color: Record<string, string | null>;
  /**
   * Code of the single layer pinned above the WME editor band (roads, places,
   * hazards…). `null` means every NLSC layer sits below the editor band — the
   * default behavior. At most one layer can hold this slot at a time; the
   * sidebar enforces radio-button semantics. State is preserved when the
   * layer is hidden, so toggling visibility back on restores its top spot.
   */
  aboveCode: string | null;
  /** Catalog layer codes the user has added beyond the built-in defaults. */
  userLayers: string[];
  /**
   * Codes from [[NLSC_LAYERS]] (the first-install defaults) the user has
   * explicitly removed. Suppresses automatic re-registration on the next page
   * load — without this, removing a default would simply re-appear on reload.
   * Cleared per-code when the user re-adds a default from the catalog picker.
   */
  removedDefaults: string[];
  /**
   * Stack/display order, in sidebar top-to-bottom order. Index 0 = top of the
   * sidebar list = top of the NLSC overlay stack (still below editor layers).
   * Reconciled against currently-registered layers at startup — unknown codes
   * are dropped, newly-registered codes are prepended.
   */
  layerOrder: string[];
  /** Floating layer box preferences (enabled flag, opacity, last position). */
  floatBox: FloatBoxState;
}

const STORAGE_KEY = "wme-nlsc-overlay:state";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Default floating-box settings, used on fresh installs and as fallbacks. */
function defaultFloatBox(): FloatBoxState {
  return { enabled: true, opacity: 0.9, x: null, y: null };
}

/**
 * Validate the persisted `floatBox` defensively, matching the tolerant style of
 * the rest of [[loadState]]. Missing key or invalid fields fall back to the
 * defaults so older states (no `floatBox`) and corrupt values stay safe.
 */
function parseFloatBox(value: unknown): FloatBoxState {
  if (typeof value !== "object" || value === null) return defaultFloatBox();
  const raw = value as Partial<Record<keyof FloatBoxState, unknown>>;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
  const opacity =
    typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
      ? Math.min(1.0, Math.max(0.1, raw.opacity))
      : 0.9;
  const x =
    typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : null;
  const y =
    typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : null;
  return { enabled, opacity, x, y };
}

function emptyState(): NlscState {
  return {
    visible: {},
    opacity: {},
    userLayers: [],
    removedDefaults: [],
    color: {},
    aboveCode: null,
    layerOrder: [],
    floatBox: defaultFloatBox(),
  };
}

export function loadState(): NlscState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<NlscState> | null;
    const color: Record<string, string | null> = {};
    if (parsed && typeof parsed.color === "object" && parsed.color !== null) {
      for (const [k, v] of Object.entries(parsed.color)) {
        if (typeof v === "string" && HEX_COLOR_RE.test(v)) color[k] = v;
      }
    }
    const layerOrder: string[] =
      parsed && Array.isArray(parsed.layerOrder)
        ? parsed.layerOrder.filter((c): c is string => typeof c === "string")
        : [];

    // `aboveCode` is the new single-slot model. If the persisted state was
    // written by a previous version that used `above: Record<string, boolean>`,
    // migrate: pick whichever true-entry is highest in layerOrder (= topmost
    // in the sidebar) so the user's most-recent intent survives. Falls back
    // to the first true key if no order is recorded.
    let aboveCode: string | null = null;
    const parsedAny = parsed as unknown as { aboveCode?: unknown; above?: unknown };
    if (typeof parsedAny?.aboveCode === "string") {
      aboveCode = parsedAny.aboveCode;
    } else if (parsedAny?.aboveCode === null) {
      aboveCode = null;
    } else if (parsedAny?.above && typeof parsedAny.above === "object") {
      const truthy: string[] = [];
      for (const [k, v] of Object.entries(parsedAny.above as Record<string, unknown>)) {
        if (v === true) truthy.push(k);
      }
      if (truthy.length === 1) {
        aboveCode = truthy[0];
      } else if (truthy.length > 1) {
        const set = new Set(truthy);
        aboveCode = layerOrder.find((c) => set.has(c)) ?? truthy[0];
      }
    }

    return {
      visible:
        parsed && typeof parsed.visible === "object" && parsed.visible !== null
          ? (parsed.visible as Record<string, boolean>)
          : {},
      opacity:
        parsed && typeof parsed.opacity === "object" && parsed.opacity !== null
          ? (parsed.opacity as Record<string, number>)
          : {},
      color,
      aboveCode,
      userLayers:
        parsed && Array.isArray(parsed.userLayers)
          ? parsed.userLayers.filter((c): c is string => typeof c === "string")
          : [],
      removedDefaults:
        parsed && Array.isArray(parsed.removedDefaults)
          ? parsed.removedDefaults.filter((c): c is string => typeof c === "string")
          : [],
      layerOrder,
      floatBox: parseFloatBox(parsed?.floatBox),
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: NlscState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (quota / privacy mode) — drop silently.
  }
}
