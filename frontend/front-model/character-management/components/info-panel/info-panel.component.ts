import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CharacterManagementTab } from '../../character-management-state.service';
import { KaelisDefinition } from '../../../../core/models/kaelis.model';
import { WeaponDefinition } from '../../../../core/models/weapon.model';
import { AppButtonComponent } from '../../../../shared/components';

export interface InfoPanelStat {
  label: string;
  value: string;
}

export interface SetBonusDisplay {
  id: string;
  label: string;
  detail: string;
}

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  templateUrl: './info-panel.component.html',
  styleUrls: ['./info-panel.component.scss']
})
export class InfoPanelComponent {
  @Input() activeTab: CharacterManagementTab = 'details';
  @Input() kaelis?: KaelisDefinition;
  @Input() baseStats: InfoPanelStat[] = [];
  @Input() weapon?: WeaponDefinition | null;
  @Input() weaponStats: InfoPanelStat[] = [];
  @Input() sigilStats: InfoPanelStat[] = [];
  @Input() sigilSetBonuses: SetBonusDisplay[] = [];
  @Input() primarySigilBonus?: SetBonusDisplay | null;

  @Output() changeWeapon = new EventEmitter<void>();

  get xpCurrent(): number {
    return this.kaelis?.profile?.xpCurrent ?? 0;
  }

  get xpMax(): number {
    return this.kaelis?.profile?.xpMax ?? 1;
  }

  get xpLevel(): number {
    return this.kaelis?.profile?.level ?? 1;
  }

  get affinity(): number {
    return this.kaelis?.profile?.affinity ?? 0;
  }
}
