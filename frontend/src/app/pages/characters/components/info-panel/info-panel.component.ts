import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KaelisTab } from '../side-navigation/side-navigation.component';

export interface InfoPanelStat {
  label: string;
  value: string;
}

export interface SetBonusDisplay {
  id: string;
  label: string;
  detail: string;
}

export interface WeaponInfo {
  name: string;
  description?: string;
  passive?: string;
  imageUrl?: string | null;
}

@Component({
  selector: 'app-kaelis-info-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-panel.component.html',
  styleUrl: './info-panel.component.css'
})
export class KaelisInfoPanelComponent {
  @Input() activeTab: KaelisTab = 'details';
  @Input() characterName = '';
  @Input() characterSubtitle = '';
  @Input() masteryLevel = 1;
  @Input() masteryXp = 0;
  @Input() masteryXpRequired = 100;
  @Input() baseStats: InfoPanelStat[] = [];
  @Input() weapon?: WeaponInfo | null;
  @Input() weaponStats: InfoPanelStat[] = [];
  @Input() sigilStats: InfoPanelStat[] = [];
  @Input() sigilSetBonuses: SetBonusDisplay[] = [];
  @Input() primarySigilBonus?: SetBonusDisplay | null;
  @Input() equippedWeaponName?: string | null;

  @Output() changeWeapon = new EventEmitter<void>();

  get xpPercent(): number {
    if (this.masteryXpRequired <= 0) return 100;
    return Math.min(100, Math.max(0, (this.masteryXp / this.masteryXpRequired) * 100));
  }
}
