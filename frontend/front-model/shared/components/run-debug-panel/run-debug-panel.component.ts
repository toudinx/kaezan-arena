import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent, AppCardComponent } from '../index';
import { RunStateService } from '../../../core/services/run-state.service';
import { ProfileStateService } from '../../../core/services/profile-state.service';
import { PlayerStateService } from '../../../core/services/player-state.service';
import { EnemyStateService } from '../../../core/services/enemy-state.service';
import { getPlayerPowerMultiplier, roomToStage } from '../../../content/balance/balance.config';

declare const ngDevMode: boolean;

const SHOW_DEBUG_PANEL = typeof ngDevMode === 'undefined' || !!ngDevMode;
const UI_SCALE_OPTIONS = [0.85, 1, 1.15, 1.3] as const;

@Component({
  selector: 'app-run-debug-panel',
  standalone: true,
  imports: [CommonModule, AppButtonComponent, AppCardComponent],
  template: `
    @if (SHOW) {
<div class="fixed bottom-4 right-4 z-40 w-[320px] space-y-2 rounded-[14px] border border-white/10 bg-black/70 p-3 text-xs text-white shadow-neon">
      <div class="flex items-center justify-between">
        <span class="uppercase tracking-[0.12em] text-[#A4A4B5]">Debug Run</span>
        <span class="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/80">{{ run.phase() }}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <app-card [interactive]="false" title="Room" [subtitle]="run.currentRoom() + '/' + run.totalRooms()"></app-card>
        <app-card [interactive]="false" title="Type" [subtitle]="run.roomType()"></app-card>
        <app-card [interactive]="false" title="Stage" [subtitle]="roomStage"></app-card>
        <app-card [interactive]="false" title="Power" [subtitle]="playerPowerLabel"></app-card>
        <app-card [interactive]="false" title="Trilhas" [subtitle]="'A ' + run.trackLevels().A + ' - B ' + run.trackLevels().B + ' - C ' + run.trackLevels().C"></app-card>
        <app-card [interactive]="false" title="Outcome" [subtitle]="run.result()"></app-card>
        <app-card [interactive]="false" title="Seed" [subtitle]="runSeedLabel"></app-card>
      </div>
      <div class="rounded-[12px] border border-white/10 bg-white/5 p-2">
        <p class="text-[10px] uppercase tracking-[0.3em] text-[#7F7F95]">Kaelis Stats</p>
        <div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-white/80">
          <span>HP {{ player.state().attributes.hp }}/{{ player.state().attributes.maxHp }}</span>
          <span>ATK {{ player.state().attributes.attack }}</span>
          <span>Crit {{ (player.state().attributes.critChance * 100) | number: '1.0-0' }}%</span>
          <span>DMG% {{ player.state().attributes.damageBonusPercent | number: '1.0-0' }}%</span>
        </div>
      </div>
      <div class="rounded-[12px] border border-white/10 bg-white/5 p-2">
        <p class="text-[10px] uppercase tracking-[0.3em] text-[#7F7F95]">Enemy Stats</p>
        <div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-white/80">
          <span>HP {{ enemy.enemy().attributes.hp }}/{{ enemy.enemy().attributes.maxHp }}</span>
          <span>ATK {{ enemy.enemy().attributes.attack }}</span>
          <span>Posture {{ enemy.enemy().attributes.posture }}/{{ enemy.enemy().attributes.maxPosture }}</span>
          <span>Crit {{ (enemy.enemy().attributes.critChance * 100) | number: '1.0-0' }}%</span>
        </div>
      </div>
      <div class="rounded-[12px] border border-white/10 bg-white/5 p-2">
        <p class="text-[10px] uppercase tracking-[0.3em] text-[#7F7F95]">Run Upgrades</p>
        <div class="mt-2 flex flex-wrap gap-1 text-[11px] text-white/70">
          @if (!activeRunUpgrades.length) {
            <span class="text-[#7F7F95]">None</span>
          } @else {
            @for (upgrade of activeRunUpgrades; track upgrade.id) {
              <span class="rounded-full bg-white/10 px-2 py-1">{{ upgrade.name }}</span>
            }
          }
        </div>
      </div>
      <div class="rounded-[12px] border border-white/10 bg-white/5 p-2">
        <p class="text-[10px] uppercase tracking-[0.3em] text-[#7F7F95]">VFX</p>
        <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/80">
          <button
            type="button"
            class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 transition hover:border-white/30 hover:bg-white/10"
            (click)="cycleVfxDensity()"
          >
            Density: {{ vfxDensityLabel }}
          </button>
          <button
            type="button"
            class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 transition hover:border-white/30 hover:bg-white/10"
            (click)="toggleScreenShake()"
          >
            Shake: {{ shakeLabel }}
          </button>
          <button
            type="button"
            class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 transition hover:border-white/30 hover:bg-white/10"
            (click)="toggleReducedFlash()"
          >
            Flash: {{ flashLabel }}
          </button>
          <button
            type="button"
            class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 transition hover:border-white/30 hover:bg-white/10"
            (click)="cycleUiScale()"
          >
            UI Scale: {{ uiScaleLabel }}
          </button>
        </div>
      </div>
      <div class="rounded-[12px] border border-white/10 bg-white/5 p-2">
        <p class="text-[10px] uppercase tracking-[0.3em] text-[#7F7F95]">Run Snapshot</p>
        <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/80">
          <button
            type="button"
            class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 transition hover:border-white/30 hover:bg-white/10"
            (click)="copySnapshot()"
          >
            Copy Snapshot
          </button>
          <button
            type="button"
            class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 transition hover:border-white/30 hover:bg-white/10"
            (click)="openSnapshotImporter()"
          >
            Paste Snapshot
          </button>
        </div>
        @if (showSnapshotInput()) {
          <textarea
            class="mt-2 h-24 w-full resize-none rounded-[10px] border border-white/10 bg-black/50 p-2 text-[11px] text-white/90 outline-none"
            [value]="snapshotInput()"
            (input)="onSnapshotInput($event)"
            placeholder="Paste run snapshot JSON here..."
          ></textarea>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition hover:border-white/30 hover:bg-white/10"
              (click)="importSnapshot()"
            >
              Import
            </button>
            <button
              type="button"
              class="rounded-[10px] border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition hover:border-white/30 hover:bg-white/10"
              (click)="closeSnapshotImporter()"
            >
              Cancel
            </button>
          </div>
        }
        @if (snapshotError()) {
          <p class="mt-2 text-[10px] text-[#ff9aaa]">{{ snapshotError() }}</p>
        }
      </div>
      <div class="grid grid-cols-2 gap-2">
        <app-button label="Force Win" variant="secondary" (click)="enemy.forceKill()"></app-button>
        <app-button label="Force Loss" variant="danger" (click)="player.applyDamage(9999, 9999)"></app-button>
        <app-button label="Skip Reward" variant="ghost" (click)="run.goToReward()"></app-button>
        <app-button label="Skip Prep" variant="ghost" (click)="run.goToPrep()"></app-button>
      </div>
    </div>
}
  `
})
export class RunDebugPanelComponent {
  protected readonly run = inject(RunStateService);
  protected readonly profile = inject(ProfileStateService);
  protected readonly player = inject(PlayerStateService);
  protected readonly enemy = inject(EnemyStateService);
  protected readonly showSnapshotInput = signal(false);
  protected readonly snapshotInput = signal('');
  protected readonly snapshotError = signal<string | null>(null);
  readonly SHOW = SHOW_DEBUG_PANEL;

