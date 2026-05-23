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

  const state: NlscState = { visible: {}, opacity: {}, userLayers: [] };
  const controller = new NlscController(state, [
    {
      layer: defaultLayer,
      setLayerVisible: vi.fn(),
      setLayerOpacity: vi.fn(),
    },
  ]);

  const addUserLayer = vi.fn((code: string) => {
    if (code === catalogLayer.code) {
      controller.addBinding({
        layer: catalogLayer,
        setLayerVisible: vi.fn(),
        setLayerOpacity: vi.fn(),
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
