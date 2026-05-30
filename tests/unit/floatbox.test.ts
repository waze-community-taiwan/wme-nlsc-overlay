// @vitest-environment jsdom
//
// Task 3.2 — mount/unmount lifecycle and opacity for the floating layer box.
// Mirrors the existing sidebar.test.ts conventions: a real NlscController, a
// plain NlscState object, vi.fn() bindings, and a *detached* root container so
// the box mounts somewhere queryable without touching document.body.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFloatingBox } from "../../src/floatbox";
import type { FloatBoxState, NlscState } from "../../src/state";
import type { NlscLayer } from "../../src/layers";
import { NlscController } from "../../src/controller";

const makeLayer = (code: string, name: string): NlscLayer => ({
  code,
  name,
  title: name,
  format: "jpeg",
  minZoom: 0,
  maxZoom: 22,
  attribution: "test",
  defaultOpacity: 0.5,
});

const makeState = (floatBox: Partial<FloatBoxState> = {}): NlscState => ({
  visible: {},
  opacity: {},
  color: {},
  aboveCode: null,
  userLayers: [],
  removedDefaults: [],
  layerOrder: [],
  floatBox: { enabled: true, opacity: 0.9, x: null, y: null, ...floatBox },
});

const makeController = (state: NlscState, layers: NlscLayer[]): NlscController =>
  new NlscController(
    state,
    layers.map((layer) => ({
      layer,
      setLayerVisible: vi.fn(),
      setLayerOpacity: vi.fn(),
      setLayerColor: vi.fn(),
    })),
  );

/** Build a floating box mounted into a fresh detached container. */
function setup(floatBox: Partial<FloatBoxState> = {}) {
  const state = makeState(floatBox);
  const layer = makeLayer("EMAP5", "EMAP5");
  const controller = makeController(state, [layer]);
  const root = document.createElement("div"); // detached: never appended to body
  const handle = createFloatingBox({
    controller,
    state,
    getLayer: (code) => (code === layer.code ? layer : undefined),
    root,
  });
  const box = () => root.querySelector(".nlsc-floatbox") as HTMLElement | null;
  return { state, controller, root, handle, box };
}

/**
 * Multi-layer variant of `setup()` for the row-list / on-top-control tests
 * (Task 4.2). The single-layer `setup()` above leaves `layerOrder` empty, but
 * `renderRows()` reads `controller.getOrder().filter(code => visible[code])`,
 * so deterministic row order needs an explicit `order` + `visible` set. State
 * is constructed with the desired visibility/above-slot up front so the very
 * first render is deterministic (no reliance on post-mount events).
 */
