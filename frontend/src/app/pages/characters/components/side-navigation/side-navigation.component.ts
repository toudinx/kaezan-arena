import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type KaelisTab = 'details' | 'weapon' | 'sigils' | 'bestiary';

interface NavTab {
  id: KaelisTab;
  label: string;
}

@Component({
  selector: 'app-kaelis-side-navigation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './side-navigation.component.html',
  styleUrl: './side-navigation.component.css'
})
export class KaelisSideNavigationComponent {
  @Input() activeTab: KaelisTab = 'details';
  @Output() tabChange = new EventEmitter<KaelisTab>();

  readonly tabs: NavTab[] = [
    { id: 'details', label: 'Details' },
    { id: 'weapon', label: 'Weapon' },
    { id: 'sigils', label: 'Sigils' },
    { id: 'bestiary', label: 'Bestiary' }
  ];

  setTab(tab: KaelisTab): void {
    this.tabChange.emit(tab);
  }
}
