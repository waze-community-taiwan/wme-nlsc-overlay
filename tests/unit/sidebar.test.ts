// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { renderSidebar } from "../../src/sidebar";
import type { NlscLayer } from "../../src/layers";
import type { NlscState } from "../../src/state";
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

it("add-button appends a new row when a catalog option is selected", () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const defaultLayer = makeLayer("EMAP5", "EMAP5 · jpeg · default");
  const catalogLayer = makeLayer("CATALOG_A", "CATALOG_A · jpeg · catalog A");

  const state: NlscState = { visible: {}, opacity: {}, color: {}, aboveCode: null, userLayers: [], removedDefaults: [], layerOrder: [], floatBox: { enabled: true, opacity: 0.9, x: null, y: null } };
  const controller = new NlscController(state, [
    {
      layer: defaultLayer,
      setLayerVisible: vi.fn(),
      setLayerOpacity: vi.fn(),
      setLayerColor: vi.fn(),
    },
  ]);

  const addUserLayer = vi.fn((code: string) => {
    if (code === catalogLayer.code) {
      controller.addBinding({
        layer: catalogLayer,
        setLayerVisible: vi.fn(),
        setLayerOpacity: vi.fn(),
        setLayerColor: vi.fn(),
      });
      return catalogLayer;
    }
    return null;
  });
  const removeUserLayer = vi.fn();

  renderSidebar(tabLabel, tabPane, [defaultLayer], controller, state, {
    catalog: [catalogLayer],
    addUserLayer,
    removeUserLayer,
  });

  const select = tabPane.querySelector("select") as HTMLSelectElement;
  const addBtn = tabPane.querySelector("button") as HTMLButtonElement;
  expect(select).toBeTruthy();
  expect(addBtn).toBeTruthy();

  // Two options: placeholder + CATALOG_A
  expect(select.options.length).toBe(2);

  // Select CATALOG_A and click 新增
  select.value = catalogLayer.code;
  addBtn.click();

  expect(addUserLayer).toHaveBeenCalledWith(catalogLayer.code);

  // After add: rows should now include CATALOG_A's title
  const titles = Array.from(tabPane.querySelectorAll("span"))
    .map((s) => s.textContent)
    .filter(Boolean);
  expect(titles).toContain(catalogLayer.title);

  // Option should have been removed from select
  expect(select.options.length).toBe(1);
});

it("shows the script version in the heading and renders a remove button on every row", () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const defaultLayer = makeLayer("EMAP5", "EMAP5 · jpeg · default");
  const state: NlscState = {
    visible: {},
    opacity: {},
    color: {},
    aboveCode: null,
    userLayers: [],
    removedDefaults: [],
    layerOrder: ["EMAP5"],
    floatBox: { enabled: true, opacity: 0.9, x: null, y: null },
  };
  const controller = new NlscController(state, [
    {
      layer: defaultLayer,
      setLayerVisible: vi.fn(),
      setLayerOpacity: vi.fn(),
      setLayerColor: vi.fn(),
    },
  ]);

  const removeUserLayer = vi.fn();

  renderSidebar(tabLabel, tabPane, [defaultLayer], controller, state, {
    catalog: [defaultLayer],
    addUserLayer: vi.fn(),
    removeUserLayer,
    version: "9.9.9",
  });

  // Heading contains the version.
  const heading = tabPane.querySelector("h4");
  expect(heading?.textContent).toBe("NLSC Overlay v9.9.9");

  // The default row should now expose a remove (✕) button.
  const removeBtn = tabPane.querySelector(".nlsc-remove") as HTMLButtonElement;
  expect(removeBtn).toBeTruthy();

  // Default isn't in the dropdown yet (it's currently registered).
  const select = tabPane.querySelector("select") as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.value)).toEqual([""]);

  // Click the remove button: the callback fires, the row goes away, and
  // the layer re-appears in the catalog picker so the user can add it back.
  removeBtn.click();
  expect(removeUserLayer).toHaveBeenCalledWith("EMAP5");
  expect(tabPane.querySelector(".nlsc-card")).toBeNull();
  expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "EMAP5"]);
});

