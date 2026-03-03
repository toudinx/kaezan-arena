import { clampWindowPosition } from "./window-clamp.helpers";

describe("window-clamp.helpers", () => {
  it("keeps position unchanged when already within bounds", () => {
    const clamped = clampWindowPosition({
      x: 120,
      y: 80,
      width: 320,
      height: 240,
      viewportWidth: 1280,
      viewportHeight: 720
    });

    expect(clamped).toEqual({ x: 120, y: 80 });
  });

  it("clamps position to the viewport rectangle", () => {
    const clamped = clampWindowPosition({
      x: 1400,
      y: -50,
      width: 320,
      height: 200,
      viewportWidth: 1280,
      viewportHeight: 720
    });

    expect(clamped).toEqual({ x: 960, y: 0 });
  });

  it("pins to top-left when the window is larger than viewport", () => {
    const clamped = clampWindowPosition({
      x: 100,
      y: 100,
      width: 1600,
      height: 900,
      viewportWidth: 1280,
      viewportHeight: 720
    });

    expect(clamped).toEqual({ x: 0, y: 0 });
  });
});
