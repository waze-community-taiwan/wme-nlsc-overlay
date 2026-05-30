# Design Document

## Overview

The Floating Layer Box is a draggable, partially-transparent in-page panel that lists the currently-visible NLSC layers and gives each a one-click "put on top" button. It lets editors flip which NLSC layer paints above the WME editor objects (roads, places, hazards) without opening the NLSC Overlay sidebar tab.

The feature is deliberately thin. It does **not** introduce any new layer logic. Instead it is a second *view* over the existing `NlscController`:

- "Put on top" calls the existing radio-style `controller.setAbove(code, true/false)` — the same single-slot `state.aboveCode` mechanism the sidebar's "above WME objects" button already uses.
- "Enabled layers" are read from `state.visible` + `controller.getOrder()`.
- The box stays in sync with the sidebar (and vice-versa) purely through the controller's existing `onVisibleChange` / `onAboveChange` / `onOrderChange` subscriptions. No new cross-component wiring is needed; both views subscribe to the same source of truth.

New persisted preferences (enabled flag, opacity, last drag position) are added as one `floatBox` sub-object on `NlscState`, saved through the existing `loadState` / `saveState`.

Two source files change and one new file is added:

| File | Change |
| --- | --- |
| `src/floatbox.ts` (new) | Renders and manages the floating box; owns drag + sync logic. |
| `src/state.ts` | Adds the `floatBox` field to `NlscState` with load-time validation/defaults. |
| `src/sidebar.ts` | Adds a "懸浮圖層框" (floating box) settings section: enable toggle + opacity slider. |
| `src/index.ts` | Constructs the box after the controller is ready; passes box controls to the sidebar. |

### Requirements coverage

| Requirement | Addressed by |
| --- | --- |
| 1 Render on page | `FloatingBox` mount/unmount, `position: fixed`, high `z-index`, deferred attach with retry |
| 2 Enabled-layer list + on-top control | `renderRows()` reading `getOrder()` + `state.visible`; `setAbove` on click |
| 3 Drag anywhere | Pointer-based drag on header handle, viewport clamping |
| 4 Partial transparency | `clampOpacity()` applied to element `opacity` |
| 5 Enable/disable from settings | `BoxControls.setEnabled` invoked by sidebar toggle |
| 6 Opacity from settings | `BoxControls.setOpacity` invoked by sidebar slider |
| 7 Persistence | `state.floatBox` via `saveState`; load-time validation + viewport recovery |
| 8 Sync with layer state | Controller `onVisibleChange` / `onAboveChange` / `onOrderChange` subscriptions |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ index.ts (entry)                                               │
│   • builds NlscController (existing)                           │
│   • getLayer(code) resolver over NLSC_LAYERS + catalog         │
│                                                                │
│   const box = createFloatingBox({ controller, state,          │
│                                    getLayer })                 │
│                                                                │
│   renderSidebar(..., { boxControls: box.controls })           │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
   ┌────────────────────────┐      ┌────────────────────────────┐
   │ floatbox.ts            │      │ sidebar.ts                  │
   │  FloatingBox           │      │  "懸浮圖層框" section:       │
   │   - mount()/unmount()  │      │   • enable toggle  ─────────┼──► box.controls.setEnabled()
   │   - renderRows()       │      │   • opacity slider ─────────┼──► box.controls.setOpacity()
   │   - drag handlers      │      └────────────────────────────┘
   │   - subscribes to:     │
   │       onVisibleChange  │◄──────────┐
   │       onAboveChange    │◄────────┐ │
   │       onOrderChange    │◄──────┐ │ │
   └───────────┬────────────┘       │ │ │
               │ setAbove()         │ │ │   (same controller instance —
               ▼                    │ │ │    events fan out to BOTH views)
   ┌────────────────────────────────┴─┴─┴──┐
   │ NlscController (existing, unchanged)   │
   │   single source of truth + state       │
   └────────────────────────────────────────┘
