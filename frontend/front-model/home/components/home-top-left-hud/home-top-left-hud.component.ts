import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-top-left-hud',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-top-left-hud.component.html',
  styleUrls: ['./home-top-left-hud.component.scss']
})
export class HomeTopLeftHudComponent {
  @Input() title = 'Kaezan: Awakening';
  @Input() commanderName = 'Commander';
  @Input() level = 52;
  @Input() xpProgress = 0.65;

  get xpPercent(): string {
    const clamped = Math.min(1, Math.max(0, this.xpProgress));
    return `${Math.round(clamped * 100)}%`;
  }
}
