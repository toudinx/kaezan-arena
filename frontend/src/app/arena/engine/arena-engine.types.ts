export type RenderLayer = "ground" | "groundFx" | "actors" | "hitFx" | "ui";
export type ElementTypeValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type CombatFxKindValue = 1 | 2 | 3 | 4 | 5;
export type DecalKindValue = 1;
export type HitKindValue = "normal" | "crit";
export const MOB_ARCHETYPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
export type MobArchetypeValue = (typeof MOB_ARCHETYPE_VALUES)[number];
export const MIN_MOB_ARCHETYPE_VALUE: MobArchetypeValue = MOB_ARCHETYPE_VALUES[0];
export const MAX_MOB_ARCHETYPE_VALUE: MobArchetypeValue = MOB_ARCHETYPE_VALUES[MOB_ARCHETYPE_VALUES.length - 1];

export interface TilePos {
  x: number;
  y: number;
}

export interface ArenaRangedConfig {
  autoAttackRangedMaxRange: number;
  rangedProjectileSpeedTiles: number;
  rangedDefaultCooldownMs: number;
  projectileColorByWeaponId: Record<string, string>;
}

export interface TileEntity {
  semanticId: string;
  tilePos: TilePos;
  layer: "ground";
}

export interface SpriteEntity {
  actorId: string;
  semanticId: string;
  tilePos: TilePos;
  layer: "actors";
  animationElapsedMs: number;
}

export interface ArenaActorState {
  actorId: string;
  kind: string;
  mobType?: MobArchetypeValue;
  tierIndex?: number;
  isElite?: boolean;
  isBuffedByElite?: boolean;
  buffSourceEliteId?: string | null;
  currentTargetId?: string | null;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  shield?: number;
  maxShield?: number;
  attackElement?: string | null;
  weakTo?: string | null;
  resistantTo?: string | null;
  sunderBrandStacks?: number;
  corrosionStacks?: number;
  focusStacks?: number;
  isStunned?: boolean;
  stunRemainingMs?: number;
  isImmobilized?: boolean;
  immobilizeRemainingMs?: number;
}

export type ArenaActorMap = Record<string, ArenaActorState>;

export type ActorAnimationMode = "idle" | "run" | "hit";

export interface ActorVisualState {
  actorId: string;
  currentAnimId: string;
  mode: ActorAnimationMode;
  elapsedMs: number;
  hitRemainingMs: number;
  runRemainingMs: number;
}

export type ActorVisualStateMap = Record<string, ActorVisualState>;

export interface ArenaSkillState {
  skillId: string;
  displayName?: string | null;
  cooldownRemainingMs: number;
  cooldownTotalMs: number;
}

export type ArenaSkillMap = Record<string, ArenaSkillState>;

export interface FxSpawnRequest {
  fxId: string;
  tilePos: TilePos;
  durationMs: number;
  layer: "groundFx" | "hitFx";
  element?: ElementTypeValue;
  startFrame?: number;
}

export interface FxPlanSpawn {
  fxId: string;
  tilePos: TilePos;
  element?: ElementTypeValue;
  startFrame?: number;
}

export interface FxInstance {
  fxId: string;
  tilePos: TilePos;
  durationMs: number;
  elapsedMs: number;
  layer: "groundFx" | "hitFx";
  element: ElementTypeValue;
  startFrame: number;
}

export interface DamageNumberInstance {
  actorId: string;
  amount: number;
  isCrit: boolean;
  kind: "damage" | "heal" | "reflect";
  isHeal: boolean;
  isShieldChange: boolean;
  shieldChangeDirection?: "gain" | "loss";
  isDamageReceived: boolean;
  sourceEntityId?: string | null;
  targetEntityId?: string | null;
  element: ElementTypeValue;
  tilePos: TilePos;
  stackIndex: number;
  spawnOrder: number;
  elapsedMs: number;
  durationMs: number;
  isWeaknessHit?: boolean;
  isResistanceHit?: boolean;
  styleVariant?: "storm_collapse";
  styleScale?: number;
}

export interface QueuedDamageNumberInstance {
  entry: Omit<DamageNumberInstance, "stackIndex" | "spawnOrder" | "elapsedMs">;
  delayRemainingMs: number;
}

export interface RangedProjectileInstance {
  weaponId: string;
  fromPos: TilePos;
  impactPos: TilePos;
  visualEndPos: TilePos;
  targetActorId?: string | null;
  pierces: boolean;
  colorHex: string;
  visualStyle?: RangedProjectileVisualStyle;
  startDelayRemainingMs?: number;
  elapsedMs: number;
  impactDurationMs: number;
  totalDurationMs: number;
}

