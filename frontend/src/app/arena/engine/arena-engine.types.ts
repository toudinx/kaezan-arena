export type RenderLayer = "ground" | "groundFx" | "actors" | "hitFx" | "ui";
export type ElementTypeValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type CombatFxKindValue = 1 | 2 | 3 | 4 | 5;
export type DecalKindValue = 1;
export type HitKindValue = "normal" | "crit";

export interface TilePos {
  x: number;
  y: number;
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
  isElite?: boolean;
  isBuffedByElite?: boolean;
  buffSourceEliteId?: string | null;
  currentTargetId?: string | null;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
}

export type MobArchetypeValue = 1 | 2 | 3 | 4;

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
}

export interface FloatingTextInstance {
  kind: "crit_text";
  text: string;
  tilePos: TilePos;
  startAtMs: number;
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

export type ArenaPoiType = "altar" | "chest" | "species_chest";

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

export type ArenaBattleEvent =
  | ArenaFxSpawnEvent
  | ArenaDamageNumberEvent
  | ArenaCritTextEvent
  | ArenaAttackFxEvent
  | ArenaDeathEvent
  | ArenaHealNumberEvent
  | ArenaReflectNumberEvent;

export interface ApplyBattleStepResult {
  scene: ArenaScene;
  damageNumbers: DamageNumberInstance[];
}

export interface ArenaScene {
  columns: number;
  rows: number;
  tileSize: number;
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
  hoveredMobEntityId?: string | null;
  threatMobEntityId?: string | null;
  fxInstances: FxInstance[];
  attackFxInstances: AttackFxInstance[];
  damageNumbers: DamageNumberInstance[];
  floatingTexts: FloatingTextInstance[];
}