it('"above WME objects" icon button is radio-style: only one layer holds the slot', () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const a = makeLayer("A", "A");
  const b = makeLayer("B", "B");
  // Both layers visible so both buttons are interactive.
  const state: NlscState = {
    visible: { A: true, B: true },
    opacity: {},
    color: {},
    aboveCode: null,
    userLayers: [],
    removedDefaults: [],
    layerOrder: ["A", "B"],
    floatBox: { enabled: true, opacity: 0.9, x: null, y: null },
  };
  const controller = new NlscController(state, [
    { layer: a, setLayerVisible: vi.fn(), setLayerOpacity: vi.fn(), setLayerColor: vi.fn() },
    { layer: b, setLayerVisible: vi.fn(), setLayerOpacity: vi.fn(), setLayerColor: vi.fn() },
  ]);

  const aboveEvents: Array<[string, boolean]> = [];
  controller.onAboveChange((code, above) => aboveEvents.push([code, above]));

  renderSidebar(tabLabel, tabPane, [a, b], controller, state, {
    catalog: [a, b],
    addUserLayer: vi.fn(),
    removeUserLayer: vi.fn(),
  });

  const btns = tabPane.querySelectorAll(".nlsc-above-btn");
  expect(btns.length).toBe(2);
  const [btnA, btnB] = Array.from(btns) as HTMLButtonElement[];
  expect(btnA.getAttribute("aria-pressed")).toBe("false");
  expect(btnB.getAttribute("aria-pressed")).toBe("false");

  // Press A → A becomes the single above-layer.
  btnA.click();
  expect(state.aboveCode).toBe("A");
  expect(btnA.getAttribute("aria-pressed")).toBe("true");
  expect(btnB.getAttribute("aria-pressed")).toBe("false");

  // Press B → A demotes, B promotes (radio swap). Both events fire so each
  // row's UI updates correctly.
  aboveEvents.length = 0;
  btnB.click();
  expect(state.aboveCode).toBe("B");
  expect(btnA.getAttribute("aria-pressed")).toBe("false");
  expect(btnB.getAttribute("aria-pressed")).toBe("true");
  expect(aboveEvents).toEqual([
    ["A", false],
    ["B", true],
  ]);

  // Press B again → demotes, no layer is above.
  btnB.click();
  expect(state.aboveCode).toBeNull();
  expect(btnB.getAttribute("aria-pressed")).toBe("false");
});

it('"above WME objects" icon button hides on invisible layers and reappears on re-show', () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const layer = makeLayer("EMAP5", "EMAP5");
  // Initially hidden.
  const state: NlscState = {
    visible: { EMAP5: false },
    opacity: {},
    color: {},
    aboveCode: null,
    userLayers: [],
    removedDefaults: [],
    layerOrder: ["EMAP5"],
    floatBox: { enabled: true, opacity: 0.9, x: null, y: null },
  };
  const controller = new NlscController(state, [
    { layer, setLayerVisible: vi.fn(), setLayerOpacity: vi.fn(), setLayerColor: vi.fn() },
  ]);

  renderSidebar(tabLabel, tabPane, [layer], controller, state, {
    catalog: [layer],
    addUserLayer: vi.fn(),
    removeUserLayer: vi.fn(),
  });

  const aboveBtn = tabPane.querySelector(".nlsc-above-btn") as HTMLButtonElement;
  expect(aboveBtn).toBeTruthy();
  expect(aboveBtn.style.display).toBe("none");

  // Show the layer → button reappears.
  controller.setVisible("EMAP5", true);
  expect(aboveBtn.style.display).toBe("");

  // Hide again → button disappears.
  controller.setVisible("EMAP5", false);
  expect(aboveBtn.style.display).toBe("none");
});

it('aboveCode is preserved when the pinned layer is hidden, restored on re-show', () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const layer = makeLayer("EMAP5", "EMAP5");
  const state: NlscState = {
    visible: { EMAP5: true },
    opacity: {},
    color: {},
    aboveCode: null,
    userLayers: [],
    removedDefaults: [],
    layerOrder: ["EMAP5"],
    floatBox: { enabled: true, opacity: 0.9, x: null, y: null },
  };
  const controller = new NlscController(state, [
    { layer, setLayerVisible: vi.fn(), setLayerOpacity: vi.fn(), setLayerColor: vi.fn() },
  ]);

  renderSidebar(tabLabel, tabPane, [layer], controller, state, {
    catalog: [layer],
    addUserLayer: vi.fn(),
    removeUserLayer: vi.fn(),
  });

  const aboveBtn = tabPane.querySelector(".nlsc-above-btn") as HTMLButtonElement;

  // User pins the layer above objects.
  aboveBtn.click();
  expect(state.aboveCode).toBe("EMAP5");

  // User hides the layer. aboveCode survives.
  controller.setVisible("EMAP5", false);
  expect(state.aboveCode).toBe("EMAP5");
  expect(aboveBtn.style.display).toBe("none");

  // User re-enables visibility. Button reappears, still pressed.
  controller.setVisible("EMAP5", true);
  expect(aboveBtn.style.display).toBe("");
  expect(aboveBtn.getAttribute("aria-pressed")).toBe("true");
});