```

The key architectural point: the floating box and the sidebar are **peer views** of one controller. Requirement 8's two-way sync falls out for free because every `setAbove` / `setVisible` call broadcasts to all subscribers, regardless of which view originated it.

## Components and Interfaces

### `src/floatbox.ts` (new module)

Mirrors the structure of `sidebar.ts` / `terms.ts`: a module-private style block injected once, a public factory function, and internal render helpers.

```ts
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
}

export interface FloatingBoxHandle {
  controls: BoxControls;
  /** Tear down DOM + listeners (used by tests; not needed in production). */
  destroy: () => void;
}

export function createFloatingBox(deps: FloatingBoxDeps): FloatingBoxHandle;
```

Internal responsibilities:

- **Mount / unmount** (`Req 1`, `Req 5`)
  - `mount()` builds the box element once and appends it to `root`. Idempotent.
  - `unmount()` removes the element from the DOM (so Req 1.2 / Req 5.4 hold: when disabled the element is *not present*, not merely hidden).
  - `setEnabled(true)` → mount + render + apply opacity/position; `setEnabled(false)` → unmount. Both persist via `saveState`.

- **Row rendering** (`Req 2`, `Req 8`)
  - `renderRows()` computes the visible-layer list as `controller.getOrder().filter(code => state.visible[code])`, resolves each via `getLayer`, and rebuilds the row container. (Full rebuild keeps the logic trivial; the list is at most a handful of layers.)
  - Each row: a label with `layer.title` and one On_Top_Control button.
  - On_Top_Control click → `const pinned = state.aboveCode === code; controller.setAbove(code, !pinned);`. The controller's radio logic handles demoting any previously-pinned layer; the box only listens for `onAboveChange` to repaint button state, so Req 2.6/2.7 are satisfied without the box tracking state itself.
  - Empty state (`Req 2.9`): when the filtered list is empty, render a single message row (e.g. "目前沒有顯示中的圖層").
  - The On_Top_Control reflects active state with `aria-pressed` + an `is-active` class (Req 2.6); since the box always rebuilds rows from the current `state.aboveCode`, at most one is ever active (Req 2.7).

- **Drag** (`Req 3`)
  - The header bar is the drag handle (`cursor: move`, `user-select: none`).
  - `pointerdown` on the handle: record `offsetX = e.clientX - rect.left`, `offsetY = e.clientY - rect.top`, call `setPointerCapture`, set a `dragging` flag.
  - `pointermove` while dragging: `left = clamp(e.clientX - offsetX, 0, innerWidth - boxWidth)`, same for top; write to `style.left/top`. Clamping keeps the handle in-viewport (Req 3.2, and aligns with Req 7.5).
  - `pointerup`: clear flag, release capture, persist `state.floatBox.x/y` via `saveState` (Req 3.4, Req 7.3).
  - `pointerdown` originating outside the handle (e.g. on a button) does not start a drag (Req 3.5) — handlers are bound to the handle element only, and buttons `stopPropagation` is unnecessary because they're separate listeners.

- **Opacity** (`Req 4`)
  - `applyOpacity()` sets `element.style.opacity = String(clampOpacity(state.floatBox.opacity))`.
  - `clampOpacity(v)` returns `0.9` for non-finite input, otherwise `Math.min(1, Math.max(0.1, v))` (Req 4.1–4.6).

- **Subscriptions** (`Req 8`) — registered once in the factory:
  - `controller.onVisibleChange(() => renderRows())` — add/remove rows; also restores the pinned row's active look when a hidden pinned layer reappears (Req 8.1/8.2/8.5/8.6).
  - `controller.onAboveChange(() => renderRows())` — repaint active/inactive buttons (Req 8.3). Because the sidebar shares the controller, a click in the box also updates the sidebar (Req 8.4) and vice-versa.
  - `controller.onOrderChange(() => renderRows())` — keep row order matching `getOrder()` (Req 2.1).

> Note: the box never reads or writes `state.aboveCode` directly for pinning; it always goes through `controller.setAbove`. The persisted `aboveCode` is retained automatically when a pinned layer is hidden (existing controller behavior — see `sidebar.test.ts`), satisfying Req 8.5.

### `src/state.ts` changes

Add a `floatBox` field to `NlscState`:

```ts
export interface FloatBoxState {
  enabled: boolean;     // default true
  opacity: number;      // 0.1–1.0, default 0.9
  x: number | null;     // px from left; null = use default position
  y: number | null;     // px from top;  null = use default position
}

