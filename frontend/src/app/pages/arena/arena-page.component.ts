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
  ArenaBuffState,
  ArenaPoiState,
  DecalInstance,
  ArenaScene,
  ArenaSkillState,
  DamageNumberInstance
} from "../../arena/engine/arena-engine.types";
import { normalizeDecalKind, resolveDecalSemanticId } from "../../arena/engine/decal.helpers";
import { CanvasLayeredRenderer } from "../../arena/render/canvas-layered-renderer";
import { HealthBarComponent } from "../../arena/ui/health-bar.component";
import {
  BattleApiService,
  StartBattleResponse,
  StepBattleRequest,
  StepBattleResponse
} from "../../api/battle-api.service";
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
type ApiBuffState = {
  buffId?: unknown;
  remainingMs?: unknown;
};
type StepCommand = NonNullable<StepBattleRequest["commands"]>[number];
type FacingDirection = "up" | "up_right" | "right" | "down_right" | "down" | "down_left" | "left" | "up_left";
type MovementKey = "w" | "a" | "s" | "d";
type AssistOffenseMode = "cooldown_spam" | "smart";
type AssistSkillId = "exori" | "exori_min" | "exori_mas" | "avalanche";
const AVALANCHE_SKILL_ID = "avalanche";
const ASSIST_CONFIG_DEBOUNCE_MS = 200;
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
  imports: [HealthBarComponent],
  templateUrl: "./arena-page.component.html",
  styleUrl: "./arena-page.component.css"
})
export class ArenaPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild("arenaCanvas", { static: true }) private readonly canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasViewport", { static: false }) private readonly canvasViewportRef?: ElementRef<HTMLDivElement>;

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
  private readonly pressedMovementKeys = new Set<MovementKey>();
  private autoStepTimerId: ReturnType<typeof setTimeout> | null = null;
  private assistConfigDebounceTimerId: ReturnType<typeof setTimeout> | null = null;
  private autoStepLoopRunId = 0;
  private lastKnownViewportWidthCss = 0;
  private lastKnownViewportHeightCss = 0;
  private readyPulseSkillIds = new Set<string>();
  assistConfig: ArenaAssistConfig = this.buildDefaultAssistConfig();

  constructor(
    private readonly resolver: AssetResolverService,
    private readonly preloader: AssetPreloaderService,
    private readonly battleApi: BattleApiService,
    private readonly router: Router,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngAfterViewInit(): Promise<void> {
    this.scene = this.engine.createTestScene();
    this.activeFxCount = 0;

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
    this.pressedMovementKeys.clear();
  }

  @HostListener("window:keydown", ["$event"])
  onKeyDown(event: KeyboardEvent): void {
    if (this.isTypingContext()) {
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

    const dedicatedDiagonalDirection = this.toDedicatedDiagonalDirection(event.key);
    if (dedicatedDiagonalDirection) {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      this.movePlayer(dedicatedDiagonalDirection);
      return;
    }

    const movementKey = this.toMovementKey(event.key);
    if (movementKey) {
      event.preventDefault();
      this.pressedMovementKeys.add(movementKey);
      if (event.repeat) {
        return;
      }

      const movementDirection = this.resolveMovementDirectionFromPressedKeys();
      if (movementDirection) {
        this.movePlayer(movementDirection);
      }

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

    if (event.key === "1") {
      if (!this.canCastSkill("exori_min")) {
        return;
      }

      event.preventDefault();
      this.castSkill("exori_min");
      return;
    }

    if (event.key === "2") {
      if (!this.canCastSkill("exori")) {
        return;
      }

      event.preventDefault();
      this.castSkill("exori");
      return;
    }

    if (event.key === "3") {
      if (!this.canCastSkill("exori_mas")) {
        return;
      }

      event.preventDefault();
      this.castSkill("exori_mas");
      return;
    }

    if (event.key === "4") {
      if (!this.canCastSkill("heal")) {
        return;
      }

      event.preventDefault();
      this.castSkill("heal");
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

    this.pressedMovementKeys.delete(movementKey);
  }

  @HostListener("window:blur")
  onWindowBlur(): void {
    this.pressedMovementKeys.clear();
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
    await this.beginNewRun();
  }

  async restartBattle(): Promise<void> {
    await this.beginNewRun();
  }

  private async beginNewRun(): Promise<void> {
    this.stopAutoStepLoop();
    this.clearAssistConfigDebounce();
    this.pressedMovementKeys.clear();
    this.autoStepEnabled = false;
    this.queuedCommands = [];
    this.queuedCommandCount = 0;
    this.recentDamageNumbers = [];
    this.recentCommandResults = [];
    this.assistConfig = this.buildDefaultAssistConfig();
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
    void this.router.navigate(["/"]);
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

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? this.currentBattleId;
        this.currentBattleTick = response.tick ?? this.currentBattleTick + 1;
        this.currentSeed = response.seed ?? this.currentSeed;
        this.battleStatus = response.battleStatus ?? this.battleStatus;
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? this.currentFacingDirection;
        this.applyBattlePayload(response);
        this.appendCommandResultLogs(response.commandResults, commandsToSend);
        this.syncUiMetaState();
        this.battleLog = JSON.stringify(response, null, 2);
        if (this.isTerminalBattleStatus(this.battleStatus)) {
          this.autoStepEnabled = false;
          this.stopAutoStepLoop();
        }
      });
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
      const response = await this.battleApi.startBattle({
        arenaId: "arena_demo",
        playerId: "player_demo"
      });

      this.runInAngularZone(() => {
        this.currentBattleId = response.battleId ?? "";
        this.currentBattleTick = response.tick ?? 0;
        this.currentSeed = response.seed ?? 0;
        this.battleStatus = response.battleStatus ?? "started";
        this.currentFacingDirection = this.toFacingDirection(response.facingDirection) ?? "up";
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
    this.updatePlayerHudFromActorStates(response.actors);
    this.updateVisibleSkills(skills);
    this.updateGlobalCooldownFromSnapshot(response);
    this.updateAltarCooldownFromSnapshot(response);
    this.activeFxCount = this.getActiveFxCount(this.scene);
    this.appendDamageLogs(applied.damageNumbers);
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
      if (!poiId || (type !== "altar" && type !== "chest") || tileX === null || tileY === null || remainingMs === null) {
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

  private canIssueBattleCommand(): boolean {
    return !this.battleRequestInFlight && !!this.currentBattleId && this.battleStatus === "started";
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

  private toMovementKey(key: string): MovementKey | null {
    const normalized = key.toLowerCase();
    if (normalized === "w" || normalized === "a" || normalized === "s" || normalized === "d") {
      return normalized as MovementKey;
    }

    return null;
  }

  private toDedicatedDiagonalDirection(key: string): FacingDirection | null {
    const normalized = key.toLowerCase();
    if (normalized === "q") {
      return "up_left";
    }

    if (normalized === "e") {
      return "up_right";
    }

    if (normalized === "z") {
      return "down_left";
    }

    if (normalized === "c") {
      return "down_right";
    }

    return null;
  }

  private resolveMovementDirectionFromPressedKeys(): FacingDirection | null {
    const hasUp = this.pressedMovementKeys.has("w");
    const hasLeft = this.pressedMovementKeys.has("a");
    const hasDown = this.pressedMovementKeys.has("s");
    const hasRight = this.pressedMovementKeys.has("d");

    const vertical = hasUp === hasDown ? 0 : hasUp ? -1 : 1;
    const horizontal = hasLeft === hasRight ? 0 : hasRight ? 1 : -1;

    if (vertical === -1 && horizontal === 1) {
      return "up_right";
    }

    if (vertical === -1 && horizontal === -1) {
      return "up_left";
    }

    if (vertical === 1 && horizontal === 1) {
      return "down_right";
    }

    if (vertical === 1 && horizontal === -1) {
      return "down_left";
    }

    if (vertical === -1) {
      return "up";
    }

    if (vertical === 1) {
      return "down";
    }

    if (horizontal === 1) {
      return "right";
    }

    if (horizontal === -1) {
      return "left";
    }

    return null;
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
    return type === "chest" ? 0 : type === "altar" ? 1 : 2;
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