function setupMulti(opts: {
  layers: ReadonlyArray<readonly [code: string, name: string]>;
  order?: string[];
  visible?: string[];
  aboveCode?: string | null;
  floatBox?: Partial<FloatBoxState>;
}) {
  const layers = opts.layers.map(([code, name]) => makeLayer(code, name));
  const byCode = new Map(layers.map((l) => [l.code, l]));
  const state = makeState(opts.floatBox);
  state.layerOrder = [...(opts.order ?? layers.map((l) => l.code))];
  for (const code of opts.visible ?? []) state.visible[code] = true;
  state.aboveCode = opts.aboveCode ?? null;
  const controller = makeController(state, layers);
  const root = document.createElement("div"); // detached
  const handle = createFloatingBox({
    controller,
    state,
    getLayer: (code) => byCode.get(code),
    root,
  });

  // Live queries: rows are rebuilt on every change, so always re-read the DOM
  // (never cache element references across a click).
  const rowEls = () =>
    Array.from(root.querySelectorAll<HTMLElement>(".nlsc-floatbox-row"));
  const labels = () =>
    rowEls().map(
      (r) => r.querySelector(".nlsc-floatbox-label")?.textContent ?? "",
    );
  const tops = () =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(".nlsc-floatbox-top"));
  const topByName = (name: string): HTMLButtonElement => {
    const row = rowEls().find(
      (r) => r.querySelector(".nlsc-floatbox-label")?.textContent === name,
    );
    const btn = row?.querySelector<HTMLButtonElement>(".nlsc-floatbox-top");
    if (!btn) throw new Error(`no On_Top_Control row for "${name}"`);
    return btn;
  };
  const pressedCount = () =>
    tops().filter((b) => b.getAttribute("aria-pressed") === "true").length;
  const emptyMsg = () =>
    root.querySelector(".nlsc-floatbox-empty") as HTMLElement | null;

  return {
    state,
    controller,
    root,
    handle,
    rowEls,
    labels,
    tops,
    topByName,
    pressedCount,
    emptyMsg,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("mount / unmount (Req 1.1, 1.2, 5.4, 5.5)", () => {
  it("mounts exactly one box into the injected root when enabled on construction", () => {
    const { root, box } = setup({ enabled: true });
    expect(root.querySelectorAll(".nlsc-floatbox").length).toBe(1);
    expect(box()).not.toBeNull();
  });

  it("does not mount the box when disabled on construction", () => {
    const { box } = setup({ enabled: false });
    expect(box()).toBeNull();
  });

  it("setEnabled(false) removes the element from the DOM", () => {
    const { handle, box } = setup({ enabled: true });
    expect(box()).not.toBeNull();

    handle.controls.setEnabled(false);
    // Req 1.2 / 5.4: the element is gone entirely, not merely hidden.
    expect(box()).toBeNull();
  });

  it("setEnabled(true) re-adds the element with persisted opacity and position", () => {
    // Persisted opacity/position should be re-applied on the re-mount (Req 5.5).
    const { handle, box } = setup({ enabled: true, opacity: 0.4, x: 200, y: 50 });

    handle.controls.setEnabled(false);
    expect(box()).toBeNull();

    handle.controls.setEnabled(true);
    const el = box();
    expect(el).not.toBeNull();
    expect(el!.style.opacity).toBe("0.4");
    expect(el!.style.left).toBe("200px");
    expect(el!.style.top).toBe("50px");
  });

  it("setEnabled is idempotent and never produces duplicate boxes", () => {
    const { root, handle } = setup({ enabled: true });
    handle.controls.setEnabled(true);
    handle.controls.setEnabled(true);
    expect(root.querySelectorAll(".nlsc-floatbox").length).toBe(1);
  });
});

describe("opacity clamping applied to element.style.opacity (Req 4.1–4.6)", () => {
  it("clamps a below-range value up to 0.1 (0.05 → 0.1)", () => {
    const { handle, box } = setup({ enabled: true });
    handle.controls.setOpacity(0.05);
    expect(box()!.style.opacity).toBe("0.1");
  });

  it("clamps an above-range value down to 1.0 (2 → 1)", () => {
    const { handle, box } = setup({ enabled: true });
    handle.controls.setOpacity(2);
    expect(box()!.style.opacity).toBe("1");
  });

  it("falls back to the default 0.9 for a non-finite value (NaN → 0.9)", () => {
    const { handle, box } = setup({ enabled: true });
    handle.controls.setOpacity(NaN);
    expect(box()!.style.opacity).toBe("0.9");
  });

  it("renders the initial opacity from state on mount", () => {
    const { box } = setup({ enabled: true, opacity: 0.6 });
    expect(box()!.style.opacity).toBe("0.6");
  });
});

describe("persistence (Req 7.1, 7.2)", () => {
  it("persists the enabled flag to state.floatBox.enabled", () => {
    const { state, handle } = setup({ enabled: true });

    handle.controls.setEnabled(false);
    expect(state.floatBox.enabled).toBe(false);
    expect(handle.controls.isEnabled()).toBe(false);

    handle.controls.setEnabled(true);
    expect(state.floatBox.enabled).toBe(true);
    expect(handle.controls.isEnabled()).toBe(true);
  });

  it("persists the clamped opacity to state.floatBox.opacity", () => {
    const { state, handle } = setup({ enabled: true });

    handle.controls.setOpacity(0.05);
    expect(state.floatBox.opacity).toBe(0.1);

    handle.controls.setOpacity(2);
    expect(state.floatBox.opacity).toBe(1);

    handle.controls.setOpacity(NaN);
    expect(state.floatBox.opacity).toBe(0.9);

    expect(handle.controls.getOpacity()).toBe(0.9);
  });

  it("writes the enabled flag and opacity through saveState to localStorage", () => {
    // saveState serializes the whole state under wme-nlsc-overlay:state.
    const { handle } = setup({ enabled: true });
    handle.controls.setEnabled(false);
    handle.controls.setOpacity(0.45);

    const persisted = JSON.parse(
      localStorage.getItem("wme-nlsc-overlay:state") ?? "{}",
    );
    expect(persisted.floatBox.enabled).toBe(false);
    expect(persisted.floatBox.opacity).toBe(0.45);
  });
});

// ---------------------------------------------------------------------------
// Task 4.2 — the enabled-layer row list and the per-layer On_Top_Control.
// Builds on the multi-layer setupMulti() helper above. Rows are rebuilt on
// every change, so each assertion re-reads the live DOM (never caches a button
// across a click).
// ---------------------------------------------------------------------------

describe("row list: one row per visible layer in getOrder() order (Req 2.1, 2.2)", () => {
  it("renders exactly one row per visible layer, hidden layers excluded", () => {
    const { rowEls, labels } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
        ["C", "Charlie"],
      ],
      order: ["A", "B", "C"],
      visible: ["A", "C"], // B hidden
    });

    expect(rowEls().length).toBe(2);
    expect(labels()).toEqual(["Alpha", "Charlie"]);
  });

  it("orders rows by getOrder(), not by visibility-toggle or declaration order", () => {
    const { labels } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
        ["C", "Charlie"],
      ],
      order: ["C", "A", "B"], // deliberately not declaration order
      visible: ["A", "B", "C"],
    });

    expect(labels()).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("renders one On_Top_Control per visible row (Req 2.3)", () => {
    const { tops } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });

    expect(tops().length).toBe(2);
  });
});