export type RangedProjectileVisualStyle =
  | "default"
  | "auto_attack_ranged"
  | "sylwen_whisper_shot"
  | "sylwen_gale_pierce"
  | "velvet_umbral_path"
  | "velvet_death_strike";

export interface SylwenHitOverlay {
  kind: "whisper_star" | "gale_slash" | "auto_attack_burst" | "auto_attack_orb_ring";
  tilePos: TilePos;
  colorHex: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
}

export interface SkullImpactOverlay {
  tilePos: TilePos;
  elapsedMs: number;
  durationMs: number;
}

export interface SylwenDissipateRingOverlay {
  tilePos: TilePos;
  colorHex: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
  maxRadiusPx: number;
}

export interface ThornfallCrossZoneOverlay {
  centerTile: TilePos;
  crossTiles: TilePos[];
  colorHex: string;
  elapsedMs: number;
  durationMs: number;
}

export interface VelvetVoidChainArcOverlay {
  fromPos: TilePos;
  toPos: TilePos;
  colorHex: string;
  elapsedMs: number;
  durationMs: number;
}

export interface VelvetVoidChainBorderShimmerOverlay {
  edge: "top" | "right" | "bottom" | "left";
  tileIndex: number;
  colorHex: string;
  elapsedMs: number;
  durationMs: number;
}

export interface VelvetVoidChainHitPulseOverlay {
  tilePos: TilePos;
  colorHex: string;
  elapsedMs: number;
  durationMs: number;
  startRadiusPx: number;
  endRadiusPx: number;
  lineWidthPx: number;
}

export interface VelvetUmbralPathTrailOverlay {
  tiles: TilePos[];
  centerLineTiles?: TilePos[];
  colorHex: string;
  elapsedMs: number;
  durationMs: number;
  fadeOutMs: number;
}

export interface VelvetUmbralPathImpactOverlay {
  tilePos: TilePos;
  colorHex: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
}

export interface VelvetDeathStrikeBurstOverlay {
  tilePos: TilePos;
  colorHex: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
}

export interface MobKnockbackSlideInstance {
  actorId: string;
  fromPos: TilePos;
  toPos: TilePos;
  elapsedMs: number;
  durationMs: number;
}

export interface FloatingTextInstance {
  kind: "crit_text" | "combat_callout" | "skill_name";
  tone?: "crit" | "elite" | "assist" | "shield_break" | "danger" | "reward" | "headshot" | "silver_tempest";
  text: string;
  tilePos: TilePos;
  startAtMs: number;
  elapsedMs: number;
  durationMs: number;
  fontScale?: number;
}

export interface ArenaCombatMomentCue {
  kind: "elite_spawn" | "elite_died" | "mob_death" | "shield_break" | "assist_cast" | "danger_hit" | "player_death" | "reward_open";
  tilePos: TilePos;
  elapsedMs: number;
  durationMs: number;
}

export interface AttackFxInstance {
  eventId: number;
  fxKind: CombatFxKindValue;
  fromPos: TilePos;
  toPos: TilePos;
  directionAngleRad: number;
  durationMs: number;
  elapsedMs: number;
  createdAtTick: number;
  element: ElementTypeValue;
}

export interface DecalInstance {
  entityId: string;
  decalKind: DecalKindValue;
  entityType: string;
  mobType?: MobArchetypeValue;
  tilePos: TilePos;
  semanticId: string;
  remainingMs: number;
  totalMs: number;
  createdTick: number;
}

export type ArenaPoiType = "altar" | "chest" | "species_chest" | "mimic_dormant";

export interface ArenaPoiState {
  poiId: string;
  type: ArenaPoiType;
  pos: TilePos;
  remainingMs: number;
  species?: string;
}

export interface ArenaBestiaryEntry {
  species: string;
  killsTotal: number;
  nextChestAtKills: number;
}

export interface ArenaBuffState {
  buffId: string;
  remainingMs: number;
}

export interface ArenaFxSpawnEvent {
  type: "fx_spawn";
  fxId: string;
  tileX: number;
  tileY: number;
  layer: string;
  durationMs: number;
  element?: ElementTypeValue;
}

export interface ArenaDamageNumberEvent {
  type: "damage_number";
  sourceEntityId?: string;
  sourceTileX?: number;
  sourceTileY?: number;
  attackerEntityId?: string;
  attackerTileX?: number;
  attackerTileY?: number;
  targetEntityId: string;
  targetTileX: number;
  targetTileY: number;
  damageAmount: number;
  isKill: boolean;
  isCrit: boolean;
  hitKind?: HitKindValue;
  hitId: number;
  shieldDamageAmount?: number;
  hpDamageAmount?: number;
  elementType?: ElementTypeValue;
  isWeaknessHit?: boolean;
  isResistanceHit?: boolean;
}

export interface ArenaCritTextEvent {
  type: "crit_text";
  text: string;
  tileX: number;
  tileY: number;
  startAtMs: number;
  durationMs: number;
}

