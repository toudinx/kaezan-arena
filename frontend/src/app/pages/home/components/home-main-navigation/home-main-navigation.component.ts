import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export type HomeNavTone = 'arena' | 'backpack' | 'kaelis' | 'recruit';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-main-navigation.component.html',
  styleUrl: './home-main-navigation.component.css'
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