it("renders the float-box settings section with a working enable toggle and opacity slider when boxControls is provided", () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const layer = makeLayer("EMAP5", "EMAP5");
  const state: NlscState = {
    visible: {},
    opacity: {},
    color: {},
    aboveCode: null,
    userLayers: [],
    removedDefaults: [],
    layerOrder: ["EMAP5"],
    floatBox: { enabled: true, opacity: 0.9, x: null, y: null },
  };
  const controller = new NlscController(state, [
    { layer, setLayerVisible: vi.fn(), setLayerOpacity: vi.fn(), setLayerColor: vi.fn() },
  ]);

  // Fake BoxControls handle backed by vi.fn() so we can assert wiring.
  const boxControls = {
    setEnabled: vi.fn(),
    setOpacity: vi.fn(),
    isEnabled: vi.fn(() => true),
    getOpacity: vi.fn(() => 0.9),
    onEnabledChange: vi.fn(() => () => {}),
  };

  renderSidebar(tabLabel, tabPane, [layer], controller, state, {
    catalog: [layer],
    addUserLayer: vi.fn(),
    removeUserLayer: vi.fn(),
    boxControls,
  });

  // The float-box section renders with its heading.
  const section = tabPane.querySelector(".nlsc-floatbox-settings") as HTMLElement;
  expect(section).toBeTruthy();
  expect(section.querySelector("h4")?.textContent).toBe("懸浮視窗");

  // Enable toggle reflects the current enabled state (isEnabled() === true).
  const checkbox = section.querySelector(
    "label.nlsc-toggle input[type=checkbox]",
  ) as HTMLInputElement;
  expect(checkbox).toBeTruthy();
  expect(checkbox.checked).toBe(true);

  // Opacity slider is a range in [10, 100] step 5, positioned at 90% (0.9).
  const slider = section.querySelector(
    "input.nlsc-slider[type=range]",
  ) as HTMLInputElement;
  expect(slider).toBeTruthy();
  expect(slider.min).toBe("10");
  expect(slider.max).toBe("100");
  expect(slider.step).toBe("5");
  expect(slider.value).toBe("90");
  const valueLabel = section.querySelector(".nlsc-value") as HTMLElement;
  expect(valueLabel?.textContent).toBe("90%");

  // Toggling the enable control off calls setEnabled(false).
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change"));
  expect(boxControls.setEnabled).toHaveBeenCalledWith(false);

  // Sliding the opacity control updates setOpacity with the fraction and the label.
  slider.value = "50";
  slider.dispatchEvent(new Event("input"));
  expect(boxControls.setOpacity).toHaveBeenCalledWith(0.5);
  expect(valueLabel.textContent).toBe("50%");
});

it("does not render the float-box settings section when boxControls is omitted", () => {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  const layer = makeLayer("EMAP5", "EMAP5");
  const state: NlscState = {
    visible: {},
    opacity: {},
    color: {},
    aboveCode: null,
    userLayers: [],
    removedDefaults: [],
    layerOrder: ["EMAP5"],
    floatBox: { enabled: true, opacity: 0.9, x: null, y: null },
  };
  const controller = new NlscController(state, [
    { layer, setLayerVisible: vi.fn(), setLayerOpacity: vi.fn(), setLayerColor: vi.fn() },
  ]);

  renderSidebar(tabLabel, tabPane, [layer], controller, state, {
    catalog: [layer],
    addUserLayer: vi.fn(),
    removeUserLayer: vi.fn(),
  });

  expect(tabPane.querySelector(".nlsc-floatbox-settings")).toBeNull();
});
