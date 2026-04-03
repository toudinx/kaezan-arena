import { Component, HostListener, OnInit, inject, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProfileStateService } from '../../../../core/services/profile-state.service';
import { LoadoutService } from '../../../../core/services/loadout.service';
import { AscensionRunStateService } from '../../state/ascension-run-state.service';
import { RngService } from '../../../../core/services/rng.service';
import { ReplayLogService } from '../../../../core/services/replay-log.service';
import { roomToStage } from '../../../../content/balance/balance.config';
import { ASCENSION_PATHS } from '../../content/configs/ascension-paths';
import {
  ASCENSION_POTIONS,
  getAscensionPotionById
} from '../../content/configs/ascension-potions';
import { ASCENSION_CONFIG } from '../../content/configs/ascension.config';
import { ASCENSION_DEV_SEEDS } from '../../content/dev-fixtures';
import { ECHO_REGISTRY } from '../../content/echoes';
import { AscensionRunPathDefinition } from '../../models/ascension-run-path.model';
import { AscensionStartRosterService } from '../../services/ascension-start-roster.service';
import type { AscensionRunModifiers } from '../../state/ascension-run-state.model';

interface StatRow {
  label: string;
  value: string;
  accent?: boolean;
}

const GAMEPLAY_RUN_PATHS = new Set(['Sentinel', 'Ruin', 'Wrath']);

@Component({
  selector: 'app-ascension-start-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ascension-start.page.html',
  styleUrls: ['./ascension-start.page.scss']
})
export class AscensionStartPageComponent implements OnInit {
  private readonly profile = inject(ProfileStateService);
  private readonly loadout = inject(LoadoutService);
  private readonly runState = inject(AscensionRunStateService);
  private readonly roster = inject(AscensionStartRosterService);
  private readonly rng = inject(RngService);
  private readonly replayLog = inject(ReplayLogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly paths = ASCENSION_PATHS;
  protected readonly potions = ASCENSION_POTIONS;
  protected readonly devSeeds = ASCENSION_DEV_SEEDS;
  protected readonly isDev = isDevMode();
  protected selectedRunPathId: string | null = null;
  protected selectedPotionId: string | null = null;
  protected devSeed = '';
  protected readonly fallbackPortrait = 'assets/battle/characters/placeholder.png';

  ngOnInit(): void {
    const snapshot = this.runState.getSnapshot();
    this.selectedRunPathId = snapshot.runPathId;
    this.selectedPotionId = snapshot.selectedPotionId;

    this.syncSelectionsForOrigin();

    const seedParam = this.route.snapshot.queryParamMap.get('seed');
    if (seedParam) {
      this.devSeed = seedParam;
    }
  }

  get activeKaelis() {
    return this.profile.activeKaelis();
  }

  get kaelisLevel(): number {
    return this.activeKaelis.profile?.level ?? 1;
  }

  get kaelisTitleLine(): string {
    const title = this.activeKaelis.title || 'Kaelis';
    const route = this.activeKaelis.routeType
      ? ` - ${this.activeKaelis.routeType}`
      : '';
    return `${title}${route}`;
  }

  get originPathId(): string {
    return this.activeKaelis.routeType;
  }

  get availableRunPaths(): AscensionRunPathDefinition[] {
    return this.paths
      .filter(path => GAMEPLAY_RUN_PATHS.has(path.id))
      .filter(path => path.id !== this.originPathId)
      .slice(0, 3);
  }

  get statRows(): StatRow[] {
    const stats = this.activeKaelis.baseStats;
    return [
      { label: 'HP', value: Math.round(stats.hpBase).toString() },
      { label: 'ATK', value: Math.round(stats.atkBase).toString() },
      { label: 'CRIT', value: `${Math.round(stats.critRateBase * 100)}%`, accent: true },
      { label: 'DOT', value: `${Math.round(stats.dotChanceBase * 100)}%` },
      { label: 'Energy', value: Math.round(stats.energyBase).toString() }
    ];
  }

  get kaelisStageImage(): string {
    const skin = this.loadout.getEquippedSkin(this.activeKaelis.id);
    return (
      skin?.imageUrl ||
      this.activeKaelis.imageUrl ||
      this.activeKaelis.portrait ||
      this.fallbackPortrait
    );
  }

  selectRunPath(pathId: string): void {
    this.selectedRunPathId = pathId;
    this.runState.patchState({ runPathId: pathId });
  }

  selectPotion(potionId: string): void {
    this.selectedPotionId = potionId;
    this.runState.patchState({ selectedPotionId: potionId });
  }

  cycleKaelis(direction: 'prev' | 'next'): void {
    this.roster.cycle(direction);
    this.syncSelectionsForOrigin();
  }

  goBack(): void {
    this.runState.resetRun();
    this.router.navigateByUrl('/');
  }

  goToLoadout(): void {
    this.router.navigateByUrl('/character-management');
  }

  confirm(): void {
    this.startRun();
  }

  startWithSeed(): void {
    const seed = this.parseSeed(this.devSeed);
    if (seed === null) return;
    this.startRun(seed);
  }

  get hasValidDevSeed(): boolean {
    return this.parseSeed(this.devSeed) !== null;
  }

  get canConfirm(): boolean {
    return !!this.selectedRunPathId && !!this.selectedPotionId;
  }

  pathBadge(index: number): string {
    return String(index + 1);
  }

  potionBadge(index: number): string {
    const labels = ['Q', 'W', 'E'];
    return labels[index] ?? String(index + 4);
  }

  @HostListener('window:keydown', ['$event'])
  handleHotkeys(event: KeyboardEvent): void {
    if (this.isEditableTarget(event.target)) return;
    const code = event.code;
    if (code === 'Space') {
      if (!this.canConfirm) return;
      event.preventDefault();
      this.confirm();
      return;
    }
    const pathIndex = this.mapDigitToIndex(code, 3);
    if (pathIndex !== null) {
      const path = this.availableRunPaths[pathIndex];
      if (path) {
        this.selectRunPath(path.id);
      }
      return;
    }
    const potionIndex = this.mapDigitToIndex(code, 3, 4);
    if (potionIndex !== null) {
      const potion = this.potions[potionIndex];
      if (potion) {
        this.selectPotion(potion.id);
      }
    }
  }

  private startRun(seedOverride?: number): void {
    if (!this.canConfirm) return;
    const runPathId = this.selectedRunPathId!;
    const potionId = this.selectedPotionId!;
    const seed =
      typeof seedOverride === 'number' ? seedOverride : this.randomSeed();
    const runModifiers = this.buildRunModifiers(potionId);
    const runModifiersPayload = this.serializeRunModifiers(runModifiers);
    const hpMax = this.applyMaxHpModifier(runModifiers);
    this.replayLog.clear();
    this.replayLog.append({
      v: 1,
      t: 'runStart',
      payload: {
        seed,
        mode: 'ascension',
        originPathId: this.originPathId,
        runPathId,
        selectedPotionId: potionId,
        hpMax,
        hpCurrent: hpMax,
        runModifiers: runModifiersPayload,
        floorIndex: 1,
        roomType: 'battle'
      }
    });
    this.replayLog.append({
      v: 1,
      t: 'enterRoom',
      payload: {
        roomIndex: 1,
        roomType: 'battle',
        stage: roomToStage(1)
      }
    });
    this.validateEchoContent(this.originPathId, runPathId);
    this.runState.createNewRun({
      seed,
      floorIndex: 1,
      roomType: 'battle',
      originPathId: this.originPathId,
      runPathId,
      selectedPotionId: potionId,
      hpMax,
      hpCurrent: hpMax
    });
    this.runState.patchState({
      echoFragments: 0,
      potionUsed: true,
      activePotionId: potionId,
      runModifiers
    });
    this.router.navigateByUrl('/ascension/battle');
  }

  private randomSeed(): number {
    return this.rng.nextInt(0, 1_000_000_000);
  }

  private parseSeed(value: string): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
  }