export interface NlscState {
  // ...existing fields...
  floatBox: FloatBoxState;
}
```

- `emptyState()` returns `floatBox: { enabled: true, opacity: 0.9, x: null, y: null }` (Req 5.2, Req 7.6).
- `loadState()` validates the parsed `floatBox` defensively (matching the file's existing tolerant style):
  - `enabled`: boolean, else `true`.
  - `opacity`: finite number clamped to `[0.1, 1.0]`, else `0.9` (Req 7.6 invalid-value path).
  - `x` / `y`: finite number or `null`.
- `null` x/y means "no saved position"; the box computes a sensible default on mount (see Position handling). Viewport-bounds recovery (Req 7.5) is done at mount time in `floatbox.ts`, not in `state.ts`, because it needs `innerWidth`/`innerHeight` and the box's measured size.

`saveState` is unchanged — it already serializes the whole state object, so adding the field is enough. Its existing `try/catch` swallows quota/availability errors, satisfying Req 7.7.

### `src/sidebar.ts` changes

Extend `SidebarCallbacks` with an optional handle:

```ts
export interface SidebarCallbacks {
  // ...existing...
  boxControls?: BoxControls;   // from floatbox.ts
}
```

Add a "懸浮圖層框" section (rendered near the footer, before `renderTermsLink`). It reuses the existing `.nlsc-toggle` pill switch and `.nlsc-slider` styles already defined in `NLSC_STYLES`, so no new CSS is required:

- **Enable toggle** — checkbox styled as the existing pill toggle. Initial `checked = boxControls.isEnabled()`. On change → `boxControls.setEnabled(checkbox.checked)` (Req 5.1, 5.3, 5.4, 5.5).
- **Opacity slider** — `<input type="range" min="10" max="100" step="5">` (step 5 → ≤0.05 increments, Req 6.1). Initial `value = round(boxControls.getOpacity() * 100)`. On `input` → `boxControls.setOpacity(Number(value) / 100)`; a value label shows the percentage like the per-layer opacity rows (Req 6.2). The `setOpacity` impl clamps (Req 6.3/6.4).

If `boxControls` is omitted (e.g. older callers / unit tests that don't exercise the box), the section is skipped — keeps existing `renderSidebar` tests valid.

### `src/index.ts` changes

After the controller is built and before/around `renderSidebar`:

```ts
const layerByCode = new Map<string, NlscLayer>();
for (const l of NLSC_LAYERS) layerByCode.set(l.code, l);
for (const l of catalog) if (!layerByCode.has(l.code)) layerByCode.set(l.code, l);

const box = createFloatingBox({
  controller,
  state,
  getLayer: (code) => layerByCode.get(code),
});

// ...
renderSidebar(tabLabel, tabPane, NLSC_LAYERS, controller, state, {
  catalog, addUserLayer, removeUserLayer, version: SCRIPT_VERSION,
  boxControls: box.controls,
});
```

`createFloatingBox` mounts immediately when `state.floatBox.enabled` is `true` (Req 1.4). The script already runs at WME's `SDK_INITIALIZED` and only on `www.waze.com`, so `document.body` exists — but to satisfy Req 1.5 the factory guards with a small retry: if `document.body` is somehow unavailable, retry on a ≤1s interval up to 30s. New layers added via `addUserLayer` / removed via `removeUserLayer` already fire `onVisibleChange` / `onOrderChange` through the controller, so the box updates without extra wiring.

## Data Models

### Extended `NlscState` (persisted, localStorage `wme-nlsc-overlay:state`)

```ts
interface NlscState {
  visible: Record<string, boolean>;
  opacity: Record<string, number>;
  color: Record<string, string | null>;
  aboveCode: string | null;
  userLayers: string[];
  removedDefaults: string[];
  layerOrder: string[];
  floatBox: {            // NEW
    enabled: boolean;    // default true
    opacity: number;     // 0.1–1.0, default 0.9
    x: number | null;    // px from viewport left, null ⇒ default position
    y: number | null;    // px from viewport top,  null ⇒ default position
  };
}
```

Backward compatibility: existing persisted states have no `floatBox` key. `loadState` fills it with defaults, so upgrading users get an enabled box at default opacity/position. No migration step beyond the default-fill is required.

### Position handling (mount time, `floatbox.ts`)

```
defaultPosition():
  // top-left-ish, clear of WME's left sidebar; tweak constants in impl
  return { x: 80, y: 100 }