describe("On_Top_Control pin / release via setAbove (Req 2.4, 2.5)", () => {
  it("clicking an inactive control pins the layer: setAbove(code, true) + state.aboveCode", () => {
    const { controller, state, topByName } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });
    const spy = vi.spyOn(controller, "setAbove");

    topByName("Alpha").click();

    expect(spy).toHaveBeenCalledWith("A", true);
    expect(state.aboveCode).toBe("A");
    // Re-query after the repaint: the clicked control is now active.
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking the active control releases it: setAbove(code, false) + aboveCode null", () => {
    const { controller, state, topByName } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
      aboveCode: "A", // Alpha starts pinned
    });
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("true");

    const spy = vi.spyOn(controller, "setAbove");
    topByName("Alpha").click();

    expect(spy).toHaveBeenCalledWith("A", false);
    expect(state.aboveCode).toBeNull();
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("single-pin radio behavior (Req 2.6, 2.7)", () => {
  it("starts with no control pressed when no layer holds the above slot", () => {
    const { pressedCount } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });
    expect(pressedCount()).toBe(0);
  });

  it("at most one control is aria-pressed=true after pinning one layer", () => {
    const { topByName, tops, pressedCount } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
        ["C", "Charlie"],
      ],
      order: ["A", "B", "C"],
      visible: ["A", "B", "C"],
    });

    topByName("Bravo").click();

    expect(pressedCount()).toBe(1);
    const pressed = tops().filter(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    expect(
      pressed[0]
        .closest(".nlsc-floatbox-row")
        ?.querySelector(".nlsc-floatbox-label")?.textContent,
    ).toBe("Bravo");
  });

  it("pinning a second layer swaps the active control (radio-style)", () => {
    const { state, topByName, pressedCount } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });

    topByName("Alpha").click();
    expect(state.aboveCode).toBe("A");
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("true");

    // Pinning Bravo must demote Alpha — never two active at once.
    topByName("Bravo").click();
    expect(state.aboveCode).toBe("B");
    expect(pressedCount()).toBe(1);
    expect(topByName("Bravo").getAttribute("aria-pressed")).toBe("true");
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("false");
    // The active control also carries the is-active class (Req 2.6).
    expect(topByName("Bravo").classList.contains("is-active")).toBe(true);
    expect(topByName("Alpha").classList.contains("is-active")).toBe(false);
  });
});

