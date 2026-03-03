import {
  AttackFxInstance,
  ActorAnimationMode,
  ActorVisualState,
  ActorVisualStateMap,
  ApplyBattleStepResult,
  ArenaActorMap,
  ArenaActorState,
  ArenaBattleEvent,
  ArenaBuffState,
  ArenaPoiState,
  ArenaScene,
  ArenaSkillMap,
  ArenaSkillState,
  DecalInstance,
  DamageNumberInstance,
  FloatingTextInstance,
  FxPlanSpawn,
  FxSpawnRequest,
  SpriteEntity,
  TileEntity,
  TilePos
} from "./arena-engine.types";
import { computeDirectionAngleRad, normalizeCombatFxKind } from "./attack-fx.helpers";
import { planSquareAreaFx, spawnAreaFx, spawnFx, spawnFxPlan, tickFx } from "./fx-spawner";
import { resolveMobSpriteSemanticId } from "./mob-visuals";

const PLAYER_IDLE_SPRITE_ID = "sprite.player.idle";
const PLAYER_RUN_SPRITE_ID = "sprite.player.run";
const PLAYER_HIT_SPRITE_ID = "sprite.player.hit";
const HIT_VISUAL_DURATION_MS = 200;
const RUN_VISUAL_DURATION_MS = 300;
const PHYSICAL_ELEMENT = 6;

