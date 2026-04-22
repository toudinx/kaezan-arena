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
  ArenaCombatMomentCue,
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
import { COMBAT_FX_MELEE_SWING, computeDirectionAngleRad, normalizeCombatFxKind } from "./attack-fx.helpers";
import { planSquareAreaFx, spawnAreaFx, spawnFx, spawnFxPlan, tickFx } from "./fx-spawner";
import { resolveBossSpriteSemanticId, resolveMobSpriteSemanticId } from "./mob-visuals";
import { resolvePlayerSpriteSemanticId } from "./player-visuals";
const HIT_VISUAL_DURATION_MS = 200;
const RUN_VISUAL_DURATION_MS = 300;
const MOB_KNOCKBACK_SLIDE_DURATION_MS = 100;
const PHYSICAL_ELEMENT = 6;
const SHIELD_BREAK_CUE_DURATION_MS = 560;
const ELITE_CUE_DURATION_MS = 760;
const MOB_DEATH_CUE_DURATION_MS = 420;
const ASSIST_CUE_DURATION_MS = 520;
const DANGER_HIT_CUE_DURATION_MS = 420;
const PLAYER_DEATH_CUE_DURATION_MS = 1200;
const REWARD_OPEN_CUE_DURATION_MS = 560;
const REWARD_CHOICE_CUE_DURATION_MS = 520;
const REWARD_CHOSEN_CUE_DURATION_MS = 460;
const MIN_MOB_TIER_INDEX = 1;
const MAX_MOB_TIER_INDEX = 5;
const COLLAPSE_FIELD_SLIDE_DURATION_MS = 180;
const COLLAPSE_FIELD_BURST_DURATION_MS = 400;
const HEADSHOT_FLASH_DURATION_MS = 200;
const HEADSHOT_FLASH_FULL_WHITE_DURATION_MS = 80;
const HEADSHOT_TEXT_DURATION_MS = 600;
const STORM_COLLAPSE_RING_DURATION_MS = 350;
const STORM_COLLAPSE_RING_STAGGER_MS = 30;
const STORM_COLLAPSE_RING_START_RADIUS_PX = 8;
const STORM_COLLAPSE_RING_END_RADIUS_PX = 32;
const STORM_COLLAPSE_RING_STROKE_WIDTH_PX = 2;
const STORM_COLLAPSE_STACK_TEXT_DURATION_MS = 400;
const STORM_COLLAPSE_ACTIVATION_FLASH_DURATION_MS = 300;
const STORM_COLLAPSE_ACTIVATION_FLASH_BORDER_COLOR_HEX = "#ffffff";
const STORM_COLLAPSE_ACTIVATION_FLASH_BORDER_WIDTH_PX = 2;
const STORM_COLLAPSE_LOCAL_PULSE_COLOR_HEX = "#7F77DD";
const STORM_COLLAPSE_LOCAL_PULSE_BORDER_WIDTH_PX = 2;
const STORM_COLLAPSE_LOCAL_PULSE_DURATION_MS = 200;
const STORM_COLLAPSE_LOCAL_PULSE_STAGGER_MS = 150;
const STORM_COLLAPSE_LOCAL_PULSE_COUNT = 3;
const WIND_BREAK_TEXT_DURATION_MS = 1200;
const MIRAI_TILE_FLASH_DURATION_MS = 120;
const BLOOD_FANG_COLOR_HEX = "#ef4444";
const BLOOD_FANG_SQUARE_RADIUS = 1;
const BLOOD_FANG_ACTIVATION_FLASH_DURATION_MS = 300;
const BLOOD_FANG_ACTIVATION_FLASH_BORDER_WIDTH_PX = 2;
const BLOOD_FANG_STACK_CONSUME_PULSE_DURATION_MS = 150;
const BLOOD_FANG_EXECUTION_FLASH_DURATION_MS = 400;
const BLOOD_FANG_SPREAD_PULSE_DURATION_MS = 150;
const BLOOD_FANG_SPREAD_PULSE_STAGGER_MS = 50;
const BLOOD_FANG_SPREAD_STACK_TEXT_DURATION_MS = 600;
const BLOOD_FANG_SPREAD_STACK_TEXT = "+3";
const MIRAI_PRIMAL_ROAR_SKILL_ID = "skill:mirai_primal_roar";
const MIRAI_REND_CLAW_SKILL_ID = "skill:mirai_rend_claw";
const SYLWEN_WHISPER_SHOT_PROJECTILE_DURATION_MS = 220;
const SYLWEN_GALE_PIERCE_PROJECTILE_DURATION_MS = 350;
const SYLWEN_WHISPER_SHOT_HIT_BURST_DURATION_MS = 250;
const SYLWEN_GALE_PIERCE_HIT_SLASH_DURATION_MS = 350;
const SYLWEN_GALE_PIERCE_END_RING_DURATION_MS = 300;
const SYLWEN_GALE_PIERCE_END_RING_MAX_RADIUS_TILE_MULTIPLIER = 0.6;
const SYLWEN_THORNFALL_DURATION_MS = 5000;
const SYLWEN_THORNFALL_LEVEL_THREE_FLOOR_TINT_RGBA = "rgba(239, 68, 68, 0.15)";
const SYLWEN_THORNFALL_SKILL_ID = "skill:sylwen_thornfall";
const SYLWEN_WHISPER_SHOT_SKILL_ID = "skill:sylwen_whisper_shot";
const SYLWEN_GALE_PIERCE_SKILL_ID = "skill:sylwen_gale_pierce";
const VELVET_VOID_CHAIN_SKILL_ID = "skill:velvet_void_chain";
const VELVET_UMBRAL_PATH_SKILL_ID = "skill:velvet_umbral_path";
const VELVET_DEATH_STRIKE_SKILL_ID = "skill:velvet_death_strike";
const VELVET_STORM_COLLAPSE_SKILL_ID = "skill:velvet_storm_collapse";
const AUTO_ATTACK_RANGED_WEAPON_ID = "auto_attack_ranged";
const AUTO_ATTACK_RANGED_PROJECTILE_DURATION_SYLWEN_MS = 150;
const AUTO_ATTACK_RANGED_PROJECTILE_DURATION_VELVET_MS = 180;
const AUTO_ATTACK_RANGED_HIT_BURST_DURATION_MS = 150;
const AUTO_ATTACK_RANGED_ORB_HIT_RING_DURATION_MS = 200;
const MOB_MELEE_SKULL_IMPACT_DURATION_MS = 400;
const CHARACTER_ID_SYLWEN = "character:sylwen";
const CHARACTER_ID_VELVET = "character:velvet";
const VELVET_VOID_CHAIN_ARC_DURATION_MS = 700;
const VELVET_VOID_CHAIN_BORDER_SHIMMER_DURATION_MS = 200;
const VELVET_VOID_CHAIN_HIT_PULSE_DURATION_MS = 400;
const VELVET_VOID_CHAIN_HIT_PULSE_START_RADIUS_PX = 0;
const VELVET_VOID_CHAIN_HIT_PULSE_END_RADIUS_PX = 36;
const VELVET_VOID_CHAIN_HIT_PULSE_LINE_WIDTH_PX = 3;
const VELVET_UMBRAL_PATH_PROJECTILE_DURATION_MS = 160;
const VELVET_UMBRAL_PATH_IMPACT_DURATION_MS = 350;
const VELVET_UMBRAL_PATH_TRAIL_DURATION_MS = 3000;
const VELVET_UMBRAL_PATH_TRAIL_FADE_OUT_MS = 500;
const VELVET_DEATH_STRIKE_PROJECTILE_DURATION_MS = 180;
const VELVET_DEATH_STRIKE_BURST_DURATION_MS = 350;
const DEFAULT_PHYSICAL_PROJECTILE_COLOR_HEX = "#D3D1C7";
const FX_SPRITE_FRAMES_PER_ROW = 10;
const ELEMENT_FX_ROW_START_BY_ACTIVE_ELEMENT: Readonly<Record<string, number>> = {
  fire: 9 * FX_SPRITE_FRAMES_PER_ROW,
  ice: 2 * FX_SPRITE_FRAMES_PER_ROW,
  earth: 3 * FX_SPRITE_FRAMES_PER_ROW,
  energy: 4 * FX_SPRITE_FRAMES_PER_ROW,
  physical: 6 * FX_SPRITE_FRAMES_PER_ROW
};

export function resolveTierAuraFxId(tierIndex: number): string | null {
  const normalizedTier = Math.floor(Number.isFinite(tierIndex) ? tierIndex : MIN_MOB_TIER_INDEX);
  switch (normalizedTier) {
    case 2:
      return "fx.tier.brave";
    case 3:
      return "fx.tier.awakened";
    case 4:
      return "fx.tier.exalted";
    case 5:
      return "fx.tier.ascendant";
    default:
      return null;
  }
}

type AssistCastCalloutProfile = Readonly<{
  cueDurationMs: number;
  fontScale: number;
}>;

const ASSIST_CAST_CALLOUT_PROFILES: Readonly<Record<string, AssistCastCalloutProfile>> = {
  // Exori family: same callout system, distinct readability hierarchy.
  exori_min: { cueDurationMs: 380, fontScale: 0.8 },
  exori: { cueDurationMs: 500, fontScale: 0.96 },
  exori_mas: { cueDurationMs: 640, fontScale: 1.14 },
  // Existing high-impact assists keep default callout weight.
  avalanche: { cueDurationMs: ASSIST_CUE_DURATION_MS, fontScale: 1 },
  shotgun: { cueDurationMs: ASSIST_CUE_DURATION_MS, fontScale: 1 },
  void_ricochet: { cueDurationMs: ASSIST_CUE_DURATION_MS, fontScale: 1 }
};

