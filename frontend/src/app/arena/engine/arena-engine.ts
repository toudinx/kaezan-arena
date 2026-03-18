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
  ArenaRangedConfig,
  ArenaScene,
  ArenaSkillMap,
  ArenaSkillState,
  DecalInstance,
  DamageNumberInstance,
  FloatingTextInstance,
  FxPlanSpawn,
  FxSpawnRequest,
  QueuedDamageNumberInstance,
  RangedProjectileInstance,
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
const MOB_KNOCKBACK_SLIDE_DURATION_MS = 100;
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
      hoveredMobEntityId: null,
      threatMobEntityId: null,
      actorsById: {},
      actorVisualsById: {},
      skillsById: {},
      tiles,
      sprites,
      decals: [],
      activeBuffs: [],
      activePois: [],
      rangedConfig: undefined,
      fxInstances: [],
      attackFxInstances: [],
      projectileInstances: [],
      mobKnockbackSlidesByActorId: {},
      queuedDamageNumbers: [],
      nextDamageSpawnOrder: 0,
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
    const spawnedProjectiles: RangedProjectileInstance[] = [];
    const queuedDamageNumbers: QueuedDamageNumberInstance[] = [...nextScene.queuedDamageNumbers];
    const mobKnockbackSlidesByActorId = { ...(nextScene.mobKnockbackSlidesByActorId ?? {}) };
    const stackIndexByTile = new Map<string, number>();
    let spawnOrder = nextScene.nextDamageSpawnOrder;
    const playerActorId = this.resolvePlayerActorId(nextScene, scene);
    let threatMobEntityId = scene.threatMobEntityId ?? null;
    const pendingProjectileImpacts: Array<{
      targetActorId?: string | null;
      tileX: number;
      tileY: number;
      delayMs: number;
    }> = [];
    let chainedProjectileStartDelayMs = 0;

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

      if (event.type === "ranged_projectile_fired") {
        const shouldChainProjectile = this.shouldChainProjectileSegments(event);
        if (!shouldChainProjectile) {
          chainedProjectileStartDelayMs = 0;
        }

        const projectileStartDelayMs = shouldChainProjectile
          ? chainedProjectileStartDelayMs
          : 0;
        const projectile = this.toRangedProjectileInstance(event, nextScene, projectileStartDelayMs);
        spawnedProjectiles.push(projectile);
        pendingProjectileImpacts.push({
          targetActorId: event.targetActorId ?? null,
          tileX: event.toTile.x,
          tileY: event.toTile.y,
          delayMs: projectileStartDelayMs + projectile.impactDurationMs
        });
        if (shouldChainProjectile) {
          chainedProjectileStartDelayMs += projectile.impactDurationMs;
        }
        continue;
      }

      if (event.type === "mob_knocked_back") {
        mobKnockbackSlidesByActorId[event.actorId] = {
          actorId: event.actorId,
          fromPos: { x: event.fromTile.x, y: event.fromTile.y },
          toPos: { x: event.toTile.x, y: event.toTile.y },
          elapsedMs: 0,
          durationMs: MOB_KNOCKBACK_SLIDE_DURATION_MS
        };
        continue;
      }

      if (event.type === "damage_number") {
        const threatSourceMobId = this.resolveThreatSourceMobEntityId(event, playerActorId, nextScene);
        if (threatSourceMobId) {
          threatMobEntityId = threatSourceMobId;
        }

        const entries = this.toDamageNumberInstances(event, playerActorId);
        const projectileArrivalDelayMs = this.consumePendingProjectileArrivalDelayMs(event, pendingProjectileImpacts);
        if (projectileArrivalDelayMs > 0) {
          this.queueDamageNumberEntries(entries, projectileArrivalDelayMs, queuedDamageNumbers);
          continue;
        }

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

    if (threatMobEntityId) {
      const threatActor = nextScene.actorsById[threatMobEntityId];
      if (!threatActor || threatActor.kind !== "mob") {
        threatMobEntityId = null;
      }
    }

    nextScene = {
      ...nextScene,
      threatMobEntityId,
      attackFxInstances: [...nextScene.attackFxInstances, ...spawnedAttackFx],
      projectileInstances: [...nextScene.projectileInstances, ...spawnedProjectiles],
      mobKnockbackSlidesByActorId,
      queuedDamageNumbers,
      nextDamageSpawnOrder: spawnOrder,
      damageNumbers: [...nextScene.damageNumbers, ...spawnedDamageNumbers],
      floatingTexts: [...nextScene.floatingTexts, ...spawnedFloatingTexts]
    };

    nextScene = this.applyMobKnockbackSlidesToSprites(nextScene);

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

  applyRangedConfig(scene: ArenaScene, rangedConfig: ArenaRangedConfig): ArenaScene {
    return {
      ...scene,
      rangedConfig
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
    const sceneWithKnockbackSlides = this.tickMobKnockbackSlides(sceneWithVisuals, safeDelta);
    const sceneWithAdjustedSprites = this.applyMobKnockbackSlidesToSprites(sceneWithKnockbackSlides);
    const sceneWithFx = tickFx(sceneWithAdjustedSprites, safeDelta);
    const sceneWithAttackFx = this.tickAttackFx(sceneWithFx, safeDelta);
    const sceneWithProjectiles = this.tickProjectiles(sceneWithAttackFx, safeDelta);
    const sceneWithDamageNumbers = this.tickDamageNumbers(sceneWithProjectiles, safeDelta);
    const sceneWithQueuedDamage = this.tickQueuedDamageNumbers(sceneWithDamageNumbers, safeDelta);
    return this.tickFloatingTexts(sceneWithQueuedDamage, safeDelta);
  }

  tick(scene: ArenaScene, deltaMs: number): ArenaScene {
    return this.update(scene, deltaMs);
  }

  private normalizeFxLayer(layer: string): "groundFx" | "hitFx" {
    return layer === "groundFx" ? "groundFx" : "hitFx";
  }

  private tickMobKnockbackSlides(scene: ArenaScene, deltaMs: number): ArenaScene {
    const activeSlides = scene.mobKnockbackSlidesByActorId ?? {};
    const activeSlideIds = Object.keys(activeSlides);
    if (activeSlideIds.length === 0) {
      return scene;
    }

    const nextSlides: Record<string, NonNullable<ArenaScene["mobKnockbackSlidesByActorId"]>[string]> = {};
    for (const actorId of activeSlideIds) {
      const slide = activeSlides[actorId];
      if (!slide) {
        continue;
      }

      if (!scene.actorsById[actorId]) {
        continue;
      }

      const elapsedMs = slide.elapsedMs + deltaMs;
      if (elapsedMs >= slide.durationMs) {
        continue;
      }

      nextSlides[actorId] = {
        ...slide,
        elapsedMs
      };
    }

    return {
      ...scene,
      mobKnockbackSlidesByActorId: nextSlides
    };
  }

  private applyMobKnockbackSlidesToSprites(scene: ArenaScene): ArenaScene {
    const activeSlides = scene.mobKnockbackSlidesByActorId ?? {};
    if (Object.keys(activeSlides).length === 0 || scene.sprites.length === 0) {
      return scene;
    }

    const adjustedSprites = scene.sprites.map((sprite) => {
      if (sprite.layer !== "actors") {
        return sprite;
      }

      const slide = activeSlides[sprite.actorId];
      if (!slide) {
        return sprite;
      }

      const durationMs = Math.max(1, slide.durationMs);
      const progress = Math.max(0, Math.min(1, slide.elapsedMs / durationMs));
      return {
        ...sprite,
        tilePos: {
          x: slide.fromPos.x + ((slide.toPos.x - slide.fromPos.x) * progress),
          y: slide.fromPos.y + ((slide.toPos.y - slide.fromPos.y) * progress)
        }
      };
    });

    return {
      ...scene,
      sprites: adjustedSprites
    };
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

  private resolveThreatSourceMobEntityId(
    event: Extract<ArenaBattleEvent, { type: "damage_number" }>,
    playerActorId: string | null,
    scene: ArenaScene
  ): string | null {
    if (!playerActorId || event.targetEntityId !== playerActorId) {
      return null;
    }

    const sourceEntityId = event.sourceEntityId ?? event.attackerEntityId ?? null;
    if (!sourceEntityId) {
      return null;
    }

    const sourceActor = scene.actorsById[sourceEntityId];
    if (!sourceActor || sourceActor.kind !== "mob") {
      return null;
    }

    return sourceEntityId;
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

  private toRangedProjectileInstance(
    event: Extract<ArenaBattleEvent, { type: "ranged_projectile_fired" }>,
    scene: ArenaScene,
    startDelayMs = 0
  ): RangedProjectileInstance {
    const fromPos: TilePos = { x: event.fromTile.x, y: event.fromTile.y };
    const impactPos: TilePos = { x: event.toTile.x, y: event.toTile.y };
    const visualEndPos = event.pierces
      ? this.computePierceVisualEndTile(fromPos, impactPos, scene.columns, scene.rows)
      : impactPos;
    const speedTilesPerSecond = this.normalizeProjectileSpeedTilesPerSecond(scene.rangedConfig?.rangedProjectileSpeedTiles);
    const impactDistance = this.computeTileDistance(fromPos, impactPos);
    const totalDistance = this.computeTileDistance(fromPos, visualEndPos);
    const impactDurationMs = Math.max(1, Math.round((impactDistance / speedTilesPerSecond) * 1000));
    const totalDurationMs = Math.max(impactDurationMs, Math.round((totalDistance / speedTilesPerSecond) * 1000));

    return {
      weaponId: event.weaponId,
      fromPos,
      impactPos,
      visualEndPos,
      targetActorId: event.targetActorId ?? null,
      pierces: event.pierces,
      colorHex: this.resolveProjectileColorHex(scene.rangedConfig, event.weaponId),
      startDelayRemainingMs: Math.max(0, Math.round(startDelayMs)),
      elapsedMs: 0,
      impactDurationMs,
      totalDurationMs
    };
  }

  private shouldChainProjectileSegments(
    event: Extract<ArenaBattleEvent, { type: "ranged_projectile_fired" }>
  ): boolean {
    return event.pierces && !event.targetActorId;
  }

  private resolveProjectileColorHex(rangedConfig: ArenaRangedConfig | undefined, weaponId: string): string {
    const mappedColor = rangedConfig?.projectileColorByWeaponId?.[weaponId];
    if (typeof mappedColor === "string" && mappedColor.trim().length > 0) {
      return mappedColor;
    }

    return "#f8fafc";
  }

  private normalizeProjectileSpeedTilesPerSecond(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 1;
    }

    return Math.max(0.001, value);
  }

  private computeTileDistance(from: TilePos, to: TilePos): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
  }

  private computePierceVisualEndTile(from: TilePos, to: TilePos, columns: number, rows: number): TilePos {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    if (deltaX === 0 && deltaY === 0) {
      return to;
    }

    let currentX = to.x;
    let currentY = to.y;
    const stepX = Math.sign(deltaX);
    const stepY = Math.sign(deltaY);

    while (true) {
      const nextX = currentX + stepX;
      const nextY = currentY + stepY;
      if (nextX < 0 || nextY < 0 || nextX >= columns || nextY >= rows) {
        return { x: currentX, y: currentY };
      }

      currentX = nextX;
      currentY = nextY;
    }
  }

  private consumePendingProjectileArrivalDelayMs(
    event: Extract<ArenaBattleEvent, { type: "damage_number" }>,
    pendingProjectileImpacts: Array<{
      targetActorId?: string | null;
      tileX: number;
      tileY: number;
      delayMs: number;
    }>
  ): number {
    if (pendingProjectileImpacts.length === 0) {
      return 0;
    }

    const targetEntityId = event.targetEntityId;
    const projectileByActorIndex = pendingProjectileImpacts.findIndex((projectile) =>
      projectile.targetActorId && projectile.targetActorId === targetEntityId);
    if (projectileByActorIndex >= 0) {
      const [projectile] = pendingProjectileImpacts.splice(projectileByActorIndex, 1);
      return projectile?.delayMs ?? 0;
    }

    const projectileByTileIndex = pendingProjectileImpacts.findIndex((projectile) =>
      projectile.tileX === event.targetTileX && projectile.tileY === event.targetTileY);
    if (projectileByTileIndex >= 0) {
      const [projectile] = pendingProjectileImpacts.splice(projectileByTileIndex, 1);
      return projectile?.delayMs ?? 0;
    }

    return 0;
  }

  private queueDamageNumberEntries(
    entries: ReadonlyArray<DamageNumberInstance>,
    delayMs: number,
    queuedDamageNumbers: QueuedDamageNumberInstance[]
  ): void {
    const delayRemainingMs = Math.max(1, Math.round(delayMs));
    for (const entry of entries) {
      queuedDamageNumbers.push({
        entry: {
          actorId: entry.actorId,
          amount: entry.amount,
          isCrit: entry.isCrit,
          kind: entry.kind,
          isHeal: entry.isHeal,
          isShieldChange: entry.isShieldChange,
          shieldChangeDirection: entry.shieldChangeDirection,
          isDamageReceived: entry.isDamageReceived,
          sourceEntityId: entry.sourceEntityId,
          targetEntityId: entry.targetEntityId,
          element: entry.element,
          tilePos: entry.tilePos,
          durationMs: entry.durationMs
        },
        delayRemainingMs
      });
    }
  }

  private tickProjectiles(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.projectileInstances.length === 0) {
      return scene;
    }

    const activeProjectiles: RangedProjectileInstance[] = [];
    for (const projectile of scene.projectileInstances) {
      let elapsedMs = projectile.elapsedMs;
      const startDelayRemainingMs = projectile.startDelayRemainingMs ?? 0;
      let nextStartDelayRemainingMs = startDelayRemainingMs;
      if (startDelayRemainingMs > 0) {
        nextStartDelayRemainingMs = Math.max(0, startDelayRemainingMs - deltaMs);
        const overflowMs = deltaMs - startDelayRemainingMs;
        if (overflowMs > 0) {
          elapsedMs += overflowMs;
        }
      } else {
        elapsedMs += deltaMs;
      }

      if (elapsedMs >= projectile.totalDurationMs) {
        continue;
      }

      activeProjectiles.push({
        ...projectile,
        startDelayRemainingMs: nextStartDelayRemainingMs,
        elapsedMs
      });
    }

    return {
      ...scene,
      projectileInstances: activeProjectiles
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

  private tickQueuedDamageNumbers(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.queuedDamageNumbers.length === 0) {
      return scene;
    }

    const queue: QueuedDamageNumberInstance[] = [];
    const stackIndexByTile = new Map<string, number>();
    const spawnedDamageNumbers: DamageNumberInstance[] = [];
    let spawnOrder = scene.nextDamageSpawnOrder;

    for (const queuedEntry of scene.queuedDamageNumbers) {
      const delayRemainingMs = queuedEntry.delayRemainingMs - deltaMs;
      if (delayRemainingMs > 0) {
        queue.push({
          ...queuedEntry,
          delayRemainingMs
        });
        continue;
      }

      const entry = queuedEntry.entry;
      spawnedDamageNumbers.push({
        ...entry,
        stackIndex: this.nextStackIndexForTile(entry.tilePos.x, entry.tilePos.y, stackIndexByTile),
        spawnOrder,
        elapsedMs: 0
      });
      spawnOrder += 1;
    }

    return {
      ...scene,
      queuedDamageNumbers: queue,
      nextDamageSpawnOrder: spawnOrder,
      damageNumbers: [...scene.damageNumbers, ...spawnedDamageNumbers]
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