describe("empty state (Req 2.9)", () => {
  it("renders the empty-state message when no layer is visible", () => {
    const { rowEls, emptyMsg } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: [], // none visible
    });

    expect(rowEls().length).toBe(0);
    const empty = emptyMsg();
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toBe("目前沒有顯示中的圖層");
  });

  it("renders the empty-state message when the layer list itself is empty", () => {
    const { rowEls, emptyMsg } = setupMulti({
      layers: [],
      order: [],
      visible: [],
    });

    expect(rowEls().length).toBe(0);
    expect(emptyMsg()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 5.1 — live sync with controller layer-state changes (Req 8).
// The box and the sidebar are peer views over one NlscController, so every
// setVisible / setAbove broadcasts to both views regardless of which one
// originated it. These tests drive the controller directly (standing in for
// "some other UI surface" / the settings panel) and use a vi.fn() onAboveChange
// listener as a sidebar stand-in. Rows are fully rebuilt on every change, so
// each assertion re-reads the live DOM rather than caching element references.
// ---------------------------------------------------------------------------

describe("live sync: visibility toggles add/remove rows (Req 8.1, 8.2)", () => {
  it("setVisible(code, true) from outside adds the layer's row via onVisibleChange", () => {
    const { controller, rowEls, labels } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A"], // B hidden to start
    });
    expect(labels()).toEqual(["Alpha"]);

    controller.setVisible("B", true);

    // The box repaints off the controller's onVisibleChange subscription.
    expect(rowEls().length).toBe(2);
    expect(labels()).toEqual(["Alpha", "Bravo"]);
  });

  it("setVisible(code, false) from outside removes the layer's row via onVisibleChange", () => {
    const { controller, labels } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });
    expect(labels()).toEqual(["Alpha", "Bravo"]);

    controller.setVisible("B", false);

    expect(labels()).toEqual(["Alpha"]);
  });
});

describe("re-showing a hidden pinned layer restores its active control (Req 8.5, 8.6)", () => {
  it("hiding the pinned layer removes its row but retains state.aboveCode", () => {
    const { controller, state, labels } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
      aboveCode: "A", // Alpha holds the above slot
    });
    expect(labels()).toEqual(["Alpha", "Bravo"]);

    controller.setVisible("A", false);

    // Req 8.5: the row is gone, but the persisted above slot is retained
    // (setVisible never clears state.aboveCode), not cleared.
    expect(labels()).toEqual(["Bravo"]);
    expect(state.aboveCode).toBe("A");
  });

  it("bringing the hidden pinned layer back restores its row with the active On_Top_Control", () => {
    const { controller, state, topByName, pressedCount } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
      aboveCode: "A",
    });

    controller.setVisible("A", false); // hide the pinned layer
    controller.setVisible("A", true); // …then bring it back

    // Req 8.6: the row reappears and its control is active again, because
    // renderRows() keys the active look on the still-retained state.aboveCode.
    const btn = topByName("Alpha");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.classList.contains("is-active")).toBe(true);
    expect(pressedCount()).toBe(1);
    expect(state.aboveCode).toBe("A");
  });
});

