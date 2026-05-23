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
  /** Catalog layer codes the user has added beyond the built-in defaults. */
  userLayers: string[];
}

const STORAGE_KEY = "wme-nlsc-overlay:state";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function emptyState(): NlscState {
  return { visible: {}, opacity: {}, userLayers: [], color: {} };
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
      userLayers:
        parsed && Array.isArray(parsed.userLayers)
          ? parsed.userLayers.filter((c): c is string => typeof c === "string")
          : [],
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
