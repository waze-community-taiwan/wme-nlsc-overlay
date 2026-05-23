// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseCapabilities } from "../../src/catalog";

// Minimal WMTS Capabilities scaffolding — only the bits parseCapabilities reads.
function makeXml(opts: {
  layers: Array<{
    code: string;
    title?: string;
    format?: string;
    matrixSetRef?: string;
    limits?: number[]; // TileMatrix identifiers (numbers) to include in TileMatrixSetLimits
  }>;
  matrixSets?: Array<{ id: string; matrixIds: string[] }>;
}): string {
  const layerXml = opts.layers
    .map((l) => {
      const setRef = l.matrixSetRef ?? "GoogleMapsCompatible";
      const limitsXml = l.limits
        ? `<TileMatrixSetLimits>${l.limits
            .map((z) => `<TileMatrixLimits><TileMatrix>${z}</TileMatrix></TileMatrixLimits>`)
            .join("")}</TileMatrixSetLimits>`
        : "";
      return `<Layer>
        <ows:Title>${l.title ?? l.code}</ows:Title>
        <ows:Identifier>${l.code}</ows:Identifier>
        <Format>${l.format ?? "image/jpeg"}</Format>
        <TileMatrixSetLink>
          <TileMatrixSet>${setRef}</TileMatrixSet>
          ${limitsXml}
        </TileMatrixSetLink>
      </Layer>`;
    })
    .join("");

  const setsXml = (opts.matrixSets ?? [])
    .map(
      (s) => `<TileMatrixSet>
        <ows:Identifier>${s.id}</ows:Identifier>
        ${s.matrixIds
          .map((id) => `<TileMatrix><ows:Identifier>${id}</ows:Identifier></TileMatrix>`)
          .join("")}
      </TileMatrixSet>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
    <Capabilities xmlns="http://www.opengis.net/wmts/1.0"
                  xmlns:ows="http://www.opengis.net/ows/1.1">
      <Contents>
        ${layerXml}
        ${setsXml}
      </Contents>
    </Capabilities>`;
}

describe("parseCapabilities maxZoom resolution", () => {
  it("uses the referenced TileMatrixSet's intrinsic max when limits are absent (NLSC's actual layout)", () => {
    const xml = makeXml({
      layers: [{ code: "EMAP5" }],
      matrixSets: [
        {
          id: "GoogleMapsCompatible",
          matrixIds: Array.from({ length: 20 }, (_, i) => String(i)), // 0..19
        },
      ],
    });
    const [layer] = parseCapabilities(xml);
    expect(layer.code).toBe("EMAP5");
    expect(layer.maxZoom).toBe(19);
  });

  it("prefers per-layer TileMatrixSetLimits over the matrix set's max", () => {
    const xml = makeXml({
      layers: [{ code: "LANDSECT2", limits: [0, 1, 2, 14, 15] }],
      matrixSets: [
        {
          id: "GoogleMapsCompatible",
          matrixIds: Array.from({ length: 20 }, (_, i) => String(i)),
        },
      ],
    });
    const [layer] = parseCapabilities(xml);
    expect(layer.maxZoom).toBe(15);
  });

  it("parses prefixed TileMatrix identifiers (\"SetName:N\") correctly", () => {
    const xml = makeXml({
      layers: [{ code: "FOO" }],
      matrixSets: [
        {
          id: "GoogleMapsCompatible",
          matrixIds: ["GoogleMapsCompatible:0", "GoogleMapsCompatible:18"],
        },
      ],
    });
    const [layer] = parseCapabilities(xml);
    expect(layer.maxZoom).toBe(18);
  });

  it("falls back to 19 when neither limits nor a matching matrix set are present", () => {
    const xml = makeXml({
      layers: [{ code: "ORPHAN", matrixSetRef: "UnknownSet" }],
      matrixSets: [],
    });
    const [layer] = parseCapabilities(xml);
    expect(layer.maxZoom).toBe(19);
  });
});
