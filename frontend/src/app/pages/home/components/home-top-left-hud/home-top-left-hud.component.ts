import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-top-left-hud',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './home-top-left-hud.component.html',
  styleUrl: './home-top-left-hud.component.css'
})
export class HomeTopLeftHudComponent {
  @Input() title = '';
  @Input() commanderName = 'Commander';
  @Input() level = 1;
  @Input() xpProgress = 0;

  get hasTitle(): boolean {
    return this.title.trim().length > 0;
  }

  get xpPercent(): string {
    const clamped = Math.min(1, Math.max(0, this.xpProgress));
    return `${Math.round(clamped * 100)}%`;
  }
}
