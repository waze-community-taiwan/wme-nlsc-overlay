import type { NlscLayer } from "./layers";
import { saveState, type NlscState } from "./state";

export interface LayerBinding {
  layer: NlscLayer;
  setLayerVisible: (visible: boolean) => void;
  setLayerOpacity: (opacity: number) => void;
  /** Apply a tint color (`#RRGGBB`) or clear it back to the original tile colors. */
  setLayerColor: (color: string | null) => void;
}

export type VisibilityListener = (code: string, visible: boolean) => void;
export type OpacityListener = (code: string, opacity: number) => void;
export type ColorListener = (code: string, color: string | null) => void;
export type AboveListener = (code: string, above: boolean) => void;
export type OrderListener = (order: readonly string[]) => void;

/**
 * Single source of truth for layer visibility/opacity/color. Both the sidebar
 * and the WME LayerSwitcher route their user actions through this controller;
 * listeners fan changes back out so each UI surface mirrors the others.
 */
export class NlscController {
  private readonly byCode: Map<string, LayerBinding>;
  private readonly visListeners: VisibilityListener[] = [];
  private readonly opListeners: OpacityListener[] = [];
  private readonly colorListeners: ColorListener[] = [];
  private readonly aboveListeners: AboveListener[] = [];
  private readonly orderListeners: OrderListener[] = [];

  constructor(
    private readonly state: NlscState,
    bindings: readonly LayerBinding[],
  ) {
    this.byCode = new Map(bindings.map((b) => [b.layer.code, b]));
  }

  setVisible(code: string, visible: boolean): void {
    const b = this.byCode.get(code);
    if (!b) return;
    // Idempotent guard: prevents echo loops when one UI surface broadcasts to the other.
    if ((this.state.visible[code] ?? false) === visible) return;
    b.setLayerVisible(visible);
    this.state.visible[code] = visible;
    saveState(this.state);
    for (const fn of this.visListeners) fn(code, visible);
  }

  setOpacity(code: string, opacity: number): void {
    const b = this.byCode.get(code);
    if (!b) return;
    b.setLayerOpacity(opacity);
    this.state.opacity[code] = opacity;
    saveState(this.state);
    for (const fn of this.opListeners) fn(code, opacity);
  }

  setColor(code: string, color: string | null): void {
    const b = this.byCode.get(code);
    if (!b) return;
    if ((this.state.color[code] ?? null) === color) return;
    b.setLayerColor(color);
    this.state.color[code] = color;
    saveState(this.state);
    for (const fn of this.colorListeners) fn(code, color);
  }

  /**
   * Radio-style: only one layer can be "above" at a time. Promoting layer X
   * automatically demotes whatever previously held the slot. Demoting X is
   * a no-op unless X currently holds the slot. Listeners fire once per
   * affected layer (the swap path fires twice: old=false, new=true) so each
   * sidebar row can update its own `aria-pressed` independently.
   */
  setAbove(code: string, above: boolean): void {
    if (!this.byCode.has(code)) return;
    const current = this.state.aboveCode;
    if (above) {
      if (current === code) return;
      this.state.aboveCode = code;
      saveState(this.state);
      if (current !== null) {
        for (const fn of this.aboveListeners) fn(current, false);
      }
      for (const fn of this.aboveListeners) fn(code, true);
    } else {
      if (current !== code) return;
      this.state.aboveCode = null;
      saveState(this.state);
      for (const fn of this.aboveListeners) fn(code, false);
    }
  }

  addBinding(binding: LayerBinding): void {
    this.byCode.set(binding.layer.code, binding);
  }

  removeBinding(code: string): void {
    this.byCode.delete(code);
  }

  getOrder(): readonly string[] {
    return this.state.layerOrder;
  }

  /**
   * Replace the stacking order. Unknown codes (no registered binding) are
   * dropped. No-op if the resulting array matches the current order, which
   * keeps DnD drop events from looping back through onOrderChange.
   */
  setOrder(order: readonly string[]): void {
    const cleaned = order.filter((c) => this.byCode.has(c));
    if (arraysEqual(cleaned, this.state.layerOrder)) return;
    this.state.layerOrder = [...cleaned];
    saveState(this.state);
    for (const fn of this.orderListeners) fn(this.state.layerOrder);
  }

  onVisibleChange(handler: VisibilityListener): void {
    this.visListeners.push(handler);
  }

  onOpacityChange(handler: OpacityListener): void {
    this.opListeners.push(handler);
  }

  onColorChange(handler: ColorListener): void {
    this.colorListeners.push(handler);
  }

  onAboveChange(handler: AboveListener): void {
    this.aboveListeners.push(handler);
  }

  onOrderChange(handler: OrderListener): void {
    this.orderListeners.push(handler);
  }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
