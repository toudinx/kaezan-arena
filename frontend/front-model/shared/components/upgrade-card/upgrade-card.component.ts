import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpgradeDef } from '../../../content/upgrades/upgrade.types';

@Component({
  selector: 'app-upgrade-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="rounded-[16px] border border-white/10 bg-white/5 p-4 transition-transform duration-200 ease-out"
      [ngClass]="{
        'outline outline-2 outline-[var(--primary)] outline-offset-2 scale-[1.01]': selected,
        'opacity-60': isDisabled
      }"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-base font-semibold text-white">{{ upgrade?.name }}</p>
          <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-[#A4A4B5]">
            <span class="rounded-full border border-white/10 bg-white/5 px-2 py-1">Track {{ upgrade?.track }}</span>
            <span class="rounded-full border border-white/10 bg-white/5 px-2 py-1">{{ durationLabel }}</span>
          </div>
        </div>
        <span
          class="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          [ngClass]="rarityClasses"
        >
          {{ rarityLabel }}
        </span>
      </div>

      <ul class="mt-3 space-y-1 text-sm text-[#A4A4B5]">
        @for (effect of upgrade?.effects ?? []; track effect.text) {
          <li class="flex items-start gap-2">
            <span class="text-[12px] text-white/80">{{ effect.icon || '*' }}</span>
            <span>{{ effect.text }}</span>
          </li>
        }
      </ul>

      <div class="mt-3 text-xs uppercase tracking-[0.2em]">
        @if (selected) {
          <span class="text-[#9FD2FF]">Selected</span>
        } @else if (isDisabled) {
          <span class="text-[#FF5A78]">{{ disabledReason || 'Locked' }}</span>
        } @else {
          <span class="text-[#7F7F95]">Ready</span>
        }
      </div>
    </div>
  `
})
export class UpgradeCardComponent {
  @Input({ required: true }) upgrade!: UpgradeDef;
  @Input() selected = false;
  @Input() disabled = false;
  @Input() disabledReason?: string;

  get isDisabled(): boolean {
    return this.disabled || !!this.disabledReason;
  }

  get durationLabel(): string {
    if (!this.upgrade) return '';
    const duration = this.upgrade.duration;
    if (duration.type === 'run') return 'Run';
    if (duration.type === 'nextBattle') return 'Next battle';
    const turnLabel = duration.turns === 1 ? 'turn' : 'turns';
    return duration.ownerTurns ? `${duration.turns} ${turnLabel} (yours)` : `${duration.turns} ${turnLabel}`;
  }

  get rarityLabel(): string {
    switch (this.upgrade?.rarity) {
      case 'epic':
        return 'Epic';
      case 'rare':
        return 'Rare';
      default:
        return 'Common';
    }
  }

  get rarityClasses(): Record<string, boolean> {
    return {
      'bg-white/5 text-[#A4A4B5]': this.upgrade?.rarity === 'common',
      'bg-[#7C6BFF]/20 text-[#B9B2FF] border-[#7C6BFF]/30': this.upgrade?.rarity === 'rare',
      'bg-[#FFD56B]/20 text-[#FFD56B] border-[#FFD56B]/40': this.upgrade?.rarity === 'epic'
    };
  }
}
