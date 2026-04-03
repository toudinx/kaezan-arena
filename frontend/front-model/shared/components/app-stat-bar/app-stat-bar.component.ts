import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type StatTone = 'hp' | 'posture' | 'energy' | 'neutral';

@Component({
  selector: 'app-stat-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-[12px] text-[#A4A4B5] uppercase tracking-wide">
        <span>{{ label }}</span>
        <span class="text-white">{{ current }} / {{ max }}</span>
      </div>
      <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full transition-all duration-300"
          [ngClass]="barClass"
          [ngStyle]="{ width: percentage + '%' }"
        ></div>
      </div>
    </div>
  `
})
export class AppStatBarComponent {
  @Input() label = '';
  @Input() current = 0;
  @Input() max = 100;
  @Input() tone: StatTone = 'neutral';
  @Input() warnAt = 0; // fraction 0-1 to trigger warning style

  get percentage(): number {
    if (this.max <= 0) {
      return 0;
    }
    const value = Math.max(0, Math.min(this.current, this.max));
    return Math.round((value / this.max) * 100);
  }

  get barClass(): Record<string, boolean> {
    const isLow = this.warnAt > 0 && this.current / this.max <= this.warnAt;
    return {
      'bg-[#FF3B5F] animate-pulse': this.tone === 'hp' && isLow,
      'bg-[#FF5A78]': this.tone === 'hp' && !isLow,
      'bg-[#7A8CFF]': this.tone === 'posture',
      'bg-[#2DE3C8]': this.tone === 'energy',
      'bg-[#8A7CFF]': this.tone === 'neutral'
    };
  }
}
