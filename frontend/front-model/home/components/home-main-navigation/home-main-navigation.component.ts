import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export type HomeNavTone = 'expedition' | 'simulation' | 'kaelis' | 'recruit';

export interface HomeNavItem {
  id: string;
  title: string;
  subtitle: string;
  route?: string;
  tone: HomeNavTone;
  disabled?: boolean;
}

@Component({
  selector: 'app-home-main-navigation',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-main-navigation.component.html',
  styleUrls: ['./home-main-navigation.component.scss']
})
export class HomeMainNavigationComponent {
  @Input() items: HomeNavItem[] = [];
  @Output() itemSelected = new EventEmitter<HomeNavItem>();

  selectItem(item: HomeNavItem): void {
    if (!item.disabled) {
      this.itemSelected.emit(item);
    }
  }
}
