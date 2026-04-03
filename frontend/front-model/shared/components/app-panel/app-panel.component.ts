import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppTagComponent } from '../app-tag/app-tag.component';

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [CommonModule, AppTagComponent],
  template: `
    <section class="card-surface border border-white/8 p-4 md:p-5">
      <div class="mb-3 flex items-start justify-between gap-2">
        <div class="space-y-1">
          @if (eyebrow) {
            <p class="text-[11px] uppercase tracking-[0.22em] text-[#A4A4B5]">
              {{ eyebrow }}
            </p>
          }
          <h2 class="text-base font-semibold text-white">{{ title }}</h2>
          @if (subtitle) {
            <p class="text-sm text-[#A4A4B5]">{{ subtitle }}</p>
          }
        </div>
        @if (tag) {
          <app-tag [label]="tag"></app-tag>
        }
      </div>
      <ng-content></ng-content>
    </section>
  `
})
export class AppPanelComponent {
  @Input() title = '';
  @Input() subtitle?: string;
  @Input() tag?: string;
  @Input() eyebrow?: string;
}
