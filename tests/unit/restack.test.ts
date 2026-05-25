// @vitest-environment node
//
// Verifies the satellite-toggle bug:
// When WME removes and re-adds the satellite imagery layer, OL 2.x's
// addLayer pushes it to the END of olMap.layers (highest array index).
// Without a re-stack, our NLSC overlays end up beneath the satellite and
// disappear. This test exercises the restack algorithm against a fake
// olMap that mirrors OL 2.x's setLayerIndex/getLayerIndex behavior.

import { describe, expect, it } from "vitest";
import { restackLayers, type RestackOlMap } from "../../src/restack";

interface FakeLayer {
  name: string;
  isBaseLayer?: boolean;
  /** Used by WME for high-res aerial orthos; matched verbatim by the restacker. */
  project?: string;
}

function makeFakeMap(layers: FakeLayer[], baseLayer?: FakeLayer) {
  const map = {
    layers: layers.slice(),
    baseLayer,
    getLayerIndex(l: unknown): number {
      return this.layers.indexOf(l as FakeLayer);
    },
    setLayerIndex(l: unknown, n: number): void {
      const cur = this.layers.indexOf(l as FakeLayer);
      if (cur === -1) return;
      this.layers.splice(cur, 1);
      // OL 2.x clamps to [0, layers.length] post-removal.
      const target = Math.max(0, Math.min(n, this.layers.length));
      this.layers.splice(target, 0, l as FakeLayer);
    },
  };
  return map satisfies RestackOlMap;
}

const names = (m: { layers: FakeLayer[] }) => m.layers.map((l) => l.name);

