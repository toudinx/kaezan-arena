import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { VelvetSkin } from "../../../core/services/skin-state.service";
import { RarityTagComponent } from "../rarity-tag/rarity-tag.component";
import { AppTagComponent } from "../app-tag/app-tag.component";

@Component({
  selector: "app-skin-card",
  standalone: true,
  imports: [CommonModule, RarityTagComponent, AppTagComponent],
  template: `
    <div
      class="card-surface relative flex h-full flex-col gap-2 border border-white/10 p-3 transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
      [ngClass]="{
        'outline outline-2 outline-[#8A7CFF] outline-offset-2': skin.isNew,
        'skin-ssr': skin.rarity === 'SSR',
        'skin-sr': skin.rarity === 'SR',
      }"
    >
      <div class="flex items-center justify-between text-sm text-[#A4A4B5]">
        <app-rarity-tag [rarity]="skin.rarity"></app-rarity-tag>
        @if (skin.isNew) {
          <app-tag label="New" tone="accent"></app-tag>
        }
        @if (skin.unlocked && !skin.isNew && showInUse) {
          <app-tag
            label="In Use"
            tone="success"
          ></app-tag>
        }
      </div>
      <div
        class="h-24 rounded-[12px] bg-gradient-to-br from-white/10 via-white/5 to-transparent"
      ></div>
      <div class="space-y-1">
        <p class="text-sm font-semibold text-white">{{ skin.name }}</p>
        <p class="text-xs text-[#A4A4B5] line-clamp-2">
          {{ skin.description }}
        </p>
      </div>
      <div class="flex flex-wrap gap-1">
        @for (tag of skin.tags || []; track tag) {
          <app-tag
            [label]="tag"
            tone="accent"
          ></app-tag>
        }
      </div>
    </div>
  `,
})
export class SkinCardComponent {
  @Input() skin!: VelvetSkin;
  @Input() showInUse = false;
}
