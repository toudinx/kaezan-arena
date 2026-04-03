import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../app-button/app-button.component';

@Component({
  selector: 'app-premium-tease',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    <div
      class="relative overflow-hidden rounded-[14px] border border-[#8A7CFF]/30 bg-gradient-to-r from-[#8A7CFF]/20 via-[#E28FE8]/10 to-transparent p-4"
      [ngClass]="{ 'flex items-center justify-between gap-3': size === 'full' }"
    >
      <div class="absolute inset-0 opacity-30 blur-3xl" aria-hidden="true">
        <div class="absolute left-0 top-0 h-32 w-32 rounded-full bg-[#8A7CFF]/30"></div>
        <div class="absolute right-4 bottom-0 h-24 w-24 rounded-full bg-[#E28FE8]/25"></div>
      </div>
      <div class="relative space-y-1">
        <p class="text-[11px] uppercase tracking-[0.22em] text-[#A4A4B5]">Premium</p>
        <h4 class="text-base font-semibold text-white">{{ title }}</h4>
        @if (subtitle) {
<p class="text-sm text-[#A4A4B5]">{{ subtitle }}</p>
}
      </div>
      @if (cta && size === 'full') {
<app-button
        class="relative"
        variant="primary"
        [label]="cta"
        [disabled]="true"
      ></app-button>
}
    </div>
  `
})
export class PremiumTeaseComponent {
  @Input() title = 'Premium perks unlock skins and extra rerolls';
  @Input() subtitle = 'Coming soon. Visual tease only, no billing.';
  @Input() cta = 'Soon';
  @Input() size: 'compact' | 'full' = 'compact';
}
