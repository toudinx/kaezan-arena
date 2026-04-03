import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type TagTone = 'accent' | 'muted' | 'warning' | 'danger' | 'success';

@Component({
  selector: 'app-tag',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-wide"
      [ngClass]="tagClasses"
    >
      @if (icon) {
        <span class="text-base leading-none">{{ icon }}</span>
      }
      {{ label }}
    </span>
  `
})
export class AppTagComponent {
  @Input() label = '';
  @Input() icon?: string;
  @Input() tone: TagTone = 'accent';

  get tagClasses(): Record<string, boolean> {
    return {
      'bg-[#8A7CFF]/20 text-[#8A7CFF] border border-[#8A7CFF]/40': this.tone === 'accent',
      'bg-white/10 text-[#A4A4B5] border border-white/10': this.tone === 'muted',
      'bg-[#FFD344]/20 text-[#FFD344] border border-[#FFD344]/30': this.tone === 'warning',
      'bg-[#FF5A78]/20 text-[#FF5A78] border border-[#FF5A78]/30': this.tone === 'danger',
      'bg-[#2DE3C8]/20 text-[#2DE3C8] border border-[#2DE3C8]/30': this.tone === 'success'
    };
  }
}
