import {
  computeArenaBoardOrigin,
  computeMaxTileSizeForViewport
} from "./arena-board-layout.helpers";

describe("arena-board-layout.helpers", () => {
  it("computes tile size using viewport safe-area constraints", () => {
    expect(computeMaxTileSizeForViewport(7, 7, 686, 720)).toBe(91);
    expect(computeMaxTileSizeForViewport(7, 7, 686, 350)).toBe(44);
  });

  it("keeps the board centered but clamped inside safe padding", () => {
    const origin = computeArenaBoardOrigin({
      columns: 7,
      rows: 7,
      tileSize: 91,
      canvasWidth: 686,
      canvasHeight: 720
    });

    expect(origin.x).toBeCloseTo(24.5, 4);
    expect(origin.y).toBeCloseTo(45.5, 4);
  });

  it("falls back to non-negative centered origin when canvas is too small for padded layout", () => {
    const origin = computeArenaBoardOrigin({
      columns: 7,
      rows: 7,
      tileSize: 48,
      canvasWidth: 330,
      canvasHeight: 330
    });

    expect(origin).toEqual({ x: 0, y: 0 });
  });
});
