import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { AssetPreloaderService } from "../../arena/assets/asset-preloader.service";
import { AssetResolverService } from "../../arena/assets/asset-resolver.service";
import { ArenaEngine } from "../../arena/engine/arena-engine";
import { getPlayerSpriteAssetIdsForPreload } from "../../arena/engine/player-visuals";
import {
  ArenaActorState,
  ArenaBattleEvent,
  ArenaBestiaryEntry,
  ArenaBuffState,
  ArenaPoiState,
  ArenaRangedConfig,
  DecalInstance,
  ArenaScene,
  ArenaSkillState,
  DamageNumberInstance
} from "../../arena/engine/arena-engine.types";
import { normalizeDecalKind, resolveDecalSemanticId } from "../../arena/engine/decal.helpers";
import { CanvasLayeredRenderer } from "../../arena/render/canvas-layered-renderer";
import { computeMaxTileSizeForViewport } from "../../arena/render/arena-board-layout.helpers";
import type { UiWindowPositionChangedEvent } from "../../arena/ui/ui-window.component";
import {
  AccountApiService,
  type AccountState,
  type CharacterState,
  type DropEvent,
  type DropSource,
  type EquipmentDefinition,
  type ItemDefinition,
  type OwnedEquipmentInstance
} from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import {
  BattleApiService,
  ChooseCardRequest,
  StartBattleRequest,
  StartBattleResponse,
  StepBattleRequest,
  StepBattleResponse
} from "../../api/battle-api.service";
import { buildDropSourceKey, dedupeDropSources, mapMobTypeToSpecies } from "./loot-source.helpers";
import {
  collectReadyPulseSkillIds,
  computeCooldownFraction,
  formatCooldownSeconds,
  isReadyButBlockedByGcd
} from "./skill-cooldown.helpers";
import {
  hitTestMobAtTile,
  resolvePointerCommand,
  screenToTile,
  type PointerActionKind
} from "./arena-pointer.helpers";
import {
  ARENA_UI_WINDOW_IDS,
  type ArenaUiWindowId,
  type UiWindowLayout,
  UiLayoutService
} from "./ui-layout.service";
import { BackpackWindowComponent } from "./backpack-window.component";
import type { BackpackEquipMode, BackpackEquipRequest } from "./backpack-window.component";
import {
  type StatusBuffViewModel,
  type StatusSkillSlotViewModel,
  buildUltimateSlotViewModel,
  mapStatusBuffs,
  mapStatusSkillSlots
} from "./status-skills.helpers";
import { EquipmentPaperdollWindowComponent } from "./equipment-paperdoll-window.component";
import type { BackpackFilter } from "./backpack-inventory.helpers";
import { DockLayoutService, type DockModuleId, type DockModuleState } from "./dock-layout.service";
import { HelperAssistWindowComponent, type AssistSkillToggleChangedEvent } from "./helper-assist-window.component";
import {
  RunResultLogger,
  type RunResultFinalizeMetrics
} from "../../shared/run-results/run-result-logger";
import { ReplayIoService } from "../../shared/replay/replay-io.service";
import {
  type DamageConsoleEntry,
  mapDamageNumbersToConsoleEntries,
  mergeDamageConsoleEntries
} from "./damage-console.helpers";
import {
  buildCombatRateSeries,
  computeCombatRollingRates,
  computeCombatRollingTotals,
  computeEliteTimelineSummary,
  resolveRollingWindowSeconds,
  type CombatMetricKind,
  type CombatMetricSample,
  type CombatRateSeries,
  type EliteTimelineEvent,
  type EliteTimelineSummary
} from "./combat-analyzer.helpers";
import { computeExpProgressPercent, computeUnifiedVitalsPercent, formatRunTimer } from "./arena-hud.helpers";

type ApiActorState = NonNullable<StartBattleResponse["actors"]>[number];
type ApiSkillState = NonNullable<StartBattleResponse["skills"]>[number];
type ApiDecalState = NonNullable<StartBattleResponse["decals"]>[number];
type ApiGroundTargetPos = NonNullable<StartBattleResponse["groundTargetPos"]>;
type ApiAssistConfig = NonNullable<StartBattleResponse["assistConfig"]>;
type ApiCommandResult = NonNullable<StepBattleResponse["commandResults"]>[number];
type ApiPoiState = {
  poiId?: unknown;
  type?: unknown;
  pos?: unknown;
  remainingMs?: unknown;
  species?: unknown;
};
type ApiBestiaryEntry = {
  species?: unknown;
  killsTotal?: unknown;
  nextChestAtKills?: unknown;
};
type ApiBuffState = {
  buffId?: unknown;
  remainingMs?: unknown;
};
type ApiCardOffer = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  rarityWeight?: unknown;
  maxStacks?: unknown;
  currentStacks?: unknown;
};
type StepCommand = NonNullable<StepBattleRequest["commands"]>[number];
type FacingDirection = "up" | "up_right" | "right" | "down_right" | "down" | "down_left" | "left" | "up_left";

type AssistOffenseMode = "cooldown_spam" | "smart";
type AssistSkillId = "exori" | "exori_min" | "exori_mas" | "avalanche";
type LeftTopTabId = "events" | "combat" | "economy";
type ToolsTabId = "helper" | "bestiary";
type NarrativeEventType =
  | "level_up"
  | "card_choice_offered"
  | "card_chosen"
  | "chest_spawned"
  | "chest_opened"
  | "elite_spawned"
  | "elite_died"
  | "elite_buff_applied"
  | "elite_buff_removed"
  | "run_ended";
type EconomyMetricKind = "xp" | "echo_fragments" | "primal_core";
type TimedMetricSample<TKind extends string> = Readonly<{
  kind: TKind;
  amount: number;
  runTimeMs: number;
}>;
type CombatRateSeriesViewModel = Readonly<{
  kind: CombatRateSeries["kind"];
  label: string;
  value: string;
  bars: ReadonlyArray<Readonly<{ id: string; heightPercent: number; tooltip: string }>>;
}>;
type CombatEliteTableRow = Readonly<{
  encounterId: string;
  eliteLabel: string;
  status: string;
  spawnLabel: string;
  uptimeLabel: string;
  ttkLabel: string;
}>;
type EconomySourceSummaryRow = Readonly<{
  label: string;
  value: string;
}>;
type RunEquipmentSnapshot = Readonly<{
  definitionId: string;
  rarity: string | null;
}>;
type EventFeedEntry = Readonly<{
  id: string;
  tick: number;
  runTimeMs: number;
  type: NarrativeEventType;
  message: string;
}>;
type ExpConsoleEntry = Readonly<{
  id: string;
  tick: number;
  message: string;
  kind: "xp_gained" | "level_up" | "system";
}>;
type CardOfferStackTone = "new" | "growing" | "maxed";
type CardChoiceLevelContext = Readonly<{
  newLevel: number;
  runXp: number;
  xpToNextLevel: number;
}>;
type ArenaCardOffer = Readonly<{
  id: string;
  name: string;
  description: string;
  tags: ReadonlyArray<string>;
  rarityWeight: number;
  maxStacks: number;
  currentStacks: number;
  rarityTierLabel: string;
  categoryLabel: string;
  impactLines: ReadonlyArray<string>;
  stackStateLabel: string;
  stackStateTone: CardOfferStackTone;
}>;
type CardChoiceSource = "chest" | "level_up" | "unknown";
type ShieldHudVisualState = "active" | "low" | "depleted";
type RunRecordingBatch = Readonly<{
  tick: number;
  stepCount: number;
  commands: StepCommand[];
}>;
type RunRecordingChoice = Readonly<{
  tick: number;
  choiceId: string;
  selectedCardId: string;
}>;
type RunRecording = Readonly<{
  runId: string;
  battleSeed: number;
  playerId: string;
  commandBatches: RunRecordingBatch[];
  cardChoices: RunRecordingChoice[];
  awardedDropEventIds: string[];
}>;
type BeginRunOptions = Readonly<{
  seedOverride: number | null;
  replayRecording: RunRecording | null;
}>;
export const TOOLS_TAB_STORAGE_KEY = "kaezan_arena_tools_tab_v1";
export const RIGHT_INFO_TAB_STORAGE_KEY = TOOLS_TAB_STORAGE_KEY;
const ASSIST_CONFIG_DEBOUNCE_MS = 200;
const RUN_INITIAL_LEVEL = 1;
const RUN_INITIAL_XP = 0;
const RUN_LEVEL_XP_BASE = 25;
const RUN_LEVEL_XP_INCREMENT_PER_LEVEL = 15;
const DEFAULT_RUN_DURATION_MS = 180_000;
const DEFAULT_ZONE_INDEX = 1;
const MAX_ZONE_INDEX = 5;
const EXP_CONSOLE_MAX_ENTRIES = 200;
const EVENT_FEED_MAX_ENTRIES = 250;
const COMBAT_DETAILS_MAX_LINES = 200;
const ANALYZER_WINDOW_MS = 10_000;
const ANALYZER_SAMPLE_RETENTION_MS = 45_000;
const ECONOMY_LOOT_PREVIEW_MAX_ENTRIES = 8;
const SHIELD_LOW_THRESHOLD_PERCENT = 30;
const SHIELD_BREAK_PULSE_DURATION_MS = 260;
const LEVEL_UP_PULSE_DURATION_MS = 760;
const CRAFTED_EQUIPMENT_ITEM_IDS = new Set<string>([
  "wpn.primal_forged_blade",
  "arm.primal_forged_mail",
  "rel.primal_forged_emblem"
]);

/*
MAX_TICK_DEBT = 0 → comportamento original, request a cada 250ms, 100% fluido mas 4 req/s
MAX_TICK_DEBT = 1 → request a cada 500ms, ~2 req/s
MAX_TICK_DEBT = 2 → request a cada 750ms, ~1.3 req/s
MAX_TICK_DEBT = 4 → request a cada 1.25s, ~0.8 req/s
MAX_TICK_DEBT = 8 → request a cada 2s, ~0.5 req/s
*/
const MAX_TICK_DEBT = 0; 

const ASSIST_SKILL_IDS: readonly AssistSkillId[] = ["exori", "exori_min", "exori_mas", "avalanche"];
type ArenaAssistConfig = Readonly<{
  enabled: boolean;
  autoHealEnabled: boolean;
  healAtHpPercent: number;
  autoGuardEnabled: boolean;
  guardAtHpPercent: number;
  autoOffenseEnabled: boolean;
  offenseMode: AssistOffenseMode;
  autoSkills: Readonly<Record<AssistSkillId, boolean>>;
  maxAutoCastsPerTick: number;
}>;
type ArenaUiPlayerState = Readonly<{
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  globalCooldownRemainingMs: number;
  globalCooldownTotalMs: number;
}>;
type ArenaUiState = Readonly<{
  player: ArenaUiPlayerState;
  skills: ReadonlyArray<ArenaSkillState>;
  tick: number;
  status: string;
  facing: FacingDirection;
  ultimateGauge: number;
  ultimateGaugeMax: number;
  ultimateReady: boolean;
}>;
type BootPhase =
  | "measuring_canvas"
  | "resolving_manifest"
  | "preloading_assets"
  | "ready_to_start"
  | "starting_battle"
  | "running"
  | "error";

const PLAYER_SPRITE_ASSET_IDS = getPlayerSpriteAssetIdsForPreload();

const DEV_LOG_ASSET_IDS: ReadonlyArray<string> = [
  "tile.floor.default",
  "tile.wall.stone",
  ...PLAYER_SPRITE_ASSET_IDS,
  "sprite.mob.slime.idle",
  "sprite.mob.slime.run",
  "sprite.mob.slime.hit",
  "sprite.mob.brute.idle",
  "sprite.mob.brute.run",
  "sprite.mob.brute.hit",
  "sprite.mob.archer.idle",
  "sprite.mob.archer.run",
  "sprite.mob.archer.hit",
  "sprite.mob.demon.idle",
  "sprite.mob.demon.run",
  "sprite.mob.demon.hit",
  "sprite.mob.dragon.idle",
  "sprite.mob.dragon.run",
  "sprite.mob.dragon.hit",
  "fx.hit.small",
  "fx.mob.brute.cleave",
  "fx.mob.archer.power_shot",
  "fx.mob.demon.beam",
  "fx.mob.dragon.breath",
  "fx.skill.exori",
  "fx.skill.exori_min",
  "fx.skill.exori_mas",
  "ui.hp.frame",
  "ui.cooldown.frame"
];

