import { CommonModule } from "@angular/common";
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
} from "@angular/core";
import { RngService } from "../../../core/services/rng.service";

@Component({
  selector: "app-wow-burst",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (active) {
      <div
        class="pointer-events-none fixed inset-0 z-50 overflow-hidden transition-opacity duration-300"
        [class.opacity-0]="!visible"
        [class.opacity-100]="visible"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-[#8A7CFF]/20 via-transparent to-[#E28FE8]/16 blur-2xl"
        ></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="burst-core"></div>
        </div>
        <div class="absolute inset-0">
          @for (particle of particles; track $index) {
            <div
              class="burst-particle"
              [style.left.%]="particle.x"
              [style.top.%]="particle.y"
              [style.--tx.px]="particle.tx"
              [style.--ty.px]="particle.ty"
            ></div>
          }
        </div>
      </div>
    }
  `,
})
export class WowBurstComponent implements OnChanges, OnDestroy {
  private readonly vfxRng = inject(RngService).fork("vfx-wow-burst");
  @Input() trigger = false;
  @Input() duration = 1200;

  visible = false;
  active = false;
  particles = Array.from({ length: 14 }, (_, i) => ({
    x: 10 + ((i * 6) % 70),
    y: 10 + ((i * 11) % 70),
    tx: this.vfxRng.nextFloat() * 120 - 60,
    ty: this.vfxRng.nextFloat() * 120 - 40,
  }));
  private timer?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["trigger"]?.currentValue) {
      this.play();
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private play(): void {
    this.active = true;
    requestAnimationFrame(() => (this.visible = true));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.visible = false;
      setTimeout(() => (this.active = false), 200);
    }, this.duration);
  }
}
