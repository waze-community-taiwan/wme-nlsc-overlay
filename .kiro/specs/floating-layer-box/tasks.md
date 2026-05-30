# Implementation Plan

## Overview

This plan builds the Floating Layer Box as a second view over the existing `NlscController`, with no new layer logic. Work proceeds bottom-up: first extend persisted state, then build the box module incrementally (mount/opacity → row list → live sync → drag), then add the sidebar settings, wire it into the entry point, and finish with a full build/test pass. Every code task is paired with a unit test task that follows the existing vitest + jsdom conventions.

## Task Dependency Graph

```
1 (state) ──┬─► 2 (state tests)
            └─► 3.1 (box skeleton + opacity) ──► 3.2 (tests)
                       │
                       ├─► 4.1 (row list) ──► 4.2 (tests)
                       │        │
                       │        └─► 5 (sync) ──► 5.1 (tests)
                       │
                       └─► 6.1 (drag) ──► 6.2 (tests)

3.1 ──► 7.1 (sidebar settings) ──► 7.2 (tests)

(4.1, 5, 6.1, 7.1) ──► 8 (integrate in index.ts) ──► 9 (build + test suite)
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3.1"] },
    { "wave": 3, "tasks": ["3.2", "4.1", "6.1", "7.1"] },
    { "wave": 4, "tasks": ["4.2", "5", "6.2", "7.2"] },
    { "wave": 5, "tasks": ["5.1"] },
    { "wave": 6, "tasks": ["8"] },
    { "wave": 7, "tasks": ["9"] }
  ]
}
```

## Tasks

- [x] 1. Extend persisted state with the `floatBox` settings
  - In `src/state.ts`, add the `FloatBoxState` interface (`enabled`, `opacity`, `x`, `y`) and a `floatBox` field on `NlscState`.
  - Update `emptyState()` to return `floatBox: { enabled: true, opacity: 0.9, x: null, y: null }`.
  - In `loadState()`, validate the parsed `floatBox` defensively: `enabled` → boolean else `true`; `opacity` → finite number clamped to `[0.1, 1.0]` else `0.9`; `x`/`y` → finite number else `null`. Fill defaults when the key is absent (backward compatibility).
  - _Requirements: 5.2, 7.4, 7.6_

- [x] 2. Write state unit tests for `floatBox` load/save
  - Extend `tests/unit/state.test.ts`: fresh state yields `{ enabled: true, opacity: 0.9, x: null, y: null }`.
  - Invalid persisted `opacity` (e.g. `5`, `"x"`, `NaN`) loads back within `[0.1, 1.0]`; out-of-range clamps; non-boolean `enabled` → `true`; non-finite `x`/`y` → `null`.
  - Round-trip: `loadState` after a `saveState` of a valid `floatBox` preserves the values.
  - _Requirements: 5.2, 7.6_

- [x] 3. Create the floating box module skeleton with opacity + enable/disable
- [x] 3.1 Implement `createFloatingBox` factory, mount/unmount, and opacity
  - Create `src/floatbox.ts` mirroring the structure of `sidebar.ts`/`terms.ts` (single injected style block, public factory, internal helpers).
  - Define `FloatingBoxDeps` (`controller`, `state`, `getLayer`, optional `root`), `BoxControls` (`setEnabled`, `setOpacity`, `isEnabled`, `getOpacity`), and `FloatingBoxHandle` (`controls`, `destroy`).
  - Build the box element once: a `position: fixed`, high `z-index` container with a header drag handle and a row container. `mount()` appends to `root ?? document.body` (idempotent); `unmount()` removes it from the DOM.
  - Implement `clampOpacity(v)` (non-finite → `0.9`, else clamp to `[0.1, 1.0]`) and `applyOpacity()` setting `element.style.opacity`.
  - `setEnabled(true)` mounts + applies opacity/position; `setEnabled(false)` unmounts; both persist `state.floatBox.enabled` via `saveState`. `setOpacity` clamps, applies, persists.
  - On construction, mount immediately when `state.floatBox.enabled` is `true`; if `document.body` is unavailable, retry attach on a ≤1s interval up to 30s.
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.4, 5.5, 7.1, 7.2, 7.7_

- [x] 3.2 Write unit tests for mount/unmount and opacity
  - Create `tests/unit/floatbox.test.ts` with `// @vitest-environment jsdom`, using a real `NlscController`, a plain `NlscState`, `vi.fn()` bindings, and a detached `root` container.
  - `setEnabled(false)` removes the element from the DOM; `setEnabled(true)` re-adds it with persisted opacity/position.
  - `setOpacity` clamping: `0.05 → 0.1`, `2 → 1`, `NaN → 0.9`; assert `element.style.opacity`.
  - Enabled state persists to `state.floatBox.enabled`; opacity persists to `state.floatBox.opacity`.
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3, 4.4, 4.6, 5.4, 5.5, 7.1, 7.2_

