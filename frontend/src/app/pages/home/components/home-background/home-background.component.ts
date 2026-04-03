import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-background',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './home-background.component.html',
  styleUrl: './home-background.component.css'
})
export class HomeBackgroundComponent {
  @Input() imageUrl?: string | null;
  @Input() gradientOverlay?: string | null;

  get backgroundImage(): string {
    return this.imageUrl ? `url('${this.imageUrl}')` : 'none';
  }
}