@Component({
  selector: "app-arena-page",
  standalone: true,
  imports: [
    BackpackWindowComponent,
    EquipmentPaperdollWindowComponent,
    HelperAssistWindowComponent
  ],
  templateUrl: "./arena-page.component.html",
  styleUrl: "./arena-page.component.css"
})
export class ArenaPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild("arenaCanvas", { static: true }) private readonly canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasViewport", { static: false }) private readonly canvasViewportRef?: ElementRef<HTMLDivElement>;
  @ViewChild("leftLogsPane", { static: false }) private readonly leftLogsPaneRef?: ElementRef<HTMLElement>;
  @ViewChild("topLeftPanel", { static: false }) private readonly topLeftPanelRef?: ElementRef<HTMLElement>;
  @ViewChild("toolsPanel", { static: false }) private readonly toolsPanelRef?: ElementRef<HTMLElement>;
  @ViewChild("rightInfoPane", { static: false }) private readonly rightInfoPaneRef?: ElementRef<HTMLElement>;
  @ViewChild("statusPanel", { static: false }) private readonly statusPanelRef?: ElementRef<HTMLElement>;
  @ViewChild("equipmentPanel", { static: false }) private readonly equipmentPanelRef?: ElementRef<HTMLElement>;
  @ViewChild("backpackPanel", { static: false }) private readonly backpackPanelRef?: ElementRef<HTMLElement>;

  fxPreviewUrl = "";
  activeFxCount = 0;
  battleStatus = "idle";
  battleLog = "";
  bootPhase: BootPhase = "measuring_canvas";
  bootErrorMessage = "";
  renderEnabled = false;
  currentBattleId = "";
  currentBattleTick = 0;
  private pendingTickDebt = 0;
  battleRequestInFlight = false;
  recentDamageNumbers: string[] = [];
  recentCommandResults: string[] = [];
  runResultCopyMessage = "";
  replayIoMessage = "";
  replayIoErrorMessage = "";
  isReplayImportModalOpen = false;
  replayImportJsonText = "";
  autoStepEnabled = false;
  stepIntervalMs = 250;
  queuedCommandCount = 0;
  pingInFlight = false;
  lastPingResult = "Not pinged yet.";
  currentFacingDirection: FacingDirection = "up";
  currentSeed = 0;
  altarCooldownRemainingMs = 0;
  bestiaryEntries: ArenaBestiaryEntry[] = [];
  private runStartBestiaryKills: Record<string, number> = {};
  pendingSpeciesChest: string | null = null;
  lastFocusedSpecies: string | null = null;
  accountState: AccountState | null = null;
  selectedCharacterId = "";
  lootFeed: DropEvent[] = [];
  accountRequestInFlight = false;
  accountStateRequestInFlight = false;
  accountLoaded = false;
  accountLoadErrorMessage = "";
  isInRun = false;
  private itemCatalogById: Record<string, ItemDefinition> = {};
  private equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {};
  backpackHighlightItemId: string | null = null;
  backpackHighlightRequestId = 0;
  backpackForcedFilter: BackpackFilter | null = null;
  backpackEquipMode: BackpackEquipMode = null;
  selectedTopLeftTab: LeftTopTabId = "events";
  selectedToolsTab: ToolsTabId = this.loadToolsTab();
  showCombatDetails = false;
  highlightedLogPanel: "damage" | "loot" | "exp" | null = null;
  eventFeedEntries: EventFeedEntry[] = [];
  combatDetailLines: string[] = [];
  combatMetricSamples: CombatMetricSample[] = [];
  combatEliteEvents: EliteTimelineEvent[] = [];
  economyMetricSamples: TimedMetricSample<EconomyMetricKind>[] = [];
  combatTotalDamageDealt = 0;
  combatTotalDamageTaken = 0;
  combatTotalHealingDone = 0;
  combatTotalShieldGained = 0;
  combatTotalShieldLost = 0;
  combatPeakHitDealt = 0;
  combatPeakHitTaken = 0;
  economyTotalXpGained = 0;
  economyTotalEchoFragments = 0;
  economyTotalPrimalCore = 0;
  runLootSourceMobCount = 0;
  runLootSourceChestCount = 0;
  runAwardedDropEventsCount = 0;
  runAwardedItemDropCount = 0;
  runPlayerMinHp = 0;
  runEchoFragmentsBalanceStart = 0;
  runEchoFragmentsBalanceCurrent = 0;
  runEchoFragmentsSpend = 0;
  runEchoFragmentsIncome = 0;
  showRunIntelPanel = false;
  isBackpackPanelOpen = false;
  isHotkeysModalOpen = false;
  isPauseModalOpen = false;
  isDeathModalOpen = false;
  deathEndReason: string | null = null;
  isRunEnded = false;
  runEndReason: string | null = null;
  runEndedAtMs: number | null = null;
  shieldBreakPulseActive = false;
  levelUpPulseActive = false;
  runTimeMs = 0;
  runDurationMs = DEFAULT_RUN_DURATION_MS;
  timeSurvivedMs = 0;
  runTotalKills = 0;
  runEliteKills = 0;
  runChestsOpened = 0;
  currentMobHpMult = 1;
  currentMobDmgMult = 1;
  scalingNormalHpMult = 1;
  scalingNormalDmgMult = 1;
  scalingEliteHpMult = 1;
  scalingEliteDmgMult = 1;
  scalingLvlFactor = 1;
  scalingLvlFactorEnabled = true;
  isAwaitingCardChoice = false;
  pendingCardChoiceId: string | null = null;
  offeredCards: ArenaCardOffer[] = [];
  selectedCards: ArenaCardOffer[] = [];
  cardChoiceSource: CardChoiceSource = "unknown";
  pendingCardSelectionId: string | null = null;
  cardChoiceRequestInFlight = false;
  damageConsoleEntries: DamageConsoleEntry[] = [];
  expConsoleEntries: ExpConsoleEntry[] = [];
  runLevel = RUN_INITIAL_LEVEL;
  runXp = RUN_INITIAL_XP;
  xpToNextLevel = this.computeRunXpToNextLevel(RUN_INITIAL_LEVEL);
  selectedZoneIndex = DEFAULT_ZONE_INDEX;
  activeZoneIndex = DEFAULT_ZONE_INDEX;
  lastRunRecording: RunRecording | null = null;
  isReplayInProgress = false;
  private expLogSequence = 0;
  private eventFeedSequence = 0;
  private runEndedNarrativeLogged = false;
  ui: ArenaUiState = {
    player: {
      hp: 0,
      maxHp: 100,
      shield: 0,
      maxShield: 80,
      globalCooldownRemainingMs: 0,
      globalCooldownTotalMs: 400
    },
    skills: [],
    tick: 0,
    status: "idle",
    facing: "up",
    ultimateGauge: 0,
    ultimateGaugeMax: 100,
    ultimateReady: false
  };

  private readonly engine = new ArenaEngine();
  private scene?: ArenaScene;
  private renderer?: CanvasLayeredRenderer;
  private canvasContext?: CanvasRenderingContext2D;
  private canvasResizeObserver?: ResizeObserver;
  private canvasReady = false;
  private resizeSyncFrameId = 0;
  private animationFrameId = 0;
  private lastFrameMs = 0;
  private fixedStepMs = 1000 / 60;
  private simulationAccumulatorMs = 0;
  private readonly maxUpdateStepsPerFrame = 8;
  private readonly minReliableViewportSizePx = 50;
  private readonly maxCanvasMeasureAttempts = 20;
  private renderInProgress = false;
  private queuedCommands: StepCommand[] = [];
  private autoStepTimerId: ReturnType<typeof setTimeout> | null = null;
  private assistConfigDebounceTimerId: ReturnType<typeof setTimeout> | null = null;
  private shieldBreakPulseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private levelUpPulseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private autoStepWasEnabledBeforePause = false;
  private autoStepWasEnabledBeforeCardChoice = false;
  private autoStepLoopRunId = 0;
  private activeRunRecording: RunRecording | null = null;
  private replayCommandBatches: RunRecordingBatch[] = [];
  private replayCommandBatchIndex = 0;
  private replayCardChoices: RunRecordingChoice[] = [];
  private replayCardChoiceIndex = 0;
  private lastKnownViewportWidthCss = 0;
  private lastKnownViewportHeightCss = 0;
  private readyPulseSkillIds = new Set<string>();
  private readonly sentLootSourceKeys = new Set<string>();
  private readonly seenAwardedDropEventIds = new Set<string>();
  private readonly runAwardedSourceKeys = new Set<string>();
  private runAwardScopeId = "";
  private runStartCraftedSnapshotByInstanceId = new Map<string, RunEquipmentSnapshot>();
  private readonly runResultLogger = new RunResultLogger();
  private readonly replayIoService = new ReplayIoService();
  private importedReplayRecording: RunRecording | null = null;
  private importedReplaySeedOverride: number | null = null;
  private readonly cardChoiceSourceByChoiceId = new Map<string, CardChoiceSource>();
  private readonly cardChoiceLevelContextByChoiceId = new Map<string, CardChoiceLevelContext>();
  private currentCardChoiceLevelContext: CardChoiceLevelContext | null = null;
  assistConfig: ArenaAssistConfig = this.buildDefaultAssistConfig();
  readonly hotkeyGroups: ReadonlyArray<Readonly<{ title: string; entries: ReadonlyArray<string> }>> = [
    { title: "Facing", entries: ["Arrow keys set facing"] },
    { title: "Targeting", entries: ["Left click ground target", "Right click lock target"] },
    {
      title: "UI",
      entries: [
        "T toggle AUTO ON/OFF",
        "Esc toggle Pause modal",
        "I focus Backpack",
        "C focus Equipment (outside run)",
        "H open Helper tool tab",
        "B open Bestiary tool tab",
        "K focus Status panel",
        "D open Combat analyzer",
        "L open Economy analyzer",
        "X open Events feed"
      ]
    }
  ];
  readonly arenaWindowIds = ARENA_UI_WINDOW_IDS;

  constructor(
    private readonly resolver: AssetResolverService,
    private readonly preloader: AssetPreloaderService,
    private readonly battleApi: BattleApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    accountApi: AccountApiService = new AccountApiService(),
    private readonly uiLayoutService: UiLayoutService = new UiLayoutService(),
    private readonly dockLayoutService: DockLayoutService = new DockLayoutService(),
    private readonly accountStore: AccountStore = new AccountStore(accountApi)
  ) {}

  get uiWindows(): ReadonlyArray<UiWindowLayout> {
    return this.uiLayoutService.windows();
  }

  get dockModules(): ReadonlyArray<DockModuleState> {
    return this.dockLayoutService.modules();
  }

  get playerHpPercent(): number {
    return computeUnifiedVitalsPercent(this.ui.player.hp, this.ui.player.maxHp);
  }

  get playerShieldPercentOfMaxHp(): number {
    return this.playerShieldPercent;
  }

  get playerHpPercentRounded(): number {
    return Math.round(this.playerHpPercent);
  }

  get playerShieldPercent(): number {
    return computeUnifiedVitalsPercent(this.playerShieldCurrent, this.playerShieldMax);
  }

  get playerShieldPercentRounded(): number {
    return Math.round(this.playerShieldPercent);
  }

  get playerHpCurrent(): number {
    return Math.max(0, this.ui.player.hp);
  }

  get playerHpMax(): number {
    return Math.max(1, this.ui.player.maxHp);
  }

  get playerShieldCurrent(): number {
    return Math.max(0, Math.min(this.ui.player.shield, this.ui.player.maxShield));
  }

  get playerShieldMax(): number {
    return Math.max(0, this.ui.player.maxShield);
  }

  get playerShieldVisualState(): ShieldHudVisualState {
    if (this.playerShieldCurrent <= 0 || this.playerShieldMax <= 0) {
      return "depleted";
    }

    const percent = this.playerShieldPercent;
    if (percent <= SHIELD_LOW_THRESHOLD_PERCENT) {
      return "low";
    }

    return "active";
  }

  get lockedTargetLabel(): string | null {
    const lockedId = this.scene?.lockedTargetEntityId ?? null;
    if (!lockedId) return null;
    const actor = this.scene?.actorsById[lockedId];
    if (!actor || actor.kind !== "mob" || !actor.mobType) return null;
    const species = this.mapMobArchetypeToSpecies(actor.mobType);
    if (!species) {
      return null;
    }

    const baseLabel = this.formatSpeciesLabel(species);
    return actor.isElite === true ? `Elite ${baseLabel}` : baseLabel;
  }

  get isLockedTargetElite(): boolean {
    const lockedId = this.scene?.lockedTargetEntityId ?? null;
    if (!lockedId) {
      return false;
    }

    const actor = this.scene?.actorsById[lockedId];
    return !!actor && actor.kind === "mob" && actor.isElite === true;
  }

  get playerExpPercent(): number {
    return computeExpProgressPercent(this.runXp, this.xpToNextLevel);
  }

  get runHudIdentityLabel(): string {
    const selected = this.selectedCharacter;
    const name = selected?.name ?? "Unknown Adventurer";
    return `${name} (Run Lv. ${this.runLevel})`;
  }

  get currentZoneLabel(): string {
    return `Zone ${Math.max(DEFAULT_ZONE_INDEX, this.activeZoneIndex)}`;
  }

  get runExpProgressLabel(): string {
    return `${this.runXp} / ${this.xpToNextLevel} XP`;
  }

  get runHudTimerElapsedLabel(): string {
    const clampedElapsedMs = Math.max(0, Math.min(this.resolveDisplayedRunTimeMs(), this.runDurationMs));
    return formatRunTimer(clampedElapsedMs);
  }

  get runHudTimerTotalLabel(): string {
    return formatRunTimer(this.runDurationMs);
  }

  get runCompleteTitle(): string {
    return this.runEndReason === "victory_time" ? "Victory" : "Defeat";
  }

  get runCompleteReasonText(): string {
    if (this.runEndReason === "victory_time") {
      return "You survived until the time target.";
    }

    if (this.runEndReason === "defeat_death") {
      return "Your character was defeated before the timer ended.";
    }

    if (this.runEndReason) {
      return `Run ended: ${this.formatRunEndReason(this.runEndReason)}.`;
    }

    return "Your character was defeated before the timer ended.";
  }

  get runCompleteTimeLabel(): string {
    return formatRunTimer(this.timeSurvivedMs);
  }

  get runCompleteEndedAtLabel(): string {
    return formatRunTimer(this.resolveRunEndedAtMsForDisplay());
  }

  get runCompleteSummaryRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    return [
      { label: "Time survived", value: this.runCompleteTimeLabel },
      {
        label: "Run time",
        value: `${this.runHudTimerElapsedLabel} / ${this.runHudTimerTotalLabel}`
      },
      { label: "Ended at", value: this.runCompleteEndedAtLabel },
      { label: "Run level reached", value: String(this.runLevel) },
      { label: "Total kills", value: String(this.runTotalKills) },
      { label: "Elite kills", value: String(this.runEliteKills) },
      { label: "Chests opened", value: String(this.runChestsOpened) },
      { label: "Cards chosen", value: String(this.selectedCards.length) }
    ];
  }

  get runPayoutRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    const refinedSummary = this.runRefinedItemsSummary;
    const craftedSummary = this.runCraftedItemsSummary;
    return [
      { label: "Loot sources (mob/chest)", value: `${this.runLootSourceMobCount} / ${this.runLootSourceChestCount}` },
      { label: "Awarded drop events", value: String(this.runAwardedDropEventsCount) },
      { label: "Equipment drops", value: String(this.runAwardedItemDropCount) },
      {
        label: "Echo Fragments flow",
        value: `+${this.runEchoFragmentsIncome} / -${this.runEchoFragmentsSpend} (net ${this.runEchoFragmentsNet >= 0 ? "+" : ""}${this.runEchoFragmentsNet})`
      },
      { label: "Echo Fragments from drops", value: String(this.economyTotalEchoFragments) },
      { label: "Primal Core from drops", value: String(this.economyTotalPrimalCore) },
      { label: "Crafted items", value: `${craftedSummary.count}${craftedSummary.preview ? ` (${craftedSummary.preview})` : ""}` },
      { label: "Refined items", value: `${refinedSummary.count}${refinedSummary.preview ? ` (${refinedSummary.preview})` : ""}` }
    ];
  }

  get runOutcomeIsVictory(): boolean {
    return this.runEndReason === "victory_time";
  }

  get runDurationFormatted(): string {
    const totalSec = Math.floor(this.timeSurvivedMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  get runSummaryLine(): string {
    return `${this.runTotalKills} kills · ${this.runEliteKills} elites · ${this.runChestsOpened} chests`;
  }

  get runBestiaryProgressRows(): ReadonlyArray<Readonly<{
    speciesId: string;
    displayName: string;
    killsGained: number;
    killsTotal: number;
    prevRank: number;
    newRank: number;
    isNewRank: boolean;
  }>> {
    const speciesById = this.accountStore.catalogs().speciesById;
    const MILESTONE = 25;
    return this.bestiaryEntries
      .map((entry) => {
        const preRunKills = Math.max(0, this.runStartBestiaryKills[entry.species] ?? 0);
        const killsTotal = entry.killsTotal;
        const killsGained = Math.max(0, killsTotal - preRunKills);
        const prevRank = Math.floor(preRunKills / MILESTONE);
        const newRank = Math.floor(killsTotal / MILESTONE);
        return {
          speciesId: entry.species,
          displayName: speciesById[entry.species]?.displayName ?? this.fallbackSpeciesLabel(entry.species),
          killsGained,
          killsTotal,
          prevRank,
          newRank,
          isNewRank: newRank > prevRank
        };
      })
      .filter((row) => row.killsGained > 0)
      .sort((a, b) => b.killsGained - a.killsGained)
      .slice(0, 3);
  }

  private fallbackSpeciesLabel(speciesId: string): string {
    return speciesId
      .split("_")
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
      .join(" ");
  }

  get itemCatalogByIdForUi(): Readonly<Record<string, ItemDefinition>> {
    return this.itemCatalogById;
  }

  get equipmentCatalogByItemIdForUi(): Readonly<Record<string, EquipmentDefinition>> {
    return this.equipmentCatalogByItemId;
  }

  get activeBuffsForStatusWindow(): ReadonlyArray<ArenaBuffState> {
    return this.scene?.activeBuffs ?? [];
  }

  get topHudBuffs(): ReadonlyArray<StatusBuffViewModel> {
    return mapStatusBuffs(this.activeBuffsForStatusWindow);
  }

  get assistAutoToggleLabel(): string {
    return this.assistConfig.enabled ? "AUTO: ON" : "AUTO: OFF";
  }

  get bottomBarSkillSlots(): ReadonlyArray<StatusSkillSlotViewModel> {
    const gcd = this.ui.player.globalCooldownRemainingMs;
    const gcdTotal = this.ui.player.globalCooldownTotalMs;
    return [
      ...mapStatusSkillSlots(this.ui.skills, gcd, gcdTotal),
      buildUltimateSlotViewModel(this.ui.ultimateGauge, this.ui.ultimateGaugeMax, this.ui.ultimateReady)
    ];
  }

  get hudPassiveSlots(): ReadonlyArray<ArenaCardOffer> {
    return this.selectedCards.slice(0, 4);
  }

  get canReplayLastRun(): boolean {
    return this.lastRunRecording !== null &&
      this.bootPhase === "ready_to_start" &&
      !this.accountStateRequestInFlight &&
      !this.accountRequestInFlight &&
      !this.battleRequestInFlight;
  }

  get replayLastRunLabel(): string {
    const recording = this.lastRunRecording;
    if (!recording) {
      return "Replay Last Run";
    }

    return `Replay Last Run (seed ${recording.battleSeed}, ${recording.commandBatches.length} ticks)`;
  }

  get statusTabRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    return [
      { label: "Run level", value: String(this.runLevel) },
      { label: "Zone", value: this.currentZoneLabel },
      { label: "Run XP", value: `${this.runXp} / ${this.xpToNextLevel}` },
      { label: "XP to next", value: String(this.xpToNextLevel) },
      { label: "Attack", value: this.resolveStatusModifier(["attack", "atk", "power"]) },
      { label: "Crit rate", value: this.resolveStatusModifier(["crit_rate", "crit", "critical"]) },
      { label: "Life leech", value: this.resolveStatusModifier(["life_leech", "leech"]) },
      { label: "Reflect", value: this.resolveStatusModifier(["reflect", "thorns"]) },
      { label: "Shield capacity", value: String(Math.max(0, this.ui.player.maxShield)) }
    ];
  }

  get analyzerWindowSeconds(): number {
    return Math.round(ANALYZER_WINDOW_MS / 1000);
  }

  get combatRollingTotals() {
    return computeCombatRollingTotals(this.combatMetricSamples, this.runTimeMs, ANALYZER_WINDOW_MS);
  }

  get combatRollingRates() {
    const windowSeconds = resolveRollingWindowSeconds(this.runTimeMs, ANALYZER_WINDOW_MS);
    return computeCombatRollingRates(this.combatRollingTotals, windowSeconds);
  }

  get combatEliteSummary(): EliteTimelineSummary {
    return computeEliteTimelineSummary(this.combatEliteEvents, this.runTimeMs);
  }

  get combatAnalyzerRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    const rates = this.combatRollingRates;
    const eliteSummary = this.combatEliteSummary;
    const averageTtkLabel = eliteSummary.averageTimeToKillMs === null
      ? "--"
      : formatRunTimer(Math.round(eliteSummary.averageTimeToKillMs));
    return [
      { label: `DPS (${this.analyzerWindowSeconds}s)`, value: this.formatPerSecond(rates.dps) },
      { label: `DTPS (${this.analyzerWindowSeconds}s)`, value: this.formatPerSecond(rates.dtps) },
      { label: `HPS (${this.analyzerWindowSeconds}s)`, value: this.formatPerSecond(rates.hps) },
      { label: `Shield+/s (${this.analyzerWindowSeconds}s)`, value: this.formatPerSecond(rates.shieldGainPerSecond) },
      { label: `Shield-/s (${this.analyzerWindowSeconds}s)`, value: this.formatPerSecond(rates.shieldLossPerSecond) },
      { label: "Total damage dealt", value: String(this.combatTotalDamageDealt) },
      { label: "Total damage taken", value: String(this.combatTotalDamageTaken) },
      { label: "Healing done", value: String(this.combatTotalHealingDone) },
      { label: "Shields gained", value: String(this.combatTotalShieldGained) },
      { label: "Shields lost", value: String(this.combatTotalShieldLost) },
      { label: "Elite uptime", value: `${eliteSummary.uptimePercent.toFixed(1)}% (${formatRunTimer(eliteSummary.uptimeMs)})` },
      { label: "Elite avg TTK", value: averageTtkLabel },
      { label: "Elite active", value: String(eliteSummary.activeCount) },
      { label: "Peak hit dealt", value: String(this.combatPeakHitDealt) },
      { label: "Peak hit taken", value: String(this.combatPeakHitTaken) }
    ];
  }

  get combatRateSeriesViewModels(): ReadonlyArray<CombatRateSeriesViewModel> {
    const series = buildCombatRateSeries(this.combatMetricSamples, this.runTimeMs, ANALYZER_WINDOW_MS, 10);
    return series.map((entry) => {
      const maxValue = Math.max(1, entry.maxValue);
      return {
        kind: entry.kind,
        label: entry.label,
        value: this.formatPerSecond(entry.latestValue),
        bars: entry.points.map((point) => {
          const normalized = point.value <= 0 ? 6 : (point.value / maxValue) * 100;
          return {
            id: `${entry.kind}:${point.index}`,
            heightPercent: Math.max(6, Math.min(100, normalized)),
            tooltip: `${entry.label}: ${point.value.toFixed(1)} (${formatRunTimer(point.startMs)} - ${formatRunTimer(point.endMs)})`
          };
        })
      };
    });
  }

  get combatEliteTableRows(): ReadonlyArray<CombatEliteTableRow> {
    const rows = this.combatEliteSummary.rows.slice(-8).reverse();
    return rows.map((row) => {
      const species = mapMobTypeToSpecies(row.mobType);
      const speciesLabel = species ? this.formatSpeciesLabel(species) : "Elite";
      const ttkLabel = row.timeToKillMs === null ? "--" : formatRunTimer(row.timeToKillMs);
      return {
        encounterId: row.encounterId,
        eliteLabel: `${speciesLabel} (${row.eliteEntityId})`,
        status: row.isAlive ? "Alive" : "Defeated",
        spawnLabel: formatRunTimer(row.spawnMs),
        uptimeLabel: formatRunTimer(row.uptimeMs),
        ttkLabel
      };
    });
  }

  get economyAnalyzerRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    const windowSeconds = this.resolveRollingWindowSeconds();
    const sums = this.computeEconomyRollingSums();
    const xpPerSecond = sums.xp / windowSeconds;
    const echoPerSecond = sums.echoFragments / windowSeconds;
    const primalPerSecond = sums.primalCore / windowSeconds;
    return [
      { label: "XP gained total", value: String(this.economyTotalXpGained) },
      { label: "XP/s", value: this.formatPerSecond(xpPerSecond) },
      { label: "Echo Fragments total", value: String(this.economyTotalEchoFragments) },
      { label: "Echo Fragments/s", value: this.formatPerSecond(echoPerSecond) },
      { label: "Primal Core total", value: String(this.economyTotalPrimalCore) },
      { label: "Primal Core/s", value: this.formatPerSecond(primalPerSecond) }
    ];
  }

  get economySourceSummaryRows(): ReadonlyArray<EconomySourceSummaryRow> {
    return [
      { label: "Mob loot sources", value: String(this.runLootSourceMobCount) },
      { label: "Chest loot sources", value: String(this.runLootSourceChestCount) },
      { label: "Awarded events", value: String(this.runAwardedDropEventsCount) },
      { label: "Equipment item drops", value: String(this.runAwardedItemDropCount) },
      {
        label: "Echo flow (+/-/net)",
        value: `+${this.runEchoFragmentsIncome} / -${this.runEchoFragmentsSpend} / ${this.runEchoFragmentsNet >= 0 ? "+" : ""}${this.runEchoFragmentsNet}`
      }
    ];
  }

  get runEchoFragmentsNet(): number {
    return this.runEchoFragmentsBalanceCurrent - this.runEchoFragmentsBalanceStart;
  }

  get runCraftedItemsSummary(): Readonly<{ count: number; preview: string }> {
    const current = this.captureCurrentCraftedSnapshot();
    const addedIds = [...current.keys()].filter((instanceId) => !this.runStartCraftedSnapshotByInstanceId.has(instanceId));
    const preview = this.buildCraftedSummaryPreview(addedIds, current);
    return {
      count: addedIds.length,
      preview
    };
  }

  get runRefinedItemsSummary(): Readonly<{ count: number; preview: string }> {
    const current = this.captureCurrentCraftedSnapshot();
    const refinedIds: string[] = [];
    for (const [instanceId, startSnapshot] of this.runStartCraftedSnapshotByInstanceId) {
      const currentSnapshot = current.get(instanceId);
      if (!currentSnapshot) {
        continue;
      }

      if (this.resolveRarityRank(currentSnapshot.rarity) > this.resolveRarityRank(startSnapshot.rarity)) {
        refinedIds.push(instanceId);
      }
    }

    const preview = this.buildCraftedSummaryPreview(refinedIds, current);
    return {
      count: refinedIds.length,
      preview
    };
  }

  get scalingAnalyzerRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    return [
      { label: "Current Mob HP Mult", value: this.formatMultiplier(this.currentMobHpMult) },
      { label: "Current Mob Dmg Mult", value: this.formatMultiplier(this.currentMobDmgMult) },
      { label: "Scaling Normal HP", value: this.formatMultiplier(this.scalingNormalHpMult) },
      { label: "Scaling Normal Dmg", value: this.formatMultiplier(this.scalingNormalDmgMult) },
      { label: "Scaling Elite HP", value: this.formatMultiplier(this.scalingEliteHpMult) },
      { label: "Scaling Elite Dmg", value: this.formatMultiplier(this.scalingEliteDmgMult) },
      { label: "Run Lv. Factor", value: this.formatMultiplier(this.scalingLvlFactor) },
      { label: "Lv. Factor Enabled", value: this.scalingLvlFactorEnabled ? "yes" : "no" }
    ];
  }

  get pacingTelemetryRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    const displayedRunTimeMs = this.resolveDisplayedRunTimeMs();
    const pacing = this.runResultLogger.getPacingTelemetry(displayedRunTimeMs);
    const lowHpSummary = pacing
      ? `${pacing.lowHp.windows} windows, ${formatRunTimer(pacing.lowHp.totalDurationMs)} total (longest ${formatRunTimer(pacing.lowHp.longestWindowMs)}) @ <=${pacing.lowHp.thresholdPercent}%`
      : "n/a";

    return [
      { label: "Time survived", value: formatRunTimer(this.timeSurvivedMs) },
      { label: "Run time", value: `${formatRunTimer(displayedRunTimeMs)} / ${formatRunTimer(this.runDurationMs)}` },
      { label: "Alive mobs (now)", value: pacing ? String(pacing.currentAliveMobs) : "n/a" },
      { label: "Peak simultaneous mobs", value: pacing ? String(pacing.peakSimultaneousMobs) : "n/a" },
      { label: "Spawn cap (director)", value: this.formatOptionalTelemetryNumber(pacing?.spawnPacing.maxAliveMobs ?? null) },
      { label: "Elite chance (director)", value: this.formatOptionalPercent(pacing?.spawnPacing.eliteSpawnChancePercent ?? null) },
      { label: "First damage taken", value: this.formatOptionalRunTime(pacing?.timeToFirstDamageTakenMs ?? null) },
      { label: "First elite", value: this.formatOptionalRunTime(pacing?.timeToFirstEliteMs ?? null) },
      { label: "First chest spawn", value: this.formatOptionalRunTime(pacing?.timeToFirstChestSpawnMs ?? null) },
      { label: "First chest opened", value: this.formatOptionalRunTime(pacing?.timeToFirstChestOpenedMs ?? null) },
      { label: "First card offer", value: this.formatOptionalRunTime(pacing?.timeToFirstCardChoiceMs ?? null) },
      { label: "Low-HP danger", value: lowHpSummary },
      { label: "Kills", value: String(this.runTotalKills) },
      { label: "Elite kills", value: String(this.runEliteKills) },
      { label: "Chests opened", value: String(this.runChestsOpened) }
    ];
  }

  get economyLootPreview(): ReadonlyArray<DropEvent> {
    return this.lootFeed.slice(0, ECONOMY_LOOT_PREVIEW_MAX_ENTRIES);
  }

  async ngAfterViewInit(): Promise<void> {
    this.selectedZoneIndex = this.resolveZoneIndexFromRoute();
    this.activeZoneIndex = this.selectedZoneIndex;
    this.scene = this.engine.createTestScene();
    this.activeFxCount = 0;
    await this.loadAccountState();

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.scene) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    this.canvasContext = context;
    this.renderer = new CanvasLayeredRenderer(context);
    try {
      await Promise.resolve();
      await this.nextAnimationFrame();
      this.bootPhase = "measuring_canvas";
      this.startCanvasResizeObserver();
      await this.prepareCanvasForFirstRender();

      this.bootPhase = "resolving_manifest";
      await this.resolver.loadManifest();
      this.logResolvedAssetPaths();

      this.bootPhase = "preloading_assets";
      const playerSpritePreloads = PLAYER_SPRITE_ASSET_IDS.map((assetId) => this.preloader.preloadAsset(assetId));
      await Promise.all([
        this.preloader.preloadAsset("tile.floor.default"),
        this.preloader.preloadAsset("tile.wall.stone"),
        ...playerSpritePreloads,
        this.preloader.preloadAsset("sprite.mob.slime.idle"),
        this.preloader.preloadAsset("sprite.mob.slime.run"),
        this.preloader.preloadAsset("sprite.mob.slime.hit"),
        this.preloader.preloadAsset("sprite.mob.brute.idle"),
        this.preloader.preloadAsset("sprite.mob.brute.run"),
        this.preloader.preloadAsset("sprite.mob.brute.hit"),
        this.preloader.preloadAsset("sprite.mob.archer.idle"),
        this.preloader.preloadAsset("sprite.mob.archer.run"),
        this.preloader.preloadAsset("sprite.mob.archer.hit"),
        this.preloader.preloadAsset("sprite.mob.demon.idle"),
        this.preloader.preloadAsset("sprite.mob.demon.run"),
        this.preloader.preloadAsset("sprite.mob.demon.hit"),
        this.preloader.preloadAsset("sprite.mob.dragon.idle"),
        this.preloader.preloadAsset("sprite.mob.dragon.run"),
        this.preloader.preloadAsset("sprite.mob.dragon.hit"),
        this.preloader.preloadAsset("fx.hit.small"),
        this.preloader.preloadAsset("fx.mob.brute.cleave"),
        this.preloader.preloadAsset("fx.mob.archer.power_shot"),
        this.preloader.preloadAsset("fx.mob.demon.beam"),
        this.preloader.preloadAsset("fx.mob.dragon.breath"),
        this.preloader.preloadAsset("fx.skill.exori"),
        this.preloader.preloadAsset("fx.skill.exori_min"),
        this.preloader.preloadAsset("fx.skill.exori_mas")
      ]);

      this.fxPreviewUrl = this.resolver.getFx("hitSmall").url;
      this.bootPhase = "ready_to_start";
      this.renderEnabled = false;
      await this.startRun();
    } catch (error) {
      this.bootPhase = "error";
      this.renderEnabled = false;
      this.autoStepEnabled = false;
      this.stopAutoStepLoop();
      this.battleStatus = "error";
      this.bootErrorMessage = `Failed to initialize arena: ${String(error)}`;
      this.battleLog = this.bootErrorMessage;
      console.error("[ArenaPage] init failed", error);
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }

    if (this.canvasResizeObserver) {
      this.canvasResizeObserver.disconnect();
      this.canvasResizeObserver = undefined;
    }

    if (this.resizeSyncFrameId) {
      cancelAnimationFrame(this.resizeSyncFrameId);
      this.resizeSyncFrameId = 0;
    }

    this.clearAssistConfigDebounce();
    this.stopAutoStepLoop();
    this.clearShieldBreakPulse();
    this.clearLevelUpPulse();

  }

  @HostListener("window:keydown", ["$event"])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.isDeathModalOpen) {
      event.preventDefault();
      return;
    }

    if (event.key === "Escape" && this.isPauseModalOpen) {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      void this.onPauseModalResume();
      return;
    }

    if (event.key === "Escape" && this.isHotkeysModalOpen) {
      event.preventDefault();
      this.closeHotkeysModal();
      return;
    }

    if (this.isTypingContext()) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.openPauseModal();
      return;
    }

    const normalizedKey = event.key.toLowerCase();
    if (normalizedKey === "l") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.focusLootConsole();
      return;
    }

    if (normalizedKey === "t") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.toggleAutoAssist();
      return;
    }

    if (normalizedKey === "d") {
      if (!event.repeat) {
        this.focusDamageConsole();
      }
    }

    if (normalizedKey === "x") {
      if (!event.repeat) {
        this.focusExpConsole();
      }
      return;
    }

    if (normalizedKey === "i") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.openBackpackPanel();
      this.focusBackpackPanel();
      this.focusRightInfoPane();
      return;
    }

    if (normalizedKey === "c") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.focusEquipmentPanel();
      this.focusRightInfoPane();
      return;
    }

    if (normalizedKey === "h") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.setToolsTab("helper");
      this.focusToolsPanel();
      return;
    }

    if (normalizedKey === "b") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.setToolsTab("bestiary");
      this.focusToolsPanel();
      return;
    }

    if (normalizedKey === "k") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.focusStatusPanel();
      this.focusRightInfoPane();
      return;
    }

    if (event.repeat) {
      return;
    }

    const facingDirection = this.toFacingDirectionFromArrowKey(event.key);
    if (facingDirection) {
      event.preventDefault();
      this.setFacing(facingDirection);
      return;
    }

  }

  @HostListener("window:resize")
  onWindowResize(): void {
    this.uiLayoutService.clampAllToViewport();
  }

  onUiWindowBringToFront(id: string): void {
    if (!this.isArenaWindowId(id)) {
      return;
    }

    this.uiLayoutService.bringToFront(id);
  }

  onUiWindowClose(id: string): void {
    if (!this.isArenaWindowId(id)) {
      return;
    }

    if (id === ARENA_UI_WINDOW_IDS.backpack) {
      this.clearBackpackEquipMode();
    }

    this.uiLayoutService.close(id);
  }

  onUiWindowToggleMinimized(id: string): void {
    if (!this.isArenaWindowId(id)) {
      return;
    }

    this.uiLayoutService.toggleMinimized(id);
  }

  onUiWindowPositionChanged(event: UiWindowPositionChangedEvent): void {
    if (!this.isArenaWindowId(event.id)) {
      return;
    }

    this.uiLayoutService.setPosition(event.id, event.x, event.y);
  }

  onDockModuleCollapseToggleRequested(id: DockModuleId): void {
    const module = this.dockLayoutService.getModule(id);
    if (!module) {
      return;
    }

    if (module.isCollapsed) {
      this.dockLayoutService.expand(id);
      return;
    }

    this.dockLayoutService.collapse(id);
  }

  onDockModuleHideRequested(id: DockModuleId): void {
    this.dockLayoutService.hide(id);
    if (id === "backpack") {
      this.clearBackpackEquipMode();
    }
  }

  async onBackpackEquipRequested(request: BackpackEquipRequest): Promise<void> {
    const equipped = await this.equipItemFromInventory(request.instanceId, request.slot);
    if (equipped && request.slot === this.backpackEquipMode) {
      this.clearBackpackEquipMode();
    }
  }

  async onBackpackSalvageRequested(itemInstanceId: string): Promise<void> {
    await this.salvageItemFromInventory(itemInstanceId);
  }

  onLootConsoleItemClicked(itemId: string): void {
    this.clearBackpackEquipMode();
    this.focusBackpackPanel();
    this.focusRightInfoPane();
    this.backpackHighlightItemId = itemId;
    this.backpackHighlightRequestId += 1;
  }

  onEquipmentWeaponSlotActivated(): void {
    this.activateBackpackEquipMode("weapon");
  }

  private activateBackpackEquipMode(slot: Exclude<BackpackEquipMode, null>): void {
    this.backpackEquipMode = slot;
    this.backpackForcedFilter = this.toBackpackFilter(slot);
    this.focusBackpackPanel();
    this.focusRightInfoPane();
  }

  onCardChoiceSelected(cardId: string): void {
    if (this.cardChoiceRequestInFlight || this.isReplayInProgress) {
      return;
    }

    this.pendingCardSelectionId = cardId;
    void this.chooseCard(cardId);
  }

  onAssistEnabledToggle(enabled: boolean): void {
    this.updateAssistConfig({ enabled });
  }

  toggleAutoAssist(): void {
    this.updateAssistConfig({ enabled: !this.assistConfig.enabled });
  }

  toggleRunIntelPanel(): void {
    this.showRunIntelPanel = !this.showRunIntelPanel;
  }

  openBackpackPanel(): void {
    this.isBackpackPanelOpen = true;
  }

  toggleBackpackPanel(): void {
    this.isBackpackPanelOpen = !this.isBackpackPanelOpen;
  }

  onAssistAutoHealEnabledToggle(enabled: boolean): void {
    this.updateAssistConfig({ autoHealEnabled: enabled });
  }

  onAssistHealThresholdChange(value: number): void {
    this.updateAssistConfig({ healAtHpPercent: this.clampAssistPercent(value) });
  }

  onAssistAutoGuardEnabledToggle(enabled: boolean): void {
    this.updateAssistConfig({ autoGuardEnabled: enabled });
  }

  onAssistGuardThresholdChange(value: number): void {
    this.updateAssistConfig({ guardAtHpPercent: this.clampAssistPercent(value) });
  }

  onAssistAutoOffenseEnabledToggle(enabled: boolean): void {
    this.updateAssistConfig({ autoOffenseEnabled: enabled });
  }

  onAssistAutoSkillToggle(event: AssistSkillToggleChangedEvent): void {
    const nextAutoSkills = {
      ...this.assistConfig.autoSkills,
      [event.skillId]: event.enabled
    };
    this.updateAssistConfig({ autoSkills: nextAutoSkills });
  }

  setToolsTab(tabId: ToolsTabId): void {
    if (this.selectedToolsTab === tabId) {
      return;
    }

    this.selectedToolsTab = tabId;
    this.persistToolsTab();
  }

  setTopLeftTab(tabId: LeftTopTabId): void {
    this.selectedTopLeftTab = tabId;
  }

  openHotkeysModal(): void {
    this.isHotkeysModalOpen = true;
  }

  closeHotkeysModal(): void {
    this.isHotkeysModalOpen = false;
  }

  onHotkeysBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeHotkeysModal();
  }

  trackSkillSlotBySkillId(_index: number, slot: StatusSkillSlotViewModel): string {
    return slot.skillId;
  }

  trackEventFeedEntryById(_index: number, entry: EventFeedEntry): string {
    return entry.id;
  }

  formatEventTime(runTimeMs: number): string {
    return formatRunTimer(Math.max(0, Math.floor(runTimeMs)));
  }

  onArenaCanvasClick(event: MouseEvent): void {
    if (event.button !== 0 || !this.canIssueBattleCommand()) {
      return;
    }

    const command = this.resolvePointerCommandFromMouse("left_click", event);
    if (!command) {
      return;
    }

    this.enqueueCommand(command);
  }

  onArenaCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (!this.canIssueBattleCommand()) {
      return;
    }

    const command = this.resolvePointerCommandFromMouse("right_click", event);
    if (!command) {
      return;
    }

    this.enqueueCommand(command);
  }

  onArenaCanvasMouseMove(event: MouseEvent): void {
    if (!this.scene) {
      return;
    }

    const tile = this.resolveTileFromMouseEvent(event);
    const hoveredMobEntityId = tile
      ? hitTestMobAtTile(Object.values(this.scene.actorsById), tile)
      : null;
    this.setHoveredMobEntityId(hoveredMobEntityId);
  }

  onArenaCanvasMouseLeave(): void {
    this.setHoveredMobEntityId(null);
  }

  stepOnce(): void {
    void this.stepBattleSafe();
  }

  async startRun(): Promise<void> {
    this.isInRun = true;
    await this.beginNewRun({
      seedOverride: null,
      replayRecording: null
    });
  }

  async restartBattle(): Promise<void> {
    await this.beginNewRun({
      seedOverride: null,
      replayRecording: null
    });
  }

  async replayLastRun(): Promise<void> {
    const recording = this.lastRunRecording;
    if (!recording || !this.canReplayLastRun) {
      return;
    }

    if (this.accountState?.characters[recording.playerId]) {
      this.selectedCharacterId = recording.playerId;
    }

    this.isInRun = true;
    await this.beginNewRun({
      seedOverride: recording.battleSeed,
      replayRecording: this.cloneRunRecording(recording)
    });
  }

  get canPlayImportedReplay(): boolean {
    return this.importedReplayRecording !== null &&
      this.bootPhase === "ready_to_start" &&
      !this.accountStateRequestInFlight &&
      !this.accountRequestInFlight &&
      !this.battleRequestInFlight;
  }

  get importedReplaySummaryLabel(): string {
    const recording = this.importedReplayRecording;
    if (!recording) {
      return "No replay imported.";
    }

    const seedLabel = this.importedReplaySeedOverride ?? recording.battleSeed;
    return `Imported replay ready: seed ${seedLabel}, ${recording.commandBatches.length} ticks.`;
  }

  async exportReplayJson(): Promise<void> {
    const recording = this.lastRunRecording;
    if (!recording || recording.commandBatches.length === 0) {
      this.replayIoErrorMessage = "No recorded run with commands available to export.";
      this.replayIoMessage = "";
      return;
    }

    const replay = this.replayIoService.buildReplay({
      battleSeed: recording.battleSeed,
      difficultyPresetId: null,
      startOptions: {
        seedOverride: recording.battleSeed
      },
      commands: recording.commandBatches.map((batch) => ({
        tick: batch.tick,
        stepCount: batch.stepCount,
        commands: this.cloneStepCommands(batch.commands)
      })),
      cardChoices: recording.cardChoices.map((choice) => ({ ...choice })),
      configFingerprint: {
        stepDeltaMs: this.stepIntervalMs,
        gridW: this.scene?.columns ?? 7,
        gridH: this.scene?.rows ?? 7
      }
    });

    const jsonText = this.replayIoService.serializePrettyJson(replay);
    const copied = await copyTextBestEffort(jsonText);
    const replayId = (this.currentBattleId || recording.runId || "replay")
      .replace(/[^a-zA-Z0-9._-]+/g, "_");
    this.downloadJsonFile(`replay-${replayId}.json`, replay);

    this.replayIoErrorMessage = "";
    this.replayIoMessage = copied
      ? "Replay exported. JSON copied to clipboard and downloaded."
      : "Replay exported and downloaded. Clipboard copy failed.";
  }

  openReplayImportModal(): void {
    this.isReplayImportModalOpen = true;
    this.replayIoErrorMessage = "";
    this.replayIoMessage = "";
  }

  closeReplayImportModal(): void {
    this.isReplayImportModalOpen = false;
  }

  onReplayImportTextChanged(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.replayImportJsonText = target?.value ?? "";
    this.replayIoErrorMessage = "";
    this.replayIoMessage = "";
  }

  async onReplayImportFileSelected(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) {
      return;
    }

    try {
      this.replayImportJsonText = await this.replayIoService.readFileText(file);
      this.replayIoErrorMessage = "";
      this.replayIoMessage = `Loaded replay file: ${file.name}`;
    } catch (error) {
      this.replayIoMessage = "";
      this.replayIoErrorMessage = `Failed to read replay file: ${String(error)}`;
    } finally {
      if (target) {
        target.value = "";
      }
    }
  }

  validateImportedReplayJson(): void {
    this.resolveImportedReplayFromInput();
  }

  async playImportedReplay(): Promise<void> {
    const resolved = this.resolveImportedReplayFromInput();
    if (!resolved) {
      return;
    }

    const { recording, seedOverride } = resolved;
    if (this.accountState?.characters[recording.playerId]) {
      this.selectedCharacterId = recording.playerId;
    }

    this.isReplayImportModalOpen = false;
    this.isInRun = true;
    await this.beginNewRun({
      seedOverride,
      replayRecording: this.cloneRunRecording(recording)
    });
  }

  openPauseModal(): void {
    if (!this.canTogglePauseModal()) {
      return;
    }

    this.autoStepWasEnabledBeforePause = this.autoStepEnabled;
    this.isPauseModalOpen = true;
    this.autoStepEnabled = false;
    this.stopAutoStepLoop();

    void this.syncBackendPauseState(true);
  }

  async onPauseModalResume(): Promise<void> {
    if (!this.isPauseModalOpen) {
      return;
    }

    this.isPauseModalOpen = false;
    await this.syncBackendPauseState(false);

    if (this.autoStepWasEnabledBeforePause &&
        this.currentBattleId &&
        this.battleStatus === "started" &&
        !this.isDeathModalOpen)
    {
      this.autoStepEnabled = true;
      this.startOrRestartAutoStepLoop();
    }

    this.autoStepWasEnabledBeforePause = false;
  }

  async onPauseModalRestartRun(): Promise<void> {
    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    await this.restartBattle();
  }

  onPauseModalExitToPrep(): void {
    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    this.exitToArenaPrep();
  }

  async onDeathModalRestartRun(): Promise<void> {
    this.isDeathModalOpen = false;
    this.deathEndReason = null;
    this.isRunEnded = false;
    this.runEndReason = null;
    this.runEndedAtMs = null;
    await this.restartBattle();
  }

  onDeathModalExitToPrep(): void {
    this.exitToArenaPrep();
  }

  private async beginNewRun(options: BeginRunOptions): Promise<void> {
    this.stopAutoStepLoop();
    this.clearAssistConfigDebounce();
    this.clearShieldBreakPulse();
    this.clearLevelUpPulse();

    this.clearReplaySessionState();
    this.activeRunRecording = null;
    this.autoStepEnabled = false;
    this.pendingTickDebt = 0;
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    this.recentDamageNumbers = [];
    this.damageConsoleEntries = [];
    this.combatDetailLines = [];
    this.combatMetricSamples = [];
    this.combatEliteEvents = [];
    this.combatTotalDamageDealt = 0;
    this.combatTotalDamageTaken = 0;
    this.combatTotalHealingDone = 0;
    this.combatTotalShieldGained = 0;
    this.combatTotalShieldLost = 0;
    this.combatPeakHitDealt = 0;
    this.combatPeakHitTaken = 0;
    this.expConsoleEntries = [];
    this.eventFeedEntries = [];
    this.eventFeedSequence = 0;
    this.runEndedNarrativeLogged = false;
    this.economyMetricSamples = [];
    this.economyTotalXpGained = 0;
    this.economyTotalEchoFragments = 0;
    this.economyTotalPrimalCore = 0;
    this.runLootSourceMobCount = 0;
    this.runLootSourceChestCount = 0;
    this.runAwardedDropEventsCount = 0;
    this.runAwardedItemDropCount = 0;
    this.runPlayerMinHp = 0;
    this.runEchoFragmentsIncome = 0;
    this.runEchoFragmentsSpend = 0;
    this.runEchoFragmentsBalanceStart = Math.max(0, this.accountState?.echoFragmentsBalance ?? 0);
    this.runEchoFragmentsBalanceCurrent = this.runEchoFragmentsBalanceStart;
    this.runAwardScopeId = "";
    this.seenAwardedDropEventIds.clear();
    this.runAwardedSourceKeys.clear();
    this.runStartCraftedSnapshotByInstanceId = this.captureCurrentCraftedSnapshot();
    this.recentCommandResults = [];
    this.runResultCopyMessage = "";
    this.replayIoMessage = "";
    this.replayIoErrorMessage = "";
    this.isReplayImportModalOpen = false;
    this.assistConfig = this.buildDefaultAssistConfig();
    this.runStartBestiaryKills = { ...(this.accountState?.characters[this.selectedCharacterId]?.bestiaryKillsBySpecies ?? {}) };
    this.bestiaryEntries = [];
    this.pendingSpeciesChest = null;
    this.lastFocusedSpecies = null;
    this.isPauseModalOpen = false;
    this.isDeathModalOpen = false;
    this.deathEndReason = null;
    this.isRunEnded = false;
    this.runEndReason = null;
    this.runEndedAtMs = null;
    this.runTimeMs = 0;
    this.runDurationMs = DEFAULT_RUN_DURATION_MS;
    this.timeSurvivedMs = 0;
    this.runTotalKills = 0;
    this.runEliteKills = 0;
    this.runChestsOpened = 0;
    this.currentMobHpMult = 1;
    this.currentMobDmgMult = 1;
    this.scalingNormalHpMult = 1;
    this.scalingNormalDmgMult = 1;
    this.scalingEliteHpMult = 1;
    this.scalingEliteDmgMult = 1;
    this.scalingLvlFactor = 1;
    this.scalingLvlFactorEnabled = true;
    this.isAwaitingCardChoice = false;
    this.pendingCardChoiceId = null;
    this.offeredCards = [];
    this.selectedCards = [];
    this.cardChoiceSource = "unknown";
    this.pendingCardSelectionId = null;
    this.cardChoiceSourceByChoiceId.clear();
    this.cardChoiceLevelContextByChoiceId.clear();
    this.currentCardChoiceLevelContext = null;
    this.cardChoiceRequestInFlight = false;
    this.autoStepWasEnabledBeforeCardChoice = false;
    this.autoStepWasEnabledBeforePause = false;
    this.sentLootSourceKeys.clear();
    this.lootFeed = [];
    this.runLevel = RUN_INITIAL_LEVEL;
    this.runXp = RUN_INITIAL_XP;
    this.xpToNextLevel = this.computeRunXpToNextLevel(RUN_INITIAL_LEVEL);
    this.activeZoneIndex = this.selectedZoneIndex;
    this.expLogSequence = 0;
    this.bootErrorMessage = "";
    this.readyPulseSkillIds = new Set<string>();
    this.ui = {
      ...this.ui,
      player: {
        ...this.ui.player,
        globalCooldownRemainingMs: 0
      }
    };

    if (!this.canvasReady) {
      this.bootPhase = "measuring_canvas";
      const measured = await this.measureCanvasViewportWithRetry();
      if (!measured) {
        this.bootPhase = "error";
        this.battleStatus = "error";
        this.bootErrorMessage = "Failed to initialize arena: Canvas viewport could not be measured.";
        this.battleLog = this.bootErrorMessage;
        return;
      }

      this.syncCanvasSize();
    }

    try {
      this.bootPhase = "starting_battle";
      await this.startBattle(options.seedOverride);
      this.configureRunRecordingMode(options.replayRecording);
      this.bootPhase = "running";
      this.renderEnabled = true;
      this.autoStepEnabled = true;
      this.ensureRenderLoopStarted();
      this.startOrRestartAutoStepLoop();
    } catch (error) {
      this.bootPhase = "error";
      this.renderEnabled = false;
      this.autoStepEnabled = false;
      this.stopAutoStepLoop();
      this.battleStatus = "error";
      this.bootErrorMessage = `Failed to start run: ${String(error)}`;
      this.battleLog = this.bootErrorMessage;
      console.error("[ArenaPage] beginNewRun failed", error);
    }
  }

  private configureRunRecordingMode(replayRecording: RunRecording | null): void {
    this.activeRunRecording = null;
    if (replayRecording) {
      this.isReplayInProgress = true;
      const replayRunId = typeof replayRecording.runId === "string" ? replayRecording.runId.trim() : "";
      this.runAwardScopeId = replayRunId.length > 0
        ? replayRunId
        : `${replayRecording.playerId}:${replayRecording.battleSeed}`;
      this.replayCommandBatches = replayRecording.commandBatches.map((batch) => ({
        tick: batch.tick,
        stepCount: batch.stepCount ?? 1,
        commands: this.cloneStepCommands(batch.commands)
      }));
      this.replayCardChoices = replayRecording.cardChoices.map((choice) => ({ ...choice }));
      this.replayCommandBatchIndex = 0;
      this.replayCardChoiceIndex = 0;
      this.seenAwardedDropEventIds.clear();
      for (const dropEventId of replayRecording.awardedDropEventIds) {
        if (dropEventId.trim().length > 0) {
          this.seenAwardedDropEventIds.add(dropEventId.trim());
        }
      }
      this.battleLog = `Replay started: seed=${replayRecording.battleSeed}, ticks=${replayRecording.commandBatches.length}`;
      return;
    }

    const playerId =
      this.selectedCharacterId ||
      this.accountState?.activeCharacterId ||
      "player_demo";
    const recording: RunRecording = {
      runId: this.currentBattleId.trim().length > 0 ? this.currentBattleId.trim() : `run-${Date.now()}`,
      battleSeed: this.currentSeed,
      playerId,
      commandBatches: [],
      cardChoices: [],
      awardedDropEventIds: []
    };
    this.runAwardScopeId = recording.runId;
    this.activeRunRecording = recording;
    this.lastRunRecording = this.cloneRunRecording(recording);
  }

  private clearReplaySessionState(): void {
    this.isReplayInProgress = false;
    this.replayCommandBatches = [];
    this.replayCommandBatchIndex = 0;
    this.replayCardChoices = [];
    this.replayCardChoiceIndex = 0;
  }

  private cloneRunRecording(recording: RunRecording): RunRecording {
    return {
      runId: recording.runId,
      battleSeed: recording.battleSeed,
      playerId: recording.playerId,
      commandBatches: recording.commandBatches.map((batch) => ({
        tick: batch.tick,
        stepCount: batch.stepCount,
        commands: this.cloneStepCommands(batch.commands)
      })),
      cardChoices: recording.cardChoices.map((choice) => ({ ...choice })),
      awardedDropEventIds: [...recording.awardedDropEventIds]
    };
  }

  private resolveImportedReplayFromInput(): { recording: RunRecording; seedOverride: number } | null {
    const validation = this.replayIoService.tryParseAndValidate(this.replayImportJsonText);
    if (!validation.ok) {
      this.replayIoMessage = "";
      this.replayIoErrorMessage = validation.error;
      return null;
    }

    const replay = validation.replay;
    const playerId =
      this.selectedCharacterId ||
      this.accountState?.activeCharacterId ||
      "player_demo";
    const runId = `imported-${Date.now()}`;
    const recording: RunRecording = {
      runId,
      battleSeed: replay.battleSeed,
      playerId,
      commandBatches: replay.commands.map((batch) => ({
        tick: batch.tick,
        stepCount: batch.stepCount ?? 1,
        commands: this.cloneStepCommands(batch.commands)
      })),
      cardChoices: (replay.cardChoices ?? []).map((choice) => ({ ...choice })),
      awardedDropEventIds: []
    };

    const configuredSeedOverride = replay.startOptions?.seedOverride;
    const seedOverride = typeof configuredSeedOverride === "number"
      ? Math.floor(configuredSeedOverride)
      : replay.battleSeed;

    this.importedReplayRecording = recording;
    this.importedReplaySeedOverride = seedOverride;
    this.replayIoErrorMessage = "";
    this.replayIoMessage =
      `Replay valid: seed=${replay.battleSeed}, batches=${replay.commands.length}, step=${replay.configFingerprint.stepDeltaMs}ms.`;
    return { recording, seedOverride };
  }

  private cloneStepCommands(commands: ReadonlyArray<StepCommand>): StepCommand[] {
    return commands.map((command) => this.cloneStepCommand(command));
  }

  private cloneStepCommand(command: StepCommand): StepCommand {
    return {
      ...command,
      assistConfig: command.assistConfig
        ? {
            ...command.assistConfig,
            autoSkills: command.assistConfig.autoSkills
              ? { ...command.assistConfig.autoSkills }
              : command.assistConfig.autoSkills
          }
        : command.assistConfig
    };
  }

  private appendStepBatchToRecording(tick: number, commands: ReadonlyArray<StepCommand>, stepCount: number): void {
    if (!this.activeRunRecording) {
      return;
    }

    const nextRecording: RunRecording = {
      ...this.activeRunRecording,
      commandBatches: [
        ...this.activeRunRecording.commandBatches,
        {
          tick,
          stepCount,
          commands: this.cloneStepCommands(commands)
        }
      ]
    };
    this.activeRunRecording = nextRecording;
    this.lastRunRecording = this.cloneRunRecording(nextRecording);
  }

  private appendCardChoiceToRecording(tick: number, choiceId: string, selectedCardId: string): void {
    if (!this.activeRunRecording) {
      return;
    }

    const nextRecording: RunRecording = {
      ...this.activeRunRecording,
      cardChoices: [
        ...this.activeRunRecording.cardChoices,
        { tick, choiceId, selectedCardId }
      ]
    };
    this.activeRunRecording = nextRecording;
    this.lastRunRecording = this.cloneRunRecording(nextRecording);
  }

  private appendAwardedDropIdsToRecording(dropEventIds: ReadonlyArray<string>): void {
    if (!this.activeRunRecording || dropEventIds.length === 0) {
      return;
    }

    const existing = new Set(this.activeRunRecording.awardedDropEventIds);
    let changed = false;
    for (const dropEventId of dropEventIds) {
      const normalized = dropEventId.trim();
      if (normalized.length === 0 || existing.has(normalized)) {
        continue;
      }

      existing.add(normalized);
      changed = true;
    }

    if (!changed) {
      return;
    }

    const nextRecording: RunRecording = {
      ...this.activeRunRecording,
      awardedDropEventIds: [...existing]
    };
    this.activeRunRecording = nextRecording;
    this.lastRunRecording = this.cloneRunRecording(nextRecording);
  }

  private resolveCommandsForNextStepRequest(): { commands: StepCommand[]; stepCount: number } {
    if (!this.isReplayInProgress) {
      return { commands: this.dequeuePendingCommands(), stepCount: 1 };
    }

    const nextBatch = this.replayCommandBatches[this.replayCommandBatchIndex];
    if (!nextBatch) {
      return { commands: [], stepCount: 1 };
    }

    if (nextBatch.tick !== this.currentBattleTick) {
      this.stopReplayWithError(
        `Replay diverged at tick ${this.currentBattleTick}: expected recorded tick ${nextBatch.tick}.`
      );
      return { commands: [], stepCount: 1 };
    }

    this.replayCommandBatchIndex += 1;
    return { commands: this.cloneStepCommands(nextBatch.commands), stepCount: nextBatch.stepCount ?? 1 };
  }

  private async replayPendingCardChoiceIfNeeded(): Promise<void> {
    if (!this.isReplayInProgress || !this.isAwaitingCardChoice || !this.pendingCardChoiceId) {
      return;
    }

    const nextChoice = this.replayCardChoices[this.replayCardChoiceIndex];
    if (!nextChoice) {
      this.stopReplayWithError(`Replay diverged at tick ${this.currentBattleTick}: missing recorded card choice.`);
      return;
    }

    if (nextChoice.tick !== this.currentBattleTick || nextChoice.choiceId !== this.pendingCardChoiceId) {
      this.stopReplayWithError(
        `Replay diverged at tick ${this.currentBattleTick}: expected choice ${nextChoice.choiceId} for ${nextChoice.tick}.`
      );
      return;
    }

    const offeredCardIds = new Set(this.offeredCards.map((card) => card.id));
    if (!offeredCardIds.has(nextChoice.selectedCardId)) {
      this.stopReplayWithError(
        `Replay diverged at tick ${this.currentBattleTick}: card '${nextChoice.selectedCardId}' is not offered.`
      );
      return;
    }

    this.replayCardChoiceIndex += 1;
    await this.chooseCard(nextChoice.selectedCardId, { recordChoice: false });
  }

  private stopReplayWithError(message: string): void {
    this.clearReplaySessionState();
    this.autoStepEnabled = false;
    this.stopAutoStepLoop();
    this.battleLog = message;
  }

  exitBattle(): void {
    this.exitToArenaPrep();
  }

  get characterOptions(): CharacterState[] {
    const state = this.accountState;
    if (!state) {
      return [];
    }

    return Object.values(state.characters).sort((left, right) => left.characterId.localeCompare(right.characterId));
  }

  get selectedCharacter(): CharacterState | null {
    const state = this.accountState;
    if (!state || !this.selectedCharacterId) {
      return null;
    }

    return state.characters[this.selectedCharacterId] ?? null;
  }

  get selectedCharacterMaterials(): Array<{ itemId: string; quantity: number }> {
    const character = this.selectedCharacter;
    if (!character) {
      return [];
    }

    return Object.entries(character.inventory.materialStacks)
      .map(([itemId, quantity]) => ({ itemId, quantity }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId));
  }

  get selectedCharacterBestiaryRows(): Array<{ species: string; kills: number; primalCore: number }> {
    const character = this.selectedCharacter;
    if (!character) {
      return [];
    }

    const killsBySpecies = character.bestiaryKillsBySpecies ?? {};
    const primalCoreBySpecies = character.primalCoreBySpecies ?? {};
    const speciesIds = new Set<string>([
      ...Object.keys(killsBySpecies),
      ...Object.keys(primalCoreBySpecies)
    ]);

    return Array.from(speciesIds)
      .sort((left, right) => left.localeCompare(right))
      .map((species) => ({
        species,
        kills: Math.max(0, killsBySpecies[species] ?? 0),
        primalCore: Math.max(0, primalCoreBySpecies[species] ?? 0)
      }));
  }

  get selectedCharacterWeapons(): Array<OwnedEquipmentInstance & { equipped: boolean; itemName: string; weaponClass: string }> {
    const character = this.selectedCharacter;
    if (!character) {
      return [];
    }

    return Object.values(character.inventory.equipmentInstances)
      .map((instance) => {
        const definition = this.equipmentCatalogByItemId[instance.definitionId];
        return {
          ...instance,
          equipped: character.equipment.weaponInstanceId === instance.instanceId,
          itemName: this.resolveItemDisplayName(instance.definitionId),
          weaponClass: definition?.weaponClass ?? "weapon"
        };
      })
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  }

  get selectedCharacterWeaponLabel(): string {
    return this.resolveSelectedEquipmentLabel("weapon");
  }

  get selectedCharacterWeaponRarity(): string | null {
    return this.resolveSelectedEquipmentRarity("weapon");
  }

  async equipItemFromInventory(equipmentInstanceId: string, slot: "weapon"): Promise<boolean> {
    const character = this.selectedCharacter;
    if (!character) {
      return false;
    }

    this.accountRequestInFlight = true;
    try {
      const updatedCharacter = await this.accountStore.equipItem(character.characterId, slot, equipmentInstanceId);
      this.mergeCharacterIntoAccountState(updatedCharacter);
      this.syncAccountStateFromStore();
      return true;
    } catch (error) {
      this.battleLog = `equipItem failed: ${String(error)}`;
      return false;
    } finally {
      this.accountRequestInFlight = false;
    }
  }

  async salvageItemFromInventory(itemInstanceId: string): Promise<boolean> {
    const character = this.selectedCharacter;
    if (!character) {
      return false;
    }

    this.accountRequestInFlight = true;
    try {
      const salvaged = await this.accountStore.salvageItem(itemInstanceId);
      this.mergeCharacterIntoAccountState(salvaged.character, salvaged.echoFragmentsBalance);
      this.syncAccountStateFromStore();
      this.battleLog = `salvageItem success: item=${salvaged.salvagedItemInstanceId}; species=${salvaged.speciesId}; primalCoreAwarded=${salvaged.primalCoreAwarded}`;
      return true;
    } catch (error) {
      this.battleLog = `salvageItem failed: ${String(error)}`;
      return false;
    } finally {
      this.accountRequestInFlight = false;
    }
  }

  formatLootEntry(dropEvent: DropEvent): string {
    if (dropEvent.rewardKind === "sigil") {
      const speciesId = dropEvent.species?.trim() ?? "";
      const speciesById = this.accountStore.catalogs().speciesById;
      const speciesName = speciesId.length > 0
        ? (speciesById[speciesId]?.displayName ?? speciesId)
        : "Unknown";
      const sigilLevel = Math.max(1, Math.floor(dropEvent.sigilLevel ?? 1));
      const slotIndex = Math.max(1, Math.floor(dropEvent.slotIndex ?? 1));
      return `+1 Sigil - ${speciesName} Lv.${sigilLevel} (Slot ${slotIndex})`;
    }

    const itemName = this.resolveItemDisplayName(dropEvent.itemId);
    const quantity = Math.max(1, dropEvent.quantity ?? 1);
    return quantity > 1 ? `${itemName} x${quantity}` : itemName;
  }

  clearExpConsole(): void {
    this.expConsoleEntries = [];
  }

  async copyExpConsoleLines(limit = 50): Promise<void> {
    const selected = this.expConsoleEntries.slice(Math.max(0, this.expConsoleEntries.length - limit));
    const text = selected.map((entry) => `t${entry.tick} ${entry.message}`).join("\n");
    if (text.length === 0) {
      return;
    }

    await copyTextBestEffort(text);
  }

  async copyLastRunResultJson(): Promise<void> {
    const payload = this.runResultLogger.serializeLastResult();
    if (!payload) {
      this.runResultCopyMessage = "No run result available.";
      return;
    }

    const copied = await copyTextBestEffort(payload);
    this.runResultCopyMessage = copied ? "Last run result copied." : "Failed to copy last run result.";
  }

  async copyAllRunResultsJson(): Promise<void> {
    const payload = this.runResultLogger.serializeAllResults();
    if (!payload) {
      this.runResultCopyMessage = "No stored run results.";
      return;
    }

    const copied = await copyTextBestEffort(payload);
    this.runResultCopyMessage = copied ? "All run results copied." : "Failed to copy stored run results.";
  }

  exportAllRunResultsJson(): void {
    const results = this.runResultLogger.getAllResults();
    if (results.length === 0) {
      this.runResultCopyMessage = "No stored run results to export.";
      return;
    }

    this.downloadJsonFile("kaezan-runs-export.json", results);
  }

  trackExpEntryById(_index: number, entry: ExpConsoleEntry): string {
    return entry.id;
  }

  get showBootOverlay(): boolean {
    return this.bootPhase !== "ready_to_start" && this.bootPhase !== "running";
  }

  get bootOverlayText(): string {
    if (this.bootPhase === "measuring_canvas") {
      return "Measuring canvas...";
    }

    if (this.bootPhase === "resolving_manifest") {
      return "Loading asset manifest...";
    }

    if (this.bootPhase === "preloading_assets") {
      return "Preloading assets...";
    }

    if (this.bootPhase === "starting_battle") {
      return "Starting battle...";
    }

    if (this.bootPhase === "error") {
      return this.bootErrorMessage || "Failed to load arena.";
    }

    if (this.bootPhase === "ready_to_start") {
      return "Ready to start.";
    }

    return "Loading arena...";
  }

  getSkillButtonLabel(skillId: string, label: string): string {
    const remainingMs = this.getCooldownRemainingMs(skillId);
    if (remainingMs <= 0) {
      return label;
    }

    return `${label} (${formatCooldownSeconds(remainingMs)})`;
  }

  getSkillCooldownFraction(skillId: string): number {
    return computeCooldownFraction(this.getCooldownRemainingMs(skillId), this.getCooldownTotalMs(skillId));
  }

  isSkillBlockedByGlobalCooldown(skillId: string): boolean {
    if (this.ui.status !== "started") {
      return false;
    }

    return isReadyButBlockedByGcd(this.getCooldownRemainingMs(skillId), this.getGlobalCooldownRemainingMs());
  }

  getSkillGlobalCooldownLabel(skillId: string): string {
    if (!this.isSkillBlockedByGlobalCooldown(skillId)) {
      return "GCD";
    }

    return `GCD ${formatCooldownSeconds(this.getGlobalCooldownRemainingMs())}`;
  }

  formatCooldownSeconds(remainingMs: number): string {
    return formatCooldownSeconds(remainingMs);
  }

  isSkillReadyPulseActive(skillId: string): boolean {
    return this.readyPulseSkillIds.has(skillId);
  }

  onSkillPulseAnimationEnd(skillId: string): void {
    if (!this.readyPulseSkillIds.has(skillId)) {
      return;
    }

    const nextPulseIds = new Set(this.readyPulseSkillIds);
    nextPulseIds.delete(skillId);
    this.readyPulseSkillIds = nextPulseIds;
  }

  getGlobalCooldownRemainingMs(): number {
    return Math.max(0, this.ui.player.globalCooldownRemainingMs);
  }

  getGlobalCooldownTotalMs(): number {
    return Math.max(0, this.ui.player.globalCooldownTotalMs);
  }

  get isRunStarted(): boolean {
    return this.ui.status === "started" && !!this.currentBattleId;
  }

  get healingAmplifierHint(): string | null {
    const scene = this.scene;
    if (!scene) {
      return null;
    }

    const healingAmp = scene.activeBuffs.find((buff) => buff.buffId === "healing_amplifier");
    if (!healingAmp || healingAmp.remainingMs <= 0) {
      return null;
    }

    const seconds = Math.max(1, Math.ceil(healingAmp.remainingMs / 1000));
    return `Healing Amp: ${seconds}s`;
  }

  get altarCooldownHint(): string | null {
    if (this.altarCooldownRemainingMs <= 0) {
      return null;
    }

    const seconds = Math.max(1, Math.ceil(this.altarCooldownRemainingMs / 1000));
    return `Altar CD: ${seconds}s`;
  }

  get bestiaryFocusEntry(): ArenaBestiaryEntry | null {
    const focusSpecies = this.resolveBestiaryFocusSpecies();
    if (!focusSpecies) {
      return null;
    }

    return this.bestiaryEntries.find((entry) => entry.species === focusSpecies) ?? null;
  }

  get bestiaryFocusLabel(): string {
    const entry = this.bestiaryFocusEntry;
    if (!entry) {
      return "No focus";
    }

    return this.formatSpeciesLabel(entry.species);
  }

  get bestiaryProgressPercent(): number {
    const entry = this.bestiaryFocusEntry;
    if (!entry || entry.nextChestAtKills <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (entry.killsTotal / entry.nextChestAtKills) * 100));
  }

  get activeSpeciesChestHint(): string | null {
    const scene = this.scene;
    if (!scene) {
      return null;
    }

    const speciesChest = scene.activePois.find((poi) => poi.type === "species_chest");
    if (!speciesChest) {
      return null;
    }

    const seconds = Math.max(1, Math.ceil(speciesChest.remainingMs / 1000));
    const species = speciesChest.species ? this.formatSpeciesLabel(speciesChest.species) : "Unknown";
    return `Species Chest: ${species} (${seconds}s)`;
  }

  get pendingSpeciesChestHint(): string | null {
    if (!this.pendingSpeciesChest) {
      return null;
    }

    return `Pending Species Chest: ${this.formatSpeciesLabel(this.pendingSpeciesChest)}`;
  }

  get cardChoiceSourceLabel(): string {
    if (this.cardChoiceSource === "chest") {
      return "Chest Reward";
    }

    if (this.cardChoiceSource === "level_up") {
      return "Level Up Reward";
    }

    return "Reward Choice";
  }

  get cardChoiceTitle(): string {
    if (this.cardChoiceSource === "chest") {
      return "Treasure Unlocked";
    }

    if (this.cardChoiceSource === "level_up") {
      return "Choose Your Growth";
    }

    return "Choose a Card";
  }

  get cardChoiceSubtitle(): string {
    if (this.cardChoiceSource === "chest") {
      return "Pick one reward and continue the fight.";
    }

    if (this.cardChoiceSource === "level_up") {
      return "Level up secured. Choose the next power spike for your build.";
    }

    return "Simulation paused. Pick one to continue.";
  }

  get cardChoiceRunContextLabel(): string {
    return `Run Lv. ${Math.max(RUN_INITIAL_LEVEL, this.runLevel)}`;
  }

  get cardChoiceBuildContextLabel(): string {
    const count = this.selectedCards.length;
    return `Build: ${count} card${count === 1 ? "" : "s"} selected`;
  }

  get cardChoiceLevelContextLabel(): string | null {
    if (this.cardChoiceSource !== "level_up") {
      return null;
    }

    const context = this.currentCardChoiceLevelContext;
    if (!context) {
      return null;
    }

    return `Lv ${context.newLevel} · ${context.runXp}/${context.xpToNextLevel} XP`;
  }

  async pingBackend(): Promise<void> {
    if (this.pingInFlight) {
      return;
    }

    this.pingInFlight = true;
    const url = "/api/ping";
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
      const contentType = response.headers.get("content-type") ?? "unknown";
      const bodyText = await response.text();
      const bodyPreview = bodyText.slice(0, 200);

      if (!response.ok) {
        this.lastPingResult = `Ping failed: status=${response.status}; content-type=${contentType}; body=${bodyPreview}`;
        return;
      }

      this.lastPingResult = `Ping ok: status=${response.status}; content-type=${contentType}; body=${bodyPreview}`;
    } catch (error) {
      this.lastPingResult = `Ping failed: ${String(error)}`;
    } finally {
      this.pingInFlight = false;
    }
  }

  onAutoStepChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.autoStepEnabled = target?.checked ?? false;
    this.startOrRestartAutoStepLoop();
  }

  onStepIntervalInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const parsed = Number(target?.value ?? Number.NaN);
    this.stepIntervalMs = Number.isFinite(parsed) ? Math.max(50, Math.round(parsed)) : 250;
    this.startOrRestartAutoStepLoop();
  }

  onAssistEnabledChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.updateAssistConfig({ enabled: target?.checked ?? this.assistConfig.enabled });
  }

  onAssistAutoHealEnabledChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.updateAssistConfig({ autoHealEnabled: target?.checked ?? this.assistConfig.autoHealEnabled });
  }

  onAssistHealThresholdInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const parsed = Number(target?.value ?? Number.NaN);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.updateAssistConfig({ healAtHpPercent: this.clampAssistPercent(Math.round(parsed)) });
  }

  onAssistAutoGuardEnabledChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.updateAssistConfig({ autoGuardEnabled: target?.checked ?? this.assistConfig.autoGuardEnabled });
  }

  onAssistGuardThresholdInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const parsed = Number(target?.value ?? Number.NaN);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.updateAssistConfig({ guardAtHpPercent: this.clampAssistPercent(Math.round(parsed)) });
  }

  onAssistAutoOffenseEnabledChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.updateAssistConfig({ autoOffenseEnabled: target?.checked ?? this.assistConfig.autoOffenseEnabled });
  }

  onAssistSkillEnabledChange(skillId: AssistSkillId, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const nextAutoSkills = {
      ...this.assistConfig.autoSkills,
      [skillId]: target?.checked ?? this.assistConfig.autoSkills[skillId]
    };
    this.updateAssistConfig({ autoSkills: nextAutoSkills });
  }

  private setFacing(dir: FacingDirection): void {
    if (!this.canIssueBattleCommand()) {
      return;
    }

    this.enqueueSetFacing(dir);
  }

  private async stepBattleSafe(liveStepCount = 1): Promise<void> {
    if (
      this.battleRequestInFlight ||
      this.cardChoiceRequestInFlight ||
      !this.currentBattleId ||
      this.isTerminalBattleStatus(this.battleStatus)
    ) {
      return;
    }

    if (this.isAwaitingCardChoice) {
      await this.replayPendingCardChoiceIfNeeded();
      return;
    }

    if (this.isReplayInProgress && this.replayCommandBatchIndex >= this.replayCommandBatches.length) {
      const replayedTicks = this.replayCommandBatchIndex;
      this.clearReplaySessionState();
      this.autoStepEnabled = false;
      this.stopAutoStepLoop();
      this.battleLog = `Replay finished: ${replayedTicks} recorded ticks applied.`;
      return;
    }

    const requestTick = this.currentBattleTick;
    const { commands: commandsToSend, stepCount: replayStepCount } = this.resolveCommandsForNextStepRequest();
    const effectiveStepCount = this.isReplayInProgress ? replayStepCount : liveStepCount;
    if (!this.isReplayInProgress) {
      this.appendStepBatchToRecording(requestTick, commandsToSend, effectiveStepCount);
    }

    let shouldReplayCardChoice = false;
    this.runInAngularZone(() => {
      this.battleRequestInFlight = true;
    });
    try {
      const response = await this.battleApi.stepBattle({
        battleId: this.currentBattleId,
        clientTick: this.currentBattleTick,
        stepCount: effectiveStepCount > 1 ? effectiveStepCount : undefined,
        commands: commandsToSend
      });
      const battleIdForLoot = response.battleId ?? this.currentBattleId;
      const lootSources = this.extractLootSourcesFromSnapshot(response);

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? this.currentBattleId;
        this.currentBattleTick = response.tick ?? this.currentBattleTick + 1;
        this.currentSeed = response.seed ?? this.currentSeed;
        this.applyStepDeltaFromSnapshot(response);
        this.battleStatus = response.battleStatus ?? this.battleStatus;
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? this.currentFacingDirection;
        this.applyGameOverStateFromSnapshot(response);
        this.applyBattlePayload(response);
        this.runResultLogger.recordStep(response);
        this.tryFinalizeRunResult(response);
        this.appendCommandResultLogs(response.commandResults, commandsToSend);
        this.syncUiMetaState();
        this.battleLog = JSON.stringify(response, null, 2);
        if (this.isAwaitingCardChoice && !this.isReplayInProgress) {
          this.autoStepWasEnabledBeforeCardChoice = this.autoStepEnabled;
          this.autoStepEnabled = false;
          this.stopAutoStepLoop();
        }

        if (this.isAwaitingCardChoice && this.isReplayInProgress) {
          shouldReplayCardChoice = true;
        }

        if (this.isTerminalBattleStatus(this.battleStatus)) {
          this.autoStepEnabled = false;
          this.stopAutoStepLoop();
        }
      });

      if (!this.isReplayInProgress && battleIdForLoot && lootSources.length > 0) {
        await this.awardLootSources(battleIdForLoot, lootSources);
      }
    } catch (error) {
      this.runInAngularZone(() => {
        if (!this.isReplayInProgress) {
          this.requeueCommands(commandsToSend);
        }
        this.pendingTickDebt = 0;
        this.battleStatus = "error";
        this.syncUiMetaState();
        this.battleLog = `stepBattle failed: ${String(error)}`;
        this.autoStepEnabled = false;
        this.stopAutoStepLoop();
      });
      console.error("[ArenaPage] stepBattle failed", error);
    } finally {
      this.runInAngularZone(() => {
        this.battleRequestInFlight = false;
      });
    }

    if (shouldReplayCardChoice) {
      await this.replayPendingCardChoiceIfNeeded();
    }
  }

  private async chooseCard(
    selectedCardId: string,
    options: Readonly<{ recordChoice: boolean }> = { recordChoice: true }
  ): Promise<void> {
    if (
      this.cardChoiceRequestInFlight ||
      this.battleRequestInFlight ||
      !this.currentBattleId ||
      !this.isAwaitingCardChoice ||
      !this.pendingCardChoiceId ||
      this.isTerminalBattleStatus(this.battleStatus)
    ) {
      this.pendingCardSelectionId = null;
      return;
    }

    const request: ChooseCardRequest = {
      battleId: this.currentBattleId,
      choiceId: this.pendingCardChoiceId,
      selectedCardId
    };

    this.runInAngularZone(() => {
      this.cardChoiceRequestInFlight = true;
    });

    let shouldResumeAutoStep = false;
    try {
      if (options.recordChoice) {
        this.appendCardChoiceToRecording(
          this.currentBattleTick,
          request.choiceId,
          selectedCardId
        );
      }

      const response = await this.battleApi.chooseCard(request);
      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? this.currentBattleId;
        this.currentBattleTick = response.tick ?? this.currentBattleTick;
        this.currentSeed = response.seed ?? this.currentSeed;
        this.applyStepDeltaFromSnapshot(response);
        this.battleStatus = response.battleStatus ?? this.battleStatus;
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? this.currentFacingDirection;
        this.applyGameOverStateFromSnapshot(response);
        this.applyBattlePayload(response);
        this.runResultLogger.recordStep(response);
        this.runResultLogger.recordCardChosen(selectedCardId);
        this.tryFinalizeRunResult(response);
        this.syncUiMetaState();
        this.battleLog = JSON.stringify(response, null, 2);
      });

      shouldResumeAutoStep =
        !this.isAwaitingCardChoice &&
        this.autoStepWasEnabledBeforeCardChoice &&
        !this.isPauseModalOpen &&
        !this.isDeathModalOpen &&
        this.battleStatus === "started";
    } catch (error) {
      this.runInAngularZone(() => {
        this.battleLog = `choose_card failed: ${String(error)}`;
      });
      console.error("[ArenaPage] choose_card failed", error);
    } finally {
      this.runInAngularZone(() => {
        this.cardChoiceRequestInFlight = false;
        this.pendingCardSelectionId = null;
        if (shouldResumeAutoStep) {
          this.autoStepEnabled = true;
          this.startOrRestartAutoStepLoop();
        }

        if (!this.isAwaitingCardChoice) {
          this.autoStepWasEnabledBeforeCardChoice = false;
        }
      });
    }
  }

  private async startBattle(seedOverride: number | null): Promise<void> {
    if (this.battleRequestInFlight) {
      return;
    }

    this.runInAngularZone(() => {
      this.battleRequestInFlight = true;
    });
    try {
      const playerId =
        this.selectedCharacterId ||
        this.accountState?.activeCharacterId ||
        "player_demo";
      const request: StartBattleRequest & { seedOverride?: number | null } = {
        arenaId: "arena_demo",
        playerId,
        zoneIndex: this.selectedZoneIndex
      };
      if (typeof seedOverride === "number") {
        request.seed = seedOverride;
        request.seedOverride = seedOverride;
      }

      const response = await this.battleApi.startBattle(request);

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? "";
        this.currentBattleTick = response.tick ?? 0;
        this.currentSeed = response.seed ?? 0;
        this.applyStepDeltaFromSnapshot(response);
        this.battleStatus = response.battleStatus ?? "started";
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? "up";
        this.applyGameOverStateFromSnapshot(response);
        this.recentDamageNumbers = [];
        this.recentCommandResults = [];
        this.applyActorStates(response.actors);
        this.updatePlayerHudFromActorStates(response.actors);
        this.applySkillStates(response.skills);
        this.applyDecals(response.decals);
        this.applyRangedConfigFromSnapshot(response);
        this.applyTargetingStateFromSnapshot(response);
        this.applyAssistConfigFromSnapshot(response);
        this.applyActiveBuffsFromSnapshot(response);
        this.applyActivePoisFromSnapshot(response);
        this.applyBestiaryFromSnapshot(response);
        this.updateGlobalCooldownFromSnapshot(response);
        this.updateAltarCooldownFromSnapshot(response);
        this.applyRunProgressFromSnapshot(response);
        this.applyScalingTelemetryFromSnapshot(response);
        this.applyCardChoiceStateFromSnapshot(response);
        this.applyUltimateFromSnapshot(response);
        this.applyZoneFromSnapshot(response);
        this.runResultLogger.startRun({
          battleSeed: this.currentSeed,
          stepDeltaMs: this.stepIntervalMs,
          snapshot: response
        });
        this.tryFinalizeRunResult(response);
        this.syncUiMetaState();
        this.battleLog = JSON.stringify(response, null, 2);
        this.activeFxCount = this.getActiveFxCount(this.scene);
      });
    } catch (error) {
      this.runInAngularZone(() => {
        this.battleStatus = "error";
        this.syncUiMetaState();
        this.battleLog = String(error);
      });
      console.error("[ArenaPage] startBattle failed", error);
      throw error;
    } finally {
      this.runInAngularZone(() => {
        this.battleRequestInFlight = false;
      });
    }
  }

  private async loadAccountState(forceRefresh = false): Promise<void> {
    this.accountStateRequestInFlight = true;
    this.accountLoadErrorMessage = "";
    try {
      if (forceRefresh) {
        await this.accountStore.refresh();
      } else {
        await this.accountStore.load();
      }
      this.syncAccountStateFromStore();
      this.accountLoaded = true;
    } catch (error) {
      this.accountLoaded = false;
      const storeError = this.accountStore.error();
      this.accountLoadErrorMessage = `Failed to load account: ${storeError ?? String(error)}`;
      this.battleLog = this.accountLoadErrorMessage;
    } finally {
      this.accountStateRequestInFlight = false;
    }
  }

  private syncAccountStateFromStore(): void {
    const account = this.accountStore.state();
    if (!account) {
      return;
    }

    const catalogs = this.accountStore.catalogs();
    this.applyAccountState(account, catalogs.itemCatalog, catalogs.equipmentCatalog);
  }

  private applyAccountState(
    account: AccountState,
    itemCatalog: ReadonlyArray<ItemDefinition> | null = null,
    equipmentCatalog: ReadonlyArray<EquipmentDefinition> | null = null
  ): void {
    this.accountState = account;
    if (itemCatalog) {
      this.itemCatalogById = {};
      for (const item of itemCatalog) {
        this.itemCatalogById[item.itemId] = item;
      }
    }

    if (equipmentCatalog) {
      this.equipmentCatalogByItemId = {};
      for (const definition of equipmentCatalog) {
        this.equipmentCatalogByItemId[definition.itemId] = definition;
      }
    }

    if (!this.selectedCharacterId || !account.characters[this.selectedCharacterId]) {
      this.selectedCharacterId = this.resolvePreferredCharacterId(account);
    }

    this.syncRunEchoBalance(account.echoFragmentsBalance);
  }

  private mergeCharacterIntoAccountState(character: CharacterState, echoFragmentsBalance?: number): void {
    if (!this.accountState) {
      return;
    }

    const nextCharacters = {
      ...this.accountState.characters,
      [character.characterId]: character
    };

    const nextEchoBalance =
      typeof echoFragmentsBalance === "number"
        ? Math.max(0, Math.floor(echoFragmentsBalance))
        : this.accountState.echoFragmentsBalance;

    this.accountState = {
      ...this.accountState,
      echoFragmentsBalance: nextEchoBalance,
      characters: nextCharacters
    };
    this.syncRunEchoBalance(nextEchoBalance);
  }

  private resolveItemDisplayName(itemId: string): string {
    return this.itemCatalogById[itemId]?.displayName ?? itemId;
  }

  private captureCurrentCraftedSnapshot(): Map<string, RunEquipmentSnapshot> {
    const snapshot = new Map<string, RunEquipmentSnapshot>();
    const character = this.selectedCharacter;
    if (!character) {
      return snapshot;
    }

    for (const [instanceId, equipment] of Object.entries(character.inventory.equipmentInstances)) {
      if (!CRAFTED_EQUIPMENT_ITEM_IDS.has(equipment.definitionId)) {
        continue;
      }

      snapshot.set(instanceId, {
        definitionId: equipment.definitionId,
        rarity: this.normalizeEquipmentRarity(equipment.rarity)
      });
    }

    return snapshot;
  }

  private buildCraftedSummaryPreview(
    instanceIds: ReadonlyArray<string>,
    snapshot: ReadonlyMap<string, RunEquipmentSnapshot>
  ): string {
    if (instanceIds.length === 0) {
      return "";
    }

    const labels = instanceIds
      .slice(0, 2)
      .map((instanceId) => {
        const entry = snapshot.get(instanceId);
        if (!entry) {
          return instanceId;
        }

        const rarityLabel = entry.rarity ? ` (${entry.rarity})` : "";
        return `${this.resolveItemDisplayName(entry.definitionId)}${rarityLabel}`;
      });

    const suffix = instanceIds.length > labels.length ? ` +${instanceIds.length - labels.length} more` : "";
    return `${labels.join(", ")}${suffix}`;
  }

  private normalizeEquipmentRarity(rarity: string | null | undefined): string | null {
    if (!rarity || rarity.trim().length === 0) {
      return null;
    }

    return rarity.trim().toLowerCase();
  }

  private resolveRarityRank(rarity: string | null): number {
    if (!rarity) {
      return 0;
    }

    if (rarity === "common") {
      return 1;
    }

    if (rarity === "rare") {
      return 2;
    }

    if (rarity === "epic") {
      return 3;
    }

    if (rarity === "legendary") {
      return 4;
    }

    if (rarity === "ascendant") {
      return 5;
    }

    return 0;
  }

  private syncRunEchoBalance(nextBalance: number): void {
    const safeNextBalance = Math.max(0, Math.floor(nextBalance));
    if (!this.isInRun) {
      this.runEchoFragmentsBalanceCurrent = safeNextBalance;
      return;
    }

    const delta = safeNextBalance - this.runEchoFragmentsBalanceCurrent;
    if (delta > 0) {
      this.runEchoFragmentsIncome += delta;
    } else if (delta < 0) {
      this.runEchoFragmentsSpend += Math.abs(delta);
    }

    this.runEchoFragmentsBalanceCurrent = safeNextBalance;
  }

  private resolvePreferredCharacterId(account: AccountState): string {
    if (account.activeCharacterId && account.characters[account.activeCharacterId]) {
      return account.activeCharacterId;
    }

    const sorted = Object.values(account.characters).sort((left, right) => {
      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
    });

    return sorted[0]?.characterId ?? "";
  }

  private resolveEquippedWeaponName(character: CharacterState): string {
    return this.resolveEquippedItemLabel(character, "weapon");
  }

  private resolveStatusModifier(candidateKeys: ReadonlyArray<string>): string {
    const definition = this.resolveSelectedWeaponDefinition();
    if (!definition) {
      return "--";
    }

    const modifiers = definition.gameplayModifiers ?? {};
    const normalizedToOriginal = new Map<string, string>();
    for (const key of Object.keys(modifiers)) {
      normalizedToOriginal.set(this.normalizeModifierKey(key), key);
    }

    for (const candidate of candidateKeys) {
      const originalKey = normalizedToOriginal.get(this.normalizeModifierKey(candidate));
      if (!originalKey) {
        continue;
      }

      const value = modifiers[originalKey];
      if (value && value.trim().length > 0) {
        return value;
      }
    }

    return "--";
  }

  private resolveSelectedWeaponDefinition(): EquipmentDefinition | null {
    return this.resolveSelectedEquipmentDefinition("weapon");
  }

  private resolveSelectedEquipmentLabel(slot: "weapon"): string {
    const character = this.selectedCharacter;
    if (!character) {
      return "None";
    }

    return this.resolveEquippedItemLabel(character, slot);
  }

  private resolveSelectedEquipmentRarity(slot: "weapon"): string | null {
    const character = this.selectedCharacter;
    if (!character) {
      return null;
    }

    const instanceId = this.resolveEquippedInstanceId(character, slot);
    if (!instanceId) {
      return null;
    }

    const equippedInstance = character.inventory.equipmentInstances[instanceId];
    if (!equippedInstance) {
      return null;
    }

    const normalizedInstanceRarity = equippedInstance?.rarity?.trim().toLowerCase();
    if (normalizedInstanceRarity && normalizedInstanceRarity.length > 0) {
      return normalizedInstanceRarity;
    }

    const itemRarity = this.itemCatalogById[equippedInstance.definitionId]?.rarity ?? "";
    const normalizedItemRarity = itemRarity.trim().toLowerCase();
    return normalizedItemRarity.length > 0 ? normalizedItemRarity : null;
  }

  private resolveSelectedEquipmentDefinition(slot: "weapon"): EquipmentDefinition | null {
    const character = this.selectedCharacter;
    if (!character) {
      return null;
    }

    const instanceId = this.resolveEquippedInstanceId(character, slot);
    if (!instanceId) {
      return null;
    }

    const equippedInstance = character.inventory.equipmentInstances[instanceId];
    if (!equippedInstance) {
      return null;
    }

    const definition = this.equipmentCatalogByItemId[equippedInstance.definitionId] ?? null;
    if (!definition) {
      return null;
    }

    return definition.slot.toLowerCase() === slot ? definition : null;
  }

  private resolveEquippedItemLabel(character: CharacterState, slot: "weapon"): string {
    const instanceId = this.resolveEquippedInstanceId(character, slot);
    if (!instanceId) {
      return "None";
    }

    const equipped = character.inventory.equipmentInstances[instanceId];
    if (!equipped) {
      return instanceId;
    }

    return this.resolveItemDisplayName(equipped.definitionId);
  }

  private resolveEquippedInstanceId(character: CharacterState, slot: "weapon"): string | null {
    if (slot === "weapon") {
      return character.equipment.weaponInstanceId ?? null;
    }

    return null;
  }

  private normalizeModifierKey(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private extractLootSourcesFromSnapshot(response: StepBattleResponse): DropSource[] {
    const events = response.events ?? [];
    const fallbackTick = response.tick ?? this.currentBattleTick;
    const sources: DropSource[] = [];

    for (const event of events) {
      const value = event as Record<string, unknown>;
      const eventType = this.readString(value["type"]);
      if (!eventType) {
        continue;
      }

      if (eventType === "death") {
        const entityType = this.readString(value["entityType"]);
        const sourceId = this.readString(value["entityId"]);
        if (!sourceId || entityType !== "mob") {
          continue;
        }

        const tick = this.readNumber(value["tickIndex"]) ?? fallbackTick;
        sources.push({
          tick,
          sourceType: "mob",
          sourceId,
          species: mapMobTypeToSpecies(this.readNumber(value["mobType"]))
        });
        continue;
      }

      if (eventType === "poi_interacted") {
        const poiType = this.readString(value["poiType"]);
        const poiId = this.readString(value["poiId"]);
        if (!poiId || (poiType !== "chest" && poiType !== "species_chest")) {
          continue;
        }

        sources.push({
          tick: fallbackTick,
          sourceType: "chest",
          sourceId: poiId,
          species: this.readString(value["species"]) ?? null
        });
      }
    }

    return sources;
  }

  private async awardLootSources(battleId: string, sources: DropSource[]): Promise<void> {
    if (this.isReplayInProgress) {
      return;
    }

    const character = this.selectedCharacter;
    if (!character || sources.length === 0) {
      return;
    }

    const awardScopeId = this.runAwardScopeId.trim().length > 0 ? this.runAwardScopeId : battleId;
    const dedupedSources = dedupeDropSources(awardScopeId, sources, this.sentLootSourceKeys);
    if (dedupedSources.length === 0) {
      return;
    }

    const dedupedKeys = dedupedSources.map((source) => buildDropSourceKey(awardScopeId, source));
    try {
      const response = await this.accountStore.awardDrops(character.characterId, battleId, dedupedSources, awardScopeId);

      const newlyAwarded = response.awarded.filter((drop) => {
        if (this.seenAwardedDropEventIds.has(drop.dropEventId)) {
          return false;
        }

        this.seenAwardedDropEventIds.add(drop.dropEventId);
        return true;
      });
      this.runInAngularZone(() => {
        this.mergeCharacterIntoAccountState(response.character);
        this.syncAccountStateFromStore();
        this.runResultLogger.recordAwardDrops(newlyAwarded, response.character);
        this.recordRunLootSourcesFromRequest(dedupedSources);
        if (newlyAwarded.length > 0) {
          this.lootFeed = [...newlyAwarded, ...this.lootFeed].slice(0, 50);
          this.recordEconomyMetricsFromDrops(newlyAwarded);
          this.recordRunPayoutFromAwardedDrops(newlyAwarded);
        }
      });
    } catch (error) {
      for (const key of dedupedKeys) {
        this.sentLootSourceKeys.delete(key);
      }

      this.runInAngularZone(() => {
        this.battleLog = `awardDrops failed: ${String(error)}`;
      });
    }
  }

  private recordRunPayoutFromAwardedDrops(awarded: ReadonlyArray<DropEvent>): void {
    if (awarded.length === 0) {
      return;
    }

    if (!this.isReplayInProgress) {
      this.appendAwardedDropIdsToRecording(awarded.map((drop) => drop.dropEventId));
    }

    this.runAwardedDropEventsCount += awarded.length;
    this.runAwardedItemDropCount += awarded.filter((drop) => drop.rewardKind === "item").length;

    for (const drop of awarded) {
      if (drop.rewardKind === "echo_fragments") {
        const quantity = Math.max(0, Math.floor(drop.quantity ?? 0));
        this.runEchoFragmentsIncome += quantity;
        this.runEchoFragmentsBalanceCurrent += quantity;
      }
    }
  }

  private recordRunLootSourcesFromRequest(sources: ReadonlyArray<DropSource>): void {
    for (const source of sources) {
      const sourceType = source.sourceType === "chest" ? "chest" : "mob";
      const sourceKey = `${sourceType}:${source.tick}:${source.sourceId}`;
      if (this.runAwardedSourceKeys.has(sourceKey)) {
        continue;
      }

      this.runAwardedSourceKeys.add(sourceKey);
      if (sourceType === "chest") {
        this.runLootSourceChestCount += 1;
      } else {
        this.runLootSourceMobCount += 1;
      }
    }
  }

  private applyBattlePayload(response: StepBattleResponse): void {
    if (!this.scene) {
      return;
    }

    const actors = this.toEngineActors(response.actors);
    const skills = this.toEngineSkills(response.skills);
    const decals = this.toEngineDecals(response.decals);
    this.applyRangedConfigFromSnapshot(response);
    const events = this.toEngineEvents(response.events);
    const applied = this.engine.applyBattleStep(this.scene, actors, skills, decals, events);

    this.scene = applied.scene;
    this.applyTargetingStateFromSnapshot(response);
    this.applyAssistConfigFromSnapshot(response);
    this.applyActiveBuffsFromSnapshot(response);
    this.applyActivePoisFromSnapshot(response);
    this.applyBestiaryFromSnapshot(response);
    this.updatePlayerHudFromActorStates(response.actors);
    this.updateVisibleSkills(skills);
    this.updateGlobalCooldownFromSnapshot(response);
    this.updateAltarCooldownFromSnapshot(response);
    this.applyRunProgressFromSnapshot(response);
    this.applyScalingTelemetryFromSnapshot(response);
    this.applyCardChoiceStateFromSnapshot(response);
    this.updateCardChoicePresentationFromEvents(response.events);
    this.applyUltimateFromSnapshot(response);
    this.applyZoneFromSnapshot(response);
    this.activeFxCount = this.getActiveFxCount(this.scene);
    this.appendDamageLogs(applied.damageNumbers);
    this.appendDamageConsoleLogs(applied.damageNumbers);
  }

  private applyActorStates(actors: StartBattleResponse["actors"]): void {
    if (!this.scene) {
      return;
    }

    this.scene = this.engine.applyActorStates(this.scene, this.toEngineActors(actors));
  }

  private applySkillStates(skills: StartBattleResponse["skills"]): void {
    if (!this.scene) {
      return;
    }

    const mappedSkills = this.toEngineSkills(skills);
    this.scene = this.engine.applySkillStates(this.scene, mappedSkills);
    this.updateVisibleSkills(mappedSkills);
  }

  private applyDecals(decals: StartBattleResponse["decals"] | StepBattleResponse["decals"]): void {
    if (!this.scene) {
      return;
    }

    this.scene = this.engine.applyDecals(this.scene, this.toEngineDecals(decals));
  }

  private applyTargetingStateFromSnapshot(
    snapshot: Pick<StartBattleResponse, "effectiveTargetEntityId" | "lockedTargetEntityId" | "groundTargetPos">
      | Pick<StepBattleResponse, "effectiveTargetEntityId" | "lockedTargetEntityId" | "groundTargetPos">
  ): void {
    if (!this.scene) {
      return;
    }

    this.scene = this.engine.applyTargetingState(
      this.scene,
      this.readString(snapshot.effectiveTargetEntityId) ?? null,
      this.readString(snapshot.lockedTargetEntityId) ?? null,
      this.toGroundTargetPos(snapshot.groundTargetPos)
    );
  }

  private applyAssistConfigFromSnapshot(
    snapshot: Pick<StartBattleResponse, "assistConfig"> | Pick<StepBattleResponse, "assistConfig">
  ): void {
    const mapped = this.toAssistConfig(snapshot.assistConfig);
    if (!mapped) {
      return;
    }

    this.assistConfig = mapped;
  }

  private applyRangedConfigFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    if (!this.scene) {
      return;
    }

    const record = snapshot as Record<string, unknown>;
    const mapped = this.toEngineRangedConfig(record["rangedConfig"]);
    if (!mapped) {
      return;
    }

    this.scene = this.engine.applyRangedConfig(this.scene, mapped);
  }

  private applyActivePoisFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    if (!this.scene) {
      return;
    }

    const activePois = this.toEnginePois((snapshot as Record<string, unknown>)["activePois"]);
    this.scene = this.engine.applyActivePois(this.scene, activePois);
  }

  private applyActiveBuffsFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    if (!this.scene) {
      return;
    }

    const activeBuffs = this.toEngineBuffs((snapshot as Record<string, unknown>)["activeBuffs"]);
    this.scene = this.engine.applyActiveBuffs(this.scene, activeBuffs);
  }

  private applyBestiaryFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const record = snapshot as Record<string, unknown>;
    this.bestiaryEntries = this.toBestiaryEntries(record["bestiary"]);
    this.pendingSpeciesChest = this.readString(record["pendingSpeciesChest"]) ?? null;
    this.updateBestiaryFocusSpecies();
  }

  private appendDamageLogs(damageEvents: ReadonlyArray<DamageNumberInstance>): void {
    if (damageEvents.length === 0) {
      return;
    }

    const nextLines = damageEvents.map(
      (event) => {
        const amountLabel = event.isHeal || (event.isShieldChange && event.shieldChangeDirection === "gain")
          ? `+${event.amount}`
          : `-${event.amount}`;
        return `t${this.currentBattleTick} ${event.actorId} ${amountLabel}${event.isCrit ? " (CRIT)" : ""}`;
      }
    );

    this.recentDamageNumbers = [...nextLines, ...this.recentDamageNumbers].slice(0, 8);
  }

  private appendDamageConsoleLogs(damageEvents: ReadonlyArray<DamageNumberInstance>): void {
    const hasStructuredMetrics = this.recordCombatMetricsFromDamageEvents(damageEvents);
    if (damageEvents.length === 0) {
      if (!hasStructuredMetrics && this.combatMetricSamples.length === 0) {
        this.recordCombatMetricsFromLegacyLines(this.recentDamageNumbers);
      }
      return;
    }

    const mapped = mapDamageNumbersToConsoleEntries(damageEvents, this.currentBattleTick);
    this.damageConsoleEntries = mergeDamageConsoleEntries(this.damageConsoleEntries, mapped, 500);
    const detailLines = mapped.map((entry) => `t${entry.tick} ${entry.message}`);
    this.combatDetailLines = [...this.combatDetailLines, ...detailLines].slice(-COMBAT_DETAILS_MAX_LINES);
  }

  private appendCommandResultLogs(
    commandResults: StepBattleResponse["commandResults"],
    sentCommands: ReadonlyArray<StepCommand>
  ): void {
    const safeResults = commandResults ?? [];
    if (safeResults.length === 0) {
      return;
    }

    const tickPrefix = `t${this.currentBattleTick}`;
    const lines: string[] = [];

    for (const result of safeResults) {
      const typedResult = result as ApiCommandResult;
      const index = typeof typedResult.index === "number" ? typedResult.index : -1;
      const command = index >= 0 && index < sentCommands.length ? sentCommands[index] : undefined;
      const commandType = this.readString(typedResult.type) ?? command?.type ?? "unknown_command";
      const rawReason = this.readString(typedResult.reason) ?? "unknown_reason";
      const reason = this.toFriendlyCommandReason(rawReason);
      const isOk = typedResult.ok === true;

      if (commandType === "set_facing") {
        const direction = this.readString(command?.dir) ?? "unknown_direction";
        lines.push(
          isOk
            ? `${tickPrefix} Facing set to ${direction}`
            : `${tickPrefix} Set facing ${direction} failed: ${reason}`
        );
        continue;
      }

      if (commandType === "interact_poi") {
        const poiId = this.readString((command as Record<string, unknown> | undefined)?.["poiId"]) ?? "unknown_poi";
        const interactReason = rawReason === "cooldown" ? "altar cooldown active" : reason;
        lines.push(
          isOk
            ? `${tickPrefix} Interact ${poiId} ok`
            : `${tickPrefix} Interact ${poiId} failed: ${interactReason}`
        );
        continue;
      }

      if (commandType === "set_target") {
        const targetEntityId = this.readString(command?.targetEntityId);
        if (isOk) {
          lines.push(targetEntityId ? `${tickPrefix} Target locked: ${targetEntityId}` : `${tickPrefix} Target lock cleared`);
        } else {
          lines.push(targetEntityId
            ? `${tickPrefix} Set target ${targetEntityId} failed: ${reason}`
            : `${tickPrefix} Clear target failed: ${reason}`);
        }
        continue;
      }

      if (commandType === "set_assist_config") {
        lines.push(isOk
          ? `${tickPrefix} Assist config updated`
          : `${tickPrefix} Assist config update failed: ${reason}`);
        continue;
      }

      if (commandType === "set_paused") {
        const pausedValue = command?.paused === true ? "paused" : "running";
        lines.push(isOk
          ? `${tickPrefix} Battle ${pausedValue}`
          : `${tickPrefix} Set pause failed: ${reason}`);
        continue;
      }

      lines.push(isOk ? `${tickPrefix} Command ${commandType} ok` : `${tickPrefix} Command ${commandType} failed: ${reason}`);
    }

    this.recentCommandResults = [...lines, ...this.recentCommandResults].slice(0, 12);
  }

  private toEngineActors(actors: StartBattleResponse["actors"] | StepBattleResponse["actors"]): ArenaActorState[] {
    const safeActors = actors ?? [];
    const mapped: ArenaActorState[] = [];

    for (const actor of safeActors) {
      const typedActor = actor as ApiActorState;
      if (!typedActor.actorId || !typedActor.kind) {
        continue;
      }

      mapped.push({
        actorId: typedActor.actorId,
        kind: typedActor.kind,
        mobType: this.readMobArchetypeValue((typedActor as Record<string, unknown>)["mobType"]) ?? undefined,
        isElite: this.readBoolean((typedActor as Record<string, unknown>)["isElite"]) ?? false,
        isBuffedByElite: this.readBoolean((typedActor as Record<string, unknown>)["isBuffedByElite"]) ?? false,
        buffSourceEliteId: this.readString((typedActor as Record<string, unknown>)["buffSourceEliteId"]) ?? null,
        currentTargetId: this.readString((typedActor as Record<string, unknown>)["currentTargetId"]) ?? null,
        tileX: typedActor.tileX ?? 0,
        tileY: typedActor.tileY ?? 0,
        hp: typedActor.hp ?? 0,
        maxHp: typedActor.maxHp ?? 1,
        shield: typedActor.shield ?? 0,
        maxShield: typedActor.maxShield ?? 0
      });
    }

    return mapped;
  }

  private toEngineSkills(skills: StartBattleResponse["skills"] | StepBattleResponse["skills"]): ArenaSkillState[] {
    const safeSkills = skills ?? [];
    const mapped: ArenaSkillState[] = [];

    for (const skill of safeSkills) {
      const typedSkill = skill as ApiSkillState;
      if (!typedSkill.skillId) {
        continue;
      }

      mapped.push({
        skillId: typedSkill.skillId,
        displayName: typedSkill.displayName ?? null,
        cooldownRemainingMs: typedSkill.cooldownRemainingMs ?? 0,
        cooldownTotalMs: typedSkill.cooldownTotalMs ?? 0
      });
    }

    return mapped;
  }

  private toEngineDecals(decals: StartBattleResponse["decals"] | StepBattleResponse["decals"]): DecalInstance[] {
    const safeDecals = decals ?? [];
    const mapped: DecalInstance[] = [];

    for (const decal of safeDecals) {
      const value = decal as ApiDecalState;
      const entityId = this.readString((value as Record<string, unknown>)["entityId"]);
      const entityType = this.readString((value as Record<string, unknown>)["entityType"]) ?? "mob";
      const tileX = this.readNumber((value as Record<string, unknown>)["tileX"]);
      const tileY = this.readNumber((value as Record<string, unknown>)["tileY"]);
      const remainingMs = this.readNumber((value as Record<string, unknown>)["remainingMs"]);
      const totalMs = this.readNumber((value as Record<string, unknown>)["totalMs"]);
      const createdTick = this.readNumber((value as Record<string, unknown>)["createdTick"]);
      const decalKindValue = this.readNumber((value as Record<string, unknown>)["decalKind"]);
      const spriteKey = this.readString((value as Record<string, unknown>)["spriteKey"]);
      const mobType = this.readMobArchetypeValue((value as Record<string, unknown>)["mobType"]) ?? undefined;
      if (
        !entityId ||
        tileX === null ||
        tileY === null ||
        remainingMs === null ||
        totalMs === null ||
        createdTick === null
      ) {
        continue;
      }

      mapped.push({
        entityId,
        entityType,
        mobType,
        decalKind: normalizeDecalKind(decalKindValue ?? undefined),
        tilePos: { x: tileX, y: tileY },
        semanticId: resolveDecalSemanticId(entityType, mobType, spriteKey ?? undefined),
        remainingMs: Math.max(0, remainingMs),
        totalMs: Math.max(1, totalMs),
        createdTick
      });
    }

    return mapped;
  }

  private toEngineRangedConfig(value: unknown): ArenaRangedConfig | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;
    const autoAttackRangedMaxRange = this.readNumber(record["autoAttackRangedMaxRange"]);
    const rangedProjectileSpeedTiles = this.readNumber(record["rangedProjectileSpeedTiles"]);
    const rangedDefaultCooldownMs = this.readNumber(record["rangedDefaultCooldownMs"]);
    const projectileColorByWeaponId = this.readStringMap(record["projectileColorByWeaponId"]);
    if (
      autoAttackRangedMaxRange === null ||
      rangedProjectileSpeedTiles === null ||
      rangedDefaultCooldownMs === null
    ) {
      return null;
    }

    return {
      autoAttackRangedMaxRange,
      rangedProjectileSpeedTiles,
      rangedDefaultCooldownMs,
      projectileColorByWeaponId
    };
  }

  private toEnginePois(value: unknown): ArenaPoiState[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const mapped: ArenaPoiState[] = [];
    for (const poiEntry of value) {
      const poi = poiEntry as ApiPoiState;
      const poiId = this.readString(poi.poiId);
      const type = this.readString(poi.type);
      const pos = poi.pos as Record<string, unknown> | null | undefined;
      const tileX = this.readNumber(pos?.["x"]);
      const tileY = this.readNumber(pos?.["y"]);
      const remainingMs = this.readNumber(poi.remainingMs);
      const species = this.readString(poi.species) ?? undefined;
      if (
        !poiId ||
        (type !== "altar" && type !== "chest" && type !== "species_chest") ||
        tileX === null ||
        tileY === null ||
        remainingMs === null
      ) {
        continue;
      }

      mapped.push({
        poiId,
        type,
        pos: { x: tileX, y: tileY },
        remainingMs: Math.max(0, remainingMs),
        species
      });
    }

    return mapped.sort((left, right) => left.poiId.localeCompare(right.poiId));
  }

  private toEngineBuffs(value: unknown): ArenaBuffState[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const mapped: ArenaBuffState[] = [];
    for (const buffEntry of value) {
      const buff = buffEntry as ApiBuffState;
      const buffId = this.readString(buff.buffId);
      const remainingMs = this.readNumber(buff.remainingMs);
      if (!buffId || remainingMs === null) {
        continue;
      }

      mapped.push({
        buffId,
        remainingMs: Math.max(0, remainingMs)
      });
    }

    return mapped.sort((left, right) => left.buffId.localeCompare(right.buffId));
  }

  private toBestiaryEntries(value: unknown): ArenaBestiaryEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const mapped: ArenaBestiaryEntry[] = [];
    for (const entry of value) {
      const bestiaryEntry = entry as ApiBestiaryEntry;
      const species = this.readString(bestiaryEntry.species);
      const killsTotal = this.readNumber(bestiaryEntry.killsTotal);
      const nextChestAtKills = this.readNumber(bestiaryEntry.nextChestAtKills);
      if (!species || killsTotal === null || nextChestAtKills === null || nextChestAtKills <= 0) {
        continue;
      }

      mapped.push({
        species,
        killsTotal: Math.max(0, killsTotal),
        nextChestAtKills: Math.max(1, nextChestAtKills)
      });
    }

    return mapped.sort((left, right) => left.species.localeCompare(right.species));
  }

  private toEngineEvents(events: StepBattleResponse["events"]): ArenaBattleEvent[] {
    const safeEvents = events ?? [];
    const mapped: ArenaBattleEvent[] = [];

    for (const event of safeEvents) {
      const value = event as Record<string, unknown>;
      const eventType = this.readString(value["type"]);
      if (!eventType) {
        continue;
      }

      if (eventType === "fx_spawn") {
        const fxId = this.readString(value["fxId"]);
        const tileX = this.readNumber(value["tileX"]);
        const tileY = this.readNumber(value["tileY"]);
        const layer = this.readString(value["layer"]);
        const durationMs = this.readNumber(value["durationMs"]);
        const element = this.readElementValue(value["element"]);
        if (!fxId || tileX === null || tileY === null || !layer || durationMs === null) {
          continue;
        }

        mapped.push({
          type: "fx_spawn",
          fxId,
          tileX,
          tileY,
          layer,
          durationMs,
          element: element ?? undefined
        });
        continue;
      }

      if (eventType === "damage_number") {
        const targetEntityId = this.readString(value["targetEntityId"]);
        const targetTileX = this.readNumber(value["targetTileX"]);
        const targetTileY = this.readNumber(value["targetTileY"]);
        const damageAmount = this.readNumber(value["damageAmount"]);
        const isKill = this.readBoolean(value["isKill"]);
        const isCrit = this.readBoolean(value["isCrit"]);
        const hitKind = this.readHitKind(value["hitKind"]);
        const hitId = this.readNumber(value["hitId"]);
        const elementType = this.readElementValue(value["elementType"]);
        const sourceEntityId = this.readString(value["sourceEntityId"]);
        const sourceTileX = this.readNumber(value["sourceTileX"]);
        const sourceTileY = this.readNumber(value["sourceTileY"]);
        const attackerEntityId = this.readString(value["attackerEntityId"]);
        const attackerTileX = this.readNumber(value["attackerTileX"]);
        const attackerTileY = this.readNumber(value["attackerTileY"]);
        const shieldDamageAmount = this.readNumber(value["shieldDamageAmount"]);
        const hpDamageAmount = this.readNumber(value["hpDamageAmount"]);
        if (
          !targetEntityId ||
          targetTileX === null ||
          targetTileY === null ||
          damageAmount === null ||
          isKill === null ||
          hitId === null
        ) {
          continue;
        }

        const resolvedIsCrit = isCrit ?? hitKind === "crit";

        mapped.push({
          type: "damage_number",
          sourceEntityId: sourceEntityId ?? attackerEntityId ?? undefined,
          sourceTileX: sourceTileX ?? attackerTileX ?? undefined,
          sourceTileY: sourceTileY ?? attackerTileY ?? undefined,
          attackerEntityId: attackerEntityId ?? undefined,
          attackerTileX: attackerTileX ?? undefined,
          attackerTileY: attackerTileY ?? undefined,
          targetEntityId,
          targetTileX,
          targetTileY,
          damageAmount,
          isKill,
          isCrit: resolvedIsCrit,
          hitKind: hitKind ?? undefined,
          hitId,
          shieldDamageAmount: shieldDamageAmount ?? undefined,
          hpDamageAmount: hpDamageAmount ?? undefined,
          elementType: elementType ?? undefined
        });
        continue;
      }

      if (eventType === "crit_text") {
        const text = this.readString(value["text"]);
        const tileX = this.readNumber(value["tileX"]);
        const tileY = this.readNumber(value["tileY"]);
        const startAtMs = this.readNumber(value["startAtMs"]);
        const durationMs = this.readNumber(value["durationMs"]);
        if (!text || tileX === null || tileY === null || startAtMs === null || durationMs === null) {
          continue;
        }

        mapped.push({
          type: "crit_text",
          text,
          tileX,
          tileY,
          startAtMs,
          durationMs
        });
        continue;
      }

      if (eventType === "attack_fx") {
        const fxKind = this.readNumber(value["fxKind"]);
        const fromTileX = this.readNumber(value["fromTileX"]);
        const fromTileY = this.readNumber(value["fromTileY"]);
        const toTileX = this.readNumber(value["toTileX"]);
        const toTileY = this.readNumber(value["toTileY"]);
        const durationMs = this.readNumber(value["durationMs"]);
        const createdAtTick = this.readNumber(value["createdAtTick"]);
        const eventId = this.readNumber(value["eventId"]);
        const elementType = this.readElementValue(value["elementType"]);
        if (
          fxKind === null ||
          fromTileX === null ||
          fromTileY === null ||
          toTileX === null ||
          toTileY === null ||
          durationMs === null ||
          createdAtTick === null ||
          eventId === null
        ) {
          continue;
        }

        mapped.push({
          type: "attack_fx",
          fxKind: fxKind as 1 | 2 | 3 | 4 | 5,
          fromTileX,
          fromTileY,
          toTileX,
          toTileY,
          durationMs,
          createdAtTick,
          eventId,
          elementType: elementType ?? undefined
        });
        continue;
      }

      if (eventType === "assist_cast") {
        const skillId = this.readString(value["skillId"]);
        const reason = this.readString(value["reason"]);
        if (!skillId || !reason) {
          continue;
        }

        mapped.push({
          type: "assist_cast",
          skillId,
          reason
        });
        continue;
      }

      if (eventType === "poi_interacted") {
        const poiId = this.readString(value["poiId"]);
        const poiType = this.readString(value["poiType"]);
        const tileX = this.readNumber(value["tileX"]);
        const tileY = this.readNumber(value["tileY"]);
        if (
          !poiId ||
          (poiType !== "altar" && poiType !== "chest" && poiType !== "species_chest") ||
          tileX === null ||
          tileY === null
        ) {
          continue;
        }

        mapped.push({
          type: "poi_interacted",
          poiId,
          poiType,
          tileX,
          tileY,
          species: this.readString(value["species"]) ?? undefined
        });
        continue;
      }

      if (eventType === "card_choice_offered") {
        const choiceId = this.readString(value["choiceId"]);
        if (!choiceId) {
          continue;
        }

        mapped.push({
          type: "card_choice_offered",
          choiceId
        });
        continue;
      }

      if (eventType === "card_chosen") {
        const choiceId = this.readString(value["choiceId"]);
        if (!choiceId) {
          continue;
        }

        const card = this.readRecord(value["card"]);
        const cardName = this.readString(card?.["name"]) ?? undefined;
        mapped.push({
          type: "card_chosen",
          choiceId,
          cardName
        });
        continue;
      }

      if (eventType === "elite_spawned" || eventType === "elite_died") {
        const eliteEntityId = this.readString(value["eliteEntityId"]);
        const mobType = this.readMobArchetypeValue(value["mobType"]);
        if (!eliteEntityId || !mobType) {
          continue;
        }

        mapped.push({
          type: eventType,
          eliteEntityId,
          mobType
        });
        continue;
      }

      if (eventType === "ranged_projectile_fired") {
        const weaponId = this.readString(value["weaponId"]);
        const fromTile = this.readRecord(value["fromTile"]);
        const toTile = this.readRecord(value["toTile"]);
        const fromX = this.readNumber(fromTile?.["x"]);
        const fromY = this.readNumber(fromTile?.["y"]);
        const toX = this.readNumber(toTile?.["x"]);
        const toY = this.readNumber(toTile?.["y"]);
        const targetActorId = this.readString(value["targetActorId"]);
        const pierces = this.readBoolean(value["pierces"]);
        if (
          !weaponId ||
          fromX === null ||
          fromY === null ||
          toX === null ||
          toY === null ||
          pierces === null
        ) {
          continue;
        }

        mapped.push({
          type: "ranged_projectile_fired",
          weaponId,
          fromTile: { x: fromX, y: fromY },
          toTile: { x: toX, y: toY },
          targetActorId: targetActorId ?? undefined,
          pierces
        });
        continue;
      }

      if (eventType === "mob_knocked_back") {
        const actorId = this.readString(value["actorId"]);
        const fromTile = this.readRecord(value["fromTile"]);
        const toTile = this.readRecord(value["toTile"]);
        const fromX = this.readNumber(fromTile?.["x"]);
        const fromY = this.readNumber(fromTile?.["y"]);
        const toX = this.readNumber(toTile?.["x"]);
        const toY = this.readNumber(toTile?.["y"]);
        if (!actorId || fromX === null || fromY === null || toX === null || toY === null) {
          continue;
        }

        mapped.push({
          type: "mob_knocked_back",
          actorId,
          fromTile: { x: fromX, y: fromY },
          toTile: { x: toX, y: toY }
        });
        continue;
      }

      if (eventType === "heal_number") {
        const actorId = this.readString(value["actorId"]);
        const amount = this.readNumber(value["amount"]);
        const source = this.readString(value["source"]);
        if (!actorId || amount === null || !source) {
          continue;
        }

        mapped.push({
          type: "heal_number",
          actorId,
          amount,
          source
        });
        continue;
      }

      if (eventType === "death") {
        const entityId = this.readString(value["entityId"]);
        const entityType = this.readString(value["entityType"]);
        const tileX = this.readNumber(value["tileX"]);
        const tileY = this.readNumber(value["tileY"]);
        const tickIndex = this.readNumber(value["tickIndex"]);
        const elementType = this.readElementValue(value["elementType"]);
        const killerEntityId = this.readString(value["killerEntityId"]);
        const mobType = this.readMobArchetypeValue(value["mobType"]) ?? undefined;
        if (!entityId || !entityType || tileX === null || tileY === null || tickIndex === null) {
          continue;
        }

        mapped.push({
          type: "death",
          entityId,
          entityType,
          mobType,
          tileX,
          tileY,
          elementType: elementType ?? undefined,
          killerEntityId: killerEntityId ?? undefined,
          tickIndex
        });
        continue;
      }

      if (eventType === "reflect") {
        const sourceEntityId = this.readString(value["sourceEntityId"]);
        const targetEntityId = this.readString(value["targetEntityId"]);
        const amount = this.readNumber(value["amount"]);
        const targetTileX = this.readNumber(value["targetTileX"]);
        const targetTileY = this.readNumber(value["targetTileY"]);
        const elementType = this.readElementValue(value["elementType"]);
        if (!sourceEntityId || !targetEntityId || amount === null || targetTileX === null || targetTileY === null) {
          continue;
        }

        mapped.push({
          type: "fx_spawn",
          fxId: "fx.hit.small",
          tileX: targetTileX,
          tileY: targetTileY,
          layer: "hitFx",
          durationMs: 420,
          element: elementType ?? undefined
        });
        mapped.push({
          type: "reflect_number",
          sourceEntityId,
          targetEntityId,
          targetTileX,
          targetTileY,
          amount,
          elementType: elementType ?? undefined
        });
      }
    }

    return mapped;
  }

  private updateVisibleSkills(skills: ReadonlyArray<ArenaSkillState>): void {
    const previousSkills = this.ui.skills;
    const sortedSkills = [...skills].sort((left, right) => left.skillId.localeCompare(right.skillId));
    const pulseFromTransitions = collectReadyPulseSkillIds(previousSkills, sortedSkills);
    const nextPulseIds = new Set(this.readyPulseSkillIds);
    for (const skillId of pulseFromTransitions) {
      nextPulseIds.add(skillId);
    }
    this.readyPulseSkillIds = nextPulseIds;

    this.ui = {
      ...this.ui,
      skills: sortedSkills
    };
  }

  getCooldownRemainingMs(skillId: string): number {
    const skill = this.getVisibleSkill(skillId);
    if (!skill) {
      return 0;
    }

    return Math.max(0, skill.cooldownRemainingMs);
  }

  getCooldownTotalMs(skillId: string): number {
    const skill = this.getVisibleSkill(skillId);
    if (!skill) {
      return 0;
    }

    return Math.max(0, skill.cooldownTotalMs);
  }

  private getVisibleSkill(skillId: string): ArenaSkillState | undefined {
    return this.ui.skills.find((entry) => entry.skillId === skillId);
  }

  private toFriendlyCommandReason(reason: string): string {
    if (reason === "cooldown") {
      return "skill is on cooldown";
    }

    if (reason === "global_cooldown") {
      return "global cooldown active";
    }

    if (reason === "no_target") {
      return "no target";
    }

    if (reason === "unknown_skill") {
      return "unknown skill";
    }

    if (reason === "unknown_direction") {
      return "unknown direction";
    }

    if (reason === "unknown_command") {
      return "unknown command";
    }

    if (reason === "invalid_ground_target") {
      return "invalid ground target";
    }

    if (reason === "not_started") {
      return "battle is not started";
    }

    if (reason === "defeat") {
      return "battle already ended";
    }

    if (reason === "out_of_range") {
      return "target out of range";
    }

    if (reason === "move_blocked") {
      return "tile is blocked";
    }

    if (reason === "unknown_poi") {
      return "POI not available";
    }

    if (reason === "player_dead") {
      return "player is dead";
    }

    if (reason === "paused") {
      return "battle is paused";
    }

    if (reason === "awaiting_card_choice") {
      return "choose a card first";
    }

    return reason;
  }

  private updatePlayerHudFromActorStates(actors: StartBattleResponse["actors"] | StepBattleResponse["actors"]): void {
    const safeActors = actors ?? [];
    const player = safeActors.find((actor) => this.readString((actor as ApiActorState).kind) === "player") as ApiActorState | undefined;
    if (!player) {
      return;
    }

    const hp = this.readNumber(player.hp) ?? 0;
    const maxHp = Math.max(1, this.readNumber(player.maxHp) ?? 100);
    const previousShield = Math.max(0, Math.min(this.ui.player.shield, this.ui.player.maxShield));
    const maxShield = Math.max(0, this.readNumber((player as Record<string, unknown>)["maxShield"]) ?? Math.floor(maxHp * 0.8));
    const shield = Math.max(0, Math.min(maxShield, this.readNumber((player as Record<string, unknown>)["shield"]) ?? 0));

    const playerState: ArenaUiPlayerState = {
      hp: Math.max(0, Math.min(maxHp, hp)),
      maxHp,
      shield,
      maxShield,
      globalCooldownRemainingMs: this.ui.player.globalCooldownRemainingMs,
      globalCooldownTotalMs: this.ui.player.globalCooldownTotalMs
    };

    this.ui = {
      ...this.ui,
      player: playerState
    };

    if (previousShield > 0 && shield <= 0) {
      this.triggerShieldBreakPulse();
    }
  }

  private updateGlobalCooldownFromSnapshot(
    snapshot: Pick<StartBattleResponse, "globalCooldownRemainingMs" | "globalCooldownTotalMs">
      | Pick<StepBattleResponse, "globalCooldownRemainingMs" | "globalCooldownTotalMs">
  ): void {
    const totalMs = Math.max(0, this.readNumber(snapshot.globalCooldownTotalMs) ?? this.ui.player.globalCooldownTotalMs);
    const remainingMs = Math.max(
      0,
      Math.min(totalMs, this.readNumber(snapshot.globalCooldownRemainingMs) ?? this.ui.player.globalCooldownRemainingMs)
    );

    this.ui = {
      ...this.ui,
      player: {
        ...this.ui.player,
        globalCooldownRemainingMs: remainingMs,
        globalCooldownTotalMs: totalMs
      }
    };
  }

  private updateAltarCooldownFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const remainingMs = Math.max(
      0,
      this.readNumber((snapshot as Record<string, unknown>)["altarCooldownRemainingMs"]) ?? this.altarCooldownRemainingMs
    );
    this.altarCooldownRemainingMs = remainingMs;
  }

  private applyUltimateFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const record = snapshot as Record<string, unknown>;
    const rawGauge = this.readNumber(record["ultimateGauge"]);
    const rawGaugeMax = this.readNumber(record["ultimateGaugeMax"]);
    const rawReady = this.readBoolean(record["ultimateReady"]);

    const ultimateGaugeMax = Math.max(1, Math.floor(rawGaugeMax ?? this.ui.ultimateGaugeMax));
    const ultimateGauge = Math.max(
      0,
      Math.min(ultimateGaugeMax, Math.floor(rawGauge ?? this.ui.ultimateGauge))
    );
    const ultimateReady = rawReady ?? this.ui.ultimateReady;

    this.ui = {
      ...this.ui,
      ultimateGauge,
      ultimateGaugeMax,
      ultimateReady
    };
  }

  private applyZoneFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const record = snapshot as Record<string, unknown>;
    const parsedZoneIndex = this.readNumber(record["zoneIndex"]);
    if (typeof parsedZoneIndex !== "number" || !Number.isFinite(parsedZoneIndex)) {
      return;
    }

    const normalizedZoneIndex = this.clampZoneIndex(parsedZoneIndex);
    this.activeZoneIndex = normalizedZoneIndex;
    this.selectedZoneIndex = normalizedZoneIndex;
  }

  private applyRunProgressFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const record = snapshot as Record<string, unknown>;
    const parsedRunLevel = this.readNumber(record["runLevel"]);
    const parsedRunXp = this.readNumber(record["runXp"]);
    const parsedXpToNextLevel = this.readNumber(record["xpToNextLevel"]);
    const parsedRunTimeMs = this.readNumber(record["runTimeMs"]);
    const parsedRunDurationMs = this.readNumber(record["runDurationMs"]);
    const parsedTimeSurvivedMs = this.readNumber(record["timeSurvivedMs"]);
    const parsedTotalKills = this.readNumber(record["totalKills"]);
    const parsedEliteKills = this.readNumber(record["eliteKills"]);
    const parsedChestsOpened = this.readNumber(record["chestsOpened"]);
    const parsedRunEndedAtMs = this.readNumber(record["runEndedAtMs"]);

    const nextRunLevel = Math.max(RUN_INITIAL_LEVEL, Math.floor(parsedRunLevel ?? this.runLevel));
    const fallbackXpToNextLevel = this.computeRunXpToNextLevel(nextRunLevel);
    const nextXpToNextLevel = Math.max(1, Math.floor(parsedXpToNextLevel ?? fallbackXpToNextLevel));
    const nextRunXp = Math.max(0, Math.min(nextXpToNextLevel, Math.floor(parsedRunXp ?? this.runXp)));
    const nextRunTimeMs = Math.max(0, Math.floor(parsedRunTimeMs ?? this.runTimeMs));
    const nextRunDurationMs = Math.max(1, Math.floor(parsedRunDurationMs ?? this.runDurationMs));
    const nextTimeSurvivedMs = Math.max(0, Math.floor(parsedTimeSurvivedMs ?? nextRunTimeMs));

    this.runLevel = nextRunLevel;
    this.runXp = nextRunXp;
    this.xpToNextLevel = nextXpToNextLevel;
    this.runTimeMs = nextRunTimeMs;
    this.runDurationMs = nextRunDurationMs;
    this.timeSurvivedMs = nextTimeSurvivedMs;
    this.runEndedAtMs = parsedRunEndedAtMs !== null ? Math.max(0, Math.floor(parsedRunEndedAtMs)) : this.runEndedAtMs;
    this.runTotalKills = Math.max(0, Math.floor(parsedTotalKills ?? this.runTotalKills));
    this.runEliteKills = Math.max(0, Math.floor(parsedEliteKills ?? this.runEliteKills));
    this.runChestsOpened = Math.max(0, Math.floor(parsedChestsOpened ?? this.runChestsOpened));
    this.recordEliteTimelineEventsFromSnapshot(snapshot);
    this.appendExpLogsFromSnapshot(snapshot);
    this.appendEventFeedFromSnapshot(snapshot);
  }

  private applyScalingTelemetryFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const record = snapshot as Record<string, unknown>;
    const parsedCurrentMobHpMult = this.readNumber(record["currentMobHpMult"]);
    const parsedCurrentMobDmgMult = this.readNumber(record["currentMobDmgMult"]);
    const scaling = this.readRecord(record["scaling"]);
    const parsedNormalHpMult = this.readNumber(scaling?.["normalHpMult"]);
    const parsedNormalDmgMult = this.readNumber(scaling?.["normalDmgMult"]);
    const parsedEliteHpMult = this.readNumber(scaling?.["eliteHpMult"]);
    const parsedEliteDmgMult = this.readNumber(scaling?.["eliteDmgMult"]);
    const parsedLvlFactor = this.readNumber(scaling?.["lvlFactor"]);
    const parsedLvlFactorEnabled = this.readBoolean(scaling?.["isLvlFactorEnabled"]);

    this.currentMobHpMult = Math.max(0, parsedCurrentMobHpMult ?? this.currentMobHpMult);
    this.currentMobDmgMult = Math.max(0, parsedCurrentMobDmgMult ?? this.currentMobDmgMult);
    this.scalingNormalHpMult = Math.max(0, parsedNormalHpMult ?? this.scalingNormalHpMult);
    this.scalingNormalDmgMult = Math.max(0, parsedNormalDmgMult ?? this.scalingNormalDmgMult);
    this.scalingEliteHpMult = Math.max(0, parsedEliteHpMult ?? this.scalingEliteHpMult);
    this.scalingEliteDmgMult = Math.max(0, parsedEliteDmgMult ?? this.scalingEliteDmgMult);
    this.scalingLvlFactor = Math.max(0, parsedLvlFactor ?? this.scalingLvlFactor);
    if (parsedLvlFactorEnabled !== null) {
      this.scalingLvlFactorEnabled = parsedLvlFactorEnabled;
    }
  }

  private applyCardChoiceStateFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const record = snapshot as Record<string, unknown>;
    const isAwaiting = this.readBoolean(record["isAwaitingCardChoice"]) === true;
    const pendingChoiceId = this.readString(record["pendingChoiceId"]);
    const offeredCards = this.toCardOffers(record["offeredCards"]);
    const selectedCards = this.toCardOffers(record["selectedCards"]);
    const hasValidPendingChoice = isAwaiting && pendingChoiceId !== null && offeredCards.length > 0;

    this.selectedCards = selectedCards;
    this.isAwaitingCardChoice = hasValidPendingChoice;
    this.pendingCardChoiceId = hasValidPendingChoice ? pendingChoiceId : null;
    this.offeredCards = hasValidPendingChoice ? offeredCards : [];

    if (hasValidPendingChoice) {
      this.queuedCommands = [];
      this.queuedCommandCount = 0;
      this.pendingCardSelectionId = null;
    } else {
      this.pendingCardSelectionId = null;
      this.currentCardChoiceLevelContext = null;
    }
  }

  private updateCardChoicePresentationFromEvents(events: StepBattleResponse["events"]): void {
    if (Array.isArray(events) && events.length > 0) {
      let latestSource: CardChoiceSource = "unknown";
      let latestLevelContext: CardChoiceLevelContext | null = null;
      for (const rawEvent of events) {
        const eventRecord = rawEvent as Record<string, unknown>;
        const eventType = this.readString(eventRecord["type"]);
        if (!eventType) {
          continue;
        }

        if (eventType === "level_up") {
          latestSource = "level_up";
          const newLevel = Math.max(
            RUN_INITIAL_LEVEL,
            Math.floor(this.readNumber(eventRecord["newLevel"]) ?? this.runLevel)
          );
          latestLevelContext = {
            newLevel,
            runXp: Math.max(0, Math.floor(this.readNumber(eventRecord["runXp"]) ?? this.runXp)),
            xpToNextLevel: Math.max(1, Math.floor(this.readNumber(eventRecord["xpToNextLevel"]) ?? this.xpToNextLevel))
          };
          continue;
        }

        if (eventType === "poi_interacted") {
          const poiType = this.readString(eventRecord["poiType"]);
          if (poiType === "chest" || poiType === "species_chest") {
            latestSource = "chest";
            latestLevelContext = null;
          }
          continue;
        }

        if (eventType === "card_choice_offered") {
          const choiceId = this.readString(eventRecord["choiceId"]);
          if (choiceId) {
            this.cardChoiceSourceByChoiceId.set(choiceId, latestSource);
            if (latestSource === "level_up" && latestLevelContext) {
              this.cardChoiceLevelContextByChoiceId.set(choiceId, latestLevelContext);
            } else {
              this.cardChoiceLevelContextByChoiceId.delete(choiceId);
            }
          }
          continue;
        }

        if (eventType === "card_chosen") {
          const choiceId = this.readString(eventRecord["choiceId"]);
          if (choiceId) {
            this.cardChoiceSourceByChoiceId.delete(choiceId);
            this.cardChoiceLevelContextByChoiceId.delete(choiceId);
          }
        }
      }
    }

    if (this.isAwaitingCardChoice && this.pendingCardChoiceId) {
      this.cardChoiceSource = this.cardChoiceSourceByChoiceId.get(this.pendingCardChoiceId) ?? "unknown";
      this.currentCardChoiceLevelContext = this.cardChoiceLevelContextByChoiceId.get(this.pendingCardChoiceId) ?? null;
      return;
    }

    this.cardChoiceSource = "unknown";
    this.currentCardChoiceLevelContext = null;
  }

  private toCardOffers(value: unknown): ArenaCardOffer[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const offers: ArenaCardOffer[] = [];
    const seenIds = new Set<string>();
    for (const entry of value) {
      if (typeof entry === "string") {
        const id = this.readString(entry);
        if (!id || seenIds.has(id)) {
          continue;
        }

        seenIds.add(id);
        const tags: string[] = [];
        const rarityWeight = 100;
        const maxStacks = 3;
        const currentStacks = 0;
        const stackState = this.resolveCardStackPresentation(currentStacks, maxStacks);
        offers.push({
          id,
          name: this.formatCardNameFromId(id),
          description: "",
          tags,
          rarityWeight,
          maxStacks,
          currentStacks,
          rarityTierLabel: this.resolveCardRarityTierLabel(rarityWeight),
          categoryLabel: this.resolveCardCategoryLabel(tags),
          impactLines: [],
          stackStateLabel: stackState.label,
          stackStateTone: stackState.tone
        });
        continue;
      }

      if (!entry || typeof entry !== "object") {
        continue;
      }

      const typedEntry = entry as ApiCardOffer;
      const id = this.readString(typedEntry.id);
      if (!id || seenIds.has(id)) {
        continue;
      }

      const name = this.readString(typedEntry.name) ?? this.formatCardNameFromId(id);
      const description = this.readString(typedEntry.description) ?? "";
      const tags = this.toCardTags(typedEntry.tags);
      const rarityWeight = Math.max(1, Math.floor(this.readNumber(typedEntry.rarityWeight) ?? 100));
      const maxStacks = Math.max(1, Math.floor(this.readNumber(typedEntry.maxStacks) ?? 3));
      const currentStacks = Math.max(0, Math.min(maxStacks, Math.floor(this.readNumber(typedEntry.currentStacks) ?? 0)));
      const stackState = this.resolveCardStackPresentation(currentStacks, maxStacks);
      seenIds.add(id);
      offers.push({
        id,
        name,
        description,
        tags,
        rarityWeight,
        maxStacks,
        currentStacks,
        rarityTierLabel: this.resolveCardRarityTierLabel(rarityWeight),
        categoryLabel: this.resolveCardCategoryLabel(tags),
        impactLines: this.resolveCardImpactLines(description),
        stackStateLabel: stackState.label,
        stackStateTone: stackState.tone
      });
    }

    return offers;
  }

  private toCardTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized = value
      .map((tag) => this.readString(tag))
      .filter((tag): tag is string => !!tag)
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);
    return Array.from(new Set(normalized));
  }

  private resolveCardRarityTierLabel(rarityWeight: number): string {
    if (rarityWeight <= 40) {
      return "Epic";
    }

    if (rarityWeight <= 70) {
      return "Rare";
    }

    if (rarityWeight <= 95) {
      return "Uncommon";
    }

    return "Common";
  }

  private resolveCardCategoryLabel(tags: ReadonlyArray<string>): string {
    const firstTag = tags.find((tag) => tag !== "skill");
    if (!firstTag) {
      return "Passive";
    }

    if (firstTag === "offense") {
      return "Offense";
    }

    if (firstTag === "defense") {
      return "Defense";
    }

    if (firstTag === "utility") {
      return "Utility";
    }

    if (firstTag === "sustain") {
      return "Sustain";
    }

    if (firstTag === "mobility") {
      return "Mobility";
    }

    return this.formatCardNameFromId(firstTag);
  }

  private resolveCardImpactLines(description: string): string[] {
    const normalizedDescription = description.trim().replace(/\s+/g, " ");
    if (!normalizedDescription) {
      return [];
    }

    const statLines: string[] = [];
    this.tryPushCardImpactLine(statLines, normalizedDescription, /([+-]\d+%?)\s*max hp/i, (value) => `${value} Max HP`);
    const hasFlatDamage = /([+-]\d+%?)\s*flat damage/i.test(normalizedDescription);
    this.tryPushCardImpactLine(statLines, normalizedDescription, /([+-]\d+%?)\s*flat damage/i, (value) => `${value} Flat Damage`);
    if (!hasFlatDamage) {
      this.tryPushCardImpactLine(statLines, normalizedDescription, /([+-]\d+%?)\s*damage/i, (value) => `${value} Damage`);
    }
    this.tryPushCardImpactLine(statLines, normalizedDescription, /([+-]\d+%?)\s*attack speed/i, (value) => `${value} Attack Speed`);
    this.tryPushCardImpactLine(
      statLines,
      normalizedDescription,
      /([+-]\d+%?)\s*global cooldown reduction/i,
      (value) => `${value} Cooldown Reduction`
    );
    this.tryPushCardImpactLine(statLines, normalizedDescription, /([+-]\d+%?)\s*hp on hit/i, (value) => `${value} HP On Hit`);
    if (statLines.length > 0) {
      return statLines.slice(0, 3);
    }

    return normalizedDescription
      .replace(/\.$/, "")
      .split(/\s+and\s+|,\s+/i)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .slice(0, 2);
  }

  private tryPushCardImpactLine(
    output: string[],
    description: string,
    pattern: RegExp,
    formatter: (value: string) => string
  ): void {
    const match = description.match(pattern);
    if (!match || !match[1]) {
      return;
    }

    const nextLine = formatter(match[1]);
    if (!output.includes(nextLine)) {
      output.push(nextLine);
    }
  }

  private resolveCardStackPresentation(
    currentStacks: number,
    maxStacks: number
  ): Readonly<{ label: string; tone: CardOfferStackTone }> {
    if (maxStacks <= 1) {
      return { label: "Single stack card", tone: "new" };
    }

    if (currentStacks <= 0) {
      return { label: `New pick (1/${maxStacks})`, tone: "new" };
    }

    if (currentStacks >= maxStacks) {
      return { label: `Max stack (${maxStacks}/${maxStacks})`, tone: "maxed" };
    }

    return { label: `Current stack ${currentStacks}/${maxStacks}`, tone: "growing" };
  }

  private formatCardNameFromId(cardId: string): string {
    if (!cardId) {
      return "Unknown Card";
    }

    return cardId
      .split("_")
      .map((token) => (token.length > 0 ? token[0].toUpperCase() + token.slice(1) : token))
      .join(" ");
  }

  private computeRunXpToNextLevel(runLevel: number): number {
    const clampedLevel = Math.max(RUN_INITIAL_LEVEL, Math.floor(runLevel));
    return RUN_LEVEL_XP_BASE + ((clampedLevel - RUN_INITIAL_LEVEL) * RUN_LEVEL_XP_INCREMENT_PER_LEVEL);
  }

  private appendExpLogsFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const tick = Math.max(0, this.readNumber((snapshot as Record<string, unknown>)["tick"]) ?? this.currentBattleTick);
    const nextEntries: ExpConsoleEntry[] = [];

    const eventsValue = (snapshot as Record<string, unknown>)["events"];
    if (Array.isArray(eventsValue)) {
      for (const event of eventsValue) {
        const eventRecord = event as Record<string, unknown>;
        const eventType = this.readString(eventRecord["type"]);
        if (eventType === "xp_gained") {
          const amount = Math.max(0, Math.floor(this.readNumber(eventRecord["amount"]) ?? 0));
          if (amount <= 0) {
            continue;
          }

          const sourceSpeciesId = this.readString(eventRecord["sourceSpeciesId"]);
          const isElite = this.readBoolean(eventRecord["isElite"]) === true;
          const sourceLabel = sourceSpeciesId ? ` (${this.formatSpeciesLabel(sourceSpeciesId)})` : "";
          const eliteLabel = isElite ? " [Elite]" : "";
          nextEntries.push({
            id: `exp-${tick}-${this.expLogSequence++}`,
            tick,
            kind: "xp_gained",
            message: `+${amount} XP${sourceLabel}${eliteLabel}`
          });
          this.recordEconomyMetricSample("xp", amount, this.runTimeMs);
          this.economyTotalXpGained += amount;
          continue;
        }

        if (eventType === "card_choice_offered") {
          const offered = this.toCardOffers(eventRecord["offeredCards"]);
          if (offered.length === 0) {
            continue;
          }

          const offeredNames = offered.map((card) => card.name).join(" / ");
          nextEntries.push({
            id: `exp-${tick}-${this.expLogSequence++}`,
            tick,
            kind: "system",
            message: `Card choice offered: ${offeredNames}`
          });
          continue;
        }

        if (eventType === "card_chosen") {
          const cardEntry = (eventRecord["card"] ?? null) as ApiCardOffer | null;
          const cardId = this.readString(cardEntry?.id);
          const cardName = this.readString(cardEntry?.name) ?? (cardId ? this.formatCardNameFromId(cardId) : null);
          if (!cardName) {
            continue;
          }

          nextEntries.push({
            id: `exp-${tick}-${this.expLogSequence++}`,
            tick,
            kind: "system",
            message: `Card chosen: ${cardName}`
          });
          continue;
        }

        if (eventType !== "level_up") {
          continue;
        }

        const newLevel = Math.max(RUN_INITIAL_LEVEL, Math.floor(this.readNumber(eventRecord["newLevel"]) ?? this.runLevel));
        const runXp = Math.max(0, Math.floor(this.readNumber(eventRecord["runXp"]) ?? this.runXp));
        const xpToNextLevel = Math.max(1, Math.floor(this.readNumber(eventRecord["xpToNextLevel"]) ?? this.computeRunXpToNextLevel(newLevel)));
        this.triggerLevelUpPulse();
        nextEntries.push({
          id: `exp-${tick}-${this.expLogSequence++}`,
          tick,
          kind: "level_up",
          message: `Run Lv. ${newLevel} reached (${runXp}/${xpToNextLevel} XP)`
        });
      }
    }

    if (nextEntries.length === 0) {
      return;
    }

    this.expConsoleEntries = [...this.expConsoleEntries, ...nextEntries].slice(-EXP_CONSOLE_MAX_ENTRIES);
    if (this.selectedTopLeftTab === "events") {
      this.scrollConsoleToBottom(this.topLeftPanelRef, ".events-feed");
    }
  }

  toggleCombatDetails(): void {
    this.showCombatDetails = !this.showCombatDetails;
  }

  exportCombatAnalyzerJson(): void {
    const payload = this.buildCombatAnalyzerExportPayload();
    const battleId = this.currentBattleId.trim().length > 0 ? this.currentBattleId : "run";
    const safeBattleId = battleId.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const filename = `combat-analyzer-${safeBattleId}-t${this.currentBattleTick}.json`;
    this.downloadJsonFile(filename, payload);
  }

  private appendEventFeedFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const tick = Math.max(0, this.readNumber((snapshot as Record<string, unknown>)["tick"]) ?? this.currentBattleTick);
    const runTimeMs = this.runTimeMs;
    const nextEntries: EventFeedEntry[] = [];
    const eventsValue = (snapshot as Record<string, unknown>)["events"];

    if (Array.isArray(eventsValue)) {
      for (const event of eventsValue) {
        const eventRecord = event as Record<string, unknown>;
        const rawType = this.readString(eventRecord["type"]);
        if (!rawType) {
          continue;
        }

        const type = this.toNarrativeEventType(rawType);
        if (!type) {
          continue;
        }

        const message = this.formatNarrativeEventMessage(type, eventRecord);
        if (!message) {
          continue;
        }

        nextEntries.push({
          id: `event-${tick}-${this.eventFeedSequence++}`,
          tick,
          runTimeMs,
          type,
          message
        });
      }
    }

    if (this.isRunEnded && !this.runEndedNarrativeLogged) {
      nextEntries.push({
        id: `event-${tick}-${this.eventFeedSequence++}`,
        tick,
        runTimeMs,
        type: "run_ended",
        message: `Run ended: ${this.formatRunEndReason(this.runEndReason)}`
      });
      this.runEndedNarrativeLogged = true;
    }

    if (nextEntries.some((entry) => entry.type === "run_ended")) {
      this.runEndedNarrativeLogged = true;
    }

    if (nextEntries.length === 0) {
      return;
    }

    this.eventFeedEntries = [...this.eventFeedEntries, ...nextEntries].slice(-EVENT_FEED_MAX_ENTRIES);
    if (this.selectedTopLeftTab === "events") {
      this.scrollConsoleToBottom(this.topLeftPanelRef, ".events-feed");
    }
  }

  private buildCombatAnalyzerExportPayload() {
    const rollingTotals = this.combatRollingTotals;
    const rollingWindowSeconds = resolveRollingWindowSeconds(this.runTimeMs, ANALYZER_WINDOW_MS);
    const rollingRates = computeCombatRollingRates(rollingTotals, rollingWindowSeconds);
    const eliteSummary = this.combatEliteSummary;
    const series = buildCombatRateSeries(this.combatMetricSamples, this.runTimeMs, ANALYZER_WINDOW_MS, 10);
    const pacing = this.runResultLogger.getPacingTelemetry(this.runTimeMs);

    return {
      version: 1,
      exportedAtIso: new Date().toISOString(),
      battleId: this.currentBattleId || null,
      tick: this.currentBattleTick,
      runTimeMs: this.runTimeMs,
      analyzerWindowMs: ANALYZER_WINDOW_MS,
      rolling: {
        totals: rollingTotals,
        rates: {
          dps: Number(rollingRates.dps.toFixed(2)),
          dtps: Number(rollingRates.dtps.toFixed(2)),
          hps: Number(rollingRates.hps.toFixed(2)),
          shieldGainPerSecond: Number(rollingRates.shieldGainPerSecond.toFixed(2)),
          shieldLossPerSecond: Number(rollingRates.shieldLossPerSecond.toFixed(2))
        }
      },
      totals: {
        damageDealt: this.combatTotalDamageDealt,
        damageTaken: this.combatTotalDamageTaken,
        healingDone: this.combatTotalHealingDone,
        shieldsGained: this.combatTotalShieldGained,
        shieldsLost: this.combatTotalShieldLost
      },
      peaks: {
        hitDealt: this.combatPeakHitDealt,
        hitTaken: this.combatPeakHitTaken
      },
      pacing: pacing ? {
        timeToFirstDamageTakenMs: pacing.timeToFirstDamageTakenMs,
        timeToFirstEliteMs: pacing.timeToFirstEliteMs,
        timeToFirstChestSpawnMs: pacing.timeToFirstChestSpawnMs,
        timeToFirstChestOpenedMs: pacing.timeToFirstChestOpenedMs,
        timeToFirstCardChoiceMs: pacing.timeToFirstCardChoiceMs,
        currentAliveMobs: pacing.currentAliveMobs,
        peakSimultaneousMobs: pacing.peakSimultaneousMobs,
        spawnPacing: {
          maxAliveMobs: pacing.spawnPacing.maxAliveMobs,
          eliteSpawnChancePercent: pacing.spawnPacing.eliteSpawnChancePercent
        },
        lowHp: {
          thresholdPercent: pacing.lowHp.thresholdPercent,
          firstEnteredAtMs: pacing.lowHp.firstEnteredAtMs,
          windows: pacing.lowHp.windows,
          totalDurationMs: pacing.lowHp.totalDurationMs,
          longestWindowMs: pacing.lowHp.longestWindowMs
        }
      } : null,
      elite: {
        encounters: eliteSummary.encounters,
        kills: eliteSummary.kills,
        activeCount: eliteSummary.activeCount,
        uptimeMs: eliteSummary.uptimeMs,
        uptimePercent: Number(eliteSummary.uptimePercent.toFixed(2)),
        averageTimeToKillMs: eliteSummary.averageTimeToKillMs === null ? null : Math.round(eliteSummary.averageTimeToKillMs),
        fastestTimeToKillMs: eliteSummary.fastestTimeToKillMs,
        slowestTimeToKillMs: eliteSummary.slowestTimeToKillMs,
        rows: eliteSummary.rows.map((row) => ({
          encounterId: row.encounterId,
          eliteEntityId: row.eliteEntityId,
          species: mapMobTypeToSpecies(row.mobType),
          spawnMs: row.spawnMs,
          despawnMs: row.despawnMs,
          uptimeMs: row.uptimeMs,
          timeToKillMs: row.timeToKillMs,
          isAlive: row.isAlive
        }))
      },
      graphSeries: series.map((entry) => ({
        kind: entry.kind,
        label: entry.label,
        latestValue: Number(entry.latestValue.toFixed(2)),
        maxValue: Number(entry.maxValue.toFixed(2)),
        points: entry.points.map((point) => ({
          startMs: point.startMs,
          endMs: point.endMs,
          value: Number(point.value.toFixed(2))
        }))
      }))
    };
  }

  private downloadJsonFile(fileName: string, payload: unknown): void {
    const jsonText = JSON.stringify(payload, null, 2);
    if (
      typeof document === "undefined" ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      this.battleLog = jsonText;
      return;
    }

    try {
      const blob = new Blob([jsonText], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      this.battleLog = `Combat analyzer export downloaded (${fileName}).`;
    } catch (error) {
      this.battleLog = `Combat analyzer export failed: ${String(error)}`;
    }
  }

  private recordEliteTimelineEventsFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const eventsValue = (snapshot as Record<string, unknown>)["events"];
    if (!Array.isArray(eventsValue) || eventsValue.length === 0) {
      return;
    }

    const timelineEvents: EliteTimelineEvent[] = [];
    for (const event of eventsValue) {
      const eventRecord = event as Record<string, unknown>;
      const type = this.readString(eventRecord["type"]);
      if (type !== "elite_spawned" && type !== "elite_died") {
        continue;
      }

      const eliteEntityId = this.readString(eventRecord["eliteEntityId"]);
      if (!eliteEntityId) {
        continue;
      }

      const mobTypeValue = this.readNumber(eventRecord["mobType"]);
      timelineEvents.push({
        kind: type === "elite_spawned" ? "spawned" : "died",
        eliteEntityId,
        runTimeMs: this.runTimeMs,
        mobType: mobTypeValue === null ? null : Math.floor(mobTypeValue)
      });
    }

    if (timelineEvents.length === 0) {
      return;
    }

    this.combatEliteEvents = [...this.combatEliteEvents, ...timelineEvents];
  }

  private toNarrativeEventType(rawType: string): NarrativeEventType | null {
    if (
      rawType === "level_up" ||
      rawType === "card_choice_offered" ||
      rawType === "card_chosen" ||
      rawType === "elite_spawned" ||
      rawType === "elite_died" ||
      rawType === "elite_buff_applied" ||
      rawType === "elite_buff_removed" ||
      rawType === "run_ended"
    ) {
      return rawType;
    }

    if (rawType === "species_chest_spawned" || rawType === "chest_spawned") {
      return "chest_spawned";
    }

    if (rawType === "species_chest_opened" || rawType === "chest_opened") {
      return "chest_opened";
    }

    return null;
  }

  private formatNarrativeEventMessage(type: NarrativeEventType, eventRecord: Record<string, unknown>): string | null {
    if (type === "level_up") {
      const newLevel = Math.max(RUN_INITIAL_LEVEL, Math.floor(this.readNumber(eventRecord["newLevel"]) ?? this.runLevel));
      const runXp = Math.max(0, Math.floor(this.readNumber(eventRecord["runXp"]) ?? this.runXp));
      const xpToNext = Math.max(1, Math.floor(this.readNumber(eventRecord["xpToNextLevel"]) ?? this.xpToNextLevel));
      return `Level up: Run Lv. ${newLevel} (${runXp}/${xpToNext} XP)`;
    }

    if (type === "card_choice_offered") {
      const offered = this.toCardOffers(eventRecord["offeredCards"]);
      if (offered.length === 0) {
        return "Card choice offered";
      }

      const names = offered.map((card) => card.name).join(" / ");
      return `Card choice offered: ${names}`;
    }

    if (type === "card_chosen") {
      const cardEntry = (eventRecord["card"] ?? null) as ApiCardOffer | null;
      const cardId = this.readString(cardEntry?.id);
      const cardName = this.readString(cardEntry?.name) ?? (cardId ? this.formatCardNameFromId(cardId) : null);
      return cardName ? `Card chosen: ${cardName}` : "Card chosen";
    }

    if (type === "chest_spawned") {
      const species = this.readString(eventRecord["species"]);
      if (species) {
        return `Chest spawned: ${this.formatSpeciesLabel(species)}`;
      }

      const poiId = this.readString(eventRecord["poiId"]);
      return poiId ? `Chest spawned: ${poiId}` : "Chest spawned";
    }

    if (type === "chest_opened") {
      const species = this.readString(eventRecord["species"]);
      const buffId = this.readString(eventRecord["buffId"]);
      const durationMs = this.readNumber(eventRecord["durationMs"]);
      const durationLabel = durationMs !== null ? ` (${Math.max(1, Math.round(durationMs / 1000))}s)` : "";
      const chestLabel = species ? `Chest opened: ${this.formatSpeciesLabel(species)}` : "Chest opened";
      if (!buffId) {
        return chestLabel;
      }

      return `${chestLabel} -> ${buffId}${durationLabel}`;
    }

    if (type === "elite_spawned" || type === "elite_died") {
      const eliteEntityId = this.readString(eventRecord["eliteEntityId"]);
      const mobType = this.readNumber(eventRecord["mobType"]);
      const species = mapMobTypeToSpecies(mobType);
      const speciesLabel = species ? this.formatSpeciesLabel(species) : "Elite";
      const verb = type === "elite_spawned" ? "spawned" : "died";
      const idSuffix = eliteEntityId ? ` (${eliteEntityId})` : "";
      return `Elite ${verb}: ${speciesLabel}${idSuffix}`;
    }

    if (type === "elite_buff_applied" || type === "elite_buff_removed") {
      const eliteEntityId = this.readString(eventRecord["eliteEntityId"]) ?? "elite";
      const targetEntityId = this.readString(eventRecord["targetEntityId"]) ?? "target";
      const verb = type === "elite_buff_applied" ? "applied to" : "removed from";
      return `Elite buff ${verb}: ${eliteEntityId} -> ${targetEntityId}`;
    }

    if (type === "run_ended") {
      const reason = this.readString(eventRecord["reason"]) ?? this.runEndReason;
      return `Run ended: ${this.formatRunEndReason(reason)}`;
    }

    return null;
  }

  private formatRunEndReason(reason: string | null): string {
    if (!reason || reason.trim().length === 0) {
      return "Unknown";
    }

    return reason
      .split("_")
      .map((token) => token.length > 0 ? `${token[0].toUpperCase()}${token.slice(1)}` : token)
      .join(" ");
  }

  private recordCombatMetricsFromDamageEvents(damageEvents: ReadonlyArray<DamageNumberInstance>): boolean {
    if (damageEvents.length === 0) {
      return false;
    }

    const runtimeMs = this.runTimeMs;
    for (const event of damageEvents) {
      const amount = Math.max(0, Math.floor(event.amount));
      if (amount <= 0) {
        continue;
      }

      if (event.isHeal) {
        this.recordCombatMetricSample("healing", amount, runtimeMs);
        continue;
      }

      if (event.isShieldChange && event.shieldChangeDirection === "gain") {
        this.recordCombatMetricSample("shield_gained", amount, runtimeMs);
        continue;
      }

      if (event.isShieldChange && event.shieldChangeDirection === "loss") {
        this.recordCombatMetricSample("shield_lost", amount, runtimeMs);
      }

      if (event.isDamageReceived) {
        this.recordCombatMetricSample("damage_taken", amount, runtimeMs);
        this.combatPeakHitTaken = Math.max(this.combatPeakHitTaken, amount);
      } else {
        this.recordCombatMetricSample("damage_dealt", amount, runtimeMs);
        this.combatPeakHitDealt = Math.max(this.combatPeakHitDealt, amount);
      }
    }

    this.pruneCombatMetricSamples(runtimeMs);
    return true;
  }

  private recordCombatMetricsFromLegacyLines(lines: ReadonlyArray<string>): void {
    if (lines.length === 0) {
      return;
    }

    for (const line of lines) {
      const parsed = this.parseCombatMetricSampleFromLegacyLogLine(line, this.runTimeMs);
      if (!parsed) {
        continue;
      }

      this.recordCombatMetricSample(parsed.kind, parsed.amount, parsed.runTimeMs);
    }

    this.pruneCombatMetricSamples(this.runTimeMs);
  }

  private parseCombatMetricSampleFromLegacyLogLine(
    line: string,
    runTimeMs: number
  ): CombatMetricSample | null {
    const match = /(?:^|\s)([+-])(\d+)(?:\s|$)/.exec(line);
    if (!match) {
      return null;
    }

    const amount = Math.max(0, Math.floor(Number(match[2])));
    if (amount <= 0) {
      return null;
    }

    // Legacy parser fallback for unstructured combat logs.
    const kind: CombatMetricKind = match[1] === "+" ? "healing" : "damage_taken";
    return {
      kind,
      amount,
      runTimeMs
    };
  }

  private recordCombatMetricSample(kind: CombatMetricKind, amount: number, runTimeMs: number): void {
    if (kind === "damage_dealt") {
      this.combatTotalDamageDealt += amount;
    } else if (kind === "damage_taken") {
      this.combatTotalDamageTaken += amount;
    } else if (kind === "healing") {
      this.combatTotalHealingDone += amount;
    } else if (kind === "shield_gained") {
      this.combatTotalShieldGained += amount;
    } else if (kind === "shield_lost") {
      this.combatTotalShieldLost += amount;
    }

    this.combatMetricSamples = [
      ...this.combatMetricSamples,
      { kind, amount, runTimeMs }
    ];
  }

  private recordEconomyMetricSample(kind: EconomyMetricKind, amount: number, runTimeMs: number): void {
    if (amount <= 0) {
      return;
    }

    this.economyMetricSamples = [
      ...this.economyMetricSamples,
      { kind, amount, runTimeMs }
    ];
    this.pruneEconomyMetricSamples(runTimeMs);
  }

  private recordEconomyMetricsFromDrops(drops: ReadonlyArray<DropEvent>): void {
    if (drops.length === 0) {
      return;
    }

    for (const drop of drops) {
      const amount = Math.max(0, Math.floor(drop.quantity ?? 0));
      if (amount <= 0) {
        continue;
      }

      if (drop.rewardKind === "echo_fragments") {
        this.economyTotalEchoFragments += amount;
        this.recordEconomyMetricSample("echo_fragments", amount, this.runTimeMs);
        continue;
      }

      if (drop.rewardKind === "primal_core") {
        this.economyTotalPrimalCore += amount;
        this.recordEconomyMetricSample("primal_core", amount, this.runTimeMs);
      }
    }
  }

  private computeEconomyRollingSums(): Readonly<{
    xp: number;
    echoFragments: number;
    primalCore: number;
  }> {
    const windowStartMs = Math.max(0, this.runTimeMs - ANALYZER_WINDOW_MS);
    let xp = 0;
    let echoFragments = 0;
    let primalCore = 0;

    for (const sample of this.economyMetricSamples) {
      if (sample.runTimeMs < windowStartMs) {
        continue;
      }

      if (sample.kind === "xp") {
        xp += sample.amount;
      } else if (sample.kind === "echo_fragments") {
        echoFragments += sample.amount;
      } else if (sample.kind === "primal_core") {
        primalCore += sample.amount;
      }
    }

    return { xp, echoFragments, primalCore };
  }

  private resolveRollingWindowSeconds(): number {
    return resolveRollingWindowSeconds(this.runTimeMs, ANALYZER_WINDOW_MS);
  }

  private formatPerSecond(value: number): string {
    return value.toFixed(1);
  }

  private pruneCombatMetricSamples(nowMs: number): void {
    const minTimeMs = Math.max(0, nowMs - ANALYZER_SAMPLE_RETENTION_MS);
    this.combatMetricSamples = this.combatMetricSamples.filter((sample) => sample.runTimeMs >= minTimeMs);
  }

  private pruneEconomyMetricSamples(nowMs: number): void {
    const minTimeMs = Math.max(0, nowMs - ANALYZER_SAMPLE_RETENTION_MS);
    this.economyMetricSamples = this.economyMetricSamples.filter((sample) => sample.runTimeMs >= minTimeMs);
  }

  private animationLoop(timestamp: number): void {
    if (!this.scene || !this.renderer) {
      this.animationFrameId = requestAnimationFrame((nextTs) => this.animationLoop(nextTs));
      return;
    }

    if (!this.renderEnabled) {
      this.animationFrameId = requestAnimationFrame((nextTs) => this.animationLoop(nextTs));
      return;
    }

    const deltaMs = Math.min(250, Math.max(0, timestamp - this.lastFrameMs));
    this.lastFrameMs = timestamp;
    this.simulationAccumulatorMs += deltaMs;

    let updateSteps = 0;
    while (
      this.simulationAccumulatorMs >= this.fixedStepMs &&
      updateSteps < this.maxUpdateStepsPerFrame
    ) {
      this.runSimulationStep(this.fixedStepMs);
      this.simulationAccumulatorMs -= this.fixedStepMs;
      updateSteps += 1;
    }

    if (updateSteps == this.maxUpdateStepsPerFrame && this.simulationAccumulatorMs > this.fixedStepMs) {
      this.simulationAccumulatorMs = this.fixedStepMs;
    }

    if (!this.renderInProgress && this.canvasReady && this.canRenderCanvas()) {
      this.renderInProgress = true;
      void this.renderer
        .render(this.scene, (semanticId) => this.preloader.preloadResolvedAsset(semanticId))
        .finally(() => {
          this.renderInProgress = false;
        });
    }

    this.animationFrameId = requestAnimationFrame((nextTs) => this.animationLoop(nextTs));
  }

  private ensureRenderLoopStarted(): void {
    if (this.animationFrameId) {
      return;
    }

    this.lastFrameMs = performance.now();
    this.animationFrameId = requestAnimationFrame((timestamp) => this.animationLoop(timestamp));
  }

  private runSimulationStep(deltaMs: number): void {
    if (!this.scene) {
      return;
    }

    this.scene = this.engine.update(this.scene, deltaMs);
    this.activeFxCount = this.getActiveFxCount(this.scene);
  }

  private getActiveFxCount(scene: ArenaScene | null | undefined): number {
    if (!scene) {
      return 0;
    }

    return scene.fxInstances.length + scene.attackFxInstances.length;
  }

  private updateAssistConfig(
    patch: Partial<{
      enabled: boolean;
      autoHealEnabled: boolean;
      healAtHpPercent: number;
      autoGuardEnabled: boolean;
      guardAtHpPercent: number;
      autoOffenseEnabled: boolean;
      offenseMode: AssistOffenseMode;
      autoSkills: Record<AssistSkillId, boolean>;
      maxAutoCastsPerTick: number;
    }>
  ): void {
    this.assistConfig = {
      ...this.assistConfig,
      ...patch
    };
    this.scheduleAssistConfigCommandSync();
  }

  private scheduleAssistConfigCommandSync(): void {
    if (!this.canIssueBattleCommand()) {
      return;
    }

    this.clearAssistConfigDebounce();
    const nextConfig = this.assistConfig;
    this.assistConfigDebounceTimerId = setTimeout(() => {
      this.assistConfigDebounceTimerId = null;
      if (!this.canIssueBattleCommand()) {
        return;
      }

      this.enqueueCommand(this.toAssistConfigCommand(nextConfig));
    }, ASSIST_CONFIG_DEBOUNCE_MS);
  }

  private clearAssistConfigDebounce(): void {
    if (!this.assistConfigDebounceTimerId) {
      return;
    }

    clearTimeout(this.assistConfigDebounceTimerId);
    this.assistConfigDebounceTimerId = null;
  }

  private toAssistConfigCommand(config: ArenaAssistConfig): StepCommand {
    return {
      type: "set_assist_config",
      assistConfig: {
        enabled: config.enabled,
        autoHealEnabled: config.autoHealEnabled,
        healAtHpPercent: config.healAtHpPercent,
        autoGuardEnabled: config.autoGuardEnabled,
        guardAtHpPercent: config.guardAtHpPercent,
        autoOffenseEnabled: config.autoOffenseEnabled,
        offenseMode: config.offenseMode,
        autoSkills: { ...config.autoSkills },
        maxAutoCastsPerTick: config.maxAutoCastsPerTick
      }
    };
  }

  private buildDefaultAssistConfig(): ArenaAssistConfig {
    return {
      enabled: true,
      autoHealEnabled: true,
      healAtHpPercent: 40,
      autoGuardEnabled: true,
      guardAtHpPercent: 60,
      autoOffenseEnabled: true,
      offenseMode: "cooldown_spam",
      autoSkills: {
        exori: true,
        exori_min: true,
        exori_mas: true,
        avalanche: true
      },
      maxAutoCastsPerTick: 1
    };
  }

  private enqueueSetFacing(dir: FacingDirection): void {
    this.enqueueCommand({
      type: "set_facing",
      dir
    });
  }

  private enqueueInteractPoi(poiId: string): void {
    this.enqueueCommand({
      type: "interact_poi",
      poiId
    } as StepCommand);
  }

  private enqueueCommand(command: StepCommand): void {
    this.queuedCommands.push(command);
    this.queuedCommandCount = this.queuedCommands.length;
    // If we've been skipping ticks, flush immediately so the command doesn't wait for the next timer.
    if (
      this.autoStepEnabled &&
      this.pendingTickDebt > 0 &&
      !this.battleRequestInFlight &&
      !this.cardChoiceRequestInFlight &&
      !this.isAwaitingCardChoice &&
      this.battleStatus === "started"
    ) {
      this.startOrRestartAutoStepLoop();
    }
  }

  private dequeuePendingCommands(): StepCommand[] {
    const drained = [...this.queuedCommands];
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    return drained;
  }

  private requeueCommands(commands: ReadonlyArray<StepCommand>): void {
    if (commands.length == 0) {
      return;
    }

    this.queuedCommands = [...commands, ...this.queuedCommands];
    this.queuedCommandCount = this.queuedCommands.length;
  }

  private startOrRestartAutoStepLoop(): void {
    this.stopAutoStepLoop();

    if (
      !this.autoStepEnabled ||
      !this.currentBattleId ||
      this.battleStatus !== "started" ||
      this.isAwaitingCardChoice ||
      this.cardChoiceRequestInFlight
    ) {
      return;
    }

    const loopRunId = ++this.autoStepLoopRunId;
    const runLoop = async (): Promise<void> => {
      if (loopRunId !== this.autoStepLoopRunId) {
        return;
      }

      // Skip the HTTP request when there are no commands and we haven't exceeded the debt cap.
      // Only skip in live mode — replay always reads from the recorded batch sequence.
      const canSkip = !this.isReplayInProgress
        && this.queuedCommands.length === 0
        && this.pendingTickDebt < MAX_TICK_DEBT;

      if (canSkip) {
        this.pendingTickDebt++;
      } else {
        const stepCount = this.isReplayInProgress ? 1 : this.pendingTickDebt + 1;
        this.pendingTickDebt = 0;
        await this.stepBattleSafe(stepCount);
      }

      if (loopRunId !== this.autoStepLoopRunId) {
        return;
      }

      if (
        !this.autoStepEnabled ||
        !this.currentBattleId ||
        this.battleStatus !== "started" ||
        this.isAwaitingCardChoice ||
        this.cardChoiceRequestInFlight
      ) {
        return;
      }

      this.autoStepTimerId = setTimeout(() => {
        void runLoop();
      }, this.getSafeStepIntervalMs());
    };

    void runLoop();
  }

  private stopAutoStepLoop(): void {
    this.autoStepLoopRunId += 1;
    if (!this.autoStepTimerId) {
      return;
    }

    clearTimeout(this.autoStepTimerId);
    this.autoStepTimerId = null;
  }

  private getSafeStepIntervalMs(): number {
    return Math.max(50, this.stepIntervalMs);
  }

  private isTerminalBattleStatus(status: string): boolean {
    return status === "defeat" || status === "victory" || this.isRunEnded;
  }

  private canTogglePauseModal(): boolean {
    return this.isInRun &&
      !!this.currentBattleId &&
      this.battleStatus === "started" &&
      !this.isReplayInProgress &&
      !this.isDeathModalOpen &&
      !this.isAwaitingCardChoice;
  }

  private async syncBackendPauseState(paused: boolean): Promise<void> {
    if (!this.currentBattleId || this.isTerminalBattleStatus(this.battleStatus) || this.isAwaitingCardChoice) {
      return;
    }

    const battleApi = this.battleApi as unknown as {
      stepBattle?: (request: StepBattleRequest) => Promise<StepBattleResponse>;
    };
    if (typeof battleApi.stepBattle !== "function") {
      return;
    }

    if (this.battleRequestInFlight || this.cardChoiceRequestInFlight) {
      return;
    }

    const pauseCommand: StepCommand = {
      type: "set_paused",
      paused
    };

    this.runInAngularZone(() => {
      this.battleRequestInFlight = true;
    });

    try {
      if (!this.isReplayInProgress) {
        this.appendStepBatchToRecording(this.currentBattleTick, [pauseCommand], 1);
      }

      const response = await battleApi.stepBattle({
        battleId: this.currentBattleId,
        clientTick: this.currentBattleTick,
        commands: [pauseCommand]
      });

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? this.currentBattleId;
        this.currentBattleTick = response.tick ?? this.currentBattleTick;
        this.currentSeed = response.seed ?? this.currentSeed;
        this.battleStatus = response.battleStatus ?? this.battleStatus;
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? this.currentFacingDirection;
        this.applyGameOverStateFromSnapshot(response);
        this.applyBattlePayload(response);
        this.appendCommandResultLogs(response.commandResults, [pauseCommand]);
        this.syncUiMetaState();
        this.battleLog = JSON.stringify(response, null, 2);
      });
    } catch (error) {
      this.runInAngularZone(() => {
        this.battleLog = `set_paused failed: ${String(error)}`;
      });
      console.error("[ArenaPage] set_paused failed", error);
    } finally {
      this.runInAngularZone(() => {
        this.battleRequestInFlight = false;
      });
    }
  }

  private exitToArenaPrep(): void {
    this.stopAutoStepLoop();
    this.clearAssistConfigDebounce();
    this.clearShieldBreakPulse();
    this.clearLevelUpPulse();

    this.clearReplaySessionState();
    this.activeRunRecording = null;
    this.autoStepEnabled = false;
    this.pendingTickDebt = 0;
    this.battleRequestInFlight = false;
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    this.currentBattleId = "";
    this.currentBattleTick = 0;
    this.battleStatus = "idle";
    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    this.autoStepWasEnabledBeforeCardChoice = false;
    this.isDeathModalOpen = false;
    this.deathEndReason = null;
    this.isRunEnded = false;
    this.runEndReason = null;
    this.runEndedAtMs = null;
    this.runTimeMs = 0;
    this.runDurationMs = DEFAULT_RUN_DURATION_MS;
    this.timeSurvivedMs = 0;
    this.runTotalKills = 0;
    this.runEliteKills = 0;
    this.runChestsOpened = 0;
    this.isAwaitingCardChoice = false;
    this.pendingCardChoiceId = null;
    this.offeredCards = [];
    this.selectedCards = [];
    this.cardChoiceSource = "unknown";
    this.pendingCardSelectionId = null;
    this.cardChoiceSourceByChoiceId.clear();
    this.cardChoiceLevelContextByChoiceId.clear();
    this.currentCardChoiceLevelContext = null;
    this.cardChoiceRequestInFlight = false;
    this.eventFeedEntries = [];
    this.eventFeedSequence = 0;
    this.runEndedNarrativeLogged = false;
    this.combatDetailLines = [];
    this.combatMetricSamples = [];
    this.combatEliteEvents = [];
    this.combatTotalDamageDealt = 0;
    this.combatTotalDamageTaken = 0;
    this.combatTotalHealingDone = 0;
    this.combatTotalShieldGained = 0;
    this.combatTotalShieldLost = 0;
    this.combatPeakHitDealt = 0;
    this.combatPeakHitTaken = 0;
    this.economyMetricSamples = [];
    this.economyTotalXpGained = 0;
    this.economyTotalEchoFragments = 0;
    this.economyTotalPrimalCore = 0;
    this.runLootSourceMobCount = 0;
    this.runLootSourceChestCount = 0;
    this.runAwardedDropEventsCount = 0;
    this.runAwardedItemDropCount = 0;
    this.runPlayerMinHp = 0;
    this.runEchoFragmentsIncome = 0;
    this.runEchoFragmentsSpend = 0;
    this.runEchoFragmentsBalanceStart = 0;
    this.runEchoFragmentsBalanceCurrent = 0;
    this.runAwardScopeId = "";
    this.seenAwardedDropEventIds.clear();
    this.runAwardedSourceKeys.clear();
    this.runStartCraftedSnapshotByInstanceId = new Map<string, RunEquipmentSnapshot>();
    this.expConsoleEntries = [];
    this.runResultCopyMessage = "";
    this.replayIoMessage = "";
    this.replayIoErrorMessage = "";
    this.isReplayImportModalOpen = false;
    this.runLevel = RUN_INITIAL_LEVEL;
    this.runXp = RUN_INITIAL_XP;
    this.xpToNextLevel = this.computeRunXpToNextLevel(RUN_INITIAL_LEVEL);
    this.expLogSequence = 0;
    this.isInRun = false;
    this.syncUiMetaState();
    void this.router.navigate(["/arena-prep"], {
      queryParams: { zoneIndex: this.selectedZoneIndex }
    });
  }

  private triggerShieldBreakPulse(): void {
    if (this.shieldBreakPulseTimeoutId) {
      clearTimeout(this.shieldBreakPulseTimeoutId);
      this.shieldBreakPulseTimeoutId = null;
    }

    this.shieldBreakPulseActive = true;
    this.shieldBreakPulseTimeoutId = setTimeout(() => {
      this.runInAngularZone(() => {
        this.shieldBreakPulseActive = false;
      });
      this.shieldBreakPulseTimeoutId = null;
    }, SHIELD_BREAK_PULSE_DURATION_MS);
  }

  private clearShieldBreakPulse(): void {
    if (this.shieldBreakPulseTimeoutId) {
      clearTimeout(this.shieldBreakPulseTimeoutId);
      this.shieldBreakPulseTimeoutId = null;
    }

    this.shieldBreakPulseActive = false;
  }

  private triggerLevelUpPulse(): void {
    if (this.levelUpPulseTimeoutId) {
      clearTimeout(this.levelUpPulseTimeoutId);
      this.levelUpPulseTimeoutId = null;
    }

    this.levelUpPulseActive = true;
    this.levelUpPulseTimeoutId = setTimeout(() => {
      this.runInAngularZone(() => {
        this.levelUpPulseActive = false;
      });
      this.levelUpPulseTimeoutId = null;
    }, LEVEL_UP_PULSE_DURATION_MS);
  }

  private clearLevelUpPulse(): void {
    if (this.levelUpPulseTimeoutId) {
      clearTimeout(this.levelUpPulseTimeoutId);
      this.levelUpPulseTimeoutId = null;
    }

    this.levelUpPulseActive = false;
  }

  private canIssueBattleCommand(): boolean {
    return !this.battleRequestInFlight &&
      !this.cardChoiceRequestInFlight &&
      !!this.currentBattleId &&
      this.battleStatus === "started" &&
      !this.isReplayInProgress &&
      !this.isRunEnded &&
      !this.isAwaitingCardChoice &&
      !this.isPauseModalOpen &&
      !this.isDeathModalOpen;
  }

  private resolvePointerCommandFromMouse(action: PointerActionKind, event: MouseEvent): StepCommand | null {
    const scene = this.scene;
    if (!scene) {
      return null;
    }

    const tile = this.resolveTileFromMouseEvent(event);
    const poisForPointer = scene.activePois.map((p) => ({ poiId: p.poiId, tileX: p.pos.x, tileY: p.pos.y }));
    const command = resolvePointerCommand(action, tile, Object.values(scene.actorsById), poisForPointer);
    if (!command) {
      return null;
    }

    return command as StepCommand;
  }

  private resolveTileFromMouseEvent(event: MouseEvent): { x: number; y: number } | null {
    const scene = this.scene;
    const canvas = this.canvasRef?.nativeElement;
    if (!scene || !canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return screenToTile(
      event.clientX,
      event.clientY,
      rect,
      {
        columns: scene.columns,
        rows: scene.rows,
        tileSize: scene.tileSize,
        canvasWidth: rect.width,
        canvasHeight: rect.height
      }
    );
  }

  private setHoveredMobEntityId(actorId: string | null): void {
    if (!this.scene) {
      return;
    }

    const nextHoveredId = actorId ?? null;
    if ((this.scene.hoveredMobEntityId ?? null) === nextHoveredId) {
      return;
    }

    this.scene = {
      ...this.scene,
      hoveredMobEntityId: nextHoveredId
    };
  }

  private syncUiMetaState(): void {
    this.ui = {
      ...this.ui,
      tick: this.currentBattleTick,
      status: this.battleStatus,
      facing: this.currentFacingDirection
    };
  }

  private applyStepDeltaFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): void {
    const stepDeltaMs = this.readStepDeltaMsFromSnapshot(snapshot);
    if (stepDeltaMs === null) {
      return;
    }

    this.stepIntervalMs = stepDeltaMs;
  }

  private readStepDeltaMsFromSnapshot(snapshot: StartBattleResponse | StepBattleResponse): number | null {
    const value = this.readNumber((snapshot as Record<string, unknown>)["stepDeltaMs"]);
    if (value === null) {
      return null;
    }

    return Math.max(50, Math.floor(value));
  }

  private buildRunResultFinalizeMetrics(): RunResultFinalizeMetrics {
    return {
      healingDoneTotal: this.combatTotalHealingDone,
      echoFragmentsDelta: this.runEchoFragmentsNet
    };
  }

  private tryFinalizeRunResult(snapshot: StartBattleResponse | StepBattleResponse): void {
    const finalized = this.runResultLogger.finalizeIfEnded(snapshot, this.buildRunResultFinalizeMetrics());
    if (!finalized) {
      return;
    }

    this.runPlayerMinHp = finalized.playerMinHp;
    this.runResultCopyMessage = "Run result logged and stored.";
  }

  private applyGameOverStateFromSnapshot(
    snapshot: Pick<StartBattleResponse, "isGameOver" | "endReason" | "battleStatus"> | Pick<StepBattleResponse, "isGameOver" | "endReason" | "battleStatus">
  ): void {
    const record = snapshot as Record<string, unknown>;
    const snapshotIsRunEnded = this.readBoolean(record["isRunEnded"]);
    const snapshotRunEndReason = this.readString(record["runEndReason"]);
    const snapshotRunEndedAtMs = this.readNumber(record["runEndedAtMs"]);
    const snapshotTimeSurvivedMs = this.readNumber(record["timeSurvivedMs"]);
    const snapshotRunTimeMs = this.readNumber(record["runTimeMs"]);
    const snapshotIsGameOver = this.readBoolean(record["isGameOver"]);
    const snapshotEndReason = this.readString(record["endReason"]);
    const snapshotBattleStatus = this.readString(record["battleStatus"]);
    const fallbackRunEndReason = this.resolveRunEndReasonFromLegacySnapshot(snapshotEndReason, snapshotBattleStatus);
    const isRunEnded = snapshotIsRunEnded ?? snapshotIsGameOver ?? (
      snapshotBattleStatus === "defeat" || snapshotBattleStatus === "victory"
    );

    if (!isRunEnded) {
      return;
    }

    this.isRunEnded = true;
    this.runEndReason = snapshotRunEndReason ?? fallbackRunEndReason ?? this.runEndReason ?? "defeat_death";
    const resolvedRunEndedAtMs =
      snapshotRunEndedAtMs ??
      snapshotTimeSurvivedMs ??
      snapshotRunTimeMs ??
      this.runEndedAtMs ??
      this.timeSurvivedMs ??
      this.runTimeMs;
    this.runEndedAtMs = Math.max(0, Math.floor(resolvedRunEndedAtMs));
    if (snapshotTimeSurvivedMs === null && this.timeSurvivedMs <= 0) {
      this.timeSurvivedMs = this.runEndedAtMs;
    }
    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    this.isDeathModalOpen = true;
    this.deathEndReason = this.runEndReason;
  }

  private resolveRunEndReasonFromLegacySnapshot(
    endReason: string | null,
    battleStatus: string | null
  ): "victory_time" | "defeat_death" | null {
    if (battleStatus === "victory" || endReason === "time") {
      return "victory_time";
    }

    if (battleStatus === "defeat" || endReason === "death") {
      return "defeat_death";
    }

    return null;
  }

  private runInAngularZone(action: () => void): void {
    if (NgZone.isInAngularZone()) {
      action();
      this.cdr.markForCheck();
      return;
    }

    this.ngZone.run(() => {
      action();
      this.cdr.markForCheck();
    });
  }

  private isTypingContext(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) {
      return false;
    }

    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement
    ) {
      return true;
    }

    return activeElement instanceof HTMLElement && activeElement.isContentEditable;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private resolveZoneIndexFromRoute(): number {
    const queryParamMap = this.route.snapshot.queryParamMap;
    const rawZone = queryParamMap.get("zoneIndex") ?? queryParamMap.get("zone");
    if (!rawZone) {
      return DEFAULT_ZONE_INDEX;
    }

    const parsedZone = Number.parseInt(rawZone, 10);
    if (!Number.isFinite(parsedZone)) {
      return DEFAULT_ZONE_INDEX;
    }

    return this.clampZoneIndex(parsedZone);
  }

  private clampZoneIndex(zoneIndex: number): number {
    if (!Number.isFinite(zoneIndex)) {
      return DEFAULT_ZONE_INDEX;
    }

    return Math.max(DEFAULT_ZONE_INDEX, Math.min(MAX_ZONE_INDEX, Math.floor(zoneIndex)));
  }

  private readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
  }

  private readStringMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const record = value as Record<string, unknown>;
    const mapped: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(record)) {
      if (typeof rawValue === "string" && key.trim().length > 0 && rawValue.trim().length > 0) {
        mapped[key] = rawValue;
      }
    }

    return mapped;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readHitKind(value: unknown): "normal" | "crit" | null {
    return value === "normal" || value === "crit" ? value : null;
  }

  private readElementValue(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null {
    const numberValue = this.readNumber(value);
    if (numberValue === null) {
      return null;
    }

    if (
      numberValue === 1 ||
      numberValue === 2 ||
      numberValue === 3 ||
      numberValue === 4 ||
      numberValue === 5 ||
      numberValue === 6 ||
      numberValue === 7 ||
      numberValue === 8 ||
      numberValue === 9
    ) {
      return numberValue;
    }

    return null;
  }

  private readMobArchetypeValue(value: unknown): 1 | 2 | 3 | 4 | null {
    const numberValue = this.readNumber(value);
    if (numberValue === 1 || numberValue === 2 || numberValue === 3 || numberValue === 4) {
      return numberValue;
    }

    return null;
  }

  private toGroundTargetPos(value: StartBattleResponse["groundTargetPos"] | StepBattleResponse["groundTargetPos"]): { x: number; y: number } | null {
    if (!value) {
      return null;
    }

    const typedValue = value as ApiGroundTargetPos;
    const x = this.readNumber((typedValue as Record<string, unknown>)["x"]);
    const y = this.readNumber((typedValue as Record<string, unknown>)["y"]);
    if (x === null || y === null) {
      return null;
    }

    return { x, y };
  }

  private toAssistConfig(value: StartBattleResponse["assistConfig"] | StepBattleResponse["assistConfig"]): ArenaAssistConfig | null {
    if (!value) {
      return null;
    }

    const typedValue = value as ApiAssistConfig;
    const defaultConfig = this.buildDefaultAssistConfig();
    const offenseMode = this.normalizeAssistOffenseMode(this.readString((typedValue as Record<string, unknown>)["offenseMode"]));
    const autoSkills = this.toAssistSkillMap((typedValue as Record<string, unknown>)["autoSkills"], defaultConfig.autoSkills);

    return {
      enabled: this.readBoolean((typedValue as Record<string, unknown>)["enabled"]) ?? defaultConfig.enabled,
      autoHealEnabled: this.readBoolean((typedValue as Record<string, unknown>)["autoHealEnabled"]) ?? defaultConfig.autoHealEnabled,
      healAtHpPercent: this.clampAssistPercent(
        this.readNumber((typedValue as Record<string, unknown>)["healAtHpPercent"]) ?? defaultConfig.healAtHpPercent
      ),
      autoGuardEnabled: this.readBoolean((typedValue as Record<string, unknown>)["autoGuardEnabled"]) ?? defaultConfig.autoGuardEnabled,
      guardAtHpPercent: this.clampAssistPercent(
        this.readNumber((typedValue as Record<string, unknown>)["guardAtHpPercent"]) ?? defaultConfig.guardAtHpPercent
      ),
      autoOffenseEnabled: this.readBoolean((typedValue as Record<string, unknown>)["autoOffenseEnabled"]) ?? defaultConfig.autoOffenseEnabled,
      offenseMode: offenseMode ?? defaultConfig.offenseMode,
      autoSkills,
      maxAutoCastsPerTick: this.clampAssistMaxAutoCasts(
        this.readNumber((typedValue as Record<string, unknown>)["maxAutoCastsPerTick"]) ?? defaultConfig.maxAutoCastsPerTick
      )
    };
  }

  private toAssistSkillMap(
    value: unknown,
    fallback: Readonly<Record<AssistSkillId, boolean>>
  ): Record<AssistSkillId, boolean> {
    const result = { ...fallback };
    if (!value || typeof value !== "object") {
      return result;
    }

    const record = value as Record<string, unknown>;
    for (const skillId of ASSIST_SKILL_IDS) {
      const parsed = this.readBoolean(record[skillId]);
      if (parsed === null) {
        continue;
      }

      result[skillId] = parsed;
    }

    return result;
  }

  private normalizeAssistOffenseMode(value: string | null): AssistOffenseMode | null {
    if (!value) {
      return null;
    }

    return value === "smart" ? "smart" : value === "cooldown_spam" ? "cooldown_spam" : null;
  }

  private clampAssistPercent(value: number): number {
    return Math.min(99, Math.max(1, value));
  }

  private clampAssistMaxAutoCasts(value: number): number {
    return Math.min(3, Math.max(1, value));
  }

  private resolveRunEndedAtMsForDisplay(): number {
    if (this.runEndedAtMs !== null) {
      return Math.max(0, Math.floor(this.runEndedAtMs));
    }

    return Math.max(0, Math.floor(this.timeSurvivedMs));
  }

  private resolveDisplayedRunTimeMs(): number {
    if (!this.isRunEnded) {
      return Math.max(0, Math.floor(this.runTimeMs));
    }

    return this.resolveRunEndedAtMsForDisplay();
  }

  private formatOptionalRunTime(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return "n/a";
    }

    return formatRunTimer(Math.max(0, Math.floor(value)));
  }

  private formatOptionalTelemetryNumber(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return "n/a";
    }

    return String(Math.max(0, Math.floor(value)));
  }

  private formatOptionalPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return "n/a";
    }

    return `${Math.max(0, Math.floor(value))}%`;
  }

  private formatMultiplier(value: number): string {
    if (!Number.isFinite(value)) {
      return "0.00x";
    }

    return `${value.toFixed(2)}x`;
  }

  private toFacingDirection(raw: string | null | undefined): FacingDirection | null {
    if (!raw) {
      return null;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized === "up" || normalized === "n") {
      return "up";
    }

    if (normalized === "up_right" || normalized === "up-right" || normalized === "ne") {
      return "up_right";
    }

    if (normalized === "right" || normalized === "e") {
      return "right";
    }

    if (normalized === "down_right" || normalized === "down-right" || normalized === "se") {
      return "down_right";
    }

    if (normalized === "down" || normalized === "s") {
      return "down";
    }

    if (normalized === "down_left" || normalized === "down-left" || normalized === "sw") {
      return "down_left";
    }

    if (normalized === "left" || normalized === "w") {
      return "left";
    }

    if (normalized === "up_left" || normalized === "up-left" || normalized === "nw") {
      return "up_left";
    }

    return null;
  }

  private toFacingDirectionFromArrowKey(key: string): FacingDirection | null {
    if (key === "ArrowUp") {
      return "up";
    }

    if (key === "ArrowDown") {
      return "down";
    }

    if (key === "ArrowLeft") {
      return "left";
    }

    if (key === "ArrowRight") {
      return "right";
    }

    return null;
  }


  private isArenaWindowId(value: string): value is ArenaUiWindowId {
    return value === ARENA_UI_WINDOW_IDS.backpack ||
      value === ARENA_UI_WINDOW_IDS.equipmentCharacter ||
      value === ARENA_UI_WINDOW_IDS.lootFeed ||
      value === ARENA_UI_WINDOW_IDS.statusSkills;
  }

  private toDockModuleId(id: ArenaUiWindowId): DockModuleId | null {
    if (id === ARENA_UI_WINDOW_IDS.statusSkills) {
      return "status";
    }

    if (id === ARENA_UI_WINDOW_IDS.backpack) {
      return "backpack";
    }

    if (id === ARENA_UI_WINDOW_IDS.equipmentCharacter) {
      return "equipment";
    }

    if (id === ARENA_UI_WINDOW_IDS.lootFeed) {
      return "loot";
    }

    return null;
  }

  private toggleDockModuleFromHotkey(id: DockModuleId): void {
    const module = this.dockLayoutService.getModule(id);
    if (!module) {
      return;
    }

    if (module.isVisible) {
      this.dockLayoutService.hide(id);
      if (id === "backpack") {
        this.clearBackpackEquipMode();
      }
      return;
    }

    this.dockLayoutService.show(id);
    this.dockLayoutService.expand(id);
  }

  private clearBackpackEquipMode(): void {
    this.backpackForcedFilter = null;
    this.backpackEquipMode = null;
  }

  private toBackpackFilter(_slot: Exclude<BackpackEquipMode, null>): BackpackFilter {
    return "weapons";
  }

  private focusDamageConsole(): void {
    this.setTopLeftTab("combat");
    this.focusTopLeftPanel();
    this.focusLeftLogsPane();
    this.highlightLogPanel("damage");
    this.scrollConsoleToBottom(this.topLeftPanelRef, ".combat-analyzer__body");
  }

  private focusLootConsole(): void {
    this.setTopLeftTab("economy");
    this.focusTopLeftPanel();
    this.focusLeftLogsPane();
    this.highlightLogPanel("loot");
    this.scrollConsoleToBottom(this.topLeftPanelRef, ".economy-analyzer__body");
  }

  private focusExpConsole(): void {
    this.setTopLeftTab("events");
    this.focusTopLeftPanel();
    this.focusLeftLogsPane();
    this.highlightLogPanel("exp");
    this.scrollConsoleToBottom(this.topLeftPanelRef, ".events-feed");
  }

  private focusEquipmentPanel(): void {
    this.focusPane(this.equipmentPanelRef);
  }

  private focusBackpackPanel(): void {
    this.focusPane(this.backpackPanelRef);
  }

  private focusToolsPanel(): void {
    this.focusPane(this.toolsPanelRef);
  }

  private focusTopLeftPanel(): void {
    this.focusPane(this.topLeftPanelRef);
  }

  private focusStatusPanel(): void {
    this.focusPane(this.statusPanelRef);
  }

  private focusLeftLogsPane(): void {
    this.focusPane(this.leftLogsPaneRef);
  }

  private focusRightInfoPane(): void {
    this.focusPane(this.rightInfoPaneRef);
  }

  private focusPane(paneRef: ElementRef<HTMLElement> | undefined): void {
    const pane = paneRef?.nativeElement;
    if (!pane) {
      return;
    }

    requestAnimationFrame(() => {
      pane.focus({ preventScroll: true });
    });
  }

  private highlightLogPanel(panel: "damage" | "loot" | "exp"): void {
    this.highlightedLogPanel = panel;
    setTimeout(() => {
      if (this.highlightedLogPanel === panel) {
        this.highlightedLogPanel = null;
      }
    }, 650);
  }

  private scrollConsoleToBottom(panelRef: ElementRef<HTMLElement> | undefined, selector: string): void {
    const panel = panelRef?.nativeElement;
    if (!panel) {
      return;
    }

    requestAnimationFrame(() => {
      const body = panel.querySelector(selector);
      if (!(body instanceof HTMLElement)) {
        return;
      }

      body.scrollTop = body.scrollHeight;
    });
  }

  private loadToolsTab(): ToolsTabId {
    if (!this.canUseStorage()) {
      return "helper";
    }

    try {
      const value = window.localStorage.getItem(TOOLS_TAB_STORAGE_KEY);
      return value === "helper" || value === "bestiary"
        ? value
        : "helper";
    } catch {
      return "helper";
    }
  }

  private persistToolsTab(): void {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      window.localStorage.setItem(TOOLS_TAB_STORAGE_KEY, this.selectedToolsTab);
    } catch {
      // Ignore storage failures to avoid blocking gameplay.
    }
  }

  private canUseStorage(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return typeof window.localStorage !== "undefined";
    } catch {
      return false;
    }
  }

  private updateBestiaryFocusSpecies(): void {
    const focused = this.resolveBestiaryFocusSpeciesFromScene();
    if (!focused) {
      return;
    }

    this.lastFocusedSpecies = focused;
  }

  private resolveBestiaryFocusSpecies(): string | null {
    const focused = this.resolveBestiaryFocusSpeciesFromScene();
    if (focused) {
      this.lastFocusedSpecies = focused;
      return focused;
    }

    return this.lastFocusedSpecies;
  }

  private resolveBestiaryFocusSpeciesFromScene(): string | null {
    const scene = this.scene;
    if (!scene || !scene.effectiveTargetEntityId) {
      return null;
    }

    const target = scene.actorsById[scene.effectiveTargetEntityId];
    if (!target || target.kind !== "mob" || !target.mobType) {
      return null;
    }

    return this.mapMobArchetypeToSpecies(target.mobType);
  }

  private mapMobArchetypeToSpecies(mobType: number): string | null {
    if (mobType === 1) {
      return "melee_brute";
    }

    if (mobType === 2) {
      return "ranged_archer";
    }

    if (mobType === 3) {
      return "melee_demon";
    }

    if (mobType === 4) {
      return "ranged_dragon";
    }

    return null;
  }

  formatSpeciesLabel(species: string): string {
    if (!species) {
      return "Unknown";
    }

    return species
      .split("_")
      .map((token) => (token.length > 0 ? token[0].toUpperCase() + token.slice(1) : token))
      .join(" ");
  }

  private logResolvedAssetPaths(): void {
    const resolvedEntries = DEV_LOG_ASSET_IDS.map((assetId) => {
      try {
        const resolved = this.resolver.resolve(assetId);
        return `${assetId} -> ${resolved.url}`;
      } catch (error) {
        return `${assetId} -> <missing> (${String(error)})`;
      }
    });

    console.info("[ArenaPage] Resolved semantic assets:\n" + resolvedEntries.join("\n"));
  }

  private startCanvasResizeObserver(): void {
    const viewport = this.canvasViewportRef?.nativeElement;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    this.canvasResizeObserver = new ResizeObserver(() => {
      this.scheduleCanvasSync();
    });
    this.canvasResizeObserver.observe(viewport);
  }

  private async prepareCanvasForFirstRender(): Promise<void> {
    const measured = await this.measureCanvasViewportWithRetry();
    if (!measured) {
      throw new Error("Canvas viewport could not be measured.");
    }

    this.syncCanvasSize();
    await this.nextAnimationFrame();
    this.syncCanvasSize();
  }

  private scheduleCanvasSync(): void {
    if (this.resizeSyncFrameId) {
      return;
    }

    this.resizeSyncFrameId = requestAnimationFrame(() => {
      this.resizeSyncFrameId = 0;
      this.syncCanvasSize();
    });
  }

  private async measureCanvasViewportWithRetry(): Promise<boolean> {
    for (let attempt = 0; attempt < this.maxCanvasMeasureAttempts; attempt += 1) {
      if (this.tryCaptureViewportSizeFromLayout(this.minReliableViewportSizePx)) {
        return true;
      }

      await this.nextAnimationFrame();
    }

    if (this.applyFallbackViewportSize()) {
      return true;
    }

    // Keep observer-based recovery path alive for late layout stabilization.
    this.canvasReady = false;
    return false;
  }

  private tryCaptureViewportSizeFromLayout(minSizePx: number): boolean {
    const viewport = this.canvasViewportRef?.nativeElement;
    if (!viewport) {
      return false;
    }

    const bounds = viewport.getBoundingClientRect();
    const width = Math.floor(bounds.width);
    const height = Math.floor(bounds.height);
    if (width < minSizePx || height < minSizePx) {
      return false;
    }

    this.lastKnownViewportWidthCss = width;
    this.lastKnownViewportHeightCss = height;
    return true;
  }

  private applyFallbackViewportSize(): boolean {
    const fallback = this.computeFallbackViewportSize();
    if (!fallback) {
      return false;
    }

    this.lastKnownViewportWidthCss = fallback.width;
    this.lastKnownViewportHeightCss = fallback.height;
    return true;
  }

  private computeFallbackViewportSize(): { width: number; height: number } | null {
    const viewport = this.canvasViewportRef?.nativeElement;
    const viewportBounds = viewport?.getBoundingClientRect();
    const rightPanelWidth = 360;
    const headerHeight = 64;
    const horizontalPadding = 48;
    const verticalPadding = 48;

    const width = Math.floor(
      Math.max(
        viewportBounds?.width ?? 0,
        window.innerWidth - rightPanelWidth - horizontalPadding
      )
    );
    const height = Math.floor(
      Math.max(
        viewportBounds?.height ?? 0,
        window.innerHeight - headerHeight - verticalPadding
      )
    );

    if (width <= 0 || height <= 0) {
      return null;
    }

    return { width, height };
  }

  private syncCanvasSize(): void {
    const canvas = this.canvasRef?.nativeElement;
    const viewport = this.canvasViewportRef?.nativeElement;
    if (!canvas || !this.scene || !this.canvasContext) {
      this.canvasReady = false;
      return;
    }

    if (viewport) {
      const bounds = viewport.getBoundingClientRect();
      const layoutWidth = Math.floor(bounds.width);
      const layoutHeight = Math.floor(bounds.height);
      if (layoutWidth >= 1 && layoutHeight >= 1) {
        this.lastKnownViewportWidthCss = layoutWidth;
        this.lastKnownViewportHeightCss = layoutHeight;
      }
    }

    if (this.lastKnownViewportWidthCss <= 0 || this.lastKnownViewportHeightCss <= 0) {
      this.applyFallbackViewportSize();
    }

    const cssWidth = this.lastKnownViewportWidthCss;
    const cssHeight = this.lastKnownViewportHeightCss;
    if (cssWidth <= 0 || cssHeight <= 0) {
      this.canvasReady = false;
      return;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const nextPixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const nextPixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

    if (canvas.width !== nextPixelWidth || canvas.height !== nextPixelHeight) {
      canvas.width = nextPixelWidth;
      canvas.height = nextPixelHeight;
    }

    canvas.style.width = "100%";
    canvas.style.height = "100%";
    this.canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rawTileSize = computeMaxTileSizeForViewport(
      this.scene.columns,
      this.scene.rows,
      cssWidth,
      cssHeight
    );
    const nextTileSize = Math.max(16, Math.min(160, rawTileSize));
    if (nextTileSize <= 0) {
      this.canvasReady = false;
      return;
    }

    if (this.scene.tileSize !== nextTileSize) {
      this.scene = {
        ...this.scene,
        tileSize: nextTileSize
      };
    }

    this.canvasReady = true;
  }

  private canRenderCanvas(): boolean {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return false;
    }

    if (this.lastKnownViewportWidthCss <= 0 || this.lastKnownViewportHeightCss <= 0) {
      return false;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const expectedWidth = Math.max(1, Math.floor(this.lastKnownViewportWidthCss * dpr));
    const expectedHeight = Math.max(1, Math.floor(this.lastKnownViewportHeightCss * dpr));

    if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
      return false;
    }

    // Prevent drawing while still on the default fallback backing store dimensions.
    if ((canvas.width === 300 && canvas.height === 150) && (expectedWidth !== 300 || expectedHeight !== 150)) {
      return false;
    }

    return true;
  }

  private nextAnimationFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

async function copyTextBestEffort(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy path.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}
