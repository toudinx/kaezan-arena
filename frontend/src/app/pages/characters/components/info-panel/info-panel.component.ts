import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KaelisTab } from '../side-navigation/side-navigation.component';
import { type SigilSlotCardViewModel } from '../sigil-pentagon/sigil-pentagon.component';

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
  @Input() activeTab: KaelisTab = 'overview';
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
  @Input() sigilSlots: SigilSlotCardViewModel[] = [];
  @Input() equippedWeaponName?: string | null;
  @Input() fixedKitNames: string[] = [];
  @Input() isActiveCharacter = false;
  @Input() canManageInfusion = false;

  @Output() changeWeapon = new EventEmitter<void>();
  @Output() setActiveCharacter = new EventEmitter<void>();
  @Output() manageInfusion = new EventEmitter<void>();

  get xpPercent(): number {
    if (this.masteryXpRequired <= 0) return 100;
    return Math.min(100, Math.max(0, (this.masteryXp / this.masteryXpRequired) * 100));
  }

  get totalSigilHpBonus(): number {
    return this.sigilSlots.reduce((sum, slot) => sum + (slot.equippedSigil?.hpBonus ?? 0), 0);
  }

  get weaponRarity(): string {
    return this.getWeaponStatValue('Rarity') ?? 'Unknown';
  }

  get weaponClassType(): string {
    return this.getWeaponStatValue('Class') ?? 'Unknown';
  }

  get weaponElement(): string {
    return this.getWeaponStatValue('Element') ?? 'None';
  }

  get weaponDamage(): string {
    return this.getWeaponStatValue('Damage') ?? '-';
  }

  get weaponFinisher(): string {
    const finisher = this.getWeaponStatValue('Finisher');
    if (finisher) {
      return finisher;
    }

    const passiveText = (this.weapon?.passive ?? '').trim();
    if (passiveText.toLowerCase().startsWith('finisher:')) {
      const [, value = ''] = passiveText.split(':', 2);
      const normalized = value.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }

    return 'Unspecified';
  }

  get weaponPassive(): string {
    const passiveText = (this.weapon?.passive ?? '').trim();
    if (passiveText.length > 0) {
      return passiveText;
    }

    return this.getWeaponStatValue('On Hit')
      ?? this.getWeaponStatValue('Focus')
      ?? this.getWeaponStatValue('Pattern')
      ?? this.getWeaponStatValue('Profile')
      ?? 'No passive listed';
  }

  get weaponSecondaryStats(): InfoPanelStat[] {
    return this.weaponStats.filter((stat) => {
      const label = stat.label.trim().toLowerCase();
      return !(
        label === 'rarity'
        || label === 'class'
        || label === 'element'
        || label === 'damage'
        || label === 'finisher'
      );
    });
  }

  get weaponRarityClass(): string {
    if (this.activeTab !== 'weapon') {
      return '';
    }

    const rarity = this.normalizedWeaponRarity;
    if (rarity === 'legendary') {
      return 'rarity-legendary';
    }

    if (rarity === 'rare') {
      return 'rarity-rare';
    }

    if (rarity === 'common') {
      return 'rarity-common';
    }

    return 'rarity-epic';
  }

  private getWeaponStatValue(label: string): string | null {
    const normalizedTarget = label.trim().toLowerCase();
    for (const stat of this.weaponStats) {
      if (stat.label.trim().toLowerCase() === normalizedTarget) {
        const value = stat.value.trim();
        return value.length > 0 ? value : null;
      }
    }

    return null;
  }

  private get normalizedWeaponRarity(): string {
    const rarity = this.weaponRarity.trim().toLowerCase();
    if (rarity.length === 0 || rarity === 'unknown') {
      return 'common';
    }

    return rarity;
  }
}
