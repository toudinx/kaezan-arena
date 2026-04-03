import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-raid-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-raid-banner.component.html',
  styleUrls: ['./home-raid-banner.component.scss']
})
export class HomeRaidBannerComponent {
  @Input() label = 'Event Active';
  @Input() title = 'Boss Raid';
  @Input() timer = 'Ends soon';
}