resolvePosition():
  let { x, y } = state.floatBox
  if x == null or y == null: ({x, y} = defaultPosition())
  // measure box, then clamp into viewport (Req 7.5)
  x = clamp(x, 0, innerWidth  - boxWidth)
  y = clamp(y, 0, innerHeight - boxHeight)
  return { x, y }
```

## Error Handling

| Scenario | Handling | Requirement |
| --- | --- | --- |
| `saveState` throws (quota / privacy mode) | Existing `try/catch` in `saveState` swallows it; in-memory state keeps the value; box keeps working | 7.7 |
| Persisted `opacity` invalid / out of range | `loadState` clamps or falls back to `0.9` | 4.4, 7.6 |
| Persisted position off-screen | `resolvePosition()` clamps into viewport at mount | 7.5 |
| `document.body` not ready at init | Factory retries attach ≤1s interval, ≤30s | 1.5 |
| On_Top_Control fires for a layer no longer visible | Rows are rebuilt from current state; a stale click target can't exist after rebuild. Defensive guard: `if (!state.visible[code]) return;` before `setAbove` | 2.10 |
| `getLayer(code)` returns undefined (catalog miss) | Skip that row (can't render a name); list still renders others | 2.1 |

## Testing Strategy

Follow the existing pattern: vitest unit tests under `tests/unit/*.test.ts` with `// @vitest-environment jsdom` for DOM-touching files, using a real `NlscController` + plain `NlscState` object and `vi.fn()` bindings (exactly as `sidebar.test.ts` does). The `root` injection point on `createFloatingBox` lets tests mount into a detached container.

### Unit tests — `tests/unit/floatbox.test.ts` (new)

- Renders one row per **visible** layer in `getOrder()` order; hidden layers excluded (Req 2.1, 2.2).
- Clicking an On_Top_Control calls `setAbove(code, true)` and sets `state.aboveCode`; clicking the active one releases it (Req 2.4, 2.5).
- Only one On_Top_Control is `aria-pressed="true"` at a time; pinning a second swaps (Req 2.6, 2.7) — mirrors the radio-style assertion in `sidebar.test.ts`.
- Empty state message shown when no layer is visible (Req 2.9).
- `onVisibleChange` from the controller adds/removes rows (Req 8.1, 8.2); re-showing the pinned layer restores its active button (Req 8.6).
- A `setAbove` triggered through the sidebar repaints the box's buttons via `onAboveChange` (Req 8.3); and a box click is observed by a sidebar-style `onAboveChange` listener (Req 8.4).
- `setEnabled(false)` removes the element from the DOM; `setEnabled(true)` re-adds it (Req 1.2, 5.4, 5.5).
- `setOpacity` clamps: `0.05 → 0.1`, `2 → 1`, `NaN → 0.9`; applied to `element.style.opacity` (Req 4.1–4.6, 6.3, 6.4).
- Drag: dispatch `pointerdown` on the handle then `pointermove`; assert `style.left/top` track pointer minus captured offset and stay within clamped bounds; `pointerup` persists `state.floatBox.x/y` (Req 3.1, 3.2, 3.4, 7.3). `pointerdown` on a button does not move the box (Req 3.5).
- Off-screen persisted position is clamped into the viewport on mount (Req 7.5).

### Unit tests — `tests/unit/state.test.ts` (extend)

- Fresh state has `floatBox = { enabled: true, opacity: 0.9, x: null, y: null }` (Req 5.2, 7.6).
- Invalid persisted `floatBox.opacity` (e.g. `5`, `"x"`) loads back as a value within `[0.1, 1.0]` (Req 7.6).
- `enabled`/`x`/`y` type validation (non-boolean → `true`; non-finite → `null`).

### Unit tests — `tests/unit/sidebar.test.ts` (extend)

- When `boxControls` is provided, the panel renders an enable toggle and opacity slider; toggling/sliding calls `setEnabled` / `setOpacity` (Req 5.1, 5.3, 6.1, 6.2).
- When `boxControls` is omitted, no float-box section renders (keeps existing callers valid).

### E2E (optional, playwright)

Existing `test:e2e` harness can later assert the box appears on load and drags over the WME save/cancel bar, but unit coverage above is sufficient for the acceptance criteria; e2e is not required for this feature.

## Correctness Properties

These are invariants that should hold for any sequence of operations (visibility toggles, pin/unpin clicks from either view, drags, opacity/enable changes, reloads). They make good property-based or invariant-style test targets.

### Property 1: Single-pin invariant

At any time, at most one On_Top_Control in the box is in the active state, and it is active iff its layer code equals `state.aboveCode`. Holds because rows are always rebuilt from the live `state.aboveCode`, and pinning routes through the controller's radio-style `setAbove`.

**Validates: Requirements 2.6, 2.7**

### Property 2: List equals visible ∩ ordered

The set of rows rendered always equals `{ code ∈ controller.getOrder() : state.visible[code] === true }`, in `getOrder()` order. No hidden layer ever has a row; no visible layer is ever missing a row.

**Validates: Requirements 2.1, 2.2, 8.1, 8.2**

### Property 3: View agreement

After any operation settles, the box and the sidebar report the same pinned layer, because both derive their pressed state from the same `state.aboveCode` via the shared controller subscriptions.

**Validates: Requirements 8.3, 8.4**

### Property 4: Opacity bounds

The rendered element opacity is always within `[0.1, 1.0]` for every possible stored value, including non-finite or out-of-range input (clamped or defaulted to `0.9`).

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6**

### Property 5: In-viewport invariant

After mount or after any drag completes, the box's top-left is within `[0, innerWidth − boxWidth] × [0, innerHeight − boxHeight]`, so the drag handle is always reachable.

**Validates: Requirements 3.2, 7.5**

### Property 6: Persistence round-trip

For any valid `floatBox` value, `loadState(saveState(state))` yields an equal `floatBox` (with `x/y` either preserved or both `null`); invalid persisted values normalize to in-range defaults rather than propagating.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**

### Property 7: Enabled ⇔ present in DOM

The box element is attached to the DOM iff `state.floatBox.enabled === true`. Disabling removes it entirely (not merely hidden); enabling re-attaches with the persisted opacity and position.

**Validates: Requirements 1.1, 1.2, 5.4, 5.5**

## Design Decisions & Rationale

1. **Reuse `setAbove` instead of a new "on top" concept.** The requirement "put on top" is semantically identical to the existing single-slot "above WME objects" feature. Reusing it means the box and sidebar can't disagree, the restack engine needs no changes, and Req 8 sync is automatic. A parallel mechanism would risk two layers both claiming "top."

2. **Box is a stateless view; controller owns truth.** The box never caches layer state — every render reads live `state` + `getOrder()`. This eliminates a whole class of desync bugs and keeps the module small.

3. **Full row rebuild over surgical DOM diffing.** The visible-layer list is tiny (typically 1–5 rows). Rebuilding on each change is simpler and fast enough, and avoids per-row listener bookkeeping.

4. **Pointer Events for drag (not jQuery UI like the WME Toolbox sample).** The sample relies on jQuery UI, which this project doesn't bundle. Native Pointer Events with `setPointerCapture` give the same drag-anywhere behavior with zero dependencies and clean capture semantics.

5. **`floatBox` as a nested object on `NlscState`.** Groups the three related settings, keeps the top-level shape readable, and needs only a single default-fill in `loadState` for backward compatibility — no versioned migration.

6. **Settings live in the existing sidebar panel.** Req 5/6 explicitly place the controls in the NLSC Overlay tab. Reusing the existing toggle/slider CSS keeps the look consistent and adds no new styles.