export interface ArenaAttackFxEvent {
  type: "attack_fx";
  fxKind: CombatFxKindValue;
  fromTileX: number;
  fromTileY: number;
  toTileX: number;
  toTileY: number;
  durationMs: number;
  createdAtTick: number;
  eventId: number;
  elementType?: ElementTypeValue;
}

export interface ArenaDeathEvent {
  type: "death";
  entityId: string;
  entityType: string;
  mobType?: MobArchetypeValue;
  tileX: number;
  tileY: number;
  elementType?: ElementTypeValue;
  killerEntityId?: string;
  tickIndex: number;
}

export interface ArenaRangedProjectileFiredEvent {
  type: "ranged_projectile_fired";
  weaponId: string;
  fromTile: TilePos;
  toTile: TilePos;
  targetActorId?: string | null;
  pierces: boolean;
  isChainJump?: boolean;
  isSilverTempestFollowUp?: boolean;
}

export interface ArenaMobKnockedBackEvent {
  type: "mob_knocked_back";
  actorId: string;
  fromTile: TilePos;
  toTile: TilePos;
}

export interface ArenaHealNumberEvent {
  type: "heal_number";
  actorId: string;
  amount: number;
  source: string;
}

export interface ArenaReflectNumberEvent {
  type: "reflect_number";
  sourceEntityId: string;
  targetEntityId: string;
  targetTileX: number;
  targetTileY: number;
  amount: number;
  elementType?: ElementTypeValue;
}

export interface ArenaAssistCastEvent {
  type: "assist_cast";
  skillId: string;
  reason: string;
  displayName?: string;
  hitTiles?: TilePos[];
}

export interface ArenaEliteSpawnedEvent {
  type: "elite_spawned";
  eliteEntityId: string;
  mobType: MobArchetypeValue;
}

export interface ArenaEliteDiedEvent {
  type: "elite_died";
  eliteEntityId: string;
  mobType: MobArchetypeValue;
}

export interface ArenaPoiInteractedEvent {
  type: "poi_interacted";
  poiId: string;
  poiType: "altar" | "chest" | "species_chest";
  tileX: number;
  tileY: number;
  species?: string;
}

export interface ArenaCardChoiceOfferedEvent {
  type: "card_choice_offered";
  choiceId: string;
}

export interface ArenaCardChosenEvent {
  type: "card_chosen";
  choiceId: string;
  cardName?: string;
}

export interface ArenaMimicActivatedEvent {
  type: "mimic_activated";
  poiId: string;
  actorId: string;
  tileX: number;
  tileY: number;
}

export interface ArenaSunderBrandUpdatedEvent {
  type: "sunder_brand_updated";
  mobId: string;
  stacks: number;
}

export interface ArenaCorrosionUpdatedEvent {
  type: "corrosion_updated";
  mobId: string;
  stacks: number;
}

export interface ArenaFocusUpdatedEvent {
  type: "focus_updated";
  mobId: string;
  focusStacks: number;
  consecutiveHits: number;
}

export interface ArenaHeadshotEvent {
  type: "headshot";
  mobId: string;
  damageDealt: number;
}

export interface ArenaFocusResetEvent {
  type: "focus_reset";
  mobId: string;
  reason?: string;
}

export interface ArenaStunAppliedEvent {
  type: "stun_applied";
  mobId: string;
  durationMs: number;
}

export interface ArenaImmobilizeAppliedEvent {
  type: "immobilize_applied";
  mobId: string;
  durationMs: number;
}

export interface ArenaCollapseFieldPullResult {
  mobId: string;
  newPosition: TilePos;
  damageDealt: number;
}

export interface ArenaCollapseFieldActivatedEvent {
  type: "collapse_field_activated";
  playerPosition: TilePos;
  pullResults: ArenaCollapseFieldPullResult[];
}

export interface ArenaStormCollapseHit {
  mobId: string;
  stacksConsumed: number;
  damageDealt: number;
}

export interface ArenaStormCollapseDetonatedEvent {
  type: "storm_collapse_detonated";
  hits: ArenaStormCollapseHit[];
}

export interface ArenaSilverTempestActivatedEvent {
  type: "silver_tempest_activated";
  durationMs: number;
}

export interface ArenaThornfallPlacedEvent {
  type: "thornfall_placed";
  fanTiles?: TilePos[];
  crossTiles?: TilePos[];
}

