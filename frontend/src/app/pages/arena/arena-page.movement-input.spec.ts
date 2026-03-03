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

  it("maps dedicated diagonal keys Q/E/Z to move_player diagonals", () => {
    const component = createComponent();
    enableCommandIssuing(component);

    component.onKeyDown(new KeyboardEvent("keydown", { key: "q" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "e" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "z" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued).toEqual([
      { type: "move_player", dir: "up_left" },
      { type: "move_player", dir: "up_right" },
      { type: "move_player", dir: "down_left" }
    ]);
  });

  it("uses C hotkey to focus equipment panel", () => {
    const component = createComponent();
    const focusSpy = vi.spyOn(component as any, "focusEquipmentPanel");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "c" }));

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("uses H hotkey to switch right info tab to helper", () => {
    const component = createComponent();
    (component as any).selectedRightInfoTab = "bestiary";

    component.onKeyDown(new KeyboardEvent("keydown", { key: "h" }));
    expect((component as any).selectedRightInfoTab).toBe("helper");
  });

  it("uses K hotkey to switch right info tab to status", () => {
    const component = createComponent();
    (component as any).selectedRightInfoTab = "helper";

    component.onKeyDown(new KeyboardEvent("keydown", { key: "k" }));
    expect((component as any).selectedRightInfoTab).toBe("status");
  });

  it("uses T hotkey to toggle AUTO flag and label", () => {
    const component = createComponent();

    expect((component as any).assistConfig.enabled).toBe(false);
    expect(component.assistAutoToggleLabel).toBe("AUTO: OFF");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "t" }));
    expect((component as any).assistConfig.enabled).toBe(true);
    expect(component.assistAutoToggleLabel).toBe("AUTO: ON");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "t" }));
    expect((component as any).assistConfig.enabled).toBe(false);
    expect(component.assistAutoToggleLabel).toBe("AUTO: OFF");
  });

  it("uses D/L hotkeys to focus damage/loot console helpers", () => {
    const component = createComponent();
    const focusDamageSpy = vi.spyOn(component as any, "focusDamageConsole");
    const focusLootSpy = vi.spyOn(component as any, "focusLootConsole");

    component.onKeyDown(new KeyboardEvent("keydown", { key: "d" }));
    component.onKeyDown(new KeyboardEvent("keydown", { key: "l" }));

    expect(focusDamageSpy).toHaveBeenCalledTimes(1);
    expect(focusLootSpy).toHaveBeenCalledTimes(1);
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

  it("pressing F treats species_chest as chest priority over altar", () => {
    const component = createComponent();
    enableCommandIssuing(component);
    const scene = (component as any).engine.createTestScene();
    scene.actorsById = {
      player_demo: { actorId: "player_demo", kind: "player", tileX: 3, tileY: 3, hp: 120, maxHp: 120 }
    };
    scene.playerTile = { x: 3, y: 3 };
    scene.activePois = [
      { poiId: "poi.altar.1", type: "altar", pos: { x: 3, y: 2 }, remainingMs: 5000 },
      { poiId: "poi.species_chest.1", type: "species_chest", pos: { x: 4, y: 3 }, remainingMs: 5000, species: "ranged_archer" }
    ];
    (component as any).scene = scene;

    component.onKeyDown(new KeyboardEvent("keydown", { key: "f" }));

    const queued = (component as any).queuedCommands as Array<Record<string, unknown>>;
    expect(queued).toEqual([{ type: "interact_poi", poiId: "poi.species_chest.1" }]);
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

  it("bestiary focus follows effective target species and keeps last focus when target clears", () => {
    const component = createComponent();
    const scene = (component as any).engine.createTestScene();
    scene.actorsById = {
      player_demo: { actorId: "player_demo", kind: "player", tileX: 3, tileY: 3, hp: 120, maxHp: 120 },
      "mob.dragon.001": { actorId: "mob.dragon.001", kind: "mob", mobType: 4, tileX: 4, tileY: 3, hp: 40, maxHp: 40 }
    };
    scene.effectiveTargetEntityId = "mob.dragon.001";
    (component as any).scene = scene;
    (component as any).bestiaryEntries = [
      { species: "ranged_dragon", killsTotal: 7, nextChestAtKills: 13 },
      { species: "melee_brute", killsTotal: 2, nextChestAtKills: 11 }
    ];

    expect((component as any).bestiaryFocusEntry).toEqual({
      species: "ranged_dragon",
      killsTotal: 7,
      nextChestAtKills: 13
    });

    scene.effectiveTargetEntityId = null;
    expect((component as any).bestiaryFocusEntry).toEqual({
      species: "ranged_dragon",
      killsTotal: 7,
      nextChestAtKills: 13
    });
  });
});