export class ArenaEngine {
  createTestScene(columns = 7, rows = 7, tileSize = 48): ArenaScene {
    const playerTile = { x: Math.floor(columns / 2), y: Math.floor(rows / 2) };
    const tiles: TileEntity[] = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const isBorderTile = x === 0 || y === 0 || x === columns - 1 || y === rows - 1;
        tiles.push({
          semanticId: isBorderTile ? "tile.wall.stone" : "tile.floor.default",
          tilePos: { x, y },
          layer: "ground"
        });
      }
    }

    const sprites: SpriteEntity[] = [
      {
        actorId: "preview.player",
        semanticId: PLAYER_IDLE_SPRITE_ID,
        tilePos: playerTile,
        layer: "actors",
        animationElapsedMs: 0
      }
    ];

    return {
      columns,
      rows,
      tileSize,
      playerTile,
      effectiveTargetEntityId: null,
      lockedTargetEntityId: null,
      groundTargetPos: null,
      actorsById: {},
      actorVisualsById: {},
      skillsById: {},
      tiles,
      sprites,
      decals: [],
      activeBuffs: [],
      activePois: [],
      fxInstances: [],
      attackFxInstances: [],
      damageNumbers: [],
      floatingTexts: []
    };
  }

  applyActorStates(scene: ArenaScene, actorStates: ReadonlyArray<ArenaActorState>): ArenaScene {
    const sortedActors = [...actorStates].sort((left, right) => left.actorId.localeCompare(right.actorId));
    const player = sortedActors.find((actor) => actor.kind === "player");
    const previousActorsById = scene.actorsById;
    const previousVisualsById = scene.actorVisualsById;

    const actorVisualsById: ActorVisualStateMap = {};
    const sprites: SpriteEntity[] = [];
    for (const actor of sortedActors) {
      const previousActor = previousActorsById[actor.actorId];
      const previousVisual = previousVisualsById[actor.actorId];
      const moved = !!previousActor && (previousActor.tileX !== actor.tileX || previousActor.tileY !== actor.tileY);
      const tookDamage = !!previousActor && actor.hp < previousActor.hp;
      const visual = this.createOrUpdateVisualState(previousVisual, actor, moved, tookDamage);

      actorVisualsById[actor.actorId] = visual;
      sprites.push({
        actorId: actor.actorId,
        semanticId: visual.currentAnimId,
        tilePos: { x: actor.tileX, y: actor.tileY },
        layer: "actors",
        animationElapsedMs: visual.elapsedMs
      });
    }

    return {
      ...scene,
      playerTile: player ? { x: player.tileX, y: player.tileY } : scene.playerTile,
      actorsById: this.toActorMap(sortedActors),
      actorVisualsById,
      sprites
    };
  }

  applyBattleStep(
    scene: ArenaScene,
    actorStates: ReadonlyArray<ArenaActorState>,
    skillStates: ReadonlyArray<ArenaSkillState>,
    decals: ReadonlyArray<DecalInstance>,
    events: ReadonlyArray<ArenaBattleEvent>
  ): ApplyBattleStepResult {
    let nextScene = this.applyActorStates(scene, actorStates);
    nextScene = this.applySkillStates(nextScene, skillStates);
    nextScene = this.applyDecals(nextScene, decals);
    const spawnedDamageNumbers: DamageNumberInstance[] = [];
    const spawnedAttackFx: AttackFxInstance[] = [];
    const spawnedFloatingTexts: FloatingTextInstance[] = [];
    const stackIndexByTile = new Map<string, number>();
    let spawnOrder = 0;
    const playerActorId = this.resolvePlayerActorId(nextScene, scene);

    for (const event of events) {
      if (event.type === "fx_spawn") {
        nextScene = spawnFx(nextScene, {
          fxId: event.fxId,
          tilePos: { x: event.tileX, y: event.tileY },
          durationMs: event.durationMs,
          layer: this.normalizeFxLayer(event.layer),
          element: this.normalizeElement(event.element)
        });
        continue;
      }

      if (event.type === "attack_fx") {
        spawnedAttackFx.push(this.toAttackFxInstance(event));
        continue;
      }

      if (event.type === "damage_number") {
        const entries = this.toDamageNumberInstances(event, playerActorId);
        for (const entry of entries) {
          spawnedDamageNumbers.push({
            ...entry,
            stackIndex: this.nextStackIndexForTile(entry.tilePos.x, entry.tilePos.y, stackIndexByTile),
            spawnOrder
          });
          spawnOrder += 1;
        }
        continue;
      }

      if (event.type === "crit_text") {
        spawnedFloatingTexts.push(this.toFloatingTextInstance(event));
        continue;
      }

      if (event.type === "death") {
        continue;
      }

      if (event.type === "heal_number") {
        const actorState = nextScene.actorsById[event.actorId] ?? scene.actorsById[event.actorId];
        const tilePos = actorState ? { x: actorState.tileX, y: actorState.tileY } : nextScene.playerTile;
        spawnedDamageNumbers.push(
          this.toHealNumberInstance(
            event,
            tilePos.x,
            tilePos.y,
            playerActorId,
            this.nextStackIndexForTile(tilePos.x, tilePos.y, stackIndexByTile),
            spawnOrder
          )
        );
        spawnOrder += 1;
        continue;
      }

      if (event.type === "reflect_number") {
        spawnedDamageNumbers.push(
          this.toReflectNumberInstance(
            event,
            playerActorId,
            this.nextStackIndexForTile(event.targetTileX, event.targetTileY, stackIndexByTile),
            spawnOrder
          )
        );
        spawnOrder += 1;
      }
    }

    nextScene = {
      ...nextScene,
      attackFxInstances: [...nextScene.attackFxInstances, ...spawnedAttackFx],
      damageNumbers: [...nextScene.damageNumbers, ...spawnedDamageNumbers],
      floatingTexts: [...nextScene.floatingTexts, ...spawnedFloatingTexts]
    };

    return {
      scene: nextScene,
      damageNumbers: spawnedDamageNumbers
    };
  }

  applySkillStates(scene: ArenaScene, skillStates: ReadonlyArray<ArenaSkillState>): ArenaScene {
    return {
      ...scene,
      skillsById: this.toSkillMap(skillStates)
    };
  }

  applyDecals(scene: ArenaScene, decals: ReadonlyArray<DecalInstance>): ArenaScene {
    return {
      ...scene,
      decals: [...decals]
    };
  }

  applyActivePois(scene: ArenaScene, pois: ReadonlyArray<ArenaPoiState>): ArenaScene {
    return {
      ...scene,
      activePois: [...pois]
    };
  }

  applyActiveBuffs(scene: ArenaScene, buffs: ReadonlyArray<ArenaBuffState>): ArenaScene {
    return {
      ...scene,
      activeBuffs: [...buffs]
    };
  }

  applyTargetingState(
    scene: ArenaScene,
    effectiveTargetEntityId: string | null,
    lockedTargetEntityId: string | null,
    groundTargetPos: TilePos | null
  ): ArenaScene {
    return {
      ...scene,
      effectiveTargetEntityId,
      lockedTargetEntityId,
      groundTargetPos
    };
  }

  spawnFx(scene: ArenaScene, request: FxSpawnRequest): ArenaScene {
    return spawnFx(scene, request);
  }

  spawnAreaFx(
    scene: ArenaScene,
    centerTile: TilePos,
    radius: number,
    fxId: string,
    durationMs: number,
    layer: "groundFx" | "hitFx" = "groundFx"
  ): ArenaScene {
    return spawnAreaFx(scene, centerTile, radius, fxId, durationMs, layer);
  }

  planSquareAreaFx(scene: ArenaScene, centerTile: TilePos, radius: number, fxId: string): FxPlanSpawn[] {
    return planSquareAreaFx(scene, centerTile, radius, fxId);
  }

  spawnFxPlan(
    scene: ArenaScene,
    plan: ReadonlyArray<FxPlanSpawn>,
    durationMs: number,
    layer: "groundFx" | "hitFx" = "groundFx"
  ): ArenaScene {
    return spawnFxPlan(scene, plan, durationMs, layer);
  }

  update(scene: ArenaScene, deltaMs: number): ArenaScene {
    const safeDelta = Math.max(0, deltaMs);
    const sceneWithVisuals = this.tickActorVisuals(scene, safeDelta);
    const sceneWithFx = tickFx(sceneWithVisuals, safeDelta);
    const sceneWithAttackFx = this.tickAttackFx(sceneWithFx, safeDelta);
    const sceneWithDamageNumbers = this.tickDamageNumbers(sceneWithAttackFx, safeDelta);
    return this.tickFloatingTexts(sceneWithDamageNumbers, safeDelta);
  }

  tick(scene: ArenaScene, deltaMs: number): ArenaScene {
    return this.update(scene, deltaMs);
  }

  private normalizeFxLayer(layer: string): "groundFx" | "hitFx" {
    return layer === "groundFx" ? "groundFx" : "hitFx";
  }

  private createOrUpdateVisualState(
    previousVisual: ActorVisualState | undefined,
    actor: ArenaActorState,
    moved: boolean,
    tookDamage: boolean
  ): ActorVisualState {
    let hitRemainingMs = previousVisual?.hitRemainingMs ?? 0;
    let runRemainingMs = previousVisual?.runRemainingMs ?? 0;

    if (tookDamage) {
      hitRemainingMs = HIT_VISUAL_DURATION_MS;
    }

    if (moved) {
      runRemainingMs = RUN_VISUAL_DURATION_MS;
    }

    const mode = this.resolveVisualMode(hitRemainingMs, runRemainingMs);
    const currentAnimId = this.resolveSpriteSemanticId(actor, mode);
    const elapsedMs = previousVisual && previousVisual.currentAnimId === currentAnimId
      ? previousVisual.elapsedMs
      : 0;

    return {
      actorId: actor.actorId,
      currentAnimId,
      mode,
      elapsedMs,
      hitRemainingMs,
      runRemainingMs
    };
  }

  private tickActorVisuals(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (Object.keys(scene.actorsById).length === 0) {
      return {
        ...scene,
        actorVisualsById: {},
        sprites: []
      };
    }

    const nextVisualsById: ActorVisualStateMap = {};
    const nextSprites: SpriteEntity[] = [];

    const actors = Object.values(scene.actorsById).sort((left, right) => left.actorId.localeCompare(right.actorId));
    for (const actor of actors) {
      const previousVisual = scene.actorVisualsById[actor.actorId];
      const hitRemainingMs = Math.max(0, (previousVisual?.hitRemainingMs ?? 0) - deltaMs);
      const runRemainingMs = Math.max(0, (previousVisual?.runRemainingMs ?? 0) - deltaMs);
      const mode = this.resolveVisualMode(hitRemainingMs, runRemainingMs);
      const currentAnimId = this.resolveSpriteSemanticId(actor, mode);
      const elapsedMs = previousVisual && previousVisual.currentAnimId === currentAnimId
        ? previousVisual.elapsedMs + deltaMs
        : 0;

      const visual: ActorVisualState = {
        actorId: actor.actorId,
        currentAnimId,
        mode,
        elapsedMs,
        hitRemainingMs,
        runRemainingMs
      };

      nextVisualsById[actor.actorId] = visual;
      nextSprites.push({
        actorId: actor.actorId,
        semanticId: visual.currentAnimId,
        tilePos: { x: actor.tileX, y: actor.tileY },
        layer: "actors",
        animationElapsedMs: visual.elapsedMs
      });
    }

    return {
      ...scene,
      actorVisualsById: nextVisualsById,
      sprites: nextSprites
    };
  }

  private resolveVisualMode(hitRemainingMs: number, runRemainingMs: number): ActorAnimationMode {
    if (hitRemainingMs > 0) {
      return "hit";
    }

    if (runRemainingMs > 0) {
      return "run";
    }

    return "idle";
  }

  private resolveSpriteSemanticId(actor: ArenaActorState, mode: ActorAnimationMode): string {
    if (actor.kind === "player") {
      if (mode === "run") {
        return PLAYER_RUN_SPRITE_ID;
      }

      if (mode === "hit") {
        return PLAYER_HIT_SPRITE_ID;
      }

      return PLAYER_IDLE_SPRITE_ID;
    }

    if (actor.kind === "mob") {
      return resolveMobSpriteSemanticId(actor.mobType, mode);
    }

    return PLAYER_IDLE_SPRITE_ID;
  }

  private toActorMap(actorStates: ReadonlyArray<ArenaActorState>): ArenaActorMap {
    const actorsById: ArenaActorMap = {};
    for (const actor of actorStates) {
      actorsById[actor.actorId] = actor;
    }

    return actorsById;
  }

  private toSkillMap(skillStates: ReadonlyArray<ArenaSkillState>): ArenaSkillMap {
    const skillsById: ArenaSkillMap = {};
    for (const skill of skillStates) {
      skillsById[skill.skillId] = skill;
    }

    return skillsById;
  }

  private toDamageNumberInstances(
    event: Extract<ArenaBattleEvent, { type: "damage_number" }>,
    playerActorId: string | null
  ): DamageNumberInstance[] {
    const sourceEntityId = event.sourceEntityId ?? event.attackerEntityId ?? null;
    const targetEntityId = event.targetEntityId;
    const targetTile = { x: event.targetTileX, y: event.targetTileY };
    const shieldDamageAmount = Math.max(0, event.shieldDamageAmount ?? 0);
    const hpDamageAmount = Math.max(0, event.hpDamageAmount ?? 0);
    const isCrit = event.hitKind === "crit" || event.isCrit;
    const isDamageReceived = this.isDamageReceived(sourceEntityId, targetEntityId, playerActorId);
    const element = this.normalizeElement(event.elementType);
    const entries: DamageNumberInstance[] = [];

    if (shieldDamageAmount > 0) {
      entries.push({
        actorId: targetEntityId,
        amount: shieldDamageAmount,
        isCrit: false,
        kind: "damage",
        isHeal: false,
        isShieldChange: true,
        shieldChangeDirection: "loss",
        isDamageReceived,
        sourceEntityId,
        targetEntityId,
        element,
        tilePos: targetTile,
        stackIndex: 0,
        spawnOrder: 0,
        elapsedMs: 0,
        durationMs: 930
      });
    }

    const hpAmount = hpDamageAmount > 0 ? hpDamageAmount : Math.max(0, event.damageAmount - shieldDamageAmount);
    if (hpAmount > 0 || entries.length === 0) {
      entries.push({
        actorId: targetEntityId,
        amount: hpAmount > 0 ? hpAmount : event.damageAmount,
        isCrit,
        kind: "damage",
        isHeal: false,
        isShieldChange: false,
        isDamageReceived,
        sourceEntityId,
        targetEntityId,
        element,
        tilePos: targetTile,
        stackIndex: 0,
        spawnOrder: 0,
        elapsedMs: 0,
        durationMs: 950
      });
    }

    return entries;
  }

  private toHealNumberInstance(
    event: Extract<ArenaBattleEvent, { type: "heal_number" }>,
    tileX: number,
    tileY: number,
    playerActorId: string | null,
    stackIndex: number,
    spawnOrder: number
  ): DamageNumberInstance {
    const isShieldGain = event.source === "shield_gain";
    return {
      actorId: event.actorId,
      amount: event.amount,
      isCrit: false,
      kind: isShieldGain ? "damage" : "heal",
      isHeal: !isShieldGain,
      isShieldChange: isShieldGain,
      shieldChangeDirection: isShieldGain ? "gain" : undefined,
      isDamageReceived: this.isDamageReceived(event.actorId, event.actorId, playerActorId),
      sourceEntityId: event.actorId,
      targetEntityId: event.actorId,
      element: PHYSICAL_ELEMENT,
      tilePos: { x: tileX, y: tileY },
      stackIndex,
      spawnOrder,
      elapsedMs: 0,
      durationMs: 900
    };
  }

  private toReflectNumberInstance(
    event: Extract<ArenaBattleEvent, { type: "reflect_number" }>,
    playerActorId: string | null,
    stackIndex: number,
    spawnOrder: number
  ): DamageNumberInstance {
    const sourceEntityId = event.sourceEntityId;
    const targetEntityId = event.targetEntityId;
    return {
      actorId: targetEntityId,
      amount: event.amount,
      isCrit: false,
      kind: "reflect",
      isHeal: false,
      isShieldChange: false,
      isDamageReceived: this.isDamageReceived(sourceEntityId, targetEntityId, playerActorId),
      sourceEntityId,
      targetEntityId,
      element: this.normalizeElement(event.elementType),
      tilePos: { x: event.targetTileX, y: event.targetTileY },
      stackIndex,
      spawnOrder,
      elapsedMs: 0,
      durationMs: 980
    };
  }

  private nextStackIndexForTile(tileX: number, tileY: number, stackIndexByTile: Map<string, number>): number {
    const key = `${tileX}:${tileY}`;
    const current = stackIndexByTile.get(key) ?? 0;
    stackIndexByTile.set(key, current + 1);
    return current;
  }

  private resolvePlayerActorId(currentScene: ArenaScene, previousScene: ArenaScene): string | null {
    const fromCurrent = Object.values(currentScene.actorsById).find((actor) => actor.kind === "player")?.actorId;
    if (fromCurrent) {
      return fromCurrent;
    }

    const fromPrevious = Object.values(previousScene.actorsById).find((actor) => actor.kind === "player")?.actorId;
    return fromPrevious ?? null;
  }

  private isDamageReceived(sourceEntityId: string | null, targetEntityId: string, playerActorId: string | null): boolean {
    if (!playerActorId) {
      return false;
    }

    return targetEntityId === playerActorId && sourceEntityId !== playerActorId;
  }

  private toAttackFxInstance(event: Extract<ArenaBattleEvent, { type: "attack_fx" }>): AttackFxInstance {
    const fromPos = { x: event.fromTileX, y: event.fromTileY };
    const toPos = { x: event.toTileX, y: event.toTileY };
    return {
      eventId: event.eventId,
      fxKind: normalizeCombatFxKind(event.fxKind),
      fromPos,
      toPos,
      directionAngleRad: computeDirectionAngleRad(fromPos, toPos),
      durationMs: Math.max(1, event.durationMs),
      elapsedMs: 0,
      createdAtTick: event.createdAtTick,
      element: this.normalizeElement(event.elementType)
    };
  }

  private toFloatingTextInstance(event: Extract<ArenaBattleEvent, { type: "crit_text" }>): FloatingTextInstance {
    return {
      kind: "crit_text",
      text: event.text,
      tilePos: { x: event.tileX, y: event.tileY },
      startAtMs: event.startAtMs,
      elapsedMs: 0,
      durationMs: Math.max(1, event.durationMs)
    };
  }

  private tickAttackFx(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.attackFxInstances.length === 0) {
      return scene;
    }

    const activeAttackFx: AttackFxInstance[] = [];
    for (const entry of scene.attackFxInstances) {
      const elapsedMs = entry.elapsedMs + deltaMs;
      if (elapsedMs >= entry.durationMs) {
        continue;
      }

      activeAttackFx.push({
        ...entry,
        elapsedMs
      });
    }

    if (activeAttackFx.length === scene.attackFxInstances.length) {
      return {
        ...scene,
        attackFxInstances: activeAttackFx
      };
    }

    return {
      ...scene,
      attackFxInstances: activeAttackFx
    };
  }

  private tickDamageNumbers(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.damageNumbers.length == 0) {
      return scene;
    }

    const activeDamageNumbers = scene.damageNumbers
      .map((entry) => ({
        ...entry,
        elapsedMs: entry.elapsedMs + deltaMs
      }))
      .filter((entry) => entry.elapsedMs < entry.durationMs);

    return {
      ...scene,
      damageNumbers: activeDamageNumbers
    };
  }

  private tickFloatingTexts(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.floatingTexts.length === 0) {
      return scene;
    }

    const activeFloatingTexts = scene.floatingTexts
      .map((entry) => ({
        ...entry,
        elapsedMs: entry.elapsedMs + deltaMs
      }))
      .filter((entry) => entry.elapsedMs < entry.durationMs);

    return {
      ...scene,
      floatingTexts: activeFloatingTexts
    };
  }

  private normalizeElement(value: number | undefined): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
    if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7 || value === 8 || value === 9) {
      return value;
    }

    return PHYSICAL_ELEMENT;
  }
}
