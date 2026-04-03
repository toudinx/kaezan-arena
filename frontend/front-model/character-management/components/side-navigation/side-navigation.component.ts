import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CharacterManagementTab } from '../../character-management-state.service';

interface NavTab {
  id: CharacterManagementTab;
  label: string;
}

@Component({
  selector: 'app-side-navigation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './side-navigation.component.html',
  styleUrls: ['./side-navigation.component.scss']
})
export class SideNavigationComponent {
  @Input() activeTab: CharacterManagementTab = 'details';
  @Output() tabChange = new EventEmitter<CharacterManagementTab>();

  readonly tabs: NavTab[] = [
    { id: 'details', label: 'Details' },
    { id: 'weapon', label: 'Weapon' },
    { id: 'sigils', label: 'Sigils' }
  ];

  setTab(tab: CharacterManagementTab): void {
    this.tabChange.emit(tab);
  }
}
