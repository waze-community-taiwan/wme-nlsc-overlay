/**
 * Per-layer color tinting via SVG `<feColorMatrix>`.
 *
 * NLSC's TOWN/CITY/etc. boundary tiles are pre-rendered PNGs with black
 * strokes on a transparent background — server-side recoloring is impossible
 * and canvas pixel manipulation would require CORS headers NLSC does not send
 * (tainted canvas, broken tiles). Applying an SVG filter to the OpenLayers
 * layer `<div>` recolors every visible pixel while preserving alpha, so
 * anti-aliased edges stay smooth and only the stroke color changes.
 *
 * The matrix `[0 0 0 0 R; 0 0 0 0 G; 0 0 0 0 B; 0 0 0 1 0]` discards the input
 * RGB and emits the constant chosen color; the alpha row is identity, so
 * transparent pixels stay transparent.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFS_ID = "nlsc-tint-defs";

let defsEl: SVGDefsElement | null = null;

function ensureDefs(): SVGDefsElement {
  if (defsEl && defsEl.isConnected) return defsEl;
  const existing = document.getElementById(DEFS_ID);
  if (existing && existing instanceof SVGSVGElement) {
    const defs = existing.querySelector("defs");
    if (defs) {
      defsEl = defs as SVGDefsElement;
      return defsEl;
    }
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = DEFS_ID;
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  defsEl = defs as SVGDefsElement;
  return defsEl;
}

function filterId(code: string): string {
  return `nlsc-tint-${code.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function hexToRgbFloat(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * Returns the CSS `filter` value to apply (e.g., `url(#nlsc-tint-TOWN)`) for
 * the given color, or an empty string when no tint should be applied. The
 * SVG `<filter>` node is created/updated as a side effect.
 */
export function filterForColor(code: string, color: string | null): string {
  if (!color) return "";
  const rgb = hexToRgbFloat(color);
  if (!rgb) return "";
  const id = filterId(code);
  const defs = ensureDefs();
  let filter = defs.querySelector(`#${CSS.escape(id)}`) as SVGFilterElement | null;
  let matrix: SVGElement | null = null;
  if (!filter) {
    filter = document.createElementNS(SVG_NS, "filter") as SVGFilterElement;
    filter.id = id;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    matrix = document.createElementNS(SVG_NS, "feColorMatrix");
    matrix.setAttribute("type", "matrix");
    filter.appendChild(matrix);
    defs.appendChild(filter);
  } else {
    matrix = filter.querySelector("feColorMatrix");
  }
  if (matrix) {
    const [r, g, b] = rgb;
    matrix.setAttribute(
      "values",
      `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0`,
    );
  }
  return `url(#${id})`;
}
