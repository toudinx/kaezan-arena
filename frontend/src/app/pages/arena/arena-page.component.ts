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
import { Router } from "@angular/router";
import { AssetPreloaderService } from "../../arena/assets/asset-preloader.service";
import { AssetResolverService } from "../../arena/assets/asset-resolver.service";
import { ArenaEngine } from "../../arena/engine/arena-engine";
import {
  ArenaActorState,
  ArenaBattleEvent,
  ArenaBestiaryEntry,
  ArenaBuffState,
  ArenaPoiState,
  DecalInstance,
  ArenaScene,
  ArenaSkillState,
  DamageNumberInstance
} from "../../arena/engine/arena-engine.types";
import { normalizeDecalKind, resolveDecalSemanticId } from "../../arena/engine/decal.helpers";
import { CanvasLayeredRenderer } from "../../arena/render/canvas-layered-renderer";
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
import {
  BattleApiService,
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
import { LootConsoleWindowComponent } from "./loot-console-window.component";
import {
  type StatusBuffViewModel,
  type StatusSkillSlotViewModel,
  mapStatusBuffs,
  mapStatusSkillSlots,
  resolveSkillIdForHotkeyKey
} from "./status-skills.helpers";
import { EquipmentPaperdollWindowComponent } from "./equipment-paperdoll-window.component";
import type { BackpackFilter } from "./backpack-inventory.helpers";
import { DockLayoutService, type DockModuleId, type DockModuleState } from "./dock-layout.service";
import { HelperAssistWindowComponent, type AssistSkillToggleChangedEvent } from "./helper-assist-window.component";
import {
  DamageConsoleComponent
} from "./damage-console.component";
import {
  type DamageConsoleEntry,
  mapDamageNumbersToConsoleEntries,
  mergeDamageConsoleEntries
} from "./damage-console.helpers";
import { computeExpProgressPercent, computeUnifiedVitalsPercent } from "./arena-hud.helpers";

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
type StepCommand = NonNullable<StepBattleRequest["commands"]>[number];
type FacingDirection = "up" | "up_right" | "right" | "down_right" | "down" | "down_left" | "left" | "up_left";
type MovementInputKey = "w" | "a" | "s" | "d" | "q" | "e" | "z" | "c";
type PressedMovementKeyState = Readonly<{
  pressedAtMs: number;
  sequence: number;
}>;
type AssistOffenseMode = "cooldown_spam" | "smart";
type AssistSkillId = "exori" | "exori_min" | "exori_mas" | "avalanche";
type RightInfoTabId = "helper" | "bestiary" | "status";
type PreRunCharacterViewModel = Readonly<{
  id: string;
  name: string;
  level: number;
  xp: number;
  equippedWeaponName: string;
  isActive: boolean;
}>;
export const RIGHT_INFO_TAB_STORAGE_KEY = "kaezan_arena_right_tab_v1";
const AVALANCHE_SKILL_ID = "avalanche";
const ASSIST_CONFIG_DEBOUNCE_MS = 200;
const MOVEMENT_BUFFER_TTL_MS = 250;
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
}>;
type BootPhase =
  | "measuring_canvas"
  | "resolving_manifest"
  | "preloading_assets"
  | "ready_to_start"
  | "starting_battle"
  | "running"
  | "error";

const DEV_LOG_ASSET_IDS = [
  "tile.floor.default",
  "tile.wall.stone",
  "sprite.player.idle",
  "sprite.player.run",
  "sprite.player.hit",
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
] as const;

