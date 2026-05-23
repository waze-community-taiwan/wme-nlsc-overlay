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

  addBinding(binding: LayerBinding): void {
    this.byCode.set(binding.layer.code, binding);
  }

  removeBinding(code: string): void {
    this.byCode.delete(code);
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
}
