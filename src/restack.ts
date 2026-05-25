/**
 * Re-stack NLSC overlay layers around WME's editor band — by default above
 * the imagery band (so they actually cover the satellite/aerial tiles) and
 * below editor vector layers (roads, places, hazards, …), with an optional
 * per-layer "above" override that lifts a layer above the editor band so it
 * paints on top of roads/objects. Within each sub-band, layers are ordered
 * per `order`.
 *
 * Why this exists: WME removes and re-adds the satellite imagery layer each
 * time the user toggles it in the layer panel, and OL 2.x's `addLayer` pushes
 * the new layer to the END of `olMap.layers`. If we naively try to stack
 * above the base layer's current index, our targets overflow the array and
 * OL clamps them, scrambling our band. Instead, we build the desired layout
 *   [imagery…, NLSC band…, everything else…]
 * and write each layer into its target slot. setLayerIndex internally also
 * calls setLayerZIndex on every layer to update CSS z-indexes, so the
 * rendering reflects the new order.
 *
 * What counts as "imagery" — observed live on www.waze.com/editor:
 *   1. olMap.baseLayer — a transparent `BASE_LAYER` placeholder (OL idiom);
 *      isBaseLayer: true, no tiles. Sits at the bottom of olMap.layers.
 *   2. `satellite_imagery` — the visible satellite tiles, an
 *      OpenLayers.Layer.Google with isBaseLayer: false.
 *   3. `earthengine-legacy` aerials — high-res orthos (Pleiades, WorldView,
 *      GeoEye, SkySat, PNeo, super-resolution Sentinel-2 …) carried as
 *      OpenLayers.Layer.XYZ with `project: 'earthengine-legacy'`. Mostly
 *      hidden by default, toggled by region/zoom.
 * Treating only olMap.baseLayer as the bottom would leave satellite_imagery
 * and the aerials ABOVE our overlay — i.e. they'd cover NLSC after the user
 * toggles imagery back on. The reference WME OpenMaps userscript uses the
 * same `project === 'earthengine-legacy'` heuristic.
 *
 * `order` is sidebar top-to-bottom (`order[0]` = top of stack). OL's array
 * end is the visually-top layer, so the band is written low-to-high with
 * `order[0]` landing in the highest band slot.
 */
export interface RestackOlMap {
  readonly layers: ReadonlyArray<unknown>;
  /** OL 2.x: the currently-selected base layer. May be undefined briefly. */
  readonly baseLayer?: unknown;
  getLayerIndex(layer: unknown): number;
  setLayerIndex(layer: unknown, index: number): void;
}

/**
 * Decide whether `layer` belongs in the bottom imagery band.
 *
 * Heuristic intentionally broad — any new aerial source WME ships will most
 * likely land in `earthengine-legacy` or carry isBaseLayer, so this stays
 * useful without per-layer maintenance.
 */
function isImageryLayer(layer: unknown, base: unknown): boolean {
  if (layer === base) return true;
  const l = layer as { isBaseLayer?: unknown; name?: unknown; project?: unknown };
  if (l && l.isBaseLayer === true) return true;
  if (l && l.name === "satellite_imagery") return true;
  if (l && l.project === "earthengine-legacy") return true;
  return false;
}

export function restackLayers(
  olMap: RestackOlMap,
  tileLayersByCode: ReadonlyMap<string, unknown>,
  order: readonly string[],
  aboveCodes: ReadonlySet<string> = new Set(),
): void {
  const base = (olMap as { baseLayer?: unknown }).baseLayer;
  const snapshot = [...olMap.layers];
  const nlscSet = new Set(Array.from(tileLayersByCode.values()));

  // Resolve `order` codes to actual layer instances, split into the two bands
  // by `aboveCodes`. Each band preserves its sidebar top-to-bottom ordering.
  const belowTopFirst: unknown[] = [];
  const aboveTopFirst: unknown[] = [];
  for (const code of order) {
    const layer = tileLayersByCode.get(code);
    if (!layer || !snapshot.includes(layer)) continue;
    if (aboveCodes.has(code)) aboveTopFirst.push(layer);
    else belowTopFirst.push(layer);
  }
  // Array end = visually top, so reverse before writing: the bottom-of-band
  // layer goes first (lowest index), the top-of-band layer last (highest).
  const belowLowestFirst = belowTopFirst.slice().reverse();
  const aboveLowestFirst = aboveTopFirst.slice().reverse();

  // Imagery first (preserve existing relative order so toggling one aerial
  // on/off doesn't shuffle the others), then our below-band, then editor
  // layers, then our above-band on top of everything.
  const imagery = snapshot.filter((l) => !nlscSet.has(l) && isImageryLayer(l, base));
  const others = snapshot.filter((l) => !nlscSet.has(l) && !isImageryLayer(l, base));

  const target: unknown[] = [
    ...imagery,
    ...belowLowestFirst,
    ...others,
    ...aboveLowestFirst,
  ];

  // Skip no-op writes — each setLayerIndex re-applies CSS z-indexes across
  // every layer in olMap.layers, so suppressing redundant calls matters.
  for (let i = 0; i < target.length; i++) {
    if (olMap.getLayerIndex(target[i]) !== i) {
      olMap.setLayerIndex(target[i], i);
    }
  }
}
