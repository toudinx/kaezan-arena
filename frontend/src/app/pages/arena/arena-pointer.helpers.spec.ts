import {
  hitTestMobAtTile,
  resolvePointerCommand,
  screenToTile,
  type GridLayout,
  type PointerActorState
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

  it("dispatches left/right clicks to ground-target and set-target commands", () => {
    const actors: PointerActorState[] = [{ actorId: "mob.1", kind: "mob", tileX: 4, tileY: 3 }];

    expect(resolvePointerCommand("left_click", { x: 1, y: 2 }, actors)).toEqual({
      type: "set_ground_target",
      groundTileX: 1,
      groundTileY: 2
    });
    expect(resolvePointerCommand("right_click", { x: 4, y: 3 }, actors)).toEqual({
      type: "set_target",
      targetEntityId: "mob.1"
    });
    expect(resolvePointerCommand("right_click", { x: 0, y: 0 }, actors)).toEqual({
      type: "set_target",
      targetEntityId: null
    });
    expect(resolvePointerCommand("left_click", null, actors)).toBeNull();
  });
});
