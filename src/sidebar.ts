import type { NlscLayer } from "./layers";
import type { NlscState } from "./state";
import type { NlscController } from "./controller";

export interface SidebarCallbacks {
  catalog: readonly NlscLayer[];
  addUserLayer: (code: string) => NlscLayer | null;
  removeUserLayer: (code: string) => void;
}

const STYLE_ID = "nlsc-styles";

const NLSC_STYLES = `
.nlsc-panel { font-size: 13px; }
.nlsc-panel h4 { margin: 8px 0 12px; font-size: 14px; font-weight: 600; letter-spacing: 0.01em; }

.nlsc-add-row { display: flex; gap: 8px; margin: 0 0 12px; padding-bottom: 12px; border-bottom: 1px solid var(--hairline, rgba(128,128,128,0.2)); }
.nlsc-select { flex: 1; min-width: 0; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--hairline, rgba(128,128,128,0.3)); background: var(--background_default, transparent); color: inherit; font-size: 13px; outline: none; }
.nlsc-select:focus { border-color: #2d6cdf; box-shadow: 0 0 0 3px rgba(45,108,223,0.18); }

.nlsc-btn-primary { padding: 6px 14px; background: #2d6cdf; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background-color 0.15s, transform 0.05s; }
.nlsc-btn-primary:hover { background: #2558b5; }
.nlsc-btn-primary:active { background: #1f4895; transform: scale(0.97); }

.nlsc-card { margin: 6px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--hairline, rgba(128,128,128,0.2)); }
.nlsc-row-header { display: flex; align-items: center; gap: 10px; }
.nlsc-name { display: flex; flex-direction: column; flex: 1; min-width: 0; word-break: break-word; line-height: 1.25; }
.nlsc-name-title { font-weight: 600; }
.nlsc-name-sub { font-size: 0.82em; opacity: 0.65; margin-top: 1px; }

.nlsc-toggle { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer; }
.nlsc-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.nlsc-toggle-slider { position: absolute; inset: 0; background-color: rgba(120,120,128,0.32); border-radius: 22px; transition: background-color 0.2s; }
.nlsc-toggle-slider::before { content: ""; position: absolute; height: 18px; width: 18px; left: 2px; top: 2px; background-color: #fff; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.nlsc-toggle input:checked + .nlsc-toggle-slider { background-color: #34c759; }
.nlsc-toggle input:checked + .nlsc-toggle-slider::before { transform: translateX(16px); }
.nlsc-toggle input:focus-visible + .nlsc-toggle-slider { box-shadow: 0 0 0 3px rgba(52,199,89,0.35); }

.nlsc-remove { background: transparent; border: none; color: inherit; cursor: pointer; padding: 2px 7px; border-radius: 6px; opacity: 0.55; font-size: 14px; line-height: 1; transition: opacity 0.15s, background-color 0.15s, color 0.15s; }
.nlsc-remove:hover { opacity: 1; background: rgba(255,59,48,0.12); color: #ff3b30; }

.nlsc-slider-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.nlsc-slider { flex: 1; -webkit-appearance: none; appearance: none; height: 4px; background: rgba(120,120,128,0.3); border-radius: 2px; outline: none; }
.nlsc-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; }
.nlsc-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; }
.nlsc-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(45,108,223,0.3); }
.nlsc-value { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; opacity: 0.75; }

[wz-theme="dark"] .nlsc-toggle-slider { background-color: rgba(120,120,128,0.5); }
[wz-theme="dark"] .nlsc-card { border-color: rgba(255,255,255,0.1); }
`;

function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = NLSC_STYLES;
  document.head.appendChild(style);
}

export function renderSidebar(
  tabLabel: HTMLElement,
  tabPane: HTMLElement,
  defaults: readonly NlscLayer[],
  controller: NlscController,
  state: NlscState,
  callbacks: SidebarCallbacks,
): void {
  injectStyles();
  tabLabel.textContent = "NLSC";
  tabPane.classList.add("nlsc-panel");

  const heading = document.createElement("h4");
  heading.textContent = "NLSC Overlay";
  tabPane.appendChild(heading);

  // Catalog picker — placed *above* the layer rows so it's never hidden
  // below the fold inside WME's fixed-height tab pane.
  const addRow = document.createElement("div");
  addRow.className = "nlsc-add-row";

  const select = document.createElement("select");
  select.className = "nlsc-select";
  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = "選擇圖層…";
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  select.appendChild(placeholderOpt);

  // Tracks <option> nodes by code so we can pull/restore them as layers are added/removed.
  const optionByCode = new Map<string, HTMLOptionElement>();

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
  addBtn.className = "nlsc-btn-primary";

  addRow.appendChild(select);
  addRow.appendChild(addBtn);
  tabPane.appendChild(addRow);

  for (const layer of defaults) {
    const refs = renderLayerRow(layer, controller, state, null);
    tabPane.appendChild(refs.row);
    wireRowListeners(layer, controller, refs);
  }

  const userContainer = document.createElement("div");
  tabPane.appendChild(userContainer);

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
  row.className = "nlsc-card";

  const headerRow = document.createElement("div");
  headerRow.className = "nlsc-row-header";

  const nameWrap = document.createElement("div");
  nameWrap.className = "nlsc-name";

  const titleLine = document.createElement("span");
  titleLine.textContent = layer.title;
  titleLine.className = "nlsc-name-title";

  const codeFormatLine = document.createElement("span");
  codeFormatLine.textContent = `${layer.code} · ${layer.format}`;
  codeFormatLine.className = "nlsc-name-sub";

  nameWrap.appendChild(titleLine);
  nameWrap.appendChild(codeFormatLine);

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "nlsc-toggle";
  toggleLabel.title = "顯示／隱藏";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.visible[layer.code] ?? false;

  const toggleSlider = document.createElement("span");
  toggleSlider.className = "nlsc-toggle-slider";

  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(toggleSlider);
  headerRow.appendChild(toggleLabel);

  headerRow.appendChild(nameWrap);

  if (onRemove) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.title = "移除圖層";
    removeBtn.className = "nlsc-remove";
    removeBtn.addEventListener("click", onRemove);
    headerRow.appendChild(removeBtn);
  }

  row.appendChild(headerRow);

  const sliderRow = document.createElement("div");
  sliderRow.className = "nlsc-slider-row";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.className = "nlsc-slider";
  const initialOpacity = state.opacity[layer.code] ?? layer.defaultOpacity;
  slider.value = String(Math.round(initialOpacity * 100));

  const valueLabel = document.createElement("span");
  valueLabel.textContent = `${slider.value}%`;
  valueLabel.className = "nlsc-value";

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