@Component({
  selector: "app-arena-page",
  standalone: true,
  imports: [
    BackpackWindowComponent,
    LootConsoleWindowComponent,
    EquipmentPaperdollWindowComponent,
    HelperAssistWindowComponent,
    DamageConsoleComponent
  ],
  templateUrl: "./arena-page.component.html",
  styleUrl: "./arena-page.component.css"
})
export class ArenaPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild("arenaCanvas", { static: true }) private readonly canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasViewport", { static: false }) private readonly canvasViewportRef?: ElementRef<HTMLDivElement>;
  @ViewChild("leftLogsPane", { static: false }) private readonly leftLogsPaneRef?: ElementRef<HTMLElement>;
  @ViewChild("rightInfoPane", { static: false }) private readonly rightInfoPaneRef?: ElementRef<HTMLElement>;
  @ViewChild("damageConsolePanel", { static: false }) private readonly damageConsolePanelRef?: ElementRef<HTMLElement>;
  @ViewChild("lootConsolePanel", { static: false }) private readonly lootConsolePanelRef?: ElementRef<HTMLElement>;
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
  battleRequestInFlight = false;
  recentDamageNumbers: string[] = [];
  recentCommandResults: string[] = [];
  autoStepEnabled = false;
  stepIntervalMs = 250;
  queuedCommandCount = 0;
  pingInFlight = false;
  lastPingResult = "Not pinged yet.";
  currentFacingDirection: FacingDirection = "up";
  currentSeed = 0;
  altarCooldownRemainingMs = 0;
  bestiaryEntries: ArenaBestiaryEntry[] = [];
  pendingSpeciesChest: string | null = null;
  lastFocusedSpecies: string | null = null;
  readonly accountId = "dev_account";
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
  backpackWeaponFilterMode = false;
  selectedRightInfoTab: RightInfoTabId = this.loadRightInfoTab();
  highlightedLogPanel: "damage" | "loot" | null = null;
  isHotkeysModalOpen = false;
  isPauseModalOpen = false;
  isDeathModalOpen = false;
  deathEndReason: string | null = null;
  damageConsoleEntries: DamageConsoleEntry[] = [];
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
    facing: "up"
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
  private readonly pressedMovementKeys = new Map<MovementInputKey, PressedMovementKeyState>();
  private movementKeySequence = 0;
  private bufferedMovementDirection: FacingDirection | null = null;
  private bufferedMovementExpiresAtMs = 0;
  private bufferedMovementAwaitingResult = false;
  private autoStepTimerId: ReturnType<typeof setTimeout> | null = null;
  private assistConfigDebounceTimerId: ReturnType<typeof setTimeout> | null = null;
  private autoStepWasEnabledBeforePause = false;
  private autoStepLoopRunId = 0;
  private lastKnownViewportWidthCss = 0;
  private lastKnownViewportHeightCss = 0;
  private readyPulseSkillIds = new Set<string>();
  private readonly sentLootSourceKeys = new Set<string>();
  assistConfig: ArenaAssistConfig = this.buildDefaultAssistConfig();
  readonly hotkeyGroups: ReadonlyArray<Readonly<{ title: string; entries: ReadonlyArray<string> }>> = [
    { title: "Movement", entries: ["W/A/S/D move", "Q/E/Z/C diagonal move", "Last input direction wins"] },
    { title: "Facing", entries: ["Arrow keys set facing"] },
    { title: "Targeting", entries: ["Left click ground target", "Right click lock target", "F interact POI"] },
    {
      title: "UI",
      entries: [
        "T toggle AUTO ON/OFF",
        "Esc toggle Pause modal",
        "I focus Backpack",
        "C focus Equipment (outside run)",
        "H open Helper tab",
        "B open Bestiary tab",
        "K open Status tab",
        "D focus Damage log",
        "L focus Loot log"
      ]
    },
    { title: "Skills", entries: ["1-4 cast skills", "5 cast Guard"] }
  ];
  readonly arenaWindowIds = ARENA_UI_WINDOW_IDS;

  constructor(
    private readonly resolver: AssetResolverService,
    private readonly preloader: AssetPreloaderService,
    private readonly battleApi: BattleApiService,
    private readonly router: Router,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly accountApi: AccountApiService = new AccountApiService(),
    private readonly uiLayoutService: UiLayoutService = new UiLayoutService(),
    private readonly dockLayoutService: DockLayoutService = new DockLayoutService()
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
    const shield = Math.max(0, Math.min(this.ui.player.shield, this.ui.player.maxShield));
    return computeUnifiedVitalsPercent(shield, this.ui.player.maxHp);
  }

  get playerHpPercentRounded(): number {
    return Math.round(this.playerHpPercent);
  }

  get playerShieldPercentRounded(): number {
    return Math.round(this.playerShieldPercentOfMaxHp);
  }

  get playerExpPercent(): number {
    return computeExpProgressPercent(this.selectedCharacter?.level ?? 1, this.selectedCharacter?.xp ?? 0);
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
    return mapStatusSkillSlots(
      this.ui.skills,
      this.ui.player.globalCooldownRemainingMs,
      this.ui.player.globalCooldownTotalMs
    );
  }

  get preRunCharacters(): ReadonlyArray<PreRunCharacterViewModel> {
    const state = this.accountState;
    if (!state) {
      return [];
    }

    const characters = Object.values(state.characters).map((character) => ({
      id: character.characterId,
      name: character.name,
      level: character.level,
      xp: character.xp,
      equippedWeaponName: this.resolveEquippedWeaponName(character),
      isActive: character.characterId === state.activeCharacterId
    }));

    characters.sort((left, right) => {
      if (left.isActive && !right.isActive) {
        return -1;
      }

      if (!left.isActive && right.isActive) {
        return 1;
      }

      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : left.id.localeCompare(right.id);
    });

    return characters;
  }

  get selectedPreRunCharacter(): PreRunCharacterViewModel | null {
    if (!this.selectedCharacterId) {
      return this.preRunCharacters[0] ?? null;
    }

    return this.preRunCharacters.find((character) => character.id === this.selectedCharacterId) ?? null;
  }

  get isPreRunLoading(): boolean {
    return this.accountStateRequestInFlight && !this.accountLoaded;
  }

  get isPreRunEmptyState(): boolean {
    return this.accountLoaded && !this.accountStateRequestInFlight && this.preRunCharacters.length === 0;
  }

  get statusTabRows(): ReadonlyArray<Readonly<{ label: string; value: string }>> {
    return [
      { label: "Attack", value: this.resolveStatusModifier(["attack", "atk", "power"]) },
      { label: "Crit rate", value: this.resolveStatusModifier(["crit_rate", "crit", "critical"]) },
      { label: "Life leech", value: this.resolveStatusModifier(["life_leech", "leech"]) },
      { label: "Reflect", value: this.resolveStatusModifier(["reflect", "thorns"]) },
      { label: "Shield capacity", value: String(Math.max(0, this.ui.player.maxShield)) }
    ];
  }

  async ngAfterViewInit(): Promise<void> {
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
      await this.prepareCanvasForFirstRender();
      this.startCanvasResizeObserver();

      this.bootPhase = "resolving_manifest";
      await this.resolver.loadManifest();
      this.logResolvedAssetPaths();

      this.bootPhase = "preloading_assets";
      await Promise.all([
        this.preloader.preloadAsset("tile.floor.default"),
        this.preloader.preloadAsset("tile.wall.stone"),
        this.preloader.preloadAsset("sprite.player.idle"),
        this.preloader.preloadAsset("sprite.player.run"),
        this.preloader.preloadAsset("sprite.player.hit"),
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
    this.clearMovementInputState();
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

    if (normalizedKey === "i") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.focusBackpackPanel();
      this.focusRightInfoPane();
      return;
    }

    if (normalizedKey === "c") {
      if (!this.isMovementInputContextActive()) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }

        this.focusEquipmentPanel();
        this.focusRightInfoPane();
        return;
      }
    }

    if (normalizedKey === "h") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.setRightInfoTab("helper");
      this.focusRightInfoPane();
      return;
    }

    if (normalizedKey === "b") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.setRightInfoTab("bestiary");
      this.focusRightInfoPane();
      return;
    }

    if (normalizedKey === "k") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.setRightInfoTab("status");
      this.focusRightInfoPane();
      return;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.interactBestPoiInRange();
      return;
    }

    const movementKey = this.toMovementKey(event.key);
    if (movementKey) {
      event.preventDefault();
      this.onMovementKeyDown(movementKey, event.repeat);
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

    const mappedSkillId = resolveSkillIdForHotkeyKey(event.key);
    if (mappedSkillId) {
      event.preventDefault();
      this.onStatusSkillActivated(mappedSkillId);
      return;
    }

    if (event.key === "5") {
      if (!this.canCastSkill("guard")) {
        return;
      }

      event.preventDefault();
      this.castSkill("guard");
    }
  }

  @HostListener("window:keyup", ["$event"])
  onKeyUp(event: KeyboardEvent): void {
    const movementKey = this.toMovementKey(event.key);
    if (!movementKey) {
      return;
    }

    this.onMovementKeyUp(movementKey);
  }

  @HostListener("window:blur")
  onWindowBlur(): void {
    this.clearMovementInputState();
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
      this.clearBackpackWeaponFilterMode();
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
      this.clearBackpackWeaponFilterMode();
    }
  }

  async onBackpackEquipRequested(weaponInstanceId: string): Promise<void> {
    const equipped = await this.equipWeaponFromInventory(weaponInstanceId);
    if (equipped) {
      this.clearBackpackWeaponFilterMode();
    }
  }

  onLootConsoleItemClicked(itemId: string): void {
    this.clearBackpackWeaponFilterMode();
    this.focusBackpackPanel();
    this.focusRightInfoPane();
    this.backpackHighlightItemId = itemId;
    this.backpackHighlightRequestId += 1;
  }

  onEquipmentWeaponSlotActivated(): void {
    this.backpackForcedFilter = "weapons";
    this.backpackWeaponFilterMode = true;
    this.focusBackpackPanel();
    this.focusRightInfoPane();
  }

  onStatusSkillActivated(skillId: string): void {
    this.castSkill(skillId);
  }

  onAssistEnabledToggle(enabled: boolean): void {
    this.updateAssistConfig({ enabled });
  }

  toggleAutoAssist(): void {
    this.updateAssistConfig({ enabled: !this.assistConfig.enabled });
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

  setRightInfoTab(tabId: RightInfoTabId): void {
    if (this.selectedRightInfoTab === tabId) {
      return;
    }

    this.selectedRightInfoTab = tabId;
    this.persistRightInfoTab();
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

  onArenaCanvasClick(event: MouseEvent): void {
    if (event.button !== 0 || !this.canIssueBattleCommand()) {
      return;
    }

    const command = this.resolvePointerCommandFromMouse("left_click", event);
    if (!command) {
      return;
    }

    this.enqueueCommand(command);
    this.enqueueCastSkill(AVALANCHE_SKILL_ID);
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

  stepOnce(): void {
    void this.stepBattleSafe();
  }

  async startRun(): Promise<void> {
    this.isInRun = true;
    await this.beginNewRun();
  }

  async restartBattle(): Promise<void> {
    await this.beginNewRun();
  }

  openPauseModal(): void {
    if (!this.canTogglePauseModal()) {
      return;
    }

    this.autoStepWasEnabledBeforePause = this.autoStepEnabled;
    this.isPauseModalOpen = true;
    this.autoStepEnabled = false;
    this.stopAutoStepLoop();
    this.clearMovementInputState();
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

  onPauseModalExit(): void {
    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    this.returnToPreRun();
  }

  async onDeathModalRestartRun(): Promise<void> {
    this.isDeathModalOpen = false;
    this.deathEndReason = null;
    await this.restartBattle();
  }

  onDeathModalReturnToPreRun(): void {
    this.returnToPreRun();
  }

  private async beginNewRun(): Promise<void> {
    this.stopAutoStepLoop();
    this.clearAssistConfigDebounce();
    this.clearMovementInputState();
    this.autoStepEnabled = false;
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    this.recentDamageNumbers = [];
    this.damageConsoleEntries = [];
    this.recentCommandResults = [];
    this.assistConfig = this.buildDefaultAssistConfig();
    this.bestiaryEntries = [];
    this.pendingSpeciesChest = null;
    this.lastFocusedSpecies = null;
    this.isPauseModalOpen = false;
    this.isDeathModalOpen = false;
    this.deathEndReason = null;
    this.autoStepWasEnabledBeforePause = false;
    this.sentLootSourceKeys.clear();
    this.lootFeed = [];
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
      await this.startBattle();
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

  exitBattle(): void {
    this.returnToPreRun();
  }

  castExoriMin(): void {
    this.castSkill("exori_min");
  }

  castExori(): void {
    this.castSkill("exori");
  }

  castExoriMas(): void {
    this.castSkill("exori_mas");
  }

  castHeal(): void {
    this.castSkill("heal");
  }

  castGuard(): void {
    this.castSkill("guard");
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

  get selectedCharacterArmorLabel(): string {
    return this.resolveSelectedEquipmentLabel("armor");
  }

  get selectedCharacterRelicLabel(): string {
    return this.resolveSelectedEquipmentLabel("relic");
  }

  get selectedCharacterWeaponRarity(): string | null {
    return this.resolveSelectedEquipmentRarity("weapon");
  }

  get selectedCharacterArmorRarity(): string | null {
    return this.resolveSelectedEquipmentRarity("armor");
  }

  get selectedCharacterRelicRarity(): string | null {
    return this.resolveSelectedEquipmentRarity("relic");
  }

  get selectedCharacterSummaryLabel(): string {
    const character = this.selectedPreRunCharacter;
    if (!character) {
      return "Unknown Adventurer (Lv 0)";
    }

    return `${character.name} (Lv ${character.level})`;
  }

  get isSelectedCharacterActive(): boolean {
    const state = this.accountState;
    if (!state || !this.selectedCharacterId) {
      return false;
    }

    return state.activeCharacterId === this.selectedCharacterId;
  }

  onSelectedCharacterChange(event: Event): void {
    const element = event.target as HTMLSelectElement | null;
    if (!element) {
      return;
    }

    this.selectedCharacterId = element.value;
  }

  async applySelectedCharacter(): Promise<void> {
    if (!this.accountState || !this.selectedCharacterId) {
      return;
    }

    this.accountRequestInFlight = true;
    try {
      const updated = await this.accountApi.setActiveCharacter(this.accountId, this.selectedCharacterId);
      this.applyAccountState(updated);
    } catch (error) {
      this.battleLog = `setActiveCharacter failed: ${String(error)}`;
    } finally {
      this.accountRequestInFlight = false;
    }
  }

  async reloadAccountState(): Promise<void> {
    await this.loadAccountState();
  }

  async equipWeaponFromInventory(weaponInstanceId: string): Promise<boolean> {
    const character = this.selectedCharacter;
    if (!character) {
      return false;
    }

    this.accountRequestInFlight = true;
    try {
      const updatedCharacter = await this.accountApi.equipWeapon(
        this.accountId,
        character.characterId,
        weaponInstanceId
      );
      this.updateCharacterSnapshot(updatedCharacter);
      return true;
    } catch (error) {
      this.battleLog = `equipWeapon failed: ${String(error)}`;
      return false;
    } finally {
      this.accountRequestInFlight = false;
    }
  }

  formatLootEntry(dropEvent: DropEvent): string {
    const itemName = this.resolveItemDisplayName(dropEvent.itemId);
    const quantity = Math.max(1, dropEvent.quantity ?? 1);
    return quantity > 1 ? `${itemName} x${quantity}` : itemName;
  }

  canCastSkill(skillId: string): boolean {
    if (this.battleRequestInFlight || !this.currentBattleId || this.ui.status !== "started") {
      return false;
    }

    if (this.getCooldownRemainingMs(skillId) > 0) {
      return false;
    }

    return this.getGlobalCooldownRemainingMs() === 0;
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

  get interactPoiHint(): string | null {
    const bestPoi = this.selectBestInteractablePoi(this.scene);
    if (!bestPoi) {
      return null;
    }

    if (bestPoi.type === "species_chest") {
      return "Press F to interact: Species Chest";
    }

    return `Press F to interact: ${bestPoi.type === "chest" ? "Chest" : "Altar"}`;
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

  private castSkill(skillId: string): void {
    if (!this.canCastSkill(skillId)) {
      return;
    }

    this.enqueueCastSkill(skillId);
  }

  private setFacing(dir: FacingDirection): void {
    if (!this.canIssueBattleCommand()) {
      return;
    }

    this.enqueueSetFacing(dir);
  }

  private movePlayer(dir: FacingDirection): void {
    if (!this.canIssueBattleCommand()) {
      return;
    }

    this.enqueueMovePlayer(dir);
  }

  private onMovementKeyDown(key: MovementInputKey, isRepeat: boolean): void {
    if (isRepeat) {
      return;
    }

    this.pressedMovementKeys.set(key, {
      pressedAtMs: Date.now(),
      sequence: ++this.movementKeySequence
    });

    this.syncBufferedMovementFromPressedKeys();
    this.tryQueueBufferedMovementCommand();
  }

  private onMovementKeyUp(key: MovementInputKey): void {
    this.pressedMovementKeys.delete(key);
    this.syncBufferedMovementFromPressedKeys();
    this.tryQueueBufferedMovementCommand();
  }

  private interactBestPoiInRange(): void {
    if (!this.canIssueBattleCommand()) {
      return;
    }

    const bestPoi = this.selectBestInteractablePoi(this.scene);
    if (!bestPoi) {
      return;
    }

    this.enqueueInteractPoi(bestPoi.poiId);
  }

  private async stepBattleSafe(): Promise<void> {
    if (this.battleRequestInFlight || !this.currentBattleId || this.isTerminalBattleStatus(this.battleStatus)) {
      return;
    }

    this.pumpMovementBuffer();
    const commandsToSend = this.dequeuePendingCommands();
    this.runInAngularZone(() => {
      this.battleRequestInFlight = true;
    });
    try {
      const response = await this.battleApi.stepBattle({
        battleId: this.currentBattleId,
        clientTick: this.currentBattleTick,
        commands: commandsToSend
      });
      const battleIdForLoot = response.battleId ?? this.currentBattleId;
      const lootSources = this.extractLootSourcesFromSnapshot(response);

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? this.currentBattleId;
        this.currentBattleTick = response.tick ?? this.currentBattleTick + 1;
        this.currentSeed = response.seed ?? this.currentSeed;
        this.battleStatus = response.battleStatus ?? this.battleStatus;
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? this.currentFacingDirection;
        this.applyGameOverStateFromSnapshot(response);
        this.applyBattlePayload(response);
        this.updateMovementBufferFromCommandResults(response.commandResults, commandsToSend);
        this.appendCommandResultLogs(response.commandResults, commandsToSend);
        this.syncUiMetaState();
        this.battleLog = JSON.stringify(response, null, 2);
        if (this.isTerminalBattleStatus(this.battleStatus)) {
          this.autoStepEnabled = false;
          this.stopAutoStepLoop();
        }
      });

      if (battleIdForLoot && lootSources.length > 0) {
        await this.awardLootSources(battleIdForLoot, lootSources);
      }
    } catch (error) {
      this.runInAngularZone(() => {
        this.requeueCommands(commandsToSend);
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
  }

  private async startBattle(): Promise<void> {
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
      const response = await this.battleApi.startBattle({
        arenaId: "arena_demo",
        playerId
      });

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? "";
        this.currentBattleTick = response.tick ?? 0;
        this.currentSeed = response.seed ?? 0;
        this.battleStatus = response.battleStatus ?? "started";
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? "up";
        this.applyGameOverStateFromSnapshot(response);
        this.recentDamageNumbers = [];
        this.recentCommandResults = [];
        this.applyActorStates(response.actors);
        this.updatePlayerHudFromActorStates(response.actors);
        this.applySkillStates(response.skills);
        this.applyDecals(response.decals);
        this.applyTargetingStateFromSnapshot(response);
        this.applyAssistConfigFromSnapshot(response);
        this.applyActiveBuffsFromSnapshot(response);
        this.applyActivePoisFromSnapshot(response);
        this.applyBestiaryFromSnapshot(response);
        this.updateGlobalCooldownFromSnapshot(response);
        this.updateAltarCooldownFromSnapshot(response);
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

  private async loadAccountState(): Promise<void> {
    this.accountStateRequestInFlight = true;
    this.accountLoadErrorMessage = "";
    try {
      const response = await this.accountApi.getState(this.accountId);
      this.applyAccountState(response.account, response.itemCatalog, response.equipmentCatalog);
      this.accountLoaded = true;
    } catch (error) {
      this.accountLoaded = false;
      this.accountLoadErrorMessage = `Failed to load account: ${String(error)}`;
      this.battleLog = this.accountLoadErrorMessage;
    } finally {
      this.accountStateRequestInFlight = false;
    }
  }

  private applyAccountState(
    account: AccountState,
    itemCatalog: ItemDefinition[] | null = null,
    equipmentCatalog: EquipmentDefinition[] | null = null
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
  }

  private updateCharacterSnapshot(character: CharacterState): void {
    if (!this.accountState) {
      return;
    }

    const nextCharacters = {
      ...this.accountState.characters,
      [character.characterId]: character
    };

    this.accountState = {
      ...this.accountState,
      characters: nextCharacters
    };
  }

  private resolveItemDisplayName(itemId: string): string {
    return this.itemCatalogById[itemId]?.displayName ?? itemId;
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

  private resolveSelectedEquipmentLabel(slot: "weapon" | "armor" | "relic"): string {
    const character = this.selectedCharacter;
    if (!character) {
      return "None";
    }

    return this.resolveEquippedItemLabel(character, slot);
  }

  private resolveSelectedEquipmentRarity(slot: "weapon" | "armor" | "relic"): string | null {
    const definition = this.resolveSelectedEquipmentDefinition(slot);
    if (!definition) {
      return null;
    }

    const item = this.itemCatalogById[definition.itemId];
    return item?.rarity ?? null;
  }

  private resolveSelectedEquipmentDefinition(slot: "weapon" | "armor" | "relic"): EquipmentDefinition | null {
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

  private resolveEquippedItemLabel(character: CharacterState, slot: "weapon" | "armor" | "relic"): string {
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

  private resolveEquippedInstanceId(character: CharacterState, slot: "weapon" | "armor" | "relic"): string | null {
    if (slot === "weapon") {
      return character.equipment.weaponInstanceId ?? null;
    }

    if (slot === "armor") {
      return character.equipment.armorInstanceId ?? null;
    }

    return character.equipment.relicInstanceId ?? null;
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
    const character = this.selectedCharacter;
    if (!character || sources.length === 0) {
      return;
    }

    const dedupedSources = dedupeDropSources(battleId, sources, this.sentLootSourceKeys);
    if (dedupedSources.length === 0) {
      return;
    }

    const dedupedKeys = dedupedSources.map((source) => buildDropSourceKey(battleId, source));
    try {
      const response = await this.accountApi.awardDrops(
        this.accountId,
        character.characterId,
        battleId,
        dedupedSources
      );

      this.runInAngularZone(() => {
        this.updateCharacterSnapshot(response.character);
        this.lootFeed = [...response.awarded, ...this.lootFeed].slice(0, 50);
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

  private applyBattlePayload(response: StepBattleResponse): void {
    if (!this.scene) {
      return;
    }

    const actors = this.toEngineActors(response.actors);
    const skills = this.toEngineSkills(response.skills);
    const decals = this.toEngineDecals(response.decals);
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
    if (damageEvents.length === 0) {
      return;
    }

    const mapped = mapDamageNumbersToConsoleEntries(damageEvents, this.currentBattleTick);
    this.damageConsoleEntries = mergeDamageConsoleEntries(this.damageConsoleEntries, mapped, 500);
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

      if (commandType === "cast_skill") {
        const skillId = this.readString(command?.skillId) ?? "unknown_skill";
        lines.push(isOk ? `${tickPrefix} Cast ${skillId} ok` : `${tickPrefix} Cast ${skillId} failed: ${reason}`);
        continue;
      }

      if (commandType === "set_facing") {
        const direction = this.readString(command?.dir) ?? "unknown_direction";
        lines.push(
          isOk
            ? `${tickPrefix} Facing set to ${direction}`
            : `${tickPrefix} Set facing ${direction} failed: ${reason}`
        );
        continue;
      }

      if (commandType === "move_player") {
        const direction = this.readString(command?.dir) ?? "unknown_direction";
        lines.push(
          isOk
            ? `${tickPrefix} Move ${direction} ok`
            : `${tickPrefix} Move ${direction} failed: ${reason}`
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

      if (commandType === "set_ground_target") {
        const tileX = this.readNumber(command?.groundTileX);
        const tileY = this.readNumber(command?.groundTileY);
        const tileLabel = tileX === null || tileY === null ? "clear" : `(${tileX},${tileY})`;
        lines.push(
          isOk
            ? `${tickPrefix} Ground target set ${tileLabel}`
            : `${tickPrefix} Set ground target ${tileLabel} failed: ${reason}`
        );
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
        tileX: typedActor.tileX ?? 0,
        tileY: typedActor.tileY ?? 0,
        hp: typedActor.hp ?? 0,
        maxHp: typedActor.maxHp ?? 1
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
          isCrit === null ||
          hitId === null
        ) {
          continue;
        }

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
          isCrit,
          hitId,
          shieldDamageAmount: shieldDamageAmount ?? undefined,
          hpDamageAmount: hpDamageAmount ?? undefined,
          elementType: elementType ?? undefined
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
      enabled: false,
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

  private enqueueCastSkill(skillId: string): void {
    this.enqueueCommand({
      type: "cast_skill",
      skillId
    });
  }

  private enqueueSetFacing(dir: FacingDirection): void {
    this.enqueueCommand({
      type: "set_facing",
      dir
    });
  }

  private enqueueMovePlayer(dir: FacingDirection): void {
    this.enqueueCommand({
      type: "move_player",
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
  }

  private dequeuePendingCommands(): StepCommand[] {
    const drained = [...this.queuedCommands];
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    return this.collapseMoveCommands(drained);
  }

  private collapseMoveCommands(commands: ReadonlyArray<StepCommand>): StepCommand[] {
    let latestMoveIndex = -1;
    for (let index = 0; index < commands.length; index += 1) {
      if (commands[index].type === "move_player") {
        latestMoveIndex = index;
      }
    }

    if (latestMoveIndex < 0) {
      return [...commands];
    }

    const collapsed: StepCommand[] = [];
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      if (command.type === "move_player" && index !== latestMoveIndex) {
        continue;
      }

      collapsed.push(command);
    }

    return collapsed;
  }

  private requeueCommands(commands: ReadonlyArray<StepCommand>): void {
    if (commands.length == 0) {
      return;
    }

    this.queuedCommands = [...commands, ...this.queuedCommands];
    this.queuedCommandCount = this.queuedCommands.length;
  }

  private pumpMovementBuffer(): void {
    if (!this.isMovementInputContextActive()) {
      this.clearBufferedMovement();
      return;
    }

    const desired = this.syncBufferedMovementFromPressedKeys();
    if (!desired) {
      return;
    }

    this.tryQueueBufferedMovementCommand();
  }

  private tryQueueBufferedMovementCommand(): void {
    if (!this.bufferedMovementDirection) {
      return;
    }

    if (!this.canIssueBattleCommand() || !this.isPlayerAliveForInput() || this.bufferedMovementAwaitingResult) {
      return;
    }

    if (Date.now() > this.bufferedMovementExpiresAtMs || this.hasQueuedMoveCommand()) {
      return;
    }

    this.enqueueMovePlayer(this.bufferedMovementDirection);
    this.bufferedMovementAwaitingResult = true;
  }

  private isPlayerAliveForInput(): boolean {
    return this.ui.player.hp > 0;
  }

  private updateMovementBufferFromCommandResults(
    commandResults: StepBattleResponse["commandResults"],
    sentCommands: ReadonlyArray<StepCommand>
  ): void {
    const moveCommandIndex = this.findLastMoveCommandIndex(sentCommands);
    if (moveCommandIndex < 0) {
      return;
    }

    const safeResults = commandResults ?? [];
    const moveResult = safeResults
      .map((entry) => entry as ApiCommandResult)
      .find((result) => {
        if (typeof result.index === "number") {
          return result.index === moveCommandIndex;
        }

        return this.readString(result.type) === "move_player";
      });

    this.bufferedMovementAwaitingResult = false;

    const desired = this.syncBufferedMovementFromPressedKeys();
    if (!desired) {
      return;
    }

    const wasSuccessful = moveResult?.ok === true;
    const reason = this.readString(moveResult?.reason);
    if (wasSuccessful || reason === "cooldown" || reason === "move_blocked") {
      this.bufferedMovementExpiresAtMs = Date.now() + MOVEMENT_BUFFER_TTL_MS;
      return;
    }

    this.clearBufferedMovement();
  }

  private syncBufferedMovementFromPressedKeys(nowMs: number = Date.now()): FacingDirection | null {
    const desired = this.resolveMovementDirectionFromPressedKeys();
    if (!desired) {
      this.clearBufferedMovement();
      this.removeQueuedMoveCommands();
      return null;
    }

    if (this.bufferedMovementDirection !== desired) {
      this.bufferedMovementAwaitingResult = false;
      this.removeQueuedMoveCommands();
    }

    this.bufferedMovementDirection = desired;
    this.bufferedMovementExpiresAtMs = nowMs + MOVEMENT_BUFFER_TTL_MS;
    return desired;
  }

  private clearMovementInputState(): void {
    this.pressedMovementKeys.clear();
    this.clearBufferedMovement();
    this.removeQueuedMoveCommands();
  }

  private clearBufferedMovement(): void {
    this.bufferedMovementDirection = null;
    this.bufferedMovementExpiresAtMs = 0;
    this.bufferedMovementAwaitingResult = false;
  }

  private isMovementInputContextActive(): boolean {
    return !!this.currentBattleId &&
      this.battleStatus === "started" &&
      !this.isPauseModalOpen &&
      !this.isDeathModalOpen;
  }

  private hasQueuedMoveCommand(): boolean {
    return this.queuedCommands.some((command) => command.type === "move_player");
  }

  private removeQueuedMoveCommands(): void {
    const withoutMoves = this.queuedCommands.filter((command) => command.type !== "move_player");
    if (withoutMoves.length === this.queuedCommands.length) {
      return;
    }

    this.queuedCommands = withoutMoves;
    this.queuedCommandCount = this.queuedCommands.length;
  }

  private findLastMoveCommandIndex(commands: ReadonlyArray<StepCommand>): number {
    for (let index = commands.length - 1; index >= 0; index -= 1) {
      if (commands[index].type === "move_player") {
        return index;
      }
    }

    return -1;
  }

  private startOrRestartAutoStepLoop(): void {
    this.stopAutoStepLoop();

    if (!this.autoStepEnabled || !this.currentBattleId || this.battleStatus !== "started") {
      return;
    }

    const loopRunId = ++this.autoStepLoopRunId;
    const runLoop = async (): Promise<void> => {
      if (loopRunId !== this.autoStepLoopRunId) {
        return;
      }

      await this.stepBattleSafe();
      if (loopRunId !== this.autoStepLoopRunId) {
        return;
      }

      if (!this.autoStepEnabled || !this.currentBattleId || this.battleStatus !== "started") {
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
    return status === "defeat";
  }

  private canTogglePauseModal(): boolean {
    return this.isInRun && !!this.currentBattleId && this.battleStatus === "started" && !this.isDeathModalOpen;
  }

  private async syncBackendPauseState(paused: boolean): Promise<void> {
    if (!this.currentBattleId || this.isTerminalBattleStatus(this.battleStatus)) {
      return;
    }

    const battleApi = this.battleApi as unknown as {
      stepBattle?: (request: StepBattleRequest) => Promise<StepBattleResponse>;
    };
    if (typeof battleApi.stepBattle !== "function") {
      return;
    }

    if (this.battleRequestInFlight) {
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

  private returnToPreRun(): void {
    this.stopAutoStepLoop();
    this.clearAssistConfigDebounce();
    this.clearMovementInputState();
    this.autoStepEnabled = false;
    this.battleRequestInFlight = false;
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    this.currentBattleId = "";
    this.currentBattleTick = 0;
    this.battleStatus = "idle";
    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    this.isDeathModalOpen = false;
    this.deathEndReason = null;
    this.isInRun = false;
    this.syncUiMetaState();
  }

  private canIssueBattleCommand(): boolean {
    return !this.battleRequestInFlight &&
      !!this.currentBattleId &&
      this.battleStatus === "started" &&
      !this.isPauseModalOpen &&
      !this.isDeathModalOpen;
  }

  private resolvePointerCommandFromMouse(action: PointerActionKind, event: MouseEvent): StepCommand | null {
    const scene = this.scene;
    const canvas = this.canvasRef?.nativeElement;
    if (!scene || !canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const tile = screenToTile(
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
    const command = resolvePointerCommand(action, tile, Object.values(scene.actorsById));
    if (!command) {
      return null;
    }

    return command as StepCommand;
  }

  private syncUiMetaState(): void {
    this.ui = {
      ...this.ui,
      tick: this.currentBattleTick,
      status: this.battleStatus,
      facing: this.currentFacingDirection
    };
  }

  private applyGameOverStateFromSnapshot(
    snapshot: Pick<StartBattleResponse, "isGameOver" | "endReason" | "battleStatus"> | Pick<StepBattleResponse, "isGameOver" | "endReason" | "battleStatus">
  ): void {
    const record = snapshot as Record<string, unknown>;
    const snapshotIsGameOver = this.readBoolean(record["isGameOver"]);
    const snapshotEndReason = this.readString(record["endReason"]);
    const snapshotBattleStatus = this.readString(record["battleStatus"]);
    const isGameOver = snapshotIsGameOver ?? snapshotBattleStatus === "defeat";
    if (!isGameOver)
    {
      return;
    }

    this.isPauseModalOpen = false;
    this.autoStepWasEnabledBeforePause = false;
    this.isDeathModalOpen = true;
    this.deathEndReason = snapshotEndReason ?? "death";
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

  private readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
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

  private toMovementKey(key: string): MovementInputKey | null {
    const normalized = key.toLowerCase();
    if (normalized === "w" || normalized === "a" || normalized === "s" || normalized === "d" ||
      normalized === "q" || normalized === "e" || normalized === "z" || normalized === "c")
    {
      return normalized as MovementInputKey;
    }

    return null;
  }

  private toArenaWindowHotkeyId(key: string): ArenaUiWindowId | null {
    const normalized = key.toLowerCase();
    if (normalized === "i") {
      return ARENA_UI_WINDOW_IDS.backpack;
    }

    if (normalized === "c") {
      return ARENA_UI_WINDOW_IDS.equipmentCharacter;
    }

    if (normalized === "l") {
      return ARENA_UI_WINDOW_IDS.lootFeed;
    }

    if (normalized === "k") {
      return ARENA_UI_WINDOW_IDS.statusSkills;
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
        this.clearBackpackWeaponFilterMode();
      }
      return;
    }

    this.dockLayoutService.show(id);
    this.dockLayoutService.expand(id);
  }

  private clearBackpackWeaponFilterMode(): void {
    this.backpackForcedFilter = null;
    this.backpackWeaponFilterMode = false;
  }

  private focusDamageConsole(): void {
    this.focusLeftLogsPane();
    this.highlightLogPanel("damage");
    this.scrollConsoleToBottom(this.damageConsolePanelRef, ".damage-console__body");
  }

  private focusLootConsole(): void {
    this.focusLeftLogsPane();
    this.highlightLogPanel("loot");
    this.scrollConsoleToBottom(this.lootConsolePanelRef, ".loot-console__body");
  }

  private focusEquipmentPanel(): void {
    this.focusPane(this.equipmentPanelRef);
  }

  private focusBackpackPanel(): void {
    this.focusPane(this.backpackPanelRef);
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

  private highlightLogPanel(panel: "damage" | "loot"): void {
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

  private loadRightInfoTab(): RightInfoTabId {
    if (!this.canUseStorage()) {
      return "helper";
    }

    try {
      const value = window.localStorage.getItem(RIGHT_INFO_TAB_STORAGE_KEY);
      return value === "helper" || value === "bestiary" || value === "status"
        ? value
        : "helper";
    } catch {
      return "helper";
    }
  }

  private persistRightInfoTab(): void {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      window.localStorage.setItem(RIGHT_INFO_TAB_STORAGE_KEY, this.selectedRightInfoTab);
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

  private resolveMovementDirectionFromPressedKeys(): FacingDirection | null {
    let selectedKey: MovementInputKey | null = null;
    let selectedSequence = -1;
    let selectedPressedAtMs = -1;
    for (const [key, state] of this.pressedMovementKeys.entries()) {
      if (state.sequence > selectedSequence ||
        (state.sequence === selectedSequence && state.pressedAtMs > selectedPressedAtMs))
      {
        selectedKey = key;
        selectedSequence = state.sequence;
        selectedPressedAtMs = state.pressedAtMs;
      }
    }

    if (!selectedKey) {
      return null;
    }

    return this.toFacingDirectionFromMovementKey(selectedKey);
  }

  private toFacingDirectionFromMovementKey(key: MovementInputKey): FacingDirection {
    if (key === "w") {
      return "up";
    }

    if (key === "a") {
      return "left";
    }

    if (key === "s") {
      return "down";
    }

    if (key === "d") {
      return "right";
    }

    if (key === "q") {
      return "up_left";
    }

    if (key === "e") {
      return "up_right";
    }

    if (key === "z") {
      return "down_left";
    }

    return "down_right";
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

  private selectBestInteractablePoi(scene: ArenaScene | undefined): ArenaPoiState | null {
    if (!scene || scene.activePois.length === 0) {
      return null;
    }

    const playerActor = Object.values(scene.actorsById).find((actor) => actor.kind === "player");
    const playerTileX = playerActor?.tileX ?? scene.playerTile.x;
    const playerTileY = playerActor?.tileY ?? scene.playerTile.y;

    const inRangePois = scene.activePois
      .map((poi) => ({
        poi,
        distance: this.computeChebyshevDistance(playerTileX, playerTileY, poi.pos.x, poi.pos.y)
      }))
      .filter((entry) => entry.distance <= 1);
    if (inRangePois.length === 0) {
      return null;
    }

    inRangePois.sort((left, right) => {
      const typePriorityDelta = this.getPoiTypePriority(left.poi.type) - this.getPoiTypePriority(right.poi.type);
      if (typePriorityDelta !== 0) {
        return typePriorityDelta;
      }

      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return left.poi.poiId.localeCompare(right.poi.poiId);
    });

    return inRangePois[0].poi;
  }

  private getPoiTypePriority(type: ArenaPoiState["type"]): number {
    return type === "chest" || type === "species_chest"
      ? 0
      : type === "altar"
        ? 1
        : 2;
  }

  private computeChebyshevDistance(sourceTileX: number, sourceTileY: number, targetTileX: number, targetTileY: number): number {
    return Math.max(Math.abs(sourceTileX - targetTileX), Math.abs(sourceTileY - targetTileY));
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

    const rawTileSize = Math.floor(Math.min(cssWidth / this.scene.columns, cssHeight / this.scene.rows));
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
