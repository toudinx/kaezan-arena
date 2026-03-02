import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent movement input", () => {
  function createComponent(): ArenaPageComponent {
    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  }

  function enableCommandIssuing(component: ArenaPageComponent): void {
    (component as any).currentBattleId = "battle-move";
    (component as any).battleStatus = "started";
    (component as any).battleRequestInFlight = false;
  }

  it("maps WASD keydown to move_player commands", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "w" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued.length).toBe(1);
    expect(queued[0]["type"]).toBe("move_player");
    expect(queued[0]["dir"]).toBe("up");

    component.onKeyUp(new KeyboardEvent("keyup", { key: "w" }));
  });

  it("maps simultaneous WASD combos to diagonal move directions", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "w" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "d" }));

    const drained = (component as any).dequeuePendingCommands() as Array<Record<string, unknown>>;
    expect(drained.length).toBe(1);
    expect(drained[0]["type"]).toBe("move_player");
    expect(drained[0]["dir"]).toBe("up_right");

    component.onKeyUp(new KeyboardEvent("keyup", { key: "w" }));
    component.onKeyUp(new KeyboardEvent("keyup", { key: "d" }));
  });

  it("maps dedicated diagonal keys Q/E/Z/C to move_player diagonals", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "q" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "e" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "z" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "c" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued).toEqual([
      { type: "move_player", dir: "up_left" },
      { type: "move_player", dir: "up_right" },
      { type: "move_player", dir: "down_left" },
      { type: "move_player", dir: "down_right" }
    ]);
  });

  it("keeps WASD combo diagonal fallback working", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "s" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "a" }));

    const drained = (component as any).dequeuePendingCommands() as Array<Record<string, unknown>>;
    expect(drained.length).toBe(1);
    expect(drained[0]["type"]).toBe("move_player");
    expect(drained[0]["dir"]).toBe("down_left");

    component.onKeyUp(new KeyboardEvent("keyup", { key: "s" }));
    component.onKeyUp(new KeyboardEvent("keyup", { key: "a" }));
  });

  it("keeps arrow keys mapped to set_facing commands", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowLeft" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued.length).toBe(1);
    expect(queued[0]["type"]).toBe("set_facing");
    expect(queued[0]["dir"]).toBe("left");
  });

  it("sends only the latest move_player command per step", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    (component as any).enqueueCommand({ type: "move_player", dir: "up" });
    (component as any).enqueueCommand({ type: "cast_skill", skillId: "exori" });
    (component as any).enqueueCommand({ type: "move_player", dir: "right" });

    const drained = (component as any).dequeuePendingCommands() as Array<Record<string, unknown>>;
    expect(drained).toEqual([
      { type: "cast_skill", skillId: "exori" },
      { type: "move_player", dir: "right" }
    ]);
  });

  it("pressing F selects chest over altar when both are in melee range", () => {
    const component = createComponent();
    enableCommandIssuing(component);
    const scene = (component as any).engine.createTestScene();
    scene.actorsById = {
      player_demo: { actorId: "player_demo", kind: "player", tileX: 3, tileY: 3, hp: 120, maxHp: 120 }
    };
    scene.playerTile = { x: 3, y: 3 };
    scene.activePois = [
      { poiId: "poi.altar.1", type: "altar", pos: { x: 3, y: 2 }, remainingMs: 5000 },
      { poiId: "poi.chest.1", type: "chest", pos: { x: 4, y: 3 }, remainingMs: 5000 }
    ];
    (component as any).scene = scene;

    component.onKeyDown(new KeyboardEvent("keydown", { key: "f" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued).toEqual([{ type: "interact_poi", poiId: "poi.chest.1" }]);
  });

  it("pressing F uses deterministic poiId tie-break when priority and distance match", () => {
    const component = createComponent();
    enableCommandIssuing(component);
    const scene = (component as any).engine.createTestScene();
    scene.actorsById = {
      player_demo: { actorId: "player_demo", kind: "player", tileX: 3, tileY: 3, hp: 120, maxHp: 120 }
    };
    scene.playerTile = { x: 3, y: 3 };
    scene.activePois = [
      { poiId: "poi.chest.b", type: "chest", pos: { x: 3, y: 2 }, remainingMs: 5000 },
      { poiId: "poi.chest.a", type: "chest", pos: { x: 4, y: 3 }, remainingMs: 5000 }
    ];
    (component as any).scene = scene;

    component.onKeyDown(new KeyboardEvent("keydown", { key: "f" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued).toEqual([{ type: "interact_poi", poiId: "poi.chest.a" }]);
  });
});
