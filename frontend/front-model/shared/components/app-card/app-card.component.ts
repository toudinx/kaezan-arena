import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AppTagComponent } from "../app-tag/app-tag.component";

type TagTone = "accent" | "info" | "warning" | "danger";

@Component({
  selector: "app-card",
  standalone: true,
  imports: [CommonModule, AppTagComponent],
  template: `
    <div
      class="card-surface relative flex h-full flex-col gap-3 border border-white/8 p-4 md:p-5 transition duration-150"
      [ngClass]="{
        'hover:-translate-y-1 hover:border-white/20 hover:shadow-neon':
          interactive,
      }"
    >
      @if (title || subtitle || tag) {
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-1">
            @if (eyebrow) {
              <p class="text-[11px] uppercase tracking-[0.22em] text-[#A4A4B5]">
                {{ eyebrow }}
              </p>
            }
            <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
            @if (subtitle) {
              <p class="text-sm text-[#A4A4B5] leading-relaxed">
                {{ subtitle }}
              </p>
            }
          </div>
          @if (tag) {
            <app-tag [label]="tag" [tone]="tagTone"></app-tag>
          }
        </div>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class AppCardComponent {
  @Input() title = "";
  @Input() subtitle?: string;
  @Input() eyebrow?: string;
  @Input() tag?: string;
  @Input() tagTone: TagTone = "accent";
  @Input() interactive = true;
}
