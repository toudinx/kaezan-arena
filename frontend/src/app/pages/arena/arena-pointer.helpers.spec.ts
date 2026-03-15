import {
  hitTestMobAtTile,
  hitTestPoiAtTile,
  resolvePointerCommand,
  screenToTile,
  type GridLayout,
  type PointerActorState,
  type PoiPointerState
} from "./arena-pointer.helpers";

describe("arena-pointer.helpers", () => {
  const layout: GridLayout = {
    columns: 7,
    rows: 7,
    tileSize: 48,
    canvasWidth: 480,
    canvasHeight: 420
  };
  const rect = { left: 100, top: 50, width: 480, height: 420 };

  it("converts screen coordinates into centered grid tile coordinates", () => {
    const tile = screenToTile(340, 212, rect, layout);
    expect(tile).toEqual({ x: 3, y: 2 });
    expect(screenToTile(110, 60, rect, layout)).toBeNull();
  });

  it("hit-tests mobs under a tile deterministically", () => {
    const actors: PointerActorState[] = [
      { actorId: "player_demo", kind: "player", tileX: 3, tileY: 3 },
      { actorId: "mob.b", kind: "mob", tileX: 2, tileY: 3 },
      { actorId: "mob.a", kind: "mob", tileX: 2, tileY: 3 }
    ];

    expect(hitTestMobAtTile(actors, { x: 2, y: 3 })).toBe("mob.a");
    expect(hitTestMobAtTile(actors, { x: 1, y: 1 })).toBeNull();
  });

  it("hit-tests POIs under a tile", () => {
    const pois: PoiPointerState[] = [
      { poiId: "poi.chest.0001", tileX: 1, tileY: 2 },
      { poiId: "poi.altar.0002", tileX: 4, tileY: 5 }
    ];

    expect(hitTestPoiAtTile(pois, { x: 1, y: 2 })).toBe("poi.chest.0001");
    expect(hitTestPoiAtTile(pois, { x: 4, y: 5 })).toBe("poi.altar.0002");
    expect(hitTestPoiAtTile(pois, { x: 0, y: 0 })).toBeNull();
  });

  describe("resolvePointerCommand", () => {
    const actors: PointerActorState[] = [{ actorId: "mob.1", kind: "mob", tileX: 4, tileY: 3 }];
    const pois: PoiPointerState[] = [{ poiId: "poi.chest.0001", tileX: 1, tileY: 2 }];

    it("left-click on a POI tile returns interact_poi", () => {
      expect(resolvePointerCommand("left_click", { x: 1, y: 2 }, actors, pois)).toEqual({
        type: "interact_poi",
        poiId: "poi.chest.0001"
      });
    });

    it("left-click on empty tile returns null", () => {
      expect(resolvePointerCommand("left_click", { x: 0, y: 0 }, actors, pois)).toBeNull();
    });

    it("left-click on a mob tile (no POI) returns null", () => {
      expect(resolvePointerCommand("left_click", { x: 4, y: 3 }, actors, pois)).toBeNull();
    });

    it("left-click with null tile returns null", () => {
      expect(resolvePointerCommand("left_click", null, actors, pois)).toBeNull();
    });

    it("right-click on a mob tile returns set_target", () => {
      expect(resolvePointerCommand("right_click", { x: 4, y: 3 }, actors, pois)).toEqual({
        type: "set_target",
        targetEntityId: "mob.1"
      });
    });

    it("right-click on empty tile returns set_target with null", () => {
      expect(resolvePointerCommand("right_click", { x: 0, y: 0 }, actors, pois)).toEqual({
        type: "set_target",
        targetEntityId: null
      });
    });

    it("right-click with null tile returns null", () => {
      expect(resolvePointerCommand("right_click", null, actors, pois)).toBeNull();
    });
  });
});