  get activeRunUpgrades() {
    return this.run.getRunUpgrades();
  }

  get roomStage(): string {
    return roomToStage(this.run.currentRoom());
  }

  get playerPowerLabel(): string {
    const power = getPlayerPowerMultiplier(this.run.currentRoom());
    return `${Math.round(power * 100)}%`;
  }

  get runSeedLabel(): string {
    const seed = this.run.runSeed();
    return typeof seed === 'number' ? seed.toString() : '--';
  }

  get vfxDensityLabel(): string {
    const density = this.profile.settings().vfxDensity;
    return density.toUpperCase();
  }

  get shakeLabel(): string {
    return this.profile.settings().screenShake ? 'ON' : 'OFF';
  }

  get flashLabel(): string {
    return this.profile.settings().reducedFlash ? 'LOW' : 'FULL';
  }

  get uiScaleLabel(): string {
    const scale = this.profile.settings().uiScale ?? 1;
    return `${Math.round(scale * 100)}%`;
  }

  cycleVfxDensity(): void {
    const current = this.profile.settings().vfxDensity;
    const next = current === 'low' ? 'med' : current === 'med' ? 'high' : 'low';
    this.profile.setSetting('vfxDensity', next);
  }

  toggleScreenShake(): void {
    const current = this.profile.settings().screenShake;
    this.profile.setSetting('screenShake', !current);
  }

  toggleReducedFlash(): void {
    const current = this.profile.settings().reducedFlash;
    this.profile.setSetting('reducedFlash', !current);
  }

  cycleUiScale(): void {
    const current = this.profile.settings().uiScale ?? 1;
    const index = UI_SCALE_OPTIONS.indexOf(current as (typeof UI_SCALE_OPTIONS)[number]);
    const nextIndex = index >= 0 ? (index + 1) % UI_SCALE_OPTIONS.length : 1;
    this.profile.setSetting('uiScale', UI_SCALE_OPTIONS[nextIndex]);
  }

  copySnapshot(): void {
    const snapshot = this.run.exportRunSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    this.snapshotInput.set(json);
    this.snapshotError.set(null);
    this.copyToClipboard(json);
  }

  openSnapshotImporter(): void {
    this.snapshotError.set(null);
    if (!this.showSnapshotInput()) {
      this.snapshotInput.set('');
    }
    this.showSnapshotInput.set(true);
  }

  closeSnapshotImporter(): void {
    this.showSnapshotInput.set(false);
    this.snapshotError.set(null);
  }

  onSnapshotInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.snapshotInput.set(target?.value ?? '');
  }

  importSnapshot(): void {
    const raw = this.snapshotInput().trim();
    if (!raw) {
      this.snapshotError.set('Paste a snapshot JSON first.');
      return;
    }
    try {
      const snapshot = JSON.parse(raw);
      this.run.importRunSnapshot(snapshot);
      this.snapshotError.set(null);
      this.showSnapshotInput.set(false);
    } catch (error) {
      console.warn('Failed to import run snapshot', error);
      this.snapshotError.set('Invalid snapshot JSON.');
    }
  }

  private copyToClipboard(value: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
