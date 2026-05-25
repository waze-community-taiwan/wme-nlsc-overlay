import type { NlscLayer } from "./layers";
import type { NlscState } from "./state";
import type { NlscController } from "./controller";
import { renderTermsLink } from "./terms";

export interface SidebarCallbacks {
  catalog: readonly NlscLayer[];
  addUserLayer: (code: string) => NlscLayer | null;
  removeUserLayer: (code: string) => void;
  /** Script version from the userscript metablock; shown next to the heading. */
  version?: string;
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

.nlsc-card { position: relative; margin: 6px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--hairline, rgba(128,128,128,0.2)); transition: opacity 0.15s, box-shadow 0.15s; }
.nlsc-card.nlsc-dragging { opacity: 0.45; }
.nlsc-card.nlsc-drop-above { box-shadow: 0 -3px 0 0 #2d6cdf inset, 0 -3px 0 0 #2d6cdf; }
.nlsc-card.nlsc-drop-below { box-shadow: 0 3px 0 0 #2d6cdf inset, 0 3px 0 0 #2d6cdf; }
.nlsc-grip { cursor: grab; user-select: none; padding: 0 2px; opacity: 0.45; font-size: 16px; line-height: 1; letter-spacing: -3px; color: inherit; }
.nlsc-grip:hover { opacity: 0.85; }
.nlsc-grip:active { cursor: grabbing; }
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

/* "Above WME objects" icon button — distinctly different SHAPE (square)
   from the pill toggle on the left, so the two cannot be visually confused.
   SVG glyph depicts a "bring to front" stack: a dim back square + a
   filled front square. The button itself becomes orange when active. */
.nlsc-above-btn { flex-shrink: 0; width: 26px; height: 22px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.35); background: transparent; color: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.15s, background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.05s; }
.nlsc-above-btn:hover { opacity: 1; }
.nlsc-above-btn:active { transform: scale(0.94); }
.nlsc-above-btn[aria-pressed="true"] { background: #ff9500; border-color: #ff9500; color: #fff; opacity: 1; }
.nlsc-above-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,149,0,0.35); }
.nlsc-above-btn svg { width: 14px; height: 14px; display: block; pointer-events: none; }

.nlsc-remove { background: transparent; border: none; color: inherit; cursor: pointer; padding: 2px 7px; border-radius: 6px; opacity: 0.55; font-size: 14px; line-height: 1; transition: opacity 0.15s, background-color 0.15s, color 0.15s; }
.nlsc-remove:hover { opacity: 1; background: rgba(255,59,48,0.12); color: #ff3b30; }

.nlsc-slider-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.nlsc-slider { flex: 1; -webkit-appearance: none; appearance: none; height: 4px; background: rgba(120,120,128,0.3); border-radius: 2px; outline: none; }
.nlsc-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; }
.nlsc-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; }
.nlsc-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(45,108,223,0.3); }
.nlsc-value { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; opacity: 0.75; }

.nlsc-swatch { width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; border: 1px solid rgba(128,128,128,0.4); background: transparent; cursor: pointer; padding: 0; position: relative; transition: transform 0.05s, box-shadow 0.15s; }
.nlsc-swatch:hover { box-shadow: 0 0 0 3px rgba(45,108,223,0.18); }
.nlsc-swatch:active { transform: scale(0.94); }
.nlsc-swatch[data-original="true"]::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: linear-gradient(135deg, transparent 45%, rgba(128,128,128,0.7) 47%, rgba(128,128,128,0.7) 53%, transparent 55%); }