describe("two-way above-slot sync through the shared controller (Req 8.3, 8.4)", () => {
  it("a box On_Top_Control click is observed by an external onAboveChange listener (sidebar stand-in)", () => {
    const { controller, topByName } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });
    // Register the sidebar stand-in BEFORE the click — it must see the pin
    // fan out from the same controller (Req 8.4).
    const sidebarListener = vi.fn();
    controller.onAboveChange(sidebarListener);

    topByName("Alpha").click();

    expect(sidebarListener).toHaveBeenCalledWith("A", true);
  });

  it("releasing via the box notifies the external listener too", () => {
    const { controller, topByName } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
      aboveCode: "A", // Alpha starts pinned
    });
    const sidebarListener = vi.fn();
    controller.onAboveChange(sidebarListener);

    topByName("Alpha").click(); // release the slot

    expect(sidebarListener).toHaveBeenCalledWith("A", false);
  });

  it("an external setAbove repaints the box's On_Top_Controls via onAboveChange (Req 8.3)", () => {
    const { controller, topByName, pressedCount } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
    });
    expect(pressedCount()).toBe(0);

    // Pin via the controller directly — stands in for the settings panel.
    controller.setAbove("B", true);

    expect(topByName("Bravo").getAttribute("aria-pressed")).toBe("true");
    expect(topByName("Bravo").classList.contains("is-active")).toBe(true);
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("false");
    expect(pressedCount()).toBe(1);
  });

  it("an external setAbove swap repaints both the demoted and the promoted control", () => {
    const { controller, topByName, pressedCount } = setupMulti({
      layers: [
        ["A", "Alpha"],
        ["B", "Bravo"],
      ],
      order: ["A", "B"],
      visible: ["A", "B"],
      aboveCode: "A", // Alpha pinned to start
    });
    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("true");

    controller.setAbove("B", true); // external swap A → B

    expect(topByName("Alpha").getAttribute("aria-pressed")).toBe("false");
    expect(topByName("Bravo").getAttribute("aria-pressed")).toBe("true");
    expect(pressedCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Task 6.2 — pointer-based drag and off-screen position recovery (Req 3, 7.5).
//
// Reuses the single-layer setup() (drag math) and the multi-layer setupMulti()
// (the "pointerdown on a button doesn't drag" case). jsdom caveats baked into
// the expectations below:
//   • getBoundingClientRect() returns all-zeros and offsetWidth/Height are 0,
//     so the captured offset is clientX/clientY − 0 = clientX/clientY, and the
//     box's measured size is 0. The drag therefore clamps against the bare
//     viewport: left = clamp(clientX − offsetX, 0, innerWidth − 0).
//   • window.innerWidth/innerHeight default to 1024×768 in jsdom; the clamp
//     tests assert against those live values rather than hard-coded numbers.
// ---------------------------------------------------------------------------

/**
 * Dispatch a pointer event the drag handlers understand. jsdom 27 ships a real
 * PointerEvent constructor (carrying clientX/clientY/pointerId), but we fall
 * back to a MouseEvent with a defined `pointerId` so the helper stays robust if
 * the constructor is ever unavailable. Events bubble + are cancelable so the
 * handler's preventDefault() is honored.
 */
function firePointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  coords: { clientX?: number; clientY?: number; pointerId?: number } = {},
): void {
  const { clientX = 0, clientY = 0, pointerId = 1 } = coords;
  const PointerEventCtor = (globalThis as { PointerEvent?: typeof PointerEvent })
    .PointerEvent;
  let ev: Event;
  if (typeof PointerEventCtor === "function") {
    ev = new PointerEventCtor(type, {
      clientX,
      clientY,
      pointerId,
      bubbles: true,
      cancelable: true,
    });
  } else {
    ev = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });
    Object.defineProperty(ev, "pointerId", { value: pointerId, configurable: true });
  }
  target.dispatchEvent(ev);
}

const headerOf = (root: HTMLElement): HTMLElement =>
  root.querySelector(".nlsc-floatbox-header") as HTMLElement;

describe("drag tracks the pointer minus the captured offset (Req 3.1)", () => {
  it("moves the box top-left to (clientX − offsetX, clientY − offsetY)", () => {
    // offset captured at pointerdown = clientX/clientY (rect is 0 in jsdom).
    const { box, root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(header, "pointermove", { clientX: 150, clientY: 130 });

    // left = clamp(150 − 100, 0, 1024) = 50; top = clamp(130 − 100, 0, 768) = 30.
    expect(box()!.style.left).toBe("50px");
    expect(box()!.style.top).toBe("30px");
  });

  it("keeps the captured offset constant across successive moves (1:1 tracking)", () => {
    const { box, root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 200, clientY: 200 });

    firePointer(header, "pointermove", { clientX: 260, clientY: 250 });
    expect(box()!.style.left).toBe("60px");
    expect(box()!.style.top).toBe("50px");

    // A second move keeps the same captured offset (200) — pointer-to-corner
    // distance never drifts (Req 3.1).
    firePointer(header, "pointermove", { clientX: 300, clientY: 400 });
    expect(box()!.style.left).toBe("100px");
    expect(box()!.style.top).toBe("200px");
  });
});

