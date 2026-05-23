import type { NlscLayer } from "./layers";
import type { NlscState } from "./state";
import type { NlscController } from "./controller";

export interface SidebarCallbacks {
  catalog: readonly NlscLayer[];
  addUserLayer: (code: string) => NlscLayer | null;
  removeUserLayer: (code: string) => void;
}

export function renderSidebar(
  tabLabel: HTMLElement,
  tabPane: HTMLElement,
  defaults: readonly NlscLayer[],
  controller: NlscController,
  state: NlscState,
  callbacks: SidebarCallbacks,
): void {
  tabLabel.textContent = "NLSC";

  const heading = document.createElement("h4");
  heading.textContent = "NLSC Overlay";
  heading.style.margin = "8px 0";
  tabPane.appendChild(heading);

  for (const layer of defaults) {
    const refs = renderLayerRow(layer, controller, state, null);
    tabPane.appendChild(refs.row);
    wireRowListeners(layer, controller, refs);
  }

  const userContainer = document.createElement("div");
  tabPane.appendChild(userContainer);

  // Tracks <option> nodes by code so we can pull/restore them as layers are added/removed.
  const optionByCode = new Map<string, HTMLOptionElement>();

  const renderUserRow = (layer: NlscLayer): void => {
    const refs = renderLayerRow(layer, controller, state, () => {
      callbacks.removeUserLayer(layer.code);
      userContainer.removeChild(refs.row);
      addOption(layer);
    });
    userContainer.appendChild(refs.row);
    wireRowListeners(layer, controller, refs);
  };

  for (const code of state.userLayers) {
    const layer = callbacks.catalog.find((l) => l.code === code);
    if (layer) renderUserRow(layer);
  }

  const addRow = document.createElement("div");
  addRow.style.display = "flex";
  addRow.style.gap = "6px";
  addRow.style.marginTop = "12px";
  addRow.style.paddingTop = "10px";
  addRow.style.borderTop = "1px solid rgba(255,255,255,0.1)";

  const select = document.createElement("select");
  select.style.flex = "1";
  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = "選擇圖層…";
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  select.appendChild(placeholderOpt);

  const addOption = (layer: NlscLayer): void => {
    const opt = document.createElement("option");
    opt.value = layer.code;
    opt.textContent = layer.name;
    select.appendChild(opt);
    optionByCode.set(layer.code, opt);
  };

  for (const layer of callbacks.catalog) {
    if (!state.userLayers.includes(layer.code)) addOption(layer);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "新增";

  addBtn.addEventListener("click", () => {
    const code = select.value;
    if (!code) return;
    const layer = callbacks.addUserLayer(code);
    if (!layer) return;
    renderUserRow(layer);
    const opt = optionByCode.get(code);
    if (opt) {
      select.removeChild(opt);
      optionByCode.delete(code);
    }
    placeholderOpt.selected = true;
  });

  addRow.appendChild(select);
  addRow.appendChild(addBtn);
  tabPane.appendChild(addRow);
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
  onRemove: (() => void) | null,
): RowRefs {
  const row = document.createElement("div");
  row.style.margin = "8px 0 14px";

  const headerRow = document.createElement("div");
  headerRow.style.display = "flex";
  headerRow.style.alignItems = "center";
  headerRow.style.gap = "6px";

  const checkboxLabel = document.createElement("label");
  checkboxLabel.style.display = "flex";
  checkboxLabel.style.alignItems = "center";
  checkboxLabel.style.gap = "6px";
  checkboxLabel.style.cursor = "pointer";
  checkboxLabel.style.flex = "1";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.visible[layer.code] ?? false;

  const nameSpan = document.createElement("span");
  nameSpan.textContent = layer.name;

  checkboxLabel.appendChild(checkbox);
  checkboxLabel.appendChild(nameSpan);
  headerRow.appendChild(checkboxLabel);

  if (onRemove) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.title = "移除圖層";
    removeBtn.style.background = "transparent";
    removeBtn.style.border = "none";
    removeBtn.style.color = "inherit";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.padding = "0 4px";
    removeBtn.addEventListener("click", onRemove);
    headerRow.appendChild(removeBtn);
  }

  row.appendChild(headerRow);

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

function wireRowListeners(
  layer: NlscLayer,
  controller: NlscController,
  refs: RowRefs,
): void {
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