describe("restackLayers", () => {
  it("happy path: stacks NLSC band just above base and below editor layers", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const emap: FakeLayer = { name: "EMAP5" };
    const ortho: FakeLayer = { name: "ORTHO" };
    const roads: FakeLayer = { name: "roads" };
    const places: FakeLayer = { name: "venues" };

    // Real-world initial state: createTileLayer pushes our overlays AFTER
    // WME's base+editor layers, so they start at the highest array indexes.
    const map = makeFakeMap([base, roads, places, emap, ortho], base);
    const byCode = new Map<string, FakeLayer>([
      ["EMAP5", emap],
      ["ORTHO", ortho],
    ]);

    restackLayers(map, byCode, ["EMAP5", "ORTHO"]);

    // Sidebar order [EMAP5, ORTHO] = EMAP5 on top → highest band index.
    expect(names(map)).toEqual([
      "satellite_imagery",
      "ORTHO",
      "EMAP5",
      "roads",
      "venues",
    ]);
  });

  it("REPRO: satellite re-added at end of olMap.layers ends up above NLSC without a restack", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const emap: FakeLayer = { name: "EMAP5" };
    const roads: FakeLayer = { name: "roads" };

    // After our initial restack the band sits between base and editor.
    const map = makeFakeMap([base, emap, roads], base);
    const byCode = new Map<string, FakeLayer>([["EMAP5", emap]]);
    restackLayers(map, byCode, ["EMAP5"]);
    expect(names(map)).toEqual(["satellite_imagery", "EMAP5", "roads"]);

    // Simulate the user toggling satellite OFF then ON: WME removes the
    // satellite layer and re-adds it. OL.addLayer pushes to the end.
    map.layers.splice(map.layers.indexOf(base), 1);
    map.layers.push(base);

    // BUG: without a restack, satellite is now at index 2, above EMAP5 (0).
    // It would visually cover our NLSC overlay.
    expect(map.layers.indexOf(base)).toBeGreaterThan(map.layers.indexOf(emap));
  });

  it("FIX: running restackLayers after the re-add restores base→band→editor order", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const emap: FakeLayer = { name: "EMAP5" };
    const ortho: FakeLayer = { name: "ORTHO" };
    const roads: FakeLayer = { name: "roads" };

    const map = makeFakeMap([base, emap, ortho, roads], base);
    const byCode = new Map<string, FakeLayer>([
      ["EMAP5", emap],
      ["ORTHO", ortho],
    ]);
    restackLayers(map, byCode, ["EMAP5", "ORTHO"]);
    // Sanity: pre-bug, the layout is correct.
    expect(names(map)).toEqual([
      "satellite_imagery",
      "ORTHO",
      "EMAP5",
      "roads",
    ]);

    // Reproduce the bug.
    map.layers.splice(map.layers.indexOf(base), 1);
    map.layers.push(base);
    expect(names(map)).toEqual(["ORTHO", "EMAP5", "roads", "satellite_imagery"]);

    // The OL `addlayer` handler in index.ts fires this:
    restackLayers(map, byCode, ["EMAP5", "ORTHO"]);

    // Satellite back at bottom; band restored; roads still on top.
    expect(names(map)).toEqual([
      "satellite_imagery",
      "ORTHO",
      "EMAP5",
      "roads",
    ]);
  });

  it("preserves editor layer order after the re-add (multiple editor layers)", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const a: FakeLayer = { name: "A" };
    const b: FakeLayer = { name: "B" };
    const roads: FakeLayer = { name: "roads" };
    const places: FakeLayer = { name: "venues" };
    const hazards: FakeLayer = { name: "hazards" };

    const map = makeFakeMap([base, a, b, roads, places, hazards], base);
    const byCode = new Map<string, FakeLayer>([
      ["A", a],
      ["B", b],
    ]);
    restackLayers(map, byCode, ["A", "B"]);
    expect(names(map)).toEqual([
      "satellite_imagery",
      "B",
      "A",
      "roads",
      "venues",
      "hazards",
    ]);

    // Toggle satellite off+on.
    map.layers.splice(map.layers.indexOf(base), 1);
    map.layers.push(base);
    restackLayers(map, byCode, ["A", "B"]);

    // Editor layers stay above us, in their original relative order.
    expect(names(map)).toEqual([
      "satellite_imagery",
      "B",
      "A",
      "roads",
      "venues",
      "hazards",
    ]);
  });

  it("honours sidebar top-to-bottom for a 3-layer band after re-add", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const a: FakeLayer = { name: "A" };
    const b: FakeLayer = { name: "B" };
    const c: FakeLayer = { name: "C" };
    const roads: FakeLayer = { name: "roads" };

    const map = makeFakeMap([base, a, b, c, roads], base);
    const byCode = new Map<string, FakeLayer>([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);
    // Sidebar order [B, A, C] = B on top, A middle, C bottom.
    restackLayers(map, byCode, ["B", "A", "C"]);
    expect(names(map)).toEqual(["satellite_imagery", "C", "A", "B", "roads"]);

    // Bug repro + restack.
    map.layers.splice(map.layers.indexOf(base), 1);
    map.layers.push(base);
    restackLayers(map, byCode, ["B", "A", "C"]);
    expect(names(map)).toEqual(["satellite_imagery", "C", "A", "B", "roads"]);
  });

  it("is idempotent: a restack on an already-correct map does no setLayerIndex work", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const a: FakeLayer = { name: "A" };
    const roads: FakeLayer = { name: "roads" };

    const map = makeFakeMap([base, a, roads], base);
    const byCode = new Map<string, FakeLayer>([["A", a]]);

    let setCalls = 0;
    const wrapped: RestackOlMap = {
      get layers() {
        return map.layers;
      },
      get baseLayer() {
        return map.baseLayer;
      },
      getLayerIndex: (l) => map.getLayerIndex(l),
      setLayerIndex: (l, n) => {
        setCalls += 1;
        map.setLayerIndex(l, n);
      },
    };

    restackLayers(wrapped, byCode, ["A"]);
    expect(setCalls).toBe(0);
    expect(names(map)).toEqual(["satellite_imagery", "A", "roads"]);
  });

  it("above-band: codes in aboveCodes stack on top of editor layers", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const emap: FakeLayer = { name: "EMAP5" };
    const town: FakeLayer = { name: "TOWN" };
    const roads: FakeLayer = { name: "roads" };
    const venues: FakeLayer = { name: "venues" };

    const map = makeFakeMap([base, roads, venues, emap, town], base);
    const byCode = new Map<string, FakeLayer>([
      ["EMAP5", emap],
      ["TOWN", town],
    ]);

    // TOWN promoted above editor layers; EMAP5 stays below.
    restackLayers(map, byCode, ["EMAP5", "TOWN"], new Set(["TOWN"]));

    expect(names(map)).toEqual([
      "satellite_imagery",
      "EMAP5",
      "roads",
      "venues",
      "TOWN",
    ]);
  });

  it("above-band: two promoted layers preserve their layerOrder relative position", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const a: FakeLayer = { name: "A" };
    const b: FakeLayer = { name: "B" };
    const c: FakeLayer = { name: "C" };
    const roads: FakeLayer = { name: "roads" };

    const map = makeFakeMap([base, roads, a, b, c], base);
    const byCode = new Map<string, FakeLayer>([
      ["A", a],
      ["B", b],
      ["C", c],
    ]);

    // Sidebar order [A, B, C]; A and C are above, B is below.
    // Above-band stacks A on top of C (A is higher in layerOrder = higher Z).
    restackLayers(map, byCode, ["A", "B", "C"], new Set(["A", "C"]));

    expect(names(map)).toEqual([
      "satellite_imagery",
      "B",
      "roads",
      "C",
      "A",
    ]);
  });

  it("above-band: empty aboveCodes set behaves identically to the legacy 3-arg call", () => {
    const base: FakeLayer = { name: "satellite_imagery", isBaseLayer: true };
    const emap: FakeLayer = { name: "EMAP5" };
    const roads: FakeLayer = { name: "roads" };

    const map = makeFakeMap([base, roads, emap], base);
    const byCode = new Map<string, FakeLayer>([["EMAP5", emap]]);

    restackLayers(map, byCode, ["EMAP5"], new Set());

    expect(names(map)).toEqual(["satellite_imagery", "EMAP5", "roads"]);
  });

  // Live WME does NOT use a single base layer for imagery. olMap.baseLayer is
  // a transparent `BASE_LAYER` placeholder; the visible satellite tiles ride
  // on a non-base `satellite_imagery` layer, and high-res aerials are XYZ
  // layers tagged with `project: 'earthengine-legacy'`. All three groups
  // belong below the NLSC band — otherwise re-enabling imagery covers our
  // overlay.
  it("real-WME shape: keeps placeholder base + satellite_imagery + earthengine-legacy below the NLSC band", () => {
    const placeholder: FakeLayer = { name: "BASE_LAYER", isBaseLayer: true };
    const sat: FakeLayer = { name: "satellite_imagery" };
    const ortho1: FakeLayer = { name: "satellite_pleiades_ortho_rgb", project: "earthengine-legacy" };
    const ortho2: FakeLayer = { name: "satellite_worldview3_ortho_rgb", project: "earthengine-legacy" };
    const emap: FakeLayer = { name: "EMAP5" };
    const town: FakeLayer = { name: "TOWN" };
    const roads: FakeLayer = { name: "roads" };
    const venues: FakeLayer = { name: "venues" };

    const map = makeFakeMap(
      [placeholder, sat, ortho1, ortho2, roads, venues, emap, town],
      placeholder,
    );
    const byCode = new Map<string, FakeLayer>([
      ["EMAP5", emap],
      ["TOWN", town],
    ]);

    restackLayers(map, byCode, ["EMAP5", "TOWN"]);

    // Imagery group (preserves original relative order) → NLSC band → editor layers.
    expect(names(map)).toEqual([
      "BASE_LAYER",
      "satellite_imagery",
      "satellite_pleiades_ortho_rgb",
      "satellite_worldview3_ortho_rgb",
      "TOWN",
      "EMAP5",
      "roads",
      "venues",
    ]);

    // Reproduce the satellite-toggle scenario: WME removes satellite_imagery
    // and re-adds it (OL pushes to the end).
    map.layers.splice(map.layers.indexOf(sat), 1);
    map.layers.push(sat);
    restackLayers(map, byCode, ["EMAP5", "TOWN"]);

    expect(names(map)).toEqual([
      "BASE_LAYER",
      "satellite_pleiades_ortho_rgb",
      "satellite_worldview3_ortho_rgb",
      "satellite_imagery",
      "TOWN",
      "EMAP5",
      "roads",
      "venues",
    ]);
    // Satellite back below our band.
    expect(map.layers.indexOf(sat)).toBeLessThan(map.layers.indexOf(emap));
    expect(map.layers.indexOf(sat)).toBeLessThan(map.layers.indexOf(town));
  });
});