describe("drag stays within the viewport bounds (Req 3.2, aligns with 7.5)", () => {
  it("clamps a move past the bottom-right to innerWidth/innerHeight", () => {
    const { box, root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(header, "pointermove", { clientX: 5000, clientY: 5000 });

    // Box size is 0 in jsdom, so the upper bound is the bare viewport extent.
    expect(box()!.style.left).toBe(`${window.innerWidth}px`);
    expect(box()!.style.top).toBe(`${window.innerHeight}px`);
  });

  it("clamps a move past the top-left corner to 0px", () => {
    const { box, root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 100, clientY: 100 });
    // Moving the pointer left/up of the captured offset would yield a negative
    // top-left; the clamp lower-bound pins it at 0.
    firePointer(header, "pointermove", { clientX: 40, clientY: 20 });

    expect(box()!.style.left).toBe("0px");
    expect(box()!.style.top).toBe("0px");
  });
});

describe("user-select is suppressed during the drag (Req 3.3)", () => {
  it("sets user-select:none on the handle at pointerdown and clears it at pointerup", () => {
    const { root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 100, clientY: 100 });
    expect(header.style.userSelect).toBe("none");

    firePointer(header, "pointerup", { clientX: 100, clientY: 100 });
    expect(header.style.userSelect).toBe("");
  });
});

describe("pointerup retains and persists the resting position (Req 3.4, 7.3)", () => {
  it("writes the released top-left to state.floatBox.x/y", () => {
    const { state, box, root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(header, "pointermove", { clientX: 175, clientY: 145 });
    expect(box()!.style.left).toBe("75px");
    expect(box()!.style.top).toBe("45px");

    firePointer(header, "pointerup", { clientX: 175, clientY: 145 });

    // Req 3.4: the box retains where the pointer was released; Req 7.3: that
    // resting position is persisted to state.floatBox.
    expect(state.floatBox.x).toBe(75);
    expect(state.floatBox.y).toBe(45);
  });

  it("persists the resting position through saveState to localStorage", () => {
    const { root } = setup({ enabled: true });
    const header = headerOf(root);

    firePointer(header, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(header, "pointermove", { clientX: 180, clientY: 220 });
    firePointer(header, "pointerup", { clientX: 180, clientY: 220 });

    const persisted = JSON.parse(
      localStorage.getItem("wme-nlsc-overlay:state") ?? "{}",
    );
    // left = clamp(180 − 100, 0, 1024) = 80; top = clamp(220 − 100, 0, 768) = 120.
    expect(persisted.floatBox.x).toBe(80);
    expect(persisted.floatBox.y).toBe(120);
  });
});

describe("pointerdown outside the handle does not start a drag (Req 3.5)", () => {
  it("a pointerdown on an On_Top_Control button leaves the box position unchanged", () => {
    // Drag handlers are bound to the header only; a button is not an ancestor
    // of the header, so neither the pointerdown nor a following pointermove can
    // start or advance a drag.
    const { root, topByName } = setupMulti({
      layers: [["A", "Alpha"]],
      order: ["A"],
      visible: ["A"],
    });
    const boxEl = root.querySelector(".nlsc-floatbox") as HTMLElement;
    const before = { left: boxEl.style.left, top: boxEl.style.top };

    const btn = topByName("Alpha");
    firePointer(btn, "pointerdown", { clientX: 300, clientY: 300 });
    firePointer(btn, "pointermove", { clientX: 500, clientY: 500 });

    expect(boxEl.style.left).toBe(before.left);
    expect(boxEl.style.top).toBe(before.top);
  });
});

describe("off-screen persisted position is clamped into the viewport on mount (Req 7.5)", () => {
  it("clamps a far-past-bottom-right persisted position to innerWidth/innerHeight", () => {
    // With a 0-sized box (jsdom) the in-viewport upper bound is the viewport
    // extent itself, so the entire box stays reachable.
    const { box } = setup({ enabled: true, x: 99999, y: 99999 });
    expect(box()!.style.left).toBe(`${window.innerWidth}px`);
    expect(box()!.style.top).toBe(`${window.innerHeight}px`);
  });

  it("clamps a negative persisted position to 0px", () => {
    const { box } = setup({ enabled: true, x: -500, y: -500 });
    expect(box()!.style.left).toBe("0px");
    expect(box()!.style.top).toBe("0px");
  });
});