export class ArenaEngine {
  createTestScene(columns = 7, rows = 7, tileSize = 48, floorId = 'tile.floor.default', wallId = 'tile.wall.stone'): ArenaScene {
    const playerTile = { x: Math.floor(columns / 2), y: Math.floor(rows / 2) };
    const tiles: TileEntity[] = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const isBorderTile = x === 0 || y === 0 || x === columns - 1 || y === rows - 1;
        tiles.push({
          semanticId: isBorderTile ? wallId : floorId,
          tilePos: { x, y },
          layer: "ground"
        });
      }
    }

    const sprites: SpriteEntity[] = [
      {
        actorId: "preview.player",
        semanticId: resolvePlayerSpriteSemanticId(null, "idle"),
        tilePos: playerTile,
        layer: "actors",
        animationElapsedMs: 0
      }
    ];

    return {
      columns,
      rows,
      tileSize,
      activeCharacterId: null,
      playerTile,
      effectiveTargetEntityId: null,
      lockedTargetEntityId: null,
      groundTargetPos: null,
      hoveredMobEntityId: null,
      threatMobEntityId: null,
      windBreakActive: false,
      windBreakRemainingMs: 0,
      reflectRemainingMs: 0,
      reflectPercent: 0,
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
      actorFlashOverlays: [],
      collapseFieldBursts: [],
      stormCollapseRings: [],
      stormCollapseStackTexts: [],
      stormCollapseArenaRings: [],
      stormCollapseBorderPulses: [],
      screenTintOverlays: [],
      miraiTileFlashes: [],
      sylwenHitOverlays: [],
      skullImpactOverlays: [],
      sylwenDissipateRings: [],
      thornfallCrossZones: [],
      stormCollapseZoneOverlays: [],
      velvetVoidChainArcs: [],
      velvetVoidChainBorderShimmers: [],
      velvetVoidChainHitPulses: [],
      velvetUmbralPathTrails: [],
      velvetUmbralPathImpacts: [],
      velvetDeathStrikeBursts: [],
      queuedDamageNumbers: [],
      nextDamageSpawnOrder: 0,
      damageNumbers: [],
      floatingTexts: [],
      momentCues: []
    };
  }

  applyActorStates(scene: ArenaScene, actorStates: ReadonlyArray<ArenaActorState>): ArenaScene {
    const sortedActors = [...actorStates]
      .map((actor) => ({
        ...actor,
        bleedingMarkStacks: Math.max(0, actor.bleedingMarkStacks ?? scene.actorsById[actor.actorId]?.bleedingMarkStacks ?? 0),
        corrosionStacks: Math.max(0, actor.corrosionStacks ?? scene.actorsById[actor.actorId]?.corrosionStacks ?? 0),
        focusStacks: Math.max(0, actor.focusStacks ?? scene.actorsById[actor.actorId]?.focusStacks ?? 0),
        isStunned: actor.isStunned ?? scene.actorsById[actor.actorId]?.isStunned ?? false,
        stunRemainingMs: Math.max(0, actor.stunRemainingMs ?? scene.actorsById[actor.actorId]?.stunRemainingMs ?? 0),
        isImmobilized: actor.isImmobilized ?? scene.actorsById[actor.actorId]?.isImmobilized ?? false,
        immobilizeRemainingMs: Math.max(
          0,
          actor.immobilizeRemainingMs ?? scene.actorsById[actor.actorId]?.immobilizeRemainingMs ?? 0
        ),
        tierIndex: actor.kind === "mob"
          ? this.normalizeMobTierIndex(this.readSnapshotMobTierIndex(actor))
          : MIN_MOB_TIER_INDEX
      }))
      .sort((left, right) => left.actorId.localeCompare(right.actorId));
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
      activeCharacterId: player?.actorId ?? scene.activeCharacterId ?? null,
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
    const spawnedMomentCues: ArenaCombatMomentCue[] = [];
    const spawnedProjectiles: RangedProjectileInstance[] = [];
    const actorFlashOverlays = [...nextScene.actorFlashOverlays];
    const collapseFieldBursts = [...nextScene.collapseFieldBursts];
    const stormCollapseRings = [...nextScene.stormCollapseRings];
    const stormCollapseStackTexts = [...nextScene.stormCollapseStackTexts];
    const stormCollapseArenaRings = [...nextScene.stormCollapseArenaRings];
    const stormCollapseBorderPulses = [...nextScene.stormCollapseBorderPulses];
    const screenTintOverlays = [...nextScene.screenTintOverlays];
    const miraiTileFlashes = [...nextScene.miraiTileFlashes];
    const sylwenHitOverlays = [...nextScene.sylwenHitOverlays];
    const skullImpactOverlays = [...(nextScene.skullImpactOverlays ?? [])];
    const sylwenDissipateRings = [...nextScene.sylwenDissipateRings];
    const thornfallCrossZones = [...nextScene.thornfallCrossZones];
    const velvetVoidChainArcs = [...nextScene.velvetVoidChainArcs];
    const velvetVoidChainBorderShimmers = [...(nextScene.velvetVoidChainBorderShimmers ?? [])];
    const velvetVoidChainHitPulses = [...nextScene.velvetVoidChainHitPulses];
    const velvetUmbralPathTrails = [...nextScene.velvetUmbralPathTrails];
    const velvetUmbralPathImpacts = [...(nextScene.velvetUmbralPathImpacts ?? [])];
    const velvetDeathStrikeBursts = [...nextScene.velvetDeathStrikeBursts];
    const queuedDamageNumbers: QueuedDamageNumberInstance[] = [...nextScene.queuedDamageNumbers];
    const mobKnockbackSlidesByActorId = { ...(nextScene.mobKnockbackSlidesByActorId ?? {}) };
    const collapseFieldDelayByActorId = this.resolveCollapseFieldSlideDelayByActorId(events);
    const stormCollapseStacksByActorId = this.resolveStormCollapseStacksByActorId(events);
    const stackIndexByTile = new Map<string, number>();
    let spawnOrder = nextScene.nextDamageSpawnOrder;
    const playerActorId = this.resolvePlayerActorId(nextScene, scene);
    const actorsHitThisStep = new Set<string>();
    const shieldBreakTargets = new Set<string>();
    let playerMajorHitQueued = false;
    let threatMobEntityId = scene.threatMobEntityId ?? null;
    const pendingProjectileImpacts: Array<{
      targetActorId?: string | null;
      tileX: number;
      tileY: number;
      delayMs: number;
    }> = [];
    let chainedProjectileStartDelayMs = 0;
    const galeEndRingsByPath = new Set<string>();
    let pendingUmbralPathImpactTile: TilePos | null = null;
    const stormCollapseDamageDelayByActorId = this.resolveStormCollapseDamageDelayByActorId(events);

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
        if (this.isMobMeleeHitOnPlayer(event, nextScene, scene, playerActorId)) {
          skullImpactOverlays.push({
            tilePos: { x: event.toTileX, y: event.toTileY },
            elapsedMs: 0,
            durationMs: MOB_MELEE_SKULL_IMPACT_DURATION_MS
          });
        }
        continue;
      }

      if (event.type === "ranged_projectile_fired") {
        if (this.isSylwenThornfallSkillId(event.weaponId)) {
          continue;
        }

        if (this.isVelvetVoidChainSkillId(event.weaponId)) {
          const colorHex = this.resolveProjectileColorHex(nextScene.rangedConfig, event.weaponId, nextScene);
          velvetVoidChainArcs.push({
            fromPos: { x: event.fromTile.x, y: event.fromTile.y },
            toPos: { x: event.toTile.x, y: event.toTile.y },
            colorHex,
            elapsedMs: 0,
            durationMs: VELVET_VOID_CHAIN_ARC_DURATION_MS
          });
          velvetVoidChainHitPulses.push({
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            colorHex,
            elapsedMs: 0,
            durationMs: VELVET_VOID_CHAIN_HIT_PULSE_DURATION_MS,
            startRadiusPx: VELVET_VOID_CHAIN_HIT_PULSE_START_RADIUS_PX,
            endRadiusPx: VELVET_VOID_CHAIN_HIT_PULSE_END_RADIUS_PX,
            lineWidthPx: VELVET_VOID_CHAIN_HIT_PULSE_LINE_WIDTH_PX
          });
          const shimmer = this.resolveNearestBorderShimmer(
            { x: event.toTile.x, y: event.toTile.y },
            nextScene.columns,
            nextScene.rows
          );
          if (shimmer) {
            velvetVoidChainBorderShimmers.push({
              ...shimmer,
              colorHex,
              elapsedMs: 0,
              durationMs: VELVET_VOID_CHAIN_BORDER_SHIMMER_DURATION_MS
            });
          }
          continue;
        }

        const shouldChainProjectile = this.shouldChainProjectileSegments(event);
        if (!shouldChainProjectile) {
          chainedProjectileStartDelayMs = 0;
        }

        const projectileStartDelayMs = shouldChainProjectile
          ? chainedProjectileStartDelayMs
          : 0;
        const projectile = this.toRangedProjectileInstance(event, nextScene, projectileStartDelayMs);
        spawnedProjectiles.push(projectile);
        if (this.isVelvetUmbralPathSkillId(event.weaponId)) {
          pendingUmbralPathImpactTile = { x: event.toTile.x, y: event.toTile.y };
        }
        const impactDelayMs = projectileStartDelayMs + projectile.impactDurationMs;
        pendingProjectileImpacts.push({
          targetActorId: event.targetActorId ?? null,
          tileX: event.toTile.x,
          tileY: event.toTile.y,
          delayMs: impactDelayMs
        });

        if (this.isSylwenWhisperShotSkillId(event.weaponId)) {
          sylwenHitOverlays.push({
            kind: "whisper_star",
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            colorHex: projectile.colorHex,
            delayRemainingMs: impactDelayMs,
            elapsedMs: 0,
            durationMs: SYLWEN_WHISPER_SHOT_HIT_BURST_DURATION_MS
          });
        }

        if (this.isAutoAttackRangedWeaponId(event.weaponId)) {
          if (this.isVelvetActiveCharacter(nextScene)) {
            sylwenHitOverlays.push({
              kind: "auto_attack_orb_ring",
              tilePos: { x: event.toTile.x, y: event.toTile.y },
              colorHex: projectile.colorHex,
              delayRemainingMs: impactDelayMs,
              elapsedMs: 0,
              durationMs: AUTO_ATTACK_RANGED_ORB_HIT_RING_DURATION_MS
            });
          } else {
            sylwenHitOverlays.push({
              kind: "auto_attack_burst",
              tilePos: { x: event.toTile.x, y: event.toTile.y },
              colorHex: projectile.colorHex,
              delayRemainingMs: impactDelayMs,
              elapsedMs: 0,
              durationMs: AUTO_ATTACK_RANGED_HIT_BURST_DURATION_MS
            });
          }
        }

        if (this.isSylwenGalePierceSkillId(event.weaponId)) {
          sylwenHitOverlays.push({
            kind: "gale_slash",
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            colorHex: projectile.colorHex,
            delayRemainingMs: impactDelayMs,
            elapsedMs: 0,
            durationMs: SYLWEN_GALE_PIERCE_HIT_SLASH_DURATION_MS
          });

          const galeEndKey = `${projectileStartDelayMs}:${projectile.fromPos.x}:${projectile.fromPos.y}:${projectile.visualEndPos.x}:${projectile.visualEndPos.y}`;
          if (!galeEndRingsByPath.has(galeEndKey)) {
            galeEndRingsByPath.add(galeEndKey);
            sylwenDissipateRings.push({
              tilePos: { x: projectile.visualEndPos.x, y: projectile.visualEndPos.y },
              colorHex: projectile.colorHex,
              delayRemainingMs: projectileStartDelayMs + projectile.totalDurationMs,
              elapsedMs: 0,
              durationMs: SYLWEN_GALE_PIERCE_END_RING_DURATION_MS,
              maxRadiusPx: nextScene.tileSize * SYLWEN_GALE_PIERCE_END_RING_MAX_RADIUS_TILE_MULTIPLIER
            });
          }
        }

        if (this.isVelvetDeathStrikeSkillId(event.weaponId)) {
          velvetDeathStrikeBursts.push({
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            colorHex: projectile.colorHex,
            delayRemainingMs: impactDelayMs,
            elapsedMs: 0,
            durationMs: VELVET_DEATH_STRIKE_BURST_DURATION_MS
          });
          nextScene = spawnFx(nextScene, {
            fxId: "fx.skill.death_strike_crystal",
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            durationMs: VELVET_DEATH_STRIKE_BURST_DURATION_MS,
            layer: "hitFx",
            startFrame: this.resolveElementFxStartFrame(nextScene)
          });
          nextScene = spawnFx(nextScene, {
            fxId: "fx.skill.death_strike_impact",
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            durationMs: VELVET_DEATH_STRIKE_BURST_DURATION_MS,
            layer: "hitFx",
            startFrame: this.resolveElementFxStartFrame(nextScene)
          });
        }

        if (this.isVelvetUmbralPathSkillId(event.weaponId)) {
          velvetUmbralPathImpacts.push({
            tilePos: { x: event.toTile.x, y: event.toTile.y },
            colorHex: projectile.colorHex,
            delayRemainingMs: impactDelayMs,
            elapsedMs: 0,
            durationMs: VELVET_UMBRAL_PATH_IMPACT_DURATION_MS
          });
        }

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

      if (event.type === "bleeding_mark_updated") {
        const actor = nextScene.actorsById[event.mobId];
        if (actor && actor.kind === "mob") {
          actor.bleedingMarkStacks = Math.max(0, event.stacks);
        }
        continue;
      }

      if (event.type === "corrosion_updated") {
        const actor = nextScene.actorsById[event.mobId];
        if (actor && actor.kind === "mob") {
          actor.corrosionStacks = Math.max(0, event.stacks);
        }
        continue;
      }

      if (event.type === "focus_updated") {
        const actor = nextScene.actorsById[event.mobId];
        if (actor && actor.kind === "mob") {
          actor.focusStacks = Math.max(0, event.focusStacks);
        }
        continue;
      }

      if (event.type === "focus_reset") {
        const actor = nextScene.actorsById[event.mobId];
        if (actor && actor.kind === "mob") {
          actor.focusStacks = 0;
        }
        continue;
      }

      if (event.type === "stun_applied") {
        const actor = nextScene.actorsById[event.mobId];
        if (actor && actor.kind === "mob") {
          actor.isStunned = true;
          actor.stunRemainingMs = Math.max(0, event.durationMs);
        }
        continue;
      }

      if (event.type === "immobilize_applied") {
        const actor = nextScene.actorsById[event.mobId];
        if (actor && actor.kind === "mob") {
          actor.isImmobilized = true;
          actor.immobilizeRemainingMs = Math.max(0, event.durationMs);
        }
        continue;
      }

      if (event.type === "collapse_field_activated") {
        collapseFieldBursts.push({
          centerTile: event.playerPosition,
          elapsedMs: 0,
          durationMs: COLLAPSE_FIELD_BURST_DURATION_MS
        });

        for (const pullResult of event.pulledMobs) {
          const actor = nextScene.actorsById[pullResult.mobId];
          if (!actor || actor.kind !== "mob") {
            continue;
          }

          mobKnockbackSlidesByActorId[pullResult.mobId] = {
            actorId: pullResult.mobId,
            fromPos: { x: pullResult.fromPosition.x, y: pullResult.fromPosition.y },
            toPos: { x: pullResult.toPosition.x, y: pullResult.toPosition.y },
            elapsedMs: 0,
            durationMs: COLLAPSE_FIELD_SLIDE_DURATION_MS
          };
        }
        nextScene.reflectRemainingMs = Math.max(0, event.reflectDurationMs);
        continue;
      }

      if (event.type === "blood_fang_detonated") {
        const activationTiles = this.resolveBloodFangActivationTiles(
          event,
          nextScene.playerTile,
          nextScene.columns,
          nextScene.rows
        );
        for (const tilePos of activationTiles) {
          miraiTileFlashes.push({
            tilePos,
            colorHex: BLOOD_FANG_COLOR_HEX,
            maxFillAlpha: 0,
            borderColorHex: BLOOD_FANG_COLOR_HEX,
            borderWidthPx: BLOOD_FANG_ACTIVATION_FLASH_BORDER_WIDTH_PX,
            maxBorderAlpha: 0.95,
            delayRemainingMs: 0,
            elapsedMs: 0,
            durationMs: BLOOD_FANG_ACTIVATION_FLASH_DURATION_MS
          });
        }

        if ((event.ultimateLevel ?? 1) >= 2) {
          for (const hit of event.hits) {
            if (hit.stacksConsumed <= 0) {
              continue;
            }

            const actor = nextScene.actorsById[hit.mobId];
            const previousActor = scene.actorsById[hit.mobId];
            const pulseTilePos: TilePos = actor && actor.kind === "mob"
              ? { x: actor.tileX, y: actor.tileY }
              : previousActor && previousActor.kind === "mob"
                ? { x: previousActor.tileX, y: previousActor.tileY }
                : { x: hit.position.x, y: hit.position.y };
            if (actor && actor.kind === "mob") {
              actor.bleedingMarkStacks = 0;
            }

            miraiTileFlashes.push({
              tilePos: pulseTilePos,
              colorHex: BLOOD_FANG_COLOR_HEX,
              maxFillAlpha: 0.45,
              delayRemainingMs: 0,
              elapsedMs: 0,
              durationMs: BLOOD_FANG_STACK_CONSUME_PULSE_DURATION_MS
            });
          }
        }

        if ((event.ultimateLevel ?? 1) >= 3) {
          for (const execution of event.executions) {
            const executedActor = nextScene.actorsById[execution.executedMobId] ?? scene.actorsById[execution.executedMobId];
            const executedTilePos: TilePos = executedActor && executedActor.kind === "mob"
              ? { x: executedActor.tileX, y: executedActor.tileY }
              : { x: execution.executedMobPosition.x, y: execution.executedMobPosition.y };
            miraiTileFlashes.push({
              tilePos: executedTilePos,
              colorHex: BLOOD_FANG_COLOR_HEX,
              maxFillAlpha: 0.6,
              delayRemainingMs: 0,
              elapsedMs: 0,
              durationMs: BLOOD_FANG_EXECUTION_FLASH_DURATION_MS
            });

            for (let index = 0; index < execution.spreadTargets.length; index += 1) {
              const spreadTarget = execution.spreadTargets[index];
              const spreadActor = nextScene.actorsById[spreadTarget.mobId];
              const spreadPreviousActor = scene.actorsById[spreadTarget.mobId];
              const spreadTilePos: TilePos = spreadActor && spreadActor.kind === "mob"
                ? { x: spreadActor.tileX, y: spreadActor.tileY }
                : spreadPreviousActor && spreadPreviousActor.kind === "mob"
                  ? { x: spreadPreviousActor.tileX, y: spreadPreviousActor.tileY }
                  : { x: spreadTarget.position.x, y: spreadTarget.position.y };
              if (spreadActor && spreadActor.kind === "mob") {
                spreadActor.bleedingMarkStacks = Math.max(0, spreadActor.bleedingMarkStacks ?? 0) + 3;
              }

              miraiTileFlashes.push({
                tilePos: spreadTilePos,
                colorHex: BLOOD_FANG_COLOR_HEX,
                maxFillAlpha: 0.42,
                delayRemainingMs: index * BLOOD_FANG_SPREAD_PULSE_STAGGER_MS,
                elapsedMs: 0,
                durationMs: BLOOD_FANG_SPREAD_PULSE_DURATION_MS
              });
              spawnedFloatingTexts.push(
                this.createCombatCalloutText(
                  BLOOD_FANG_SPREAD_STACK_TEXT,
                  spreadTilePos.x,
                  spreadTilePos.y,
                  "danger",
                  BLOOD_FANG_SPREAD_STACK_TEXT_DURATION_MS,
                  0.8
                )
              );
            }
          }
        }

        continue;
      }

      if (event.type === "storm_collapse_detonated") {
        const detonationColorHex = this.resolveProjectileColorHex(nextScene.rangedConfig, VELVET_STORM_COLLAPSE_SKILL_ID, nextScene);
        const activationTiles = this.resolveStormCollapseActivationTiles(
          event,
          nextScene.playerTile,
          nextScene.columns,
          nextScene.rows
        );
        for (const tilePos of activationTiles) {
          miraiTileFlashes.push({
            tilePos,
            colorHex: STORM_COLLAPSE_ACTIVATION_FLASH_BORDER_COLOR_HEX,
            maxFillAlpha: 0,
            borderColorHex: STORM_COLLAPSE_ACTIVATION_FLASH_BORDER_COLOR_HEX,
            borderWidthPx: STORM_COLLAPSE_ACTIVATION_FLASH_BORDER_WIDTH_PX,
            maxBorderAlpha: 0.95,
            elapsedMs: 0,
            durationMs: STORM_COLLAPSE_ACTIVATION_FLASH_DURATION_MS
          });
        }

        const shouldRenderLocalPulse = (event.ultimateLevel ?? 1) >= 2;
        for (let index = 0; index < event.hits.length; index += 1) {
          const hit = event.hits[index];
          const delayRemainingMs = index * STORM_COLLAPSE_RING_STAGGER_MS;
          const actor = nextScene.actorsById[hit.mobId];
          const previousActor = scene.actorsById[hit.mobId];
          const ringTilePos: TilePos = actor && actor.kind === "mob"
            ? { x: actor.tileX, y: actor.tileY }
            : previousActor && previousActor.kind === "mob"
              ? { x: previousActor.tileX, y: previousActor.tileY }
              : { x: hit.mobPosition.x, y: hit.mobPosition.y };

          if (actor && actor.kind === "mob") {
            actor.corrosionStacks = 0;
          }

          stormCollapseRings.push({
            actorId: hit.mobId,
            tilePos: ringTilePos,
            stacksConsumed: hit.stacksConsumed,
            colorHex: detonationColorHex,
            delayRemainingMs,
            elapsedMs: 0,
            durationMs: STORM_COLLAPSE_RING_DURATION_MS,
            startRadiusPx: STORM_COLLAPSE_RING_START_RADIUS_PX,
            endRadiusPx: STORM_COLLAPSE_RING_END_RADIUS_PX,
            strokeWidthPx: STORM_COLLAPSE_RING_STROKE_WIDTH_PX
          });

          if (hit.stacksConsumed > 0) {
            stormCollapseStackTexts.push({
              actorId: hit.mobId,
              tilePos: ringTilePos,
              stacksConsumed: hit.stacksConsumed,
              delayRemainingMs,
              elapsedMs: 0,
              durationMs: STORM_COLLAPSE_STACK_TEXT_DURATION_MS
            });
          }

          if (shouldRenderLocalPulse && hit.stacksConsumed > 0 && activationTiles.length > 0) {
            for (let pulseIndex = 0; pulseIndex < STORM_COLLAPSE_LOCAL_PULSE_COUNT; pulseIndex += 1) {
              stormCollapseBorderPulses.push({
                tiles: activationTiles,
                colorHex: STORM_COLLAPSE_LOCAL_PULSE_COLOR_HEX,
                borderWidthPx: STORM_COLLAPSE_LOCAL_PULSE_BORDER_WIDTH_PX,
                delayRemainingMs: delayRemainingMs + (pulseIndex * STORM_COLLAPSE_LOCAL_PULSE_STAGGER_MS),
                elapsedMs: 0,
                durationMs: STORM_COLLAPSE_LOCAL_PULSE_DURATION_MS
              });
            }
          }
        }
        continue;
      }

      if (event.type === "wind_break_activated") {
        nextScene.windBreakActive = event.durationMs > 0;
        nextScene.windBreakRemainingMs = Math.max(0, event.durationMs);

        const playerActor = playerActorId
          ? (nextScene.actorsById[playerActorId] ?? scene.actorsById[playerActorId])
          : null;
        if (playerActor) {
          spawnedFloatingTexts.push(
            this.createCombatCalloutText(
              "WIND BREAK",
              playerActor.tileX,
              playerActor.tileY,
              "wind_break",
              WIND_BREAK_TEXT_DURATION_MS,
              1
            )
          );
        }
        continue;
      }

      if (event.type === "thornfall_placed") {
        const sourceTiles = (event.crossTiles ?? event.fanTiles ?? []);
        const ultimateLevel = Math.max(1, Math.floor(event.ultimateLevel ?? 1));
        const crossTiles = sourceTiles
          .map((tile) => ({
            x: Math.round(tile.x),
            y: Math.round(tile.y)
          }))
          .filter((tile, index, array) => array.findIndex((entry) => entry.x === tile.x && entry.y === tile.y) === index);
        if (crossTiles.length === 0) {
          continue;
        }

        thornfallCrossZones.push({
          centerTile: crossTiles[0],
          crossTiles,
          colorHex: "#ffffff",
          floorTintRgba: ultimateLevel >= 3 ? SYLWEN_THORNFALL_LEVEL_THREE_FLOOR_TINT_RGBA : null,
          elapsedMs: 0,
          durationMs: SYLWEN_THORNFALL_DURATION_MS
        });
        for (const tile of crossTiles) {
          nextScene = spawnFx(nextScene, {
            fxId: "fx.skill.thornfall_arrow",
            tilePos: { x: tile.x, y: tile.y },
            durationMs: SYLWEN_THORNFALL_DURATION_MS,
            layer: "groundFx",
            startFrame: this.resolveElementFxStartFrame(nextScene)
          });
        }
        continue;
      }

      if (event.type === "headshot") {
        const actor = nextScene.actorsById[event.mobId] ?? scene.actorsById[event.mobId];
        if (!actor || actor.kind !== "mob") {
          continue;
        }

        actorFlashOverlays.push({
          actorId: event.mobId,
          delayRemainingMs: 0,
          elapsedMs: 0,
          durationMs: HEADSHOT_FLASH_DURATION_MS,
          fullWhiteDurationMs: HEADSHOT_FLASH_FULL_WHITE_DURATION_MS
        });
        spawnedFloatingTexts.push(
          this.createCombatCalloutText(
            "HEADSHOT",
            actor.tileX,
            actor.tileY,
            "headshot",
            HEADSHOT_TEXT_DURATION_MS,
            1
          )
        );
        continue;
      }

      if (event.type === "damage_number") {
        if (event.damageAmount > 0) {
          actorsHitThisStep.add(event.targetEntityId);
        }

        const threatSourceMobId = this.resolveThreatSourceMobEntityId(event, playerActorId, nextScene);
        if (threatSourceMobId) {
          threatMobEntityId = threatSourceMobId;
        }

        const isShieldBreak = this.isShieldBreakEvent(event);
        if (isShieldBreak && !shieldBreakTargets.has(event.targetEntityId)) {
          shieldBreakTargets.add(event.targetEntityId);
          spawnedMomentCues.push(this.createMomentCue("shield_break", event.targetTileX, event.targetTileY, SHIELD_BREAK_CUE_DURATION_MS));
          spawnedFloatingTexts.push(
            this.createCombatCalloutText("SHATTER", event.targetTileX, event.targetTileY, "shield_break", SHIELD_BREAK_CUE_DURATION_MS)
          );
        }

        if (!playerMajorHitQueued && this.isMajorIncomingHit(event, playerActorId, nextScene)) {
          playerMajorHitQueued = true;
          spawnedMomentCues.push(this.createMomentCue("danger_hit", event.targetTileX, event.targetTileY, DANGER_HIT_CUE_DURATION_MS));
        }

        const entries = this.toDamageNumberInstances(event, playerActorId);
        const stormStacks = stormCollapseStacksByActorId.get(event.targetEntityId) ?? 0;
        if (stormStacks > 0) {
          const stormScale = this.computeStormCollapseDamageScale(stormStacks);
          for (const entry of entries) {
            entry.styleVariant = "storm_collapse";
            entry.styleScale = stormScale;
          }
        }

        const projectileArrivalDelayMs = this.consumePendingProjectileArrivalDelayMs(event, pendingProjectileImpacts);
        const collapseDelayMs = collapseFieldDelayByActorId.get(event.targetEntityId) ?? 0;
        const stormCollapseDelayMs = stormCollapseDamageDelayByActorId.get(event.targetEntityId) ?? 0;
        const totalDelayMs = Math.max(projectileArrivalDelayMs, collapseDelayMs, stormCollapseDelayMs);
        if (totalDelayMs > 0) {
          this.queueDamageNumberEntries(entries, totalDelayMs, queuedDamageNumbers);
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
        if (event.entityType === "player") {
          spawnedMomentCues.push(this.createMomentCue("player_death", event.tileX, event.tileY, PLAYER_DEATH_CUE_DURATION_MS));
          spawnedFloatingTexts.push(
            this.createCombatCalloutText("DEFEAT", event.tileX, event.tileY, "danger", PLAYER_DEATH_CUE_DURATION_MS, 1.06)
          );
          continue;
        }

        const isFocusedDeath = event.entityId === nextScene.effectiveTargetEntityId ||
          event.entityId === nextScene.lockedTargetEntityId ||
          event.entityId === threatMobEntityId;
        if (isFocusedDeath) {
          spawnedMomentCues.push(this.createMomentCue("mob_death", event.tileX, event.tileY, MOB_DEATH_CUE_DURATION_MS));
        }
        continue;
      }

      if (event.type === "assist_cast") {
        if (!playerActorId) {
          continue;
        }

        const playerActor = nextScene.actorsById[playerActorId] ?? scene.actorsById[playerActorId];
        if (!playerActor) {
          continue;
        }

        if (this.isMiraiPrimalRoarSkillId(event.skillId) || this.isMiraiRendClawSkillId(event.skillId)) {
          const hitTiles = this.normalizeAssistCastHitTiles(event.hitTiles, nextScene.columns, nextScene.rows);
          if (hitTiles.length > 0) {
            const colorHex = this.resolveProjectileColorHex(nextScene.rangedConfig, event.skillId, nextScene);
            for (const tilePos of hitTiles) {
              miraiTileFlashes.push({
                tilePos,
                colorHex,
                elapsedMs: 0,
                durationMs: MIRAI_TILE_FLASH_DURATION_MS
              });
            }
          }
        }

        if (this.isVelvetUmbralPathSkillId(event.skillId)) {
          const targetTile = pendingUmbralPathImpactTile ??
            this.resolveVelvetUmbralPathTargetTile(nextScene, { x: playerActor.tileX, y: playerActor.tileY });
          pendingUmbralPathImpactTile = null;
          if (targetTile) {
            const trailTiles = this.buildUmbralPathTrailTiles(
              { x: playerActor.tileX, y: playerActor.tileY },
              targetTile,
              nextScene.columns,
              nextScene.rows);
            if (trailTiles.length > 0) {
              const centerLineTiles = this.buildLineTiles(
                { x: playerActor.tileX, y: playerActor.tileY },
                targetTile,
                nextScene.columns,
                nextScene.rows
              );
              velvetUmbralPathTrails.push({
                tiles: trailTiles,
                centerLineTiles,
                colorHex: this.resolveProjectileColorHex(nextScene.rangedConfig, event.skillId, nextScene),
                elapsedMs: 0,
                durationMs: VELVET_UMBRAL_PATH_TRAIL_DURATION_MS,
                fadeOutMs: VELVET_UMBRAL_PATH_TRAIL_FADE_OUT_MS
              });
              for (const tile of trailTiles) {
                nextScene = spawnFx(nextScene, {
                  fxId: "fx.skill.umbral_flame",
                  tilePos: { x: tile.x, y: tile.y },
                  durationMs: VELVET_UMBRAL_PATH_TRAIL_DURATION_MS,
                  layer: "groundFx",
                  startFrame: this.resolveElementFxStartFrame(nextScene)
                });
              }
            }
          }
        }

        // Skill-name floating text: replaces any previous cast text still visible.
        const skillLabel = (event.displayName?.trim() || this.resolveAssistCastLabel(event.skillId, nextScene));
        nextScene = { ...nextScene, floatingTexts: nextScene.floatingTexts.filter(t => t.kind !== "skill_name") };
        spawnedFloatingTexts.push(this.createSkillNameText(skillLabel, playerActor.tileX, playerActor.tileY));

        const calloutProfile = this.resolveAssistCastCalloutProfile(event.skillId);
        const cueDurationMs = calloutProfile?.cueDurationMs ?? ASSIST_CUE_DURATION_MS;
        spawnedMomentCues.push(
          this.createMomentCue("assist_cast", playerActor.tileX, playerActor.tileY, cueDurationMs)
        );

        continue;
      }

      if (event.type === "poi_interacted") {
        if (event.poiType === "chest" || event.poiType === "species_chest") {
          spawnedMomentCues.push(this.createMomentCue("reward_open", event.tileX, event.tileY, REWARD_OPEN_CUE_DURATION_MS));
          spawnedFloatingTexts.push(
            this.createCombatCalloutText("REWARD", event.tileX, event.tileY, "reward", REWARD_OPEN_CUE_DURATION_MS, 0.9)
          );
        }
        continue;
      }

      if (event.type === "card_choice_offered") {
        if (!playerActorId) {
          continue;
        }

        const playerActor = nextScene.actorsById[playerActorId] ?? scene.actorsById[playerActorId];
        if (!playerActor) {
          continue;
        }

        spawnedMomentCues.push(
          this.createMomentCue("reward_open", playerActor.tileX, playerActor.tileY, REWARD_CHOICE_CUE_DURATION_MS)
        );
        spawnedFloatingTexts.push(
          this.createCombatCalloutText("CHOOSE REWARD", playerActor.tileX, playerActor.tileY, "reward", REWARD_CHOICE_CUE_DURATION_MS, 0.92)
        );
        continue;
      }

      if (event.type === "card_chosen") {
        if (!playerActorId) {
          continue;
        }

        const playerActor = nextScene.actorsById[playerActorId] ?? scene.actorsById[playerActorId];
        if (!playerActor) {
          continue;
        }

        const text = this.resolveCardChosenLabel(event.cardName);
        spawnedMomentCues.push(
          this.createMomentCue("reward_open", playerActor.tileX, playerActor.tileY, REWARD_CHOSEN_CUE_DURATION_MS)
        );
        spawnedFloatingTexts.push(
          this.createCombatCalloutText(text, playerActor.tileX, playerActor.tileY, "reward", REWARD_CHOSEN_CUE_DURATION_MS, 0.9)
        );
        continue;
      }

      if (event.type === "elite_spawned") {
        const eliteActor = nextScene.actorsById[event.eliteEntityId] ?? scene.actorsById[event.eliteEntityId];
        if (!eliteActor) {
          continue;
        }

        spawnedMomentCues.push(this.createMomentCue("elite_spawn", eliteActor.tileX, eliteActor.tileY, ELITE_CUE_DURATION_MS));
        spawnedFloatingTexts.push(
          this.createCombatCalloutText("ELITE!", eliteActor.tileX, eliteActor.tileY, "elite", ELITE_CUE_DURATION_MS, 1.04)
        );
        continue;
      }

      if (event.type === "elite_died") {
        const eliteActor = scene.actorsById[event.eliteEntityId] ?? nextScene.actorsById[event.eliteEntityId];
        if (!eliteActor) {
          continue;
        }

        spawnedMomentCues.push(this.createMomentCue("elite_died", eliteActor.tileX, eliteActor.tileY, ELITE_CUE_DURATION_MS));
        spawnedFloatingTexts.push(
          this.createCombatCalloutText("ELITE DOWN", eliteActor.tileX, eliteActor.tileY, "elite", ELITE_CUE_DURATION_MS, 0.94)
        );
        continue;
      }

      if (event.type === "mimic_activated") {
        spawnedFloatingTexts.push(
          this.createCombatCalloutText("IT'S A MIMIC!", event.tileX, event.tileY, "danger", ELITE_CUE_DURATION_MS, 1.1)
        );
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

    nextScene = this.applyDamageHitReactions(nextScene, actorsHitThisStep);

    if (threatMobEntityId) {
      const threatActor = nextScene.actorsById[threatMobEntityId];
      if (!threatActor || threatActor.kind !== "mob") {
        threatMobEntityId = null;
      }
    }

    nextScene = {
      ...nextScene,
      threatMobEntityId,
      windBreakActive: nextScene.windBreakActive,
      windBreakRemainingMs: nextScene.windBreakRemainingMs,
      attackFxInstances: [...nextScene.attackFxInstances, ...spawnedAttackFx],
      projectileInstances: [...nextScene.projectileInstances, ...spawnedProjectiles],
      mobKnockbackSlidesByActorId,
      actorFlashOverlays,
      collapseFieldBursts,
      stormCollapseRings,
      stormCollapseStackTexts,
      stormCollapseArenaRings,
      stormCollapseBorderPulses,
      screenTintOverlays,
      miraiTileFlashes,
      sylwenHitOverlays,
      skullImpactOverlays,
      sylwenDissipateRings,
      thornfallCrossZones,
      velvetVoidChainArcs,
      velvetVoidChainBorderShimmers,
      velvetVoidChainHitPulses,
      velvetUmbralPathTrails,
      velvetUmbralPathImpacts,
      velvetDeathStrikeBursts,
      queuedDamageNumbers,
      nextDamageSpawnOrder: spawnOrder,
      damageNumbers: [...nextScene.damageNumbers, ...spawnedDamageNumbers],
      floatingTexts: [...nextScene.floatingTexts, ...spawnedFloatingTexts],
      momentCues: [...(nextScene.momentCues ?? []), ...spawnedMomentCues]
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
    const sceneWithTimers = this.tickStatusDurations(scene, safeDelta);
    const sceneWithVisuals = this.tickActorVisuals(sceneWithTimers, safeDelta);
    const sceneWithKnockbackSlides = this.tickMobKnockbackSlides(sceneWithVisuals, safeDelta);
    const sceneWithAdjustedSprites = this.applyMobKnockbackSlidesToSprites(sceneWithKnockbackSlides);
    const sceneWithFx = tickFx(sceneWithAdjustedSprites, safeDelta);
    const sceneWithMiraiTileFlashes = this.tickMiraiTileFlashes(sceneWithFx, safeDelta);
    const sceneWithThornfallZones = this.tickThornfallCrossZones(sceneWithMiraiTileFlashes, safeDelta);
    const sceneWithVelvetUmbralTrails = this.tickVelvetUmbralPathTrails(sceneWithThornfallZones, safeDelta);
    const sceneWithVelvetVoidChainArcs = this.tickVelvetVoidChainArcs(sceneWithVelvetUmbralTrails, safeDelta);
    const sceneWithVelvetVoidChainShimmers = this.tickVelvetVoidChainBorderShimmers(sceneWithVelvetVoidChainArcs, safeDelta);
    const sceneWithVelvetVoidChainHitPulses = this.tickVelvetVoidChainHitPulses(sceneWithVelvetVoidChainShimmers, safeDelta);
    const sceneWithVelvetUmbralImpacts = this.tickVelvetUmbralPathImpacts(sceneWithVelvetVoidChainHitPulses, safeDelta);
    const sceneWithVelvetDeathStrikeBursts = this.tickVelvetDeathStrikeBursts(sceneWithVelvetUmbralImpacts, safeDelta);
    const sceneWithSkullImpacts = this.tickSkullImpactOverlays(sceneWithVelvetDeathStrikeBursts, safeDelta);
    const sceneWithSylwenHitOverlays = this.tickSylwenHitOverlays(sceneWithSkullImpacts, safeDelta);
    const sceneWithSylwenDissipateRings = this.tickSylwenDissipateRings(sceneWithSylwenHitOverlays, safeDelta);
    const sceneWithAttackFx = this.tickAttackFx(sceneWithSylwenDissipateRings, safeDelta);
    const sceneWithProjectiles = this.tickProjectiles(sceneWithAttackFx, safeDelta);
    const sceneWithDamageNumbers = this.tickDamageNumbers(sceneWithProjectiles, safeDelta);
    const sceneWithQueuedDamage = this.tickQueuedDamageNumbers(sceneWithDamageNumbers, safeDelta);
    const sceneWithFloatingTexts = this.tickFloatingTexts(sceneWithQueuedDamage, safeDelta);
    const sceneWithMomentCues = this.tickMomentCues(sceneWithFloatingTexts, safeDelta);
    const sceneWithActorFlashes = this.tickActorFlashOverlays(sceneWithMomentCues, safeDelta);
    const sceneWithCollapseBursts = this.tickCollapseFieldBursts(sceneWithActorFlashes, safeDelta);
    const sceneWithStormRings = this.tickStormCollapseRings(sceneWithCollapseBursts, safeDelta);
    const sceneWithStormStackTexts = this.tickStormCollapseStackTexts(sceneWithStormRings, safeDelta);
    const sceneWithStormArenaRings = this.tickStormCollapseArenaRings(sceneWithStormStackTexts, safeDelta);
    const sceneWithStormBorderPulses = this.tickStormCollapseBorderPulses(sceneWithStormArenaRings, safeDelta);
    return this.tickScreenTintOverlays(sceneWithStormBorderPulses, safeDelta);
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

  private tickStatusDurations(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (deltaMs <= 0) {
      return scene;
    }

    let actorsChanged = false;
    const nextActorsById: ArenaActorMap = {};
    const actors = Object.values(scene.actorsById);
    for (const actor of actors) {
      if (actor.kind !== "mob") {
        nextActorsById[actor.actorId] = actor;
        continue;
      }

      const nextStunRemainingMs = Math.max(0, (actor.stunRemainingMs ?? 0) - deltaMs);
      const nextImmobilizeRemainingMs = Math.max(0, (actor.immobilizeRemainingMs ?? 0) - deltaMs);
      const nextIsStunned = nextStunRemainingMs > 0 ? true : false;
      const nextIsImmobilized = nextImmobilizeRemainingMs > 0 ? true : false;
      const changed = (actor.stunRemainingMs ?? 0) !== nextStunRemainingMs ||
        (actor.immobilizeRemainingMs ?? 0) !== nextImmobilizeRemainingMs ||
        (actor.isStunned ?? false) !== nextIsStunned ||
        (actor.isImmobilized ?? false) !== nextIsImmobilized;
      if (!changed) {
        nextActorsById[actor.actorId] = actor;
        continue;
      }

      actorsChanged = true;
      nextActorsById[actor.actorId] = {
        ...actor,
        isStunned: nextIsStunned,
        stunRemainingMs: nextStunRemainingMs,
        isImmobilized: nextIsImmobilized,
        immobilizeRemainingMs: nextImmobilizeRemainingMs
      };
    }

    const nextWindBreakRemainingMs = Math.max(0, scene.windBreakRemainingMs - deltaMs);
    const nextReflectRemainingMs = Math.max(0, scene.reflectRemainingMs - deltaMs);
    const windBreakChanged = nextWindBreakRemainingMs !== scene.windBreakRemainingMs ||
      scene.windBreakActive !== (nextWindBreakRemainingMs > 0);
    const reflectChanged = nextReflectRemainingMs !== scene.reflectRemainingMs;
    if (!actorsChanged && !windBreakChanged && !reflectChanged) {
      return scene;
    }

    return {
      ...scene,
      actorsById: actorsChanged ? nextActorsById : scene.actorsById,
      windBreakActive: nextWindBreakRemainingMs > 0,
      windBreakRemainingMs: nextWindBreakRemainingMs,
      reflectRemainingMs: nextReflectRemainingMs,
      reflectPercent: nextReflectRemainingMs > 0 ? scene.reflectPercent : 0
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

  private applyDamageHitReactions(scene: ArenaScene, actorIds: ReadonlySet<string>): ArenaScene {
    if (actorIds.size === 0) {
      return scene;
    }

    const nextVisualsById: ActorVisualStateMap = { ...scene.actorVisualsById };
    let changed = false;
    for (const actorId of actorIds) {
      const actor = scene.actorsById[actorId];
      if (!actor) {
        continue;
      }

      const previousVisual = nextVisualsById[actorId];
      const runRemainingMs = previousVisual?.runRemainingMs ?? 0;
      const hitRemainingMs = Math.max(HIT_VISUAL_DURATION_MS, previousVisual?.hitRemainingMs ?? 0);
      const mode = this.resolveVisualMode(hitRemainingMs, runRemainingMs);
      const currentAnimId = this.resolveSpriteSemanticId(actor, mode);
      const elapsedMs = previousVisual && previousVisual.currentAnimId === currentAnimId
        ? previousVisual.elapsedMs
        : 0;

      nextVisualsById[actorId] = {
        actorId,
        currentAnimId,
        mode,
        elapsedMs,
        hitRemainingMs,
        runRemainingMs
      };
      changed = true;
    }

    if (!changed) {
      return scene;
    }

    return {
      ...scene,
      actorVisualsById: nextVisualsById,
      sprites: this.rebuildActorSpritesFromVisuals(scene.actorsById, nextVisualsById)
    };
  }

  private rebuildActorSpritesFromVisuals(actorsById: ArenaActorMap, visualsById: ActorVisualStateMap): SpriteEntity[] {
    const actors = Object.values(actorsById).sort((left, right) => left.actorId.localeCompare(right.actorId));
    const sprites: SpriteEntity[] = [];
    for (const actor of actors) {
      const visual = visualsById[actor.actorId];
      if (!visual) {
        continue;
      }

      sprites.push({
        actorId: actor.actorId,
        semanticId: visual.currentAnimId,
        tilePos: { x: actor.tileX, y: actor.tileY },
        layer: "actors",
        animationElapsedMs: visual.elapsedMs
      });
    }

    return sprites;
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
      return resolvePlayerSpriteSemanticId(actor.actorId, mode);
    }

    if (actor.kind === "mob") {
      return resolveMobSpriteSemanticId(actor.mobType, mode);
    }

    if (actor.kind === "boss") {
      return resolveBossSpriteSemanticId(actor.actorId, mode);
    }

    return resolvePlayerSpriteSemanticId(null, "idle");
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
    const isWeaknessHit = event.isWeaknessHit ?? false;
    const isResistanceHit = event.isResistanceHit ?? false;
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
        durationMs: 950,
        isWeaknessHit,
        isResistanceHit
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

  private isShieldBreakEvent(event: Extract<ArenaBattleEvent, { type: "damage_number" }>): boolean {
    const shieldDamage = Math.max(0, event.shieldDamageAmount ?? 0);
    if (shieldDamage <= 0) {
      return false;
    }

    const hpDamage = Math.max(0, event.hpDamageAmount ?? (event.damageAmount - shieldDamage));
    return hpDamage > 0;
  }

  private isMajorIncomingHit(
    event: Extract<ArenaBattleEvent, { type: "damage_number" }>,
    playerActorId: string | null,
    scene: ArenaScene
  ): boolean {
    if (!playerActorId || event.targetEntityId !== playerActorId) {
      return false;
    }

    const playerActor = scene.actorsById[playerActorId];
    const maxHp = Math.max(1, playerActor?.maxHp ?? 100);
    const damageThreshold = Math.max(8, Math.round(maxHp * 0.18));
    return event.isCrit || event.damageAmount >= damageThreshold;
  }

  private createMomentCue(
    kind: ArenaCombatMomentCue["kind"],
    tileX: number,
    tileY: number,
    durationMs: number
  ): ArenaCombatMomentCue {
    return {
      kind,
      tilePos: { x: tileX, y: tileY },
      elapsedMs: 0,
      durationMs: Math.max(1, durationMs)
    };
  }

  private createCombatCalloutText(
    text: string,
    tileX: number,
    tileY: number,
    tone: NonNullable<FloatingTextInstance["tone"]>,
    durationMs: number,
    fontScale = 1
  ): FloatingTextInstance {
    return {
      kind: "combat_callout",
      tone,
      text,
      tilePos: { x: tileX, y: tileY },
      startAtMs: 0,
      elapsedMs: 0,
      durationMs: Math.max(1, durationMs),
      fontScale: Math.max(0.6, fontScale)
    };
  }

  private createSkillNameText(text: string, tileX: number, tileY: number): FloatingTextInstance {
    return {
      kind: "skill_name",
      text,
      tilePos: { x: tileX, y: tileY },
      startAtMs: 0,
      elapsedMs: 0,
      durationMs: 800
    };
  }

  private resolveAssistCastCalloutProfile(skillId: string): AssistCastCalloutProfile | null {
    return ASSIST_CAST_CALLOUT_PROFILES[skillId] ?? null;
  }

  private resolveAssistCastLabel(skillId: string, scene: ArenaScene): string {
    const mapped = scene.skillsById[skillId]?.displayName;
    if (typeof mapped === "string" && mapped.trim().length > 0) {
      return mapped.trim().toUpperCase();
    }

    return skillId
      .split("_")
      .map((token) => (token.length > 0 ? token[0].toUpperCase() + token.slice(1) : token))
      .join(" ")
      .toUpperCase();
  }

  private resolveCardChosenLabel(cardName: string | undefined): string {
    const trimmed = typeof cardName === "string" ? cardName.trim() : "";
    if (trimmed.length > 0) {
      return trimmed.toUpperCase();
    }

    return "REWARD CLAIMED";
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

  private isMobMeleeHitOnPlayer(
    event: Extract<ArenaBattleEvent, { type: "attack_fx" }>,
    scene: ArenaScene,
    previousScene: ArenaScene,
    playerActorId: string | null
  ): boolean {
    if (event.fxKind !== COMBAT_FX_MELEE_SWING || !playerActorId) {
      return false;
    }

    const playerActor = scene.actorsById[playerActorId] ?? previousScene.actorsById[playerActorId];
    if (!playerActor || playerActor.kind !== "player") {
      return false;
    }

    if (event.toTileX !== playerActor.tileX || event.toTileY !== playerActor.tileY) {
      return false;
    }

    const sourceActor = this.findActorAtTile(event.fromTileX, event.fromTileY, scene, previousScene);
    if (!sourceActor || sourceActor.kind !== "mob") {
      return false;
    }

    const distance = this.computeChebyshevDistance(event.fromTileX, event.fromTileY, event.toTileX, event.toTileY);
    return distance <= 1;
  }

  private findActorAtTile(
    tileX: number,
    tileY: number,
    scene: ArenaScene,
    previousScene: ArenaScene
  ): ArenaActorState | null {
    const fromCurrent = Object.values(scene.actorsById).find((actor) => actor.tileX === tileX && actor.tileY === tileY);
    if (fromCurrent) {
      return fromCurrent;
    }

    const fromPrevious = Object.values(previousScene.actorsById).find((actor) => actor.tileX === tileX && actor.tileY === tileY);
    return fromPrevious ?? null;
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
    const baseFromPos: TilePos = { x: event.fromTile.x, y: event.fromTile.y };
    const impactPos: TilePos = { x: event.toTile.x, y: event.toTile.y };
    const fromPos = this.applyWindBreakFollowUpWhisperOffset(baseFromPos, impactPos, event, scene);
    const visualEndPos = event.pierces
      ? this.computePierceVisualEndTile(baseFromPos, impactPos, scene.columns, scene.rows)
      : impactPos;
    const visualStyle = this.resolveProjectileVisualStyle(event.weaponId);
    let impactDurationMs: number;
    let totalDurationMs: number;
    if (visualStyle === "auto_attack_ranged") {
      const autoAttackDurationMs = this.resolveAutoAttackRangedDurationMs(scene);
      impactDurationMs = autoAttackDurationMs;
      totalDurationMs = autoAttackDurationMs;
    } else if (visualStyle === "sylwen_whisper_shot") {
      impactDurationMs = SYLWEN_WHISPER_SHOT_PROJECTILE_DURATION_MS;
      totalDurationMs = SYLWEN_WHISPER_SHOT_PROJECTILE_DURATION_MS;
    } else if (visualStyle === "sylwen_gale_pierce") {
      totalDurationMs = SYLWEN_GALE_PIERCE_PROJECTILE_DURATION_MS;
      const impactDistance = this.computeTileDistance(fromPos, impactPos);
      const totalDistance = Math.max(0.001, this.computeTileDistance(fromPos, visualEndPos));
      const impactRatio = Math.max(0, Math.min(1, impactDistance / totalDistance));
      impactDurationMs = Math.max(1, Math.round(totalDurationMs * impactRatio));
    } else if (visualStyle === "velvet_death_strike") {
      impactDurationMs = VELVET_DEATH_STRIKE_PROJECTILE_DURATION_MS;
      totalDurationMs = VELVET_DEATH_STRIKE_PROJECTILE_DURATION_MS;
    } else if (visualStyle === "velvet_umbral_path") {
      impactDurationMs = VELVET_UMBRAL_PATH_PROJECTILE_DURATION_MS;
      totalDurationMs = VELVET_UMBRAL_PATH_PROJECTILE_DURATION_MS;
    } else {
      const speedTilesPerSecond = this.normalizeProjectileSpeedTilesPerSecond(scene.rangedConfig?.rangedProjectileSpeedTiles);
      const impactDistance = this.computeTileDistance(baseFromPos, impactPos);
      const totalDistance = this.computeTileDistance(baseFromPos, visualEndPos);
      impactDurationMs = Math.max(1, Math.round((impactDistance / speedTilesPerSecond) * 1000));
      totalDurationMs = Math.max(impactDurationMs, Math.round((totalDistance / speedTilesPerSecond) * 1000));
    }

    return {
      weaponId: event.weaponId,
      fromPos,
      impactPos,
      visualEndPos,
      targetActorId: event.targetActorId ?? null,
      pierces: event.pierces,
      colorHex: this.resolveProjectileColorHex(scene.rangedConfig, event.weaponId, scene),
      visualStyle,
      startDelayRemainingMs: Math.max(0, Math.round(startDelayMs)),
      elapsedMs: 0,
      impactDurationMs,
      totalDurationMs
    };
  }

  private applyWindBreakFollowUpWhisperOffset(
    baseFromPos: TilePos,
    impactPos: TilePos,
    event: Extract<ArenaBattleEvent, { type: "ranged_projectile_fired" }>,
    scene: ArenaScene
  ): TilePos {
    if (!event.isWindBreakFollowUp || !this.isSylwenWhisperShotSkillId(event.weaponId)) {
      return baseFromPos;
    }

    const directionX = impactPos.x - baseFromPos.x;
    const directionY = impactPos.y - baseFromPos.y;
    const length = Math.hypot(directionX, directionY);
    if (length <= 0.0001) {
      return baseFromPos;
    }

    const offsetPx = 4;
    const offsetTiles = offsetPx / Math.max(1, scene.tileSize);
    const perpendicularX = -directionY / length;
    const perpendicularY = directionX / length;
    return {
      x: baseFromPos.x + (perpendicularX * offsetTiles),
      y: baseFromPos.y + (perpendicularY * offsetTiles)
    };
  }

  private shouldChainProjectileSegments(
    event: Extract<ArenaBattleEvent, { type: "ranged_projectile_fired" }>
  ): boolean {
    return event.pierces && !event.targetActorId;
  }

  private resolveProjectileColorHex(
    rangedConfig: ArenaRangedConfig | undefined,
    weaponId: string,
    scene?: ArenaScene
  ): string {
    if (this.isAutoAttackRangedWeaponId(weaponId)) {
      const autoAttackElementColor = this.resolveAutoAttackRangedElementColorHex(scene);
      if (autoAttackElementColor) {
        return autoAttackElementColor;
      }
    }

    const mappedColor = rangedConfig?.projectileColorByWeaponId?.[weaponId];
    if (typeof mappedColor === "string" && mappedColor.trim().length > 0) {
      return mappedColor;
    }

    return DEFAULT_PHYSICAL_PROJECTILE_COLOR_HEX;
  }

  private resolveAutoAttackRangedDurationMs(scene: ArenaScene): number {
    if (this.isVelvetActiveCharacter(scene)) {
      return AUTO_ATTACK_RANGED_PROJECTILE_DURATION_VELVET_MS;
    }

    if (this.isSylwenActiveCharacter(scene)) {
      return AUTO_ATTACK_RANGED_PROJECTILE_DURATION_SYLWEN_MS;
    }

    return AUTO_ATTACK_RANGED_PROJECTILE_DURATION_SYLWEN_MS;
  }

  private isSylwenActiveCharacter(scene: ArenaScene): boolean {
    const activeCharacterId = this.resolveActiveCharacterId(scene);
    return activeCharacterId === CHARACTER_ID_SYLWEN || activeCharacterId.includes("sylwen");
  }

  private isVelvetActiveCharacter(scene: ArenaScene): boolean {
    const activeCharacterId = this.resolveActiveCharacterId(scene);
    return activeCharacterId === CHARACTER_ID_VELVET || activeCharacterId.includes("velvet");
  }

  private resolveActiveCharacterId(scene: ArenaScene): string {
    const explicit = scene.activeCharacterId?.trim().toLowerCase();
    if (explicit) {
      return explicit;
    }

    const playerActorId = Object.values(scene.actorsById).find((actor) => actor.kind === "player")?.actorId;
    return playerActorId?.trim().toLowerCase() ?? "";
  }

  private resolveElementFxStartFrame(scene: ArenaScene): number {
    const baseFrame = this.resolveElementFxBaseStartFrame(scene);
    return baseFrame + Math.floor(Math.random() * FX_SPRITE_FRAMES_PER_ROW);
  }

  private resolveElementFxBaseStartFrame(scene: ArenaScene): number {
    const activeElement = this.resolveActivePlayerElement(scene);
    return ELEMENT_FX_ROW_START_BY_ACTIVE_ELEMENT[activeElement] ?? ELEMENT_FX_ROW_START_BY_ACTIVE_ELEMENT["physical"];
  }

  private resolveActivePlayerElement(scene: ArenaScene): string {
    const player = Object.values(scene.actorsById).find((actor) => actor.kind === "player");
    const activeElement = player?.attackElement?.trim().toLowerCase();
    if (!activeElement) {
      return "physical";
    }

    if (activeElement === "fire" || activeElement === "ice" || activeElement === "earth" || activeElement === "energy") {
      return activeElement;
    }

    return "physical";
  }

  private resolveAutoAttackRangedElementColorHex(scene?: ArenaScene): string | null {
    if (!scene) {
      return null;
    }

    const player = Object.values(scene.actorsById).find((actor) => actor.kind === "player");
    const attackElement = player?.attackElement?.trim().toLowerCase();
    switch (attackElement) {
      case "fire":
        return "#ff9f2d";
      case "ice":
        return "#7dd3fc";
      case "energy":
        return "#a78bfa";
      case "earth":
        return "#166534";
      case "holy":
        return "#fde68a";
      case "shadow":
        return "#4c1d95";
      case "physical":
        return "#ffffff";
      default:
        return null;
    }
  }

  private isMiraiPrimalRoarSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === MIRAI_PRIMAL_ROAR_SKILL_ID ||
      normalized === "mirai_primal_roar" ||
      normalized.includes("mirai_primal_roar");
  }

  private isMiraiRendClawSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === MIRAI_REND_CLAW_SKILL_ID ||
      normalized === "mirai_rend_claw" ||
      normalized.includes("mirai_rend_claw");
  }

  private isSylwenWhisperShotSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === SYLWEN_WHISPER_SHOT_SKILL_ID ||
      normalized === "sylwen_whisper_shot" ||
      normalized.includes("sylwen_whisper_shot");
  }

  private isAutoAttackRangedWeaponId(weaponId: string): boolean {
    const normalized = weaponId.trim().toLowerCase();
    return normalized === AUTO_ATTACK_RANGED_WEAPON_ID;
  }

  private isSylwenGalePierceSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === SYLWEN_GALE_PIERCE_SKILL_ID ||
      normalized === "sylwen_gale_pierce" ||
      normalized.includes("sylwen_gale_pierce");
  }

  private isSylwenThornfallSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === SYLWEN_THORNFALL_SKILL_ID ||
      normalized === "sylwen_thornfall" ||
      normalized.includes("sylwen_thornfall");
  }

  private isVelvetVoidChainSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === VELVET_VOID_CHAIN_SKILL_ID ||
      normalized === "velvet_void_chain" ||
      normalized.includes("velvet_void_chain");
  }

  private isVelvetUmbralPathSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === VELVET_UMBRAL_PATH_SKILL_ID ||
      normalized === "velvet_umbral_path" ||
      normalized.includes("velvet_umbral_path");
  }

  private isVelvetDeathStrikeSkillId(skillId: string): boolean {
    const normalized = skillId.trim().toLowerCase();
    return normalized === VELVET_DEATH_STRIKE_SKILL_ID ||
      normalized === "velvet_death_strike" ||
      normalized.includes("velvet_death_strike");
  }

  private resolveProjectileVisualStyle(weaponId: string): RangedProjectileInstance["visualStyle"] {
    if (this.isAutoAttackRangedWeaponId(weaponId)) {
      return "auto_attack_ranged";
    }

    if (this.isSylwenWhisperShotSkillId(weaponId)) {
      return "sylwen_whisper_shot";
    }

    if (this.isSylwenGalePierceSkillId(weaponId)) {
      return "sylwen_gale_pierce";
    }

    if (this.isVelvetUmbralPathSkillId(weaponId)) {
      return "velvet_umbral_path";
    }

    if (this.isVelvetDeathStrikeSkillId(weaponId)) {
      return "velvet_death_strike";
    }

    return "default";
  }

  private resolveVelvetUmbralPathTargetTile(scene: ArenaScene, playerTile: TilePos): TilePos | null {
    const lockedTarget = scene.lockedTargetEntityId ? scene.actorsById[scene.lockedTargetEntityId] : null;
    if (lockedTarget && lockedTarget.kind === "mob" && lockedTarget.hp > 0) {
      return { x: lockedTarget.tileX, y: lockedTarget.tileY };
    }

    const focusedTarget = scene.effectiveTargetEntityId ? scene.actorsById[scene.effectiveTargetEntityId] : null;
    if (focusedTarget && focusedTarget.kind === "mob" && focusedTarget.hp > 0) {
      return { x: focusedTarget.tileX, y: focusedTarget.tileY };
    }

    const nearestMob = Object.values(scene.actorsById)
      .filter((actor) => actor.kind === "mob" && actor.hp > 0)
      .sort((left, right) => {
        const leftDistance = this.computeChebyshevDistance(playerTile.x, playerTile.y, left.tileX, left.tileY);
        const rightDistance = this.computeChebyshevDistance(playerTile.x, playerTile.y, right.tileX, right.tileY);
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        return left.actorId.localeCompare(right.actorId);
      })[0];
    if (!nearestMob) {
      return null;
    }

    return { x: nearestMob.tileX, y: nearestMob.tileY };
  }

  private buildUmbralPathTrailTiles(
    playerTile: TilePos,
    targetTile: TilePos,
    columns: number,
    rows: number
  ): TilePos[] {
    const lineTiles = this.buildLineTiles(playerTile, targetTile, columns, rows);
    if (lineTiles.length === 0) {
      return [];
    }

    const tileByKey = new Map<string, TilePos>();
    const addTile = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= columns || y >= rows) {
        return;
      }

      const key = `${x}:${y}`;
      if (!tileByKey.has(key)) {
        tileByKey.set(key, { x, y });
      }
    };

    for (let index = 0; index < lineTiles.length; index += 1) {
      const current = lineTiles[index];
      const previous = index > 0 ? lineTiles[index - 1] : null;
      const next = index < lineTiles.length - 1 ? lineTiles[index + 1] : null;
      const directionX = next
        ? Math.sign(next.x - current.x)
        : previous
          ? Math.sign(current.x - previous.x)
          : Math.sign(targetTile.x - playerTile.x);
      const directionY = next
        ? Math.sign(next.y - current.y)
        : previous
          ? Math.sign(current.y - previous.y)
          : Math.sign(targetTile.y - playerTile.y);

      addTile(current.x, current.y);
      const perpendicularOffsets = this.getUmbralTrailPerpendicularOffsets(directionX, directionY);
      for (const offset of perpendicularOffsets) {
        addTile(current.x + offset.dx, current.y + offset.dy);
      }
    }

    return [...tileByKey.values()];
  }

  private buildLineTiles(
    fromTile: TilePos,
    toTile: TilePos,
    columns: number,
    rows: number
  ): TilePos[] {
    let x0 = Math.round(fromTile.x);
    let y0 = Math.round(fromTile.y);
    const x1 = Math.round(toTile.x);
    const y1 = Math.round(toTile.y);
    const tiles: TilePos[] = [];

    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      if (x0 >= 0 && y0 >= 0 && x0 < columns && y0 < rows) {
        tiles.push({ x: x0, y: y0 });
      }

      if (x0 === x1 && y0 === y1) {
        break;
      }

      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }

      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }

    return tiles;
  }

  private getUmbralTrailPerpendicularOffsets(
    directionX: number,
    directionY: number
  ): ReadonlyArray<Readonly<{ dx: number; dy: number }>> {
    if (directionX === 0 && directionY === 0) {
      return [];
    }

    if (directionX === 0) {
      return [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    }

    if (directionY === 0) {
      return [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
    }

    return [{ dx: directionX, dy: 0 }, { dx: 0, dy: directionY }];
  }

  private resolveNearestBorderShimmer(
    tilePos: TilePos,
    columns: number,
    rows: number
  ): { edge: "top" | "right" | "bottom" | "left"; tileIndex: number } | null {
    if (columns <= 0 || rows <= 0) {
      return null;
    }

    const clampedX = Math.max(0, Math.min(columns - 1, Math.round(tilePos.x)));
    const clampedY = Math.max(0, Math.min(rows - 1, Math.round(tilePos.y)));
    const distances = [
      { edge: "top" as const, distance: clampedY, tileIndex: clampedX },
      { edge: "right" as const, distance: (columns - 1) - clampedX, tileIndex: clampedY },
      { edge: "bottom" as const, distance: (rows - 1) - clampedY, tileIndex: clampedX },
      { edge: "left" as const, distance: clampedX, tileIndex: clampedY }
    ];
    const nearest = distances.reduce((best, current) =>
      current.distance < best.distance ? current : best);

    return {
      edge: nearest.edge,
      tileIndex: nearest.tileIndex
    };
  }

  private computeChebyshevDistance(fromX: number, fromY: number, toX: number, toY: number): number {
    return Math.max(Math.abs(fromX - toX), Math.abs(fromY - toY));
  }

  private normalizeAssistCastHitTiles(
    hitTiles: ReadonlyArray<TilePos> | undefined,
    columns: number,
    rows: number
  ): TilePos[] {
    if (!Array.isArray(hitTiles) || hitTiles.length === 0) {
      return [];
    }

    const clampedTiles = hitTiles
      .map((tile) => ({
        x: Math.max(0, Math.min(columns - 1, Math.round(tile.x))),
        y: Math.max(0, Math.min(rows - 1, Math.round(tile.y)))
      }))
      .filter((tile, index, array) => array.findIndex((entry) => entry.x === tile.x && entry.y === tile.y) === index);
    return clampedTiles;
  }

  private buildAdjacentTiles(center: TilePos, columns: number, rows: number): TilePos[] {
    const tiles: TilePos[] = [];
    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) {
          continue;
        }

        const tileX = center.x + deltaX;
        const tileY = center.y + deltaY;
        if (tileX < 0 || tileY < 0 || tileX >= columns || tileY >= rows) {
          continue;
        }

        tiles.push({ x: tileX, y: tileY });
      }
    }

    return tiles;
  }

  private resolveBloodFangActivationTiles(
    event: Extract<ArenaBattleEvent, { type: "blood_fang_detonated" }>,
    fallbackCenter: TilePos,
    columns: number,
    rows: number
  ): TilePos[] {
    const eventTiles = this.normalizeAssistCastHitTiles(event.affectedTiles, columns, rows);
    if (eventTiles.length > 0) {
      return eventTiles;
    }

    const radius = BLOOD_FANG_SQUARE_RADIUS;
    const normalizedTargetPos = event.targetPosition
      ? {
        x: Math.max(0, Math.min(columns - 1, Math.round(event.targetPosition.x))),
        y: Math.max(0, Math.min(rows - 1, Math.round(event.targetPosition.y)))
      }
      : null;
    const centerX = normalizedTargetPos?.x ?? Math.max(0, Math.min(columns - 1, Math.round(fallbackCenter.x)));
    const centerY = normalizedTargetPos?.y ?? Math.max(0, Math.min(rows - 1, Math.round(fallbackCenter.y)));
    const tilesByKey = new Map<string, TilePos>();

    for (let tileY = 0; tileY < rows; tileY += 1) {
      for (let tileX = 0; tileX < columns; tileX += 1) {
        const deltaX = tileX - centerX;
        const deltaY = tileY - centerY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > radius) {
          continue;
        }

        tilesByKey.set(`${tileX},${tileY}`, { x: tileX, y: tileY });
      }
    }

    return Array.from(tilesByKey.values());
  }

  private resolveStormCollapseActivationTiles(
    event: Extract<ArenaBattleEvent, { type: "storm_collapse_detonated" }>,
    fallbackCenter: TilePos,
    columns: number,
    rows: number
  ): TilePos[] {
    const eventTiles = this.normalizeAssistCastHitTiles(event.affectedTiles, columns, rows);
    if (eventTiles.length > 0) {
      return eventTiles;
    }

    const ultimateLevel = Math.max(1, Math.min(3, Math.floor(event.ultimateLevel ?? 1)));
    const radius = ultimateLevel >= 3 ? 3 : 2;
    const normalizedTargetPos = event.targetPosition
      ? {
        x: Math.max(0, Math.min(columns - 1, Math.round(event.targetPosition.x))),
        y: Math.max(0, Math.min(rows - 1, Math.round(event.targetPosition.y)))
      }
      : null;
    const centerX = normalizedTargetPos?.x ?? Math.max(0, Math.min(columns - 1, Math.round(fallbackCenter.x)));
    const centerY = normalizedTargetPos?.y ?? Math.max(0, Math.min(rows - 1, Math.round(fallbackCenter.y)));
    const tilesByKey = new Map<string, TilePos>();
    const addTile = (tileX: number, tileY: number): void => {
      if (tileX < 0 || tileY < 0 || tileX >= columns || tileY >= rows) {
        return;
      }

      const key = `${tileX},${tileY}`;
      if (!tilesByKey.has(key)) {
        tilesByKey.set(key, { x: tileX, y: tileY });
      }
    };

    for (let tileY = 0; tileY < rows; tileY += 1) {
      for (let tileX = 0; tileX < columns; tileX += 1) {
        const deltaX = tileX - centerX;
        const deltaY = tileY - centerY;
        if ((Math.abs(deltaX) + Math.abs(deltaY)) <= radius) {
          addTile(tileX, tileY);
        }
      }
    }

    return Array.from(tilesByKey.values());
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

  private tickMomentCues(scene: ArenaScene, deltaMs: number): ArenaScene {
    const activeCues = scene.momentCues ?? [];
    if (activeCues.length === 0) {
      return scene;
    }

    const nextCues = activeCues
      .map((cue) => ({
        ...cue,
        elapsedMs: cue.elapsedMs + deltaMs
      }))
      .filter((cue) => cue.elapsedMs < cue.durationMs);

    return {
      ...scene,
      momentCues: nextCues
    };
  }

  private tickActorFlashOverlays(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.actorFlashOverlays.length === 0) {
      return scene;
    }

    const nextOverlays = scene.actorFlashOverlays
      .map((overlay) => {
        const nextDelay = Math.max(0, overlay.delayRemainingMs - deltaMs);
        const overflow = Math.max(0, deltaMs - overlay.delayRemainingMs);
        const nextElapsed = nextDelay > 0
          ? overlay.elapsedMs
          : overlay.elapsedMs + overflow;
        return {
          ...overlay,
          delayRemainingMs: nextDelay,
          elapsedMs: nextElapsed
        };
      })
      .filter((overlay) =>
        scene.actorsById[overlay.actorId] !== undefined &&
        overlay.elapsedMs < overlay.durationMs);

    return {
      ...scene,
      actorFlashOverlays: nextOverlays
    };
  }

  private tickCollapseFieldBursts(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.collapseFieldBursts.length === 0) {
      return scene;
    }

    const nextBursts = scene.collapseFieldBursts
      .map((burst) => ({
        ...burst,
        elapsedMs: burst.elapsedMs + deltaMs
      }))
      .filter((burst) => burst.elapsedMs < burst.durationMs);

    return {
      ...scene,
      collapseFieldBursts: nextBursts
    };
  }

  private tickStormCollapseRings(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.stormCollapseRings.length === 0) {
      return scene;
    }

    const nextRings = scene.stormCollapseRings
      .map((ring) => {
        const nextDelay = Math.max(0, ring.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - ring.delayRemainingMs);
        return {
          ...ring,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? ring.elapsedMs : ring.elapsedMs + overflowMs
        };
      })
      .filter((ring) =>
        scene.actorsById[ring.actorId] !== undefined &&
        ring.elapsedMs < ring.durationMs);

    return {
      ...scene,
      stormCollapseRings: nextRings
    };
  }

  private tickStormCollapseStackTexts(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.stormCollapseStackTexts.length === 0) {
      return scene;
    }

    const nextTexts = scene.stormCollapseStackTexts
      .map((text) => {
        const nextDelay = Math.max(0, text.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - text.delayRemainingMs);
        return {
          ...text,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? text.elapsedMs : text.elapsedMs + overflowMs
        };
      })
      .filter((text) =>
        scene.actorsById[text.actorId] !== undefined &&
        text.elapsedMs < text.durationMs);

    return {
      ...scene,
      stormCollapseStackTexts: nextTexts
    };
  }

  private tickStormCollapseArenaRings(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.stormCollapseArenaRings.length === 0) {
      return scene;
    }

    const nextRings = scene.stormCollapseArenaRings
      .map((ring) => {
        const nextDelay = Math.max(0, ring.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - ring.delayRemainingMs);
        return {
          ...ring,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? ring.elapsedMs : ring.elapsedMs + overflowMs
        };
      })
      .filter((ring) => ring.elapsedMs < ring.durationMs);

    return {
      ...scene,
      stormCollapseArenaRings: nextRings
    };
  }

  private tickScreenTintOverlays(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.screenTintOverlays.length === 0) {
      return scene;
    }

    const nextTints = scene.screenTintOverlays
      .map((overlay) => ({
        ...overlay,
        elapsedMs: overlay.elapsedMs + deltaMs
      }))
      .filter((overlay) => overlay.elapsedMs < overlay.durationMs);

    return {
      ...scene,
      screenTintOverlays: nextTints
    };
  }

  private tickMiraiTileFlashes(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.miraiTileFlashes.length === 0) {
      return scene;
    }

    const nextFlashes = scene.miraiTileFlashes
      .map((overlay) => {
        const nextDelay = Math.max(0, (overlay.delayRemainingMs ?? 0) - deltaMs);
        const overflowMs = Math.max(0, deltaMs - (overlay.delayRemainingMs ?? 0));
        return {
          ...overlay,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? overlay.elapsedMs : overlay.elapsedMs + overflowMs
        };
      })
      .filter((overlay) => overlay.elapsedMs < overlay.durationMs);

    return {
      ...scene,
      miraiTileFlashes: nextFlashes
    };
  }

  private tickThornfallCrossZones(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.thornfallCrossZones.length === 0) {
      return scene;
    }

    const nextZones = scene.thornfallCrossZones
      .map((zone) => ({
        ...zone,
        elapsedMs: zone.elapsedMs + deltaMs
      }))
      .filter((zone) => zone.elapsedMs < zone.durationMs);

    return {
      ...scene,
      thornfallCrossZones: nextZones
    };
  }

  private tickStormCollapseBorderPulses(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.stormCollapseBorderPulses.length === 0) {
      return scene;
    }

    const nextPulses = scene.stormCollapseBorderPulses
      .map((pulse) => {
        const nextDelay = Math.max(0, pulse.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - pulse.delayRemainingMs);
        return {
          ...pulse,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? pulse.elapsedMs : pulse.elapsedMs + overflowMs
        };
      })
      .filter((pulse) => pulse.elapsedMs < pulse.durationMs);

    return {
      ...scene,
      stormCollapseBorderPulses: nextPulses
    };
  }

  private tickVelvetVoidChainArcs(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.velvetVoidChainArcs.length === 0) {
      return scene;
    }

    const nextArcs = scene.velvetVoidChainArcs
      .map((arc) => ({
        ...arc,
        elapsedMs: arc.elapsedMs + deltaMs
      }))
      .filter((arc) => arc.elapsedMs < arc.durationMs);

    return {
      ...scene,
      velvetVoidChainArcs: nextArcs
    };
  }

  private tickVelvetVoidChainBorderShimmers(scene: ArenaScene, deltaMs: number): ArenaScene {
    const activeShimmers = scene.velvetVoidChainBorderShimmers ?? [];
    if (activeShimmers.length === 0) {
      return scene;
    }

    const nextShimmers = activeShimmers
      .map((shimmer) => ({
        ...shimmer,
        elapsedMs: shimmer.elapsedMs + deltaMs
      }))
      .filter((shimmer) => shimmer.elapsedMs < shimmer.durationMs);

    return {
      ...scene,
      velvetVoidChainBorderShimmers: nextShimmers
    };
  }

  private tickVelvetVoidChainHitPulses(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.velvetVoidChainHitPulses.length === 0) {
      return scene;
    }

    const nextPulses = scene.velvetVoidChainHitPulses
      .map((pulse) => ({
        ...pulse,
        elapsedMs: pulse.elapsedMs + deltaMs
      }))
      .filter((pulse) => pulse.elapsedMs < pulse.durationMs);

    return {
      ...scene,
      velvetVoidChainHitPulses: nextPulses
    };
  }

  private tickVelvetUmbralPathTrails(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.velvetUmbralPathTrails.length === 0) {
      return scene;
    }

    const nextTrails = scene.velvetUmbralPathTrails
      .map((trail) => ({
        ...trail,
        elapsedMs: trail.elapsedMs + deltaMs
      }))
      .filter((trail) => trail.elapsedMs < trail.durationMs);

    return {
      ...scene,
      velvetUmbralPathTrails: nextTrails
    };
  }

  private tickVelvetUmbralPathImpacts(scene: ArenaScene, deltaMs: number): ArenaScene {
    const activeImpacts = scene.velvetUmbralPathImpacts ?? [];
    if (activeImpacts.length === 0) {
      return scene;
    }

    const nextImpacts = activeImpacts
      .map((impact) => {
        const nextDelay = Math.max(0, impact.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - impact.delayRemainingMs);
        return {
          ...impact,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? impact.elapsedMs : impact.elapsedMs + overflowMs
        };
      })
      .filter((impact) => impact.elapsedMs < impact.durationMs);

    return {
      ...scene,
      velvetUmbralPathImpacts: nextImpacts
    };
  }

  private tickVelvetDeathStrikeBursts(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.velvetDeathStrikeBursts.length === 0) {
      return scene;
    }

    const nextBursts = scene.velvetDeathStrikeBursts
      .map((burst) => {
        const nextDelay = Math.max(0, burst.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - burst.delayRemainingMs);
        return {
          ...burst,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? burst.elapsedMs : burst.elapsedMs + overflowMs
        };
      })
      .filter((burst) => burst.elapsedMs < burst.durationMs);

    return {
      ...scene,
      velvetDeathStrikeBursts: nextBursts
    };
  }

  private tickSkullImpactOverlays(scene: ArenaScene, deltaMs: number): ArenaScene {
    const activeOverlays = scene.skullImpactOverlays ?? [];
    if (activeOverlays.length === 0) {
      return scene;
    }

    const nextOverlays = activeOverlays
      .map((overlay) => ({
        ...overlay,
        elapsedMs: overlay.elapsedMs + deltaMs
      }))
      .filter((overlay) => overlay.elapsedMs < overlay.durationMs);

    return {
      ...scene,
      skullImpactOverlays: nextOverlays
    };
  }

  private tickSylwenHitOverlays(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.sylwenHitOverlays.length === 0) {
      return scene;
    }

    const nextOverlays = scene.sylwenHitOverlays
      .map((overlay) => {
        const nextDelay = Math.max(0, overlay.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - overlay.delayRemainingMs);
        return {
          ...overlay,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? overlay.elapsedMs : overlay.elapsedMs + overflowMs
        };
      })
      .filter((overlay) => overlay.elapsedMs < overlay.durationMs);

    return {
      ...scene,
      sylwenHitOverlays: nextOverlays
    };
  }

  private tickSylwenDissipateRings(scene: ArenaScene, deltaMs: number): ArenaScene {
    if (scene.sylwenDissipateRings.length === 0) {
      return scene;
    }

    const nextRings = scene.sylwenDissipateRings
      .map((ring) => {
        const nextDelay = Math.max(0, ring.delayRemainingMs - deltaMs);
        const overflowMs = Math.max(0, deltaMs - ring.delayRemainingMs);
        return {
          ...ring,
          delayRemainingMs: nextDelay,
          elapsedMs: nextDelay > 0 ? ring.elapsedMs : ring.elapsedMs + overflowMs
        };
      })
      .filter((ring) => ring.elapsedMs < ring.durationMs);

    return {
      ...scene,
      sylwenDissipateRings: nextRings
    };
  }

  private resolveCollapseFieldSlideDelayByActorId(
    events: ReadonlyArray<ArenaBattleEvent>
  ): Map<string, number> {
    const delaysByActorId = new Map<string, number>();
    const collapseEvent = events.find((event): event is Extract<ArenaBattleEvent, { type: "collapse_field_activated" }> =>
      event.type === "collapse_field_activated");
    if (!collapseEvent) {
      return delaysByActorId;
    }

    for (const pulledMob of collapseEvent.pulledMobs) {
      delaysByActorId.set(pulledMob.mobId, COLLAPSE_FIELD_SLIDE_DURATION_MS);
    }

    return delaysByActorId;
  }

  private resolveStormCollapseStacksByActorId(
    events: ReadonlyArray<ArenaBattleEvent>
  ): Map<string, number> {
    const stacksByActorId = new Map<string, number>();
    const stormEvent = events.find((event): event is Extract<ArenaBattleEvent, { type: "storm_collapse_detonated" }> =>
      event.type === "storm_collapse_detonated");
    if (!stormEvent) {
      return stacksByActorId;
    }

    for (const hit of stormEvent.hits) {
      stacksByActorId.set(hit.mobId, Math.max(0, hit.stacksConsumed));
    }

    return stacksByActorId;
  }

  private resolveStormCollapseDamageDelayByActorId(
    events: ReadonlyArray<ArenaBattleEvent>
  ): Map<string, number> {
    const delaysByActorId = new Map<string, number>();
    const stormEvent = events.find((event): event is Extract<ArenaBattleEvent, { type: "storm_collapse_detonated" }> =>
      event.type === "storm_collapse_detonated");
    if (!stormEvent) {
      return delaysByActorId;
    }

    for (let index = 0; index < stormEvent.hits.length; index += 1) {
      const hit = stormEvent.hits[index];
      delaysByActorId.set(hit.mobId, index * STORM_COLLAPSE_RING_STAGGER_MS);
    }

    return delaysByActorId;
  }

  private computeStormCollapseDamageScale(stacksConsumed: number): number {
    const cappedStacks = Math.max(0, Math.min(10, Math.floor(stacksConsumed)));
    return 1 + (cappedStacks / 10);
  }

  private normalizeElement(value: number | undefined): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
    if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7 || value === 8 || value === 9) {
      return value;
    }

    return PHYSICAL_ELEMENT;
  }

  private normalizeMobTierIndex(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return MIN_MOB_TIER_INDEX;
    }

    return Math.max(MIN_MOB_TIER_INDEX, Math.min(MAX_MOB_TIER_INDEX, Math.floor(value)));
  }

  private readSnapshotMobTierIndex(actor: ArenaActorState): number | undefined {
    if (typeof actor.tierIndex === "number" && Number.isFinite(actor.tierIndex)) {
      return actor.tierIndex;
    }

    const snapshotValue = (actor as ArenaActorState & { mobTierIndex?: number }).mobTierIndex;
    if (typeof snapshotValue === "number" && Number.isFinite(snapshotValue)) {
      return snapshotValue;
    }

    return undefined;
  }
}

