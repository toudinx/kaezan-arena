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

  it("applies hit reaction visuals even when damage is fully absorbed by shield", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const events: ArenaBattleEvent[] = [
      {
        type: "damage_number",
        sourceEntityId: "player.test",
        targetEntityId: "mob.test.01",
        targetTileX: 5,
        targetTileY: 4,
        damageAmount: 5,
        isKill: false,
        isCrit: false,
        hitId: 93,
        shieldDamageAmount: 5,
        hpDamageAmount: 0,
        elementType: 6
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, [], [], events);
    expect(applied.scene.actorVisualsById["mob.test.01"]?.mode).toBe("hit");
  });

  it("emits shield-break and high-impact assist combat callouts from existing events", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const skills: ArenaSkillState[] = [
      {
        skillId: "void_ricochet",
        displayName: "Void Ricochet",
        cooldownRemainingMs: 0,
        cooldownTotalMs: 2000
      }
    ];
    const events: ArenaBattleEvent[] = [
      {
        type: "damage_number",
        sourceEntityId: "mob.test.01",
        targetEntityId: "player.test",
        targetTileX: 3,
        targetTileY: 3,
        damageAmount: 18,
        isKill: false,
        isCrit: false,
        hitId: 94,
        shieldDamageAmount: 6,
        hpDamageAmount: 12,
        elementType: 6
      },
      {
        type: "assist_cast",
        skillId: "void_ricochet",
        reason: "auto_offense"
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, skills, [], events);
    const labels = applied.scene.floatingTexts.map((entry) => entry.text);
    const cueKinds = (applied.scene.momentCues ?? []).map((cue) => cue.kind);

    expect(labels).toContain("SHATTER");
    expect(labels).toContain("VOID RICOCHET");
    expect(cueKinds).toContain("shield_break");
    expect(cueKinds).toContain("assist_cast");
    expect(cueKinds).toContain("danger_hit");
  });

  it("uses one assist callout system for the Exori family with tiered intensity", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const skills: ArenaSkillState[] = [
      {
        skillId: "exori_min",
        displayName: "Exori Min",
        cooldownRemainingMs: 0,
        cooldownTotalMs: 800
      },
      {
        skillId: "exori",
        displayName: "Exori",
        cooldownRemainingMs: 0,
        cooldownTotalMs: 1200
      },
      {
        skillId: "exori_mas",
        displayName: "Exori Mas",
        cooldownRemainingMs: 0,
        cooldownTotalMs: 2000
      }
    ];
    const events: ArenaBattleEvent[] = [
      { type: "assist_cast", skillId: "exori_min", reason: "auto_offense" },
      { type: "assist_cast", skillId: "exori", reason: "auto_offense" },
      { type: "assist_cast", skillId: "exori_mas", reason: "auto_offense" }
    ];

    const applied = engine.applyBattleStep(scene, actors, skills, [], events);
    const callouts = applied.scene.floatingTexts.filter((entry) =>
      entry.kind === "combat_callout" && entry.tone === "assist"
    );

    expect(callouts).toHaveLength(3);
    expect(callouts.map((entry) => entry.text)).toEqual(["EXORI MIN", "EXORI", "EXORI MAS"]);

    const exoriMin = callouts.find((entry) => entry.text === "EXORI MIN");
    const exori = callouts.find((entry) => entry.text === "EXORI");
    const exoriMas = callouts.find((entry) => entry.text === "EXORI MAS");
    expect(exoriMin).toBeDefined();
    expect(exori).toBeDefined();
    expect(exoriMas).toBeDefined();

    expect(exoriMin!.durationMs).toBeLessThan(exori!.durationMs);
    expect(exori!.durationMs).toBeLessThan(exoriMas!.durationMs);
    expect(exoriMin!.fontScale ?? 1).toBeLessThan(exori!.fontScale ?? 1);
    expect(exori!.fontScale ?? 1).toBeLessThan(exoriMas!.fontScale ?? 1);
  });

  it("creates elite spawn/readability cues directly from elite lifecycle events", () => {
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
        actorId: "elite.mob.01",
        kind: "mob",
        mobType: 4,
        isElite: true,
        tileX: 5,
        tileY: 2,
        hp: 40,
        maxHp: 40
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, [], [], [
      {
        type: "elite_spawned",
        eliteEntityId: "elite.mob.01",
        mobType: 4
      }
    ]);

    expect((applied.scene.momentCues ?? []).some((cue) => cue.kind === "elite_spawn")).toBe(true);
    expect(applied.scene.floatingTexts.some((entry) => entry.text === "ELITE!")).toBe(true);
  });

  it("adds subtle mob death cue only for focused or threat-linked deaths", () => {
    const engine = new ArenaEngine();
    let scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    scene = engine.applyActorStates(scene, actors);
    scene = engine.applyTargetingState(scene, "mob.test.01", "mob.test.01", null);

    const applied = engine.applyBattleStep(scene, actors, [], [], [
      {
        type: "death",
        entityId: "mob.test.01",
        entityType: "mob",
        mobType: 2,
        tileX: 5,
        tileY: 4,
        tickIndex: 40
      }
    ]);

    expect((applied.scene.momentCues ?? []).some((cue) => cue.kind === "mob_death")).toBe(true);
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

  it("emits reward cues for chest interaction and reward card flow using existing events", () => {
    const engine = new ArenaEngine();
    const scene = engine.createTestScene(7, 7, 32);
    const actors = createActors();
    const events: ArenaBattleEvent[] = [
      {
        type: "poi_interacted",
        poiId: "poi.chest.0007",
        poiType: "chest",
        tileX: 2,
        tileY: 4
      },
      {
        type: "card_choice_offered",
        choiceId: "card-choice-07"
      },
      {
        type: "card_chosen",
        choiceId: "card-choice-07",
        cardName: "Colossus Heart"
      }
    ];

    const applied = engine.applyBattleStep(scene, actors, [], [], events);
    const cueKinds = (applied.scene.momentCues ?? []).map((cue) => cue.kind);
    const calloutTexts = applied.scene.floatingTexts.map((entry) => entry.text);
    const calloutTones = applied.scene.floatingTexts.map((entry) => entry.tone);

    expect(cueKinds.filter((kind) => kind === "reward_open").length).toBe(3);
    expect(calloutTexts).toContain("REWARD");
    expect(calloutTexts).toContain("CHOOSE REWARD");
    expect(calloutTexts).toContain("COLOSSUS HEART");
    expect(calloutTones.every((tone) => tone === "reward")).toBe(true);
  });
});
