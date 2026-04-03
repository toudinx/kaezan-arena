import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-event-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './home-event-banner.component.html',
  styleUrl: './home-event-banner.component.css'
})
export class HomeEventBannerComponent {
  @Input() label = 'Event Active';
  @Input() title = 'Daily Contracts';
  @Input() timer = 'Resets at 00:00 UTC';
  @Output() readonly bannerClick = new EventEmitter<void>();

  onBannerClick(): void {
    this.bannerClick.emit();
  }
}
