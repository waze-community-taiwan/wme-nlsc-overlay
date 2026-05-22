import type { NlscLayer } from "./layers";
import type { NlscState } from "./state";
import type { NlscController } from "./controller";

export function renderSidebar(
  tabLabel: HTMLElement,
  tabPane: HTMLElement,
  layers: readonly NlscLayer[],
  controller: NlscController,
  state: NlscState,
): void {
  tabLabel.textContent = "NLSC";

  const heading = document.createElement("h4");
  heading.textContent = "NLSC Overlay";
  heading.style.margin = "8px 0";
  tabPane.appendChild(heading);

  for (const layer of layers) {
    const refs = renderLayerRow(layer, controller, state);
    tabPane.appendChild(refs.row);

    controller.onVisibleChange((code, visible) => {
      if (code !== layer.code) return;
      if (refs.checkbox.checked !== visible) refs.checkbox.checked = visible;
    });

    controller.onOpacityChange((code, opacity) => {
      if (code !== layer.code) return;
      const pct = Math.round(opacity * 100);
      if (Number(refs.slider.value) !== pct) {
        refs.slider.value = String(pct);
        refs.valueLabel.textContent = `${pct}%`;
      }
    });
  }
}

interface RowRefs {
  row: HTMLElement;
  checkbox: HTMLInputElement;
  slider: HTMLInputElement;
  valueLabel: HTMLElement;
}

function renderLayerRow(
  layer: NlscLayer,
  controller: NlscController,
  state: NlscState,
): RowRefs {
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
    controller.setVisible(layer.code, checkbox.checked);
  });

  slider.addEventListener("input", () => {
    valueLabel.textContent = `${slider.value}%`;
    controller.setOpacity(layer.code, Number(slider.value) / 100);
  });

  return { row, checkbox, slider, valueLabel };
}
