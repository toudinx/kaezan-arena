import { ArenaEngine } from "./arena-engine";
import { ArenaActorState, ArenaBattleEvent, ArenaSkillState } from "./arena-engine.types";

describe("ArenaEngine combat fx mapping", () => {
  function createActors(): ArenaActorState[] {
    return [
      {
        actorId: "player.test",
        kind: "player",
        tileX: 3,
        tileY: 3,
        hp: 100,
        maxHp: 100
      },
      {
        actorId: "mob.test.01",
        kind: "mob",
        mobType: 2,
        tileX: 5,
        tileY: 4,
        hp: 20,
        maxHp: 20
      }
    ];
  }

  it("maps attack_fx events into deterministic render instances", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const skills: ArenaSkillState[] = [];
    const events: ArenaBattleEvent[] = [
      {
        type: "attack_fx",
        fxKind: 2,
        fromTileX: 5,
        fromTileY: 4,
        toTileX: 3,
        toTileY: 3,
        durationMs: 220,
        createdAtTick: 12,
        eventId: 3,
        elementType: 6
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, skills, [], events);

    expect(applied.scene.attackFxInstances).toHaveLength(1);
    const instance = applied.scene.attackFxInstances[0];
    expect(instance?.eventId).toBe(3);
    expect(instance?.fxKind).toBe(2);
    expect(instance?.fromPos).toEqual({ x: 5, y: 4 });
    expect(instance?.toPos).toEqual({ x: 3, y: 3 });
    expect(instance?.durationMs).toBe(220);
    expect(instance?.createdAtTick).toBe(12);
    expect(instance?.directionAngleRad).toBeCloseTo(Math.atan2(-1, -2), 8);
  });

  it("ticks and expires attack fx instances by duration", () => {
    const engine = new ArenaEngine();
    const initial = engine.applyBattleStep(engine.createTestScene(7, 7, 32), createActors(), [], [], [
      {
        type: "attack_fx",
        fxKind: 1,
        fromTileX: 3,
        fromTileY: 3,
        toTileX: 4,
        toTileY: 3,
        durationMs: 120,
        createdAtTick: 18,
        eventId: 1,
        elementType: 6
      }
    ]);

    const mid = engine.update(initial.scene, 80);
    expect(mid.attackFxInstances).toHaveLength(1);
    expect(mid.attackFxInstances[0]?.elapsedMs).toBe(80);

    const expired = engine.update(mid, 50);
    expect(expired.attackFxInstances).toHaveLength(0);
  });

  it("maps reflect numbers and assigns deterministic stack indexes per tile by event order", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const skills: ArenaSkillState[] = [];
    const events: ArenaBattleEvent[] = [
      {
        type: "damage_number",
        targetEntityId: "mob.test.01",
        targetTileX: 5,
        targetTileY: 4,
        damageAmount: 3,
        isKill: false,
        isCrit: false,
        hitId: 91,
        elementType: 6,
        attackerEntityId: "player.test",
        attackerTileX: 3,
        attackerTileY: 3
      },
      {
        type: "reflect_number",
        sourceEntityId: "player.test",
        targetEntityId: "mob.test.01",
        targetTileX: 5,
        targetTileY: 4,
        amount: 2,
        elementType: 6
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, skills, [], events);

    expect(applied.scene.damageNumbers).toHaveLength(2);
    expect(applied.scene.damageNumbers[0]?.kind).toBe("damage");
    expect(applied.scene.damageNumbers[0]?.stackIndex).toBe(0);
    expect(applied.scene.damageNumbers[0]?.spawnOrder).toBe(0);
    expect(applied.scene.damageNumbers[1]?.kind).toBe("reflect");
    expect(applied.scene.damageNumbers[1]?.stackIndex).toBe(1);
    expect(applied.scene.damageNumbers[1]?.spawnOrder).toBe(1);
  });

  it("tracks last mob attacker as threat marker candidate", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const skills: ArenaSkillState[] = [];
    const events: ArenaBattleEvent[] = [
      {
        type: "damage_number",
        sourceEntityId: "mob.test.01",
        targetEntityId: "player.test",
        targetTileX: 3,
        targetTileY: 3,
        damageAmount: 7,
        isKill: false,
        isCrit: false,
        hitId: 92,
        elementType: 6
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, skills, [], events);
    expect(applied.scene.threatMobEntityId).toBe("mob.test.01");
  });

  it("maps crit_text events and expires them by duration", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const skills: ArenaSkillState[] = [];
    const events: ArenaBattleEvent[] = [
      {
        type: "crit_text",
        text: "CRIT!",
        tileX: 5,
        tileY: 4,
        startAtMs: 250,
        durationMs: 800
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, skills, [], events);

    expect(applied.scene.floatingTexts).toHaveLength(1);
    expect(applied.scene.floatingTexts[0]?.text).toBe("CRIT!");
    expect(applied.scene.floatingTexts[0]?.tilePos).toEqual({ x: 5, y: 4 });
    expect(applied.scene.floatingTexts[0]?.durationMs).toBe(800);

    const active = engine.update(applied.scene, 700);
    expect(active.floatingTexts).toHaveLength(1);
    expect(active.floatingTexts[0]?.elapsedMs).toBe(700);

    const expired = engine.update(active, 120);
    expect(expired.floatingTexts).toHaveLength(0);
  });

  it("maps mob_knocked_back events into short slide visuals without changing gameplay authority", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors: ArenaActorState[] = [
      {
        actorId: "player.test",
        kind: "player",
        tileX: 3,
        tileY: 3,
        hp: 100,
        maxHp: 100
      },
      {
        actorId: "mob.test.01",
        kind: "mob",
        mobType: 2,
        tileX: 6,
        tileY: 4,
        hp: 20,
        maxHp: 20
      }
    ];
    const applied = engine.applyBattleStep(scene, actors, [], [], [
      {
        type: "mob_knocked_back",
        actorId: "mob.test.01",
        fromTile: { x: 5, y: 4 },
        toTile: { x: 6, y: 4 }
      }
    ]);

    const initialSprite = applied.scene.sprites.find((entry) => entry.actorId === "mob.test.01");
    expect(initialSprite?.tilePos).toEqual({ x: 5, y: 4 });

    const mid = engine.update(applied.scene, 50);
    const midSprite = mid.sprites.find((entry) => entry.actorId === "mob.test.01");
    expect(midSprite?.tilePos.x ?? 0).toBeGreaterThan(5);
    expect(midSprite?.tilePos.x ?? 0).toBeLessThan(6);

    const completed = engine.update(mid, 60);
    const completedSprite = completed.sprites.find((entry) => entry.actorId === "mob.test.01");
    expect(completedSprite?.tilePos).toEqual({ x: 6, y: 4 });
    expect(completed.mobKnockbackSlidesByActorId?.["mob.test.01"]).toBeUndefined();
  });

  it("chains piercing segment projectiles sequentially so each segment starts on previous impact", () => {
    const engine = new ArenaEngine();
    const baseScene = engine.createTestScene(7, 7, 32);
    const scene = engine.applyRangedConfig(baseScene, {
      autoAttackRangedMaxRange: 7,
      rangedProjectileSpeedTiles: 10,
      rangedDefaultCooldownMs: 800,
      projectileColorByWeaponId: {}
    });
    const actors = createActors();
    const events: ArenaBattleEvent[] = [
      {
        type: "ranged_projectile_fired",
        weaponId: "weapon:void_ricochet",
        fromTile: { x: 4, y: 2 },
        toTile: { x: 6, y: 0 },
        targetActorId: null,
        pierces: true
      },
      {
        type: "ranged_projectile_fired",
        weaponId: "weapon:void_ricochet",
        fromTile: { x: 5, y: 1 },
        toTile: { x: 0, y: 6 },
        targetActorId: null,
        pierces: true
      },
      {
        type: "ranged_projectile_fired",
        weaponId: "weapon:void_ricochet",
        fromTile: { x: 1, y: 5 },
        toTile: { x: 0, y: 4 },
        targetActorId: null,
        pierces: true
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, [], [], events);
    expect(applied.scene.projectileInstances).toHaveLength(3);

    const [first, second, third] = applied.scene.projectileInstances;
    expect(first?.startDelayRemainingMs ?? 0).toBe(0);
    expect(second?.startDelayRemainingMs ?? 0).toBe(first?.impactDurationMs ?? 0);
    expect(third?.startDelayRemainingMs ?? 0).toBe((first?.impactDurationMs ?? 0) + (second?.impactDurationMs ?? 0));

    const afterFirstImpact = engine.update(applied.scene, first?.impactDurationMs ?? 0);
    const secondAfterFirst = afterFirstImpact.projectileInstances.find((projectile) =>
      projectile.fromPos.x === 5 && projectile.fromPos.y === 1);
    const thirdAfterFirst = afterFirstImpact.projectileInstances.find((projectile) =>
      projectile.fromPos.x === 1 && projectile.fromPos.y === 5);
    expect(secondAfterFirst?.startDelayRemainingMs ?? 0).toBe(0);
    expect(thirdAfterFirst?.startDelayRemainingMs ?? 0).toBe(second?.impactDurationMs ?? 0);

    const afterSecondImpact = engine.update(afterFirstImpact, second?.impactDurationMs ?? 0);
    const thirdAfterSecond = afterSecondImpact.projectileInstances.find((projectile) =>
      projectile.fromPos.x === 1 && projectile.fromPos.y === 5);
    expect(thirdAfterSecond?.startDelayRemainingMs ?? 0).toBe(0);
  });
});
