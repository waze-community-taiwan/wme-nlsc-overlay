/** Persisted user preferences for NLSC overlay layers. */
export interface NlscState {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
}

const STORAGE_KEY = "wme-nlsc-overlay:state";

function emptyState(): NlscState {
  return { visible: {}, opacity: {} };
}

export function loadState(): NlscState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<NlscState> | null;
    return {
      visible:
        parsed && typeof parsed.visible === "object" && parsed.visible !== null
          ? (parsed.visible as Record<string, boolean>)
          : {},
      opacity:
        parsed && typeof parsed.opacity === "object" && parsed.opacity !== null
          ? (parsed.opacity as Record<string, number>)
          : {},
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
