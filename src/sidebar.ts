import type { NlscLayer } from "./layers";
import { saveState, type NlscState } from "./state";

export interface SidebarLayerHandle {
  layer: NlscLayer;
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
}

export function renderSidebar(
  tabLabel: HTMLElement,
  tabPane: HTMLElement,
  handles: readonly SidebarLayerHandle[],
  state: NlscState,
): void {
  tabLabel.textContent = "NLSC";

  const heading = document.createElement("h4");
  heading.textContent = "NLSC Overlay";
  heading.style.margin = "8px 0";
  tabPane.appendChild(heading);

  for (const handle of handles) {
    tabPane.appendChild(renderLayerRow(handle, state));
  }
}

function renderLayerRow(handle: SidebarLayerHandle, state: NlscState): HTMLElement {
  const { layer, setVisible, setOpacity } = handle;

  const row = document.createElement("div");
  row.style.margin = "8px 0 14px";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.style.display = "flex";
  checkboxLabel.style.alignItems = "center";
  checkboxLabel.style.gap = "6px";
  checkboxLabel.style.cursor = "pointer";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.visible[layer.code] ?? false;

  const nameSpan = document.createElement("span");
  nameSpan.textContent = layer.name;

  checkboxLabel.appendChild(checkbox);
  checkboxLabel.appendChild(nameSpan);
  row.appendChild(checkboxLabel);

  const sliderRow = document.createElement("div");
  sliderRow.style.display = "flex";
  sliderRow.style.alignItems = "center";
  sliderRow.style.gap = "6px";
  sliderRow.style.marginTop = "4px";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  const initialOpacity = state.opacity[layer.code] ?? layer.defaultOpacity;
  slider.value = String(Math.round(initialOpacity * 100));
  slider.style.flex = "1";

  const valueLabel = document.createElement("span");
  valueLabel.textContent = `${slider.value}%`;
  valueLabel.style.minWidth = "36px";
  valueLabel.style.textAlign = "right";
  valueLabel.style.fontVariantNumeric = "tabular-nums";

  sliderRow.appendChild(slider);
  sliderRow.appendChild(valueLabel);
  row.appendChild(sliderRow);

  checkbox.addEventListener("change", () => {
    setVisible(checkbox.checked);
    state.visible[layer.code] = checkbox.checked;
    saveState(state);
  });

  slider.addEventListener("input", () => {
    const opacity = Number(slider.value) / 100;
    setOpacity(opacity);
    valueLabel.textContent = `${slider.value}%`;
    state.opacity[layer.code] = opacity;
    saveState(state);
  });

  return row;
}
