import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

@Component({
  selector: "app-health-bar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./health-bar.component.html",
  styleUrl: "./health-bar.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HealthBarComponent {
  @Input() value = 100;
  @Input() max = 100;
  @Input() shield = 0;
  @Input() maxShield = 80;
  @Input() label = "HP";

  get hpPercent(): number {
    if (this.max <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (this.value / this.max) * 100));
  }

  get shieldPercentOfMaxHp(): number {
    if (this.max <= 0) {
      return 0;
    }

    const cappedShield = Math.max(0, Math.min(this.shield, this.maxShield));
    return Math.max(0, Math.min(80, (cappedShield / this.max) * 100));
  }
}