.nlsc-popover { position: absolute; right: 10px; top: 38px; z-index: 10; padding: 10px; border-radius: 10px; background: var(--background_default, #fff); border: 1px solid var(--hairline, rgba(128,128,128,0.3)); box-shadow: 0 6px 20px rgba(0,0,0,0.18); display: none; }
.nlsc-popover.open { display: block; }
.nlsc-popover-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.nlsc-popover-row + .nlsc-popover-row { margin-top: 8px; }
.nlsc-chip { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(128,128,128,0.35); cursor: pointer; padding: 0; transition: transform 0.05s, box-shadow 0.15s; }
.nlsc-chip:hover { box-shadow: 0 0 0 3px rgba(45,108,223,0.18); }
.nlsc-chip:active { transform: scale(0.92); }
.nlsc-chip.selected { box-shadow: 0 0 0 2px var(--background_default, #fff), 0 0 0 4px #2d6cdf; }
.nlsc-chip-original { background: transparent; position: relative; }
.nlsc-chip-original::after { content: ""; position: absolute; inset: 2px; border-radius: 50%; background: linear-gradient(135deg, transparent 45%, rgba(128,128,128,0.7) 47%, rgba(128,128,128,0.7) 53%, transparent 55%); }
.nlsc-popover-label { font-size: 11px; opacity: 0.7; margin-right: 4px; }
.nlsc-color-input { width: 28px; height: 22px; border: 1px solid rgba(128,128,128,0.35); border-radius: 4px; padding: 0; background: transparent; cursor: pointer; }

[wz-theme="dark"] .nlsc-toggle-slider { background-color: rgba(120,120,128,0.5); }
[wz-theme="dark"] .nlsc-card { border-color: rgba(255,255,255,0.1); }
[wz-theme="dark"] .nlsc-popover { background: #1f2024; border-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-chip.selected { box-shadow: 0 0 0 2px #1f2024, 0 0 0 4px #2d6cdf; }
`;

function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = NLSC_STYLES;
  document.head.appendChild(style);
  // One global listener closes any open color popover on outside click.
  document.addEventListener("click", () => {
    for (const el of document.querySelectorAll(".nlsc-popover.open")) {
      el.classList.remove("open");
    }
  });
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
  tabLabel.textContent = "NLSC Overlay";
  tabPane.classList.add("nlsc-panel");

  const heading = document.createElement("h4");
  heading.textContent = callbacks.version
    ? `NLSC Overlay v${callbacks.version}`
    : "NLSC Overlay";
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

  // Filter against the live registered set (state.layerOrder) rather than
  // userLayers alone, so defaults that have been removed reappear in the picker.
  const registeredCodes = new Set(state.layerOrder);
  for (const layer of callbacks.catalog) {
    if (!registeredCodes.has(layer.code)) addOption(layer);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "新增";
  addBtn.className = "nlsc-btn-primary";

  addRow.appendChild(select);
  addRow.appendChild(addBtn);
  tabPane.appendChild(addRow);

  // One flat container in `state.layerOrder` (= controller order). Rows for
  // defaults and user-added layers interleave freely; their visual order in
  // this container drives both the sidebar list and the OL stacking order.
  const layerList = document.createElement("div");
  tabPane.appendChild(layerList);

  const rowByCode = new Map<string, HTMLElement>();
  const layerByCode = new Map<string, NlscLayer>();
  for (const l of defaults) layerByCode.set(l.code, l);
  for (const l of callbacks.catalog) if (!layerByCode.has(l.code)) layerByCode.set(l.code, l);

  // Drag-and-drop on the ⋮⋮ grip. We keep `draggable=false` on rows by default
  // so clicks on the slider / checkbox / color picker never accidentally
  // initiate a drag; the grip flips draggable on mousedown.
  let draggingCode: string | null = null;
  const clearDropTargets = (): void => {
    for (const el of layerList.querySelectorAll(".nlsc-drop-above, .nlsc-drop-below")) {
      el.classList.remove("nlsc-drop-above", "nlsc-drop-below");
    }
  };

  const wireDnD = (row: HTMLElement, grip: HTMLElement, code: string): void => {
    grip.addEventListener("mousedown", () => {
      row.draggable = true;
    });
    grip.addEventListener("mouseup", () => {
      row.draggable = false;
    });
    row.addEventListener("dragstart", (e) => {
      if (!row.draggable) {
        e.preventDefault();
        return;
      }
      draggingCode = code;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", code);
      }
      row.classList.add("nlsc-dragging");
    });
    row.addEventListener("dragover", (e) => {
      if (!draggingCode || draggingCode === code) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      clearDropTargets();
      row.classList.add(above ? "nlsc-drop-above" : "nlsc-drop-below");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("nlsc-drop-above", "nlsc-drop-below");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!draggingCode || draggingCode === code) return;
      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      const filtered = state.layerOrder.filter((c) => c !== draggingCode);
      let idx = filtered.indexOf(code);
      if (idx === -1) return;
      if (!above) idx += 1;
      filtered.splice(idx, 0, draggingCode);
      controller.setOrder(filtered);
      clearDropTargets();
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("nlsc-dragging");
      row.draggable = false;
      draggingCode = null;
      clearDropTargets();
    });
  };

  const buildRow = (layer: NlscLayer): HTMLElement => {
    // All rows (defaults + user-added) are removable. Removing a hardcoded
    // default also persists a `removedDefaults` flag on the index.ts side so
    // it doesn't auto-reinstate on the next reload.
    let refs: RowRefs;
    refs = renderLayerRow(layer, controller, state, () => {
      callbacks.removeUserLayer(layer.code);
      if (refs.row.parentNode === layerList) layerList.removeChild(refs.row);
      rowByCode.delete(layer.code);
      if (!optionByCode.has(layer.code)) addOption(layer);
    });
    wireRowListeners(layer, controller, refs);
    wireDnD(refs.row, refs.grip, layer.code);
    rowByCode.set(layer.code, refs.row);
    return refs.row;
  };

  // Initial render in current order.
  for (const code of controller.getOrder()) {
    const layer = layerByCode.get(code);
    if (!layer) continue;
    layerList.appendChild(buildRow(layer));
  }

  // Re-arrange existing rows when the order changes (DnD drop, programmatic).
  // appendChild on an attached node moves it, so iterating top→bottom and
  // appending each row in turn ends up with them in the requested order.
  controller.onOrderChange((order) => {
    for (const code of order) {
      const row = rowByCode.get(code);
      if (row) layerList.appendChild(row);
    }
  });

  addBtn.addEventListener("click", () => {
    const code = select.value;
    if (!code) return;
    const layer = callbacks.addUserLayer(code);
    if (!layer) return;
    const row = buildRow(layer);
    // New layers land at the top of the stack — see addUserLayer in index.ts.
    layerList.insertBefore(row, layerList.firstChild);
    const opt = optionByCode.get(code);
    if (opt) {
      select.removeChild(opt);
      optionByCode.delete(code);
    }
    placeholderOpt.selected = true;
  });

  renderTermsLink(tabPane);
}

interface RowRefs {
  row: HTMLElement;
  grip: HTMLElement;
  checkbox: HTMLInputElement;
  aboveBtn: HTMLButtonElement;
  slider: HTMLInputElement;
  valueLabel: HTMLElement;
  updateColorUi: (color: string | null) => void;
}

/** High-contrast presets chosen to remain readable over Waze's dark satellite imagery. */
const PRESET_COLORS: readonly string[] = [
  "#ff3b30", // red
  "#ff9500", // orange
  "#ffcc00", // yellow
  "#34c759", // lime
  "#00c7ff", // cyan
  "#ff2d92", // magenta
];

function normalizeHex(value: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function renderColorControl(
  layer: NlscLayer,
  state: NlscState,
  controller: NlscController,
): { swatch: HTMLButtonElement; popover: HTMLElement; updateUi: (color: string | null) => void } {
  const initial = state.color[layer.code] ?? null;

  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "nlsc-swatch";
  swatch.title = "顏色";

  const popover = document.createElement("div");
  popover.className = "nlsc-popover";

  const chipRow = document.createElement("div");
  chipRow.className = "nlsc-popover-row";

  const originalChip = document.createElement("button");
  originalChip.type = "button";
  originalChip.className = "nlsc-chip nlsc-chip-original";
  originalChip.title = "原色";
  originalChip.dataset.color = "";
  chipRow.appendChild(originalChip);

  const presetChips: HTMLButtonElement[] = [];
  for (const hex of PRESET_COLORS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "nlsc-chip";
    chip.style.backgroundColor = hex;
    chip.title = hex;
    chip.dataset.color = hex;
    chipRow.appendChild(chip);
    presetChips.push(chip);
  }
  popover.appendChild(chipRow);

  const customRow = document.createElement("div");
  customRow.className = "nlsc-popover-row";
  const customLabel = document.createElement("span");
  customLabel.className = "nlsc-popover-label";
  customLabel.textContent = "自訂";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "nlsc-color-input";
  colorInput.value = initial ?? "#ff3b30";
  customRow.appendChild(customLabel);
  customRow.appendChild(colorInput);
  popover.appendChild(customRow);

  const allChips = [originalChip, ...presetChips];
  const updateUi = (color: string | null): void => {
    const normalized = color ? color.toLowerCase() : null;
    if (normalized) {
      swatch.style.backgroundColor = normalized;
      swatch.removeAttribute("data-original");
    } else {
      swatch.style.backgroundColor = "transparent";
      swatch.setAttribute("data-original", "true");
    }
    for (const chip of allChips) {
      const chipColor = chip.dataset.color || null;
      chip.classList.toggle("selected", (chipColor || null) === normalized);
    }
    if (normalized) colorInput.value = normalized;
  };
  updateUi(initial);

  const setAndClose = (color: string | null): void => {
    controller.setColor(layer.code, color);
    popover.classList.remove("open");
  };

  for (const chip of allChips) {
    chip.addEventListener("click", () => {
      const value = chip.dataset.color || "";
      setAndClose(value ? value : null);
    });
  }

  // Native color input fires `input` continuously while dragging; commit on
  // `change` (release / popover close) to avoid hammering localStorage.
  colorInput.addEventListener("input", () => {
    const normalized = normalizeHex(colorInput.value);
    if (normalized) controller.setColor(layer.code, normalized);
  });
  // Stop clicks inside the popover from bubbling to the document-level closer.
  popover.addEventListener("click", (e) => e.stopPropagation());

  swatch.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !popover.classList.contains("open");
    // Close any other open popovers in the panel.
    for (const el of document.querySelectorAll(".nlsc-popover.open")) {
      el.classList.remove("open");
    }
    if (willOpen) popover.classList.add("open");
  });

  return { swatch, popover, updateUi };
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

  const grip = document.createElement("span");
  grip.className = "nlsc-grip";
  grip.textContent = "⋮⋮";
  grip.title = "拖曳調整順序";
  headerRow.appendChild(grip);

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

  const colorCtl = renderColorControl(layer, state, controller);
  headerRow.appendChild(colorCtl.swatch);

  // "Above WME objects" icon button — flips this layer between the default
  // below-objects band and the above-objects band. Radio-style: only one
  // layer can hold the slot at a time, so this button reflects whether THIS
  // layer is the one currently pinned above. Hidden entirely when the layer
  // is not visible (the action would be a no-op anyway).
  const aboveBtn = document.createElement("button");
  aboveBtn.type = "button";
  aboveBtn.className = "nlsc-above-btn";
  aboveBtn.title = "置於物件之上";
  const initialAbove = state.aboveCode === layer.code;
  aboveBtn.setAttribute("aria-pressed", initialAbove ? "true" : "false");
  if (!(state.visible[layer.code] ?? false)) aboveBtn.style.display = "none";
  // Inline SVG so the glyph picks up the button's `currentColor` (muted when
  // off, white-on-orange when on). Two squares: dim back, filled front =
  // canonical "bring to front" iconography.
  aboveBtn.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<rect x="2" y="5.5" width="7.5" height="7.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>' +
    '<rect x="6.5" y="2" width="7.5" height="7.5" rx="1.4" fill="currentColor"/>' +
    "</svg>";
  headerRow.appendChild(aboveBtn);

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
  row.appendChild(colorCtl.popover);

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

  aboveBtn.addEventListener("click", () => {
    const next = aboveBtn.getAttribute("aria-pressed") !== "true";
    controller.setAbove(layer.code, next);
  });

  slider.addEventListener("input", () => {
    valueLabel.textContent = `${slider.value}%`;
    controller.setOpacity(layer.code, Number(slider.value) / 100);
  });

  return { row, grip, checkbox, aboveBtn, slider, valueLabel, updateColorUi: colorCtl.updateUi };
}

function wireRowListeners(
  layer: NlscLayer,
  controller: NlscController,
  refs: RowRefs,
): void {
  controller.onVisibleChange((code, visible) => {
    if (code !== layer.code) return;
    if (refs.checkbox.checked !== visible) refs.checkbox.checked = visible;
    // "Above WME objects" is meaningless on a hidden layer — hide the button
    // so the row stays uncluttered. Persisted aboveCode survives so re-enabling
    // visibility restores the pinned state without an extra click.
    refs.aboveBtn.style.display = visible ? "" : "none";
  });

  controller.onOpacityChange((code, opacity) => {
    if (code !== layer.code) return;
    const pct = Math.round(opacity * 100);
    if (Number(refs.slider.value) !== pct) {
      refs.slider.value = String(pct);
      refs.valueLabel.textContent = `${pct}%`;
    }
  });

  controller.onColorChange((code, color) => {
    if (code !== layer.code) return;
    refs.updateColorUi(color);
  });

  controller.onAboveChange((code, above) => {
    if (code !== layer.code) return;
    const want = above ? "true" : "false";
    if (refs.aboveBtn.getAttribute("aria-pressed") !== want) {
      refs.aboveBtn.setAttribute("aria-pressed", want);
    }
  });
}
