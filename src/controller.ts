import type { NlscLayer } from "./layers";
import { saveState, type NlscState } from "./state";

export interface LayerBinding {
  layer: NlscLayer;
  setLayerVisible: (visible: boolean) => void;
  setLayerOpacity: (opacity: number) => void;
}

export type VisibilityListener = (code: string, visible: boolean) => void;
export type OpacityListener = (code: string, opacity: number) => void;

/**
 * Single source of truth for layer visibility/opacity. Both the sidebar and the
 * WME LayerSwitcher route their user actions through this controller; listeners
 * fan changes back out so each UI surface mirrors the others.
 */
export class NlscController {
  private readonly byCode: Map<string, LayerBinding>;
  private readonly visListeners: VisibilityListener[] = [];
  private readonly opListeners: OpacityListener[] = [];

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
}