export type ArenaBattleEvent =
  | ArenaFxSpawnEvent
  | ArenaDamageNumberEvent
  | ArenaCritTextEvent
  | ArenaAttackFxEvent
  | ArenaDeathEvent
  | ArenaHealNumberEvent
  | ArenaReflectNumberEvent
  | ArenaAssistCastEvent
  | ArenaEliteSpawnedEvent
  | ArenaEliteDiedEvent
  | ArenaPoiInteractedEvent
  | ArenaCardChoiceOfferedEvent
  | ArenaCardChosenEvent
  | ArenaRangedProjectileFiredEvent
  | ArenaMobKnockedBackEvent
  | ArenaMimicActivatedEvent
  | ArenaSunderBrandUpdatedEvent
  | ArenaCorrosionUpdatedEvent
  | ArenaFocusUpdatedEvent
  | ArenaHeadshotEvent
  | ArenaFocusResetEvent
  | ArenaStunAppliedEvent
  | ArenaImmobilizeAppliedEvent
  | ArenaCollapseFieldActivatedEvent
  | ArenaStormCollapseDetonatedEvent
  | ArenaSilverTempestActivatedEvent
  | ArenaThornfallPlacedEvent;

export interface ActorFlashOverlay {
  actorId: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
  fullWhiteDurationMs: number;
}

export interface RadialBurstOverlay {
  centerTile: TilePos;
  elapsedMs: number;
  durationMs: number;
}

export interface StormCollapseRingOverlay {
  actorId: string;
  tilePos: TilePos;
  stacksConsumed: number;
  colorHex: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
  startRadiusPx: number;
  endRadiusPx: number;
  strokeWidthPx: number;
}

export interface StormCollapseStackTextOverlay {
  actorId: string;
  tilePos: TilePos;
  stacksConsumed: number;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
}

export interface StormCollapseArenaRingOverlay {
  centerTile: TilePos;
  colorHex: string;
  delayRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
  startRadiusPx: number;
  endRadiusPx: number;
  strokeWidthPx: number;
  maxOpacity: number;
}

export interface ScreenTintOverlay {
  colorHex: string;
  maxOpacity: number;
  elapsedMs: number;
  durationMs: number;
}

export interface RendPulseTileFlashOverlay {
  tilePos: TilePos;
  colorHex: string;
  elapsedMs: number;
  durationMs: number;
}

export interface ApplyBattleStepResult {
  scene: ArenaScene;
  damageNumbers: DamageNumberInstance[];
}

export interface ArenaScene {
  columns: number;
  rows: number;
  tileSize: number;
  activeCharacterId?: string | null;
  playerTile: TilePos;
  effectiveTargetEntityId: string | null;
  lockedTargetEntityId: string | null;
  groundTargetPos: TilePos | null;
  actorsById: ArenaActorMap;
  actorVisualsById: ActorVisualStateMap;
  skillsById: ArenaSkillMap;
  tiles: TileEntity[];
  sprites: SpriteEntity[];
  decals: DecalInstance[];
  activeBuffs: ArenaBuffState[];
  activePois: ArenaPoiState[];
  rangedConfig?: ArenaRangedConfig;
  hoveredMobEntityId?: string | null;
  threatMobEntityId?: string | null;
  silverTempestActive: boolean;
  silverTempestRemainingMs: number;
  fxInstances: FxInstance[];
  attackFxInstances: AttackFxInstance[];
  projectileInstances: RangedProjectileInstance[];
  mobKnockbackSlidesByActorId?: Record<string, MobKnockbackSlideInstance>;
  actorFlashOverlays: ActorFlashOverlay[];
  collapseFieldBursts: RadialBurstOverlay[];
  stormCollapseRings: StormCollapseRingOverlay[];
  stormCollapseStackTexts: StormCollapseStackTextOverlay[];
  stormCollapseArenaRings: StormCollapseArenaRingOverlay[];
  screenTintOverlays: ScreenTintOverlay[];
  rendPulseTileFlashes: RendPulseTileFlashOverlay[];
  sylwenHitOverlays: SylwenHitOverlay[];
  skullImpactOverlays?: SkullImpactOverlay[];
  sylwenDissipateRings: SylwenDissipateRingOverlay[];
  thornfallCrossZones: ThornfallCrossZoneOverlay[];
  velvetVoidChainArcs: VelvetVoidChainArcOverlay[];
  velvetVoidChainBorderShimmers?: VelvetVoidChainBorderShimmerOverlay[];
  velvetVoidChainHitPulses: VelvetVoidChainHitPulseOverlay[];
  velvetUmbralPathTrails: VelvetUmbralPathTrailOverlay[];
  velvetUmbralPathImpacts?: VelvetUmbralPathImpactOverlay[];
  velvetDeathStrikeBursts: VelvetDeathStrikeBurstOverlay[];
  queuedDamageNumbers: QueuedDamageNumberInstance[];
  nextDamageSpawnOrder: number;
  damageNumbers: DamageNumberInstance[];
  floatingTexts: FloatingTextInstance[];
  momentCues?: ArenaCombatMomentCue[];
}