- [x] 4. Render the enabled-layer list with on-top controls
- [x] 4.1 Implement `renderRows()` and On_Top_Control behavior
  - Compute the row list as `controller.getOrder().filter(code => state.visible[code])`, resolve each via `getLayer` (skip catalog misses), and rebuild the row container.
  - Each row shows `layer.title` and one On_Top_Control button; reflect active state with `aria-pressed` + an `is-active` class when `state.aboveCode === code`.
  - On_Top_Control click: guard `if (!state.visible[code]) return;`, then `controller.setAbove(code, state.aboveCode !== code)`.
  - When the filtered list is empty, render a single empty-state message row ("目前沒有顯示中的圖層").
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 4.2 Write unit tests for the layer list and on-top controls
  - One row per visible layer, in `getOrder()` order; hidden layers excluded.
  - Clicking an inactive control calls `setAbove(code, true)` and sets `state.aboveCode`; clicking the active one releases it.
  - Only one control is `aria-pressed="true"` at a time; pinning a second swaps (radio-style).
  - Empty-state message renders when no layer is visible.
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.9_

- [x] 5. Wire controller subscriptions for live sync
  - In the factory, register `controller.onVisibleChange(() => renderRows())`, `controller.onAboveChange(() => renderRows())`, and `controller.onOrderChange(() => renderRows())`.
  - Verify the box repaints on external changes and that pinning the box's control is observed by other subscribers (sidebar parity).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 5.1 Write unit tests for layer-state sync
  - `controller.setVisible(code, true/false)` adds/removes rows in the box.
  - Re-showing a hidden pinned layer (where `state.aboveCode` still equals its code) restores its row with the active control.
  - A `setAbove` made via the box fires `onAboveChange` to an external listener (sidebar stand-in); a `setAbove` made externally repaints the box's controls.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 6. Implement drag-anywhere with viewport clamping and position persistence
- [x] 6.1 Implement pointer-based drag on the header handle
  - Add `defaultPosition()` (e.g. `{ x: 80, y: 100 }`) and `resolvePosition()` that uses persisted `x`/`y` (or default when `null`) and clamps into `[0, innerWidth − boxWidth] × [0, innerHeight − boxHeight]`; apply on mount.
  - `pointerdown` on the handle: capture `offsetX/offsetY` from the box top-left, `setPointerCapture`, set dragging flag, apply `user-select: none`.
  - `pointermove` while dragging: set `style.left/top` to `clamp(clientX − offsetX, …)` / `clamp(clientY − offsetY, …)`.
  - `pointerup`: clear flag, release capture, persist `state.floatBox.x/y` via `saveState`.
  - Ensure `pointerdown` outside the handle (e.g. on a button) does not start a drag.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.3, 7.5_

- [x] 6.2 Write unit tests for drag and position recovery
  - Dispatch `pointerdown` on the handle then `pointermove`; assert `style.left/top` track pointer minus the captured offset and stay within clamped bounds.
  - `pointerup` persists `state.floatBox.x/y`.
  - `pointerdown` on a button does not move the box.
  - An off-screen persisted position is clamped into the viewport on mount.
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 7.3, 7.5_

- [x] 7. Add the floating-box settings section to the sidebar
- [x] 7.1 Render the enable toggle and opacity slider
  - Extend `SidebarCallbacks` with an optional `boxControls?: BoxControls`.
  - In `renderSidebar`, before `renderTermsLink`, render a "懸浮圖層框" section when `boxControls` is provided (skip entirely when omitted).
  - Enable toggle: reuse the `.nlsc-toggle` pill switch, initial `checked = boxControls.isEnabled()`, on change → `boxControls.setEnabled(checkbox.checked)`.
  - Opacity slider: `<input type="range" min="10" max="100" step="5">` with a percentage label (reuse `.nlsc-slider`/`.nlsc-value`); initial `value = round(boxControls.getOpacity() * 100)`, on `input` → `boxControls.setOpacity(Number(value) / 100)`.
  - _Requirements: 5.1, 5.3, 6.1, 6.2, 6.3, 6.4_

- [x] 7.2 Write sidebar unit tests for the settings section
  - With `boxControls` provided, the panel renders an enable toggle and opacity slider; toggling calls `setEnabled`, sliding calls `setOpacity`.
  - With `boxControls` omitted, no float-box section renders (existing callers/tests stay valid).
  - _Requirements: 5.1, 5.3, 6.1, 6.2_

- [x] 8. Integrate the floating box in the entry point
  - In `src/index.ts`, build a `layerByCode` map over `NLSC_LAYERS` ∪ `catalog` and a `getLayer(code)` resolver.
  - Call `createFloatingBox({ controller, state, getLayer })` after the controller is constructed.
  - Pass `boxControls: box.controls` into the `renderSidebar(...)` callbacks.
  - _Requirements: 1.4, 5.1, 6.1_

- [x] 9. Verify the full build and test suite
  - Run `npm test` and fix any failures across the new and extended specs.
  - Run `npm run build` to confirm the userscript bundles cleanly with the new module.
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

## Notes

- Tasks 2, 3.2, 4.2, 5.1, 6.2, and 7.2 are the test counterparts to their implementation tasks; they follow the existing `tests/unit/*.test.ts` pattern (`// @vitest-environment jsdom`, real `NlscController`, plain `NlscState`, `vi.fn()` bindings).
- The `root` injection point on `createFloatingBox` is what lets the unit tests mount into a detached container instead of `document.body`.
- No changes to `restack.ts` or `controller.ts` are needed — "put on top" reuses the existing `setAbove` / `state.aboveCode` mechanism, so the restack engine and controller stay untouched.
- E2E (playwright) coverage is optional for this feature; the unit tasks above cover the acceptance criteria.
