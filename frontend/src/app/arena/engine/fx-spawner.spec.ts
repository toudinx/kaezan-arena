import { ArenaScene } from "./arena-engine.types";
import { planSquareAreaFx, spawnFxPlan } from "./fx-spawner";

describe("fx-spawner", () => {
  function createScene(columns = 5, rows = 5): ArenaScene {
    return {
      columns,
      rows,
      tileSize: 32,
      playerTile: { x: 2, y: 2 },
      effectiveTargetEntityId: null,
      lockedTargetEntityId: null,
      groundTargetPos: null,
      actorsById: {},
      actorVisualsById: {},
      skillsById: {},
      tiles: [],
      sprites: [],
      decals: [],
      activeBuffs: [],
      activePois: [],
      fxInstances: [],
      attackFxInstances: [],
      damageNumbers: []
    };
  }

  it("plans a square AoE with deterministic tile count", () => {
    const scene = createScene();

    const plan = planSquareAreaFx(scene, { x: 2, y: 2 }, 1, "fx.hit.small");

    expect(plan).toHaveLength(9);
    expect(plan[0]?.tilePos).toEqual({ x: 1, y: 1 });
    expect(plan[4]?.tilePos).toEqual({ x: 2, y: 2 });
    expect(plan[8]?.tilePos).toEqual({ x: 3, y: 3 });
  });

  it("filters out-of-bounds tiles when spawning from a plan", () => {
    const scene = createScene(3, 3);
    const plan = [
      { fxId: "fx.hit.small", tilePos: { x: -1, y: 0 } },
      { fxId: "fx.hit.small", tilePos: { x: 1, y: 1 } },
      { fxId: "fx.hit.small", tilePos: { x: 4, y: 4 } }
    ];

    const next = spawnFxPlan(scene, plan, 600, "groundFx");

    expect(next.fxInstances).toHaveLength(1);
    expect(next.fxInstances[0]?.tilePos).toEqual({ x: 1, y: 1 });
    expect(next.fxInstances[0]?.durationMs).toBe(600);
  });
});
