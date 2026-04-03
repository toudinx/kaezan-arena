import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type Rarity = 'R' | 'SR' | 'SSR';

@Component({
  selector: 'app-rarity-tag',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-wide"
      [ngClass]="classes">
      @switch (rarity) {
        @case ('R') { <span>★</span> }
        @case ('SR') { <span>★★</span> }
        @case ('SSR') { <span>★★★</span> }
      }
      {{ rarity }}
    </span>
  `
})
export class RarityTagComponent {
  @Input() rarity: Rarity = 'R';

  get classes(): Record<string, boolean> {
    return {
      'bg-white/10 text-[#A4A4B5] border border-white/10': this.rarity === 'R',
      'bg-[#8A7CFF]/20 text-[#8A7CFF] border border-[#8A7CFF]/30': this.rarity === 'SR',
      'bg-[#FFD344]/20 text-[#FFD344] border border-[#FFD344]/30': this.rarity === 'SSR'
    };
  }
}