  private buildRunModifiers(potionId: string): AscensionRunModifiers {
    const potion = getAscensionPotionById(potionId);
    return { ...(potion?.runEffects ?? {}) };
  }

  private serializeRunModifiers(
    modifiers: AscensionRunModifiers
  ): Record<string, number> {
    const payload: Record<string, number> = {};
    if (typeof modifiers.maxHpPercent === 'number') {
      payload.maxHpPercent = modifiers.maxHpPercent;
    }
    if (typeof modifiers.damagePercent === 'number') {
      payload.damagePercent = modifiers.damagePercent;
    }
    if (typeof modifiers.fragmentsPerVictory === 'number') {
      payload.fragmentsPerVictory = modifiers.fragmentsPerVictory;
    }
    return payload;
  }

  private applyMaxHpModifier(modifiers: AscensionRunModifiers): number {
    const baseHp = ASCENSION_CONFIG.baseHp;
    const bonus = modifiers.maxHpPercent ?? 0;
    if (!bonus) return baseHp;
    return Math.round(baseHp * (1 + bonus / 100));
  }

  private syncSelectionsForOrigin(): void {
    if (this.selectedRunPathId === this.originPathId) {
      this.selectedRunPathId = null;
      this.runState.patchState({ runPathId: null });
      return;
    }

    if (
      this.selectedRunPathId &&
      !this.availableRunPaths.some(path => path.id === this.selectedRunPathId)
    ) {
      this.selectedRunPathId = null;
      this.runState.patchState({ runPathId: null });
    }
  }

  private mapDigitToIndex(
    code: string,
    count: number,
    offset = 1
  ): number | null {
    const digit = this.digitFromCode(code);
    if (digit === null) return null;
    const index = digit - offset;
    if (index < 0 || index >= count) return null;
    return index;
  }

  private digitFromCode(code: string): number | null {
    switch (code) {
      case 'Digit1':
      case 'Numpad1':
        return 1;
      case 'Digit2':
      case 'Numpad2':
        return 2;
      case 'Digit3':
      case 'Numpad3':
        return 3;
      case 'Digit4':
      case 'Numpad4':
      case 'KeyQ':
        return 4;
      case 'Digit5':
      case 'Numpad5':
      case 'KeyW':
        return 5;
      case 'Digit6':
      case 'Numpad6':
      case 'KeyE':
        return 6;
      default:
        return null;
    }
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return true;
    }
    return target.isContentEditable;
  }

  private validateEchoContent(originPathId: string, runPathId: string): void {
    if (!this.isDev) return;
    const minEchoes = 3;
    const counts: Record<string, number> = {};
    ASCENSION_PATHS.forEach(path => {
      const count = ECHO_REGISTRY[path.id]?.length ?? 0;
      counts[path.id] = count;
      if (count < minEchoes) {
        console.warn(
          `[Ascension] Path '${path.id}' has only ${count} echoes. Minimum is ${minEchoes}.`
        );
      }
    });
    const originCount = counts[originPathId] ?? 0;
    const runCount = counts[runPathId] ?? 0;
    if (originCount < minEchoes || runCount < minEchoes) {
      console.warn(
        '[Ascension] Selected Origin/Run path has insufficient echoes; drafts may starve.',
        {
          originPathId,
          runPathId,
          originCount,
          runCount
        }
      );
    }
  }
}
