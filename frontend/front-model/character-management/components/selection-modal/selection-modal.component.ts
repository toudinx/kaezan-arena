import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WeaponDefinition } from '../../../../core/models/weapon.model';
import { SigilDefinition, SigilStatType } from '../../../../core/models/sigil.model';
import { AppButtonComponent } from '../../../../shared/components';
import { SIGIL_SETS } from '../../../../content/equipment/sigils';

export type SelectionMode = 'weapon' | 'sigil';

interface FilterOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-selection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: './selection-modal.component.html',
  styleUrls: ['./selection-modal.component.scss']
})
export class SelectionModalComponent implements OnChanges {
  @Input() open = false;
  @Input() mode: SelectionMode = 'weapon';
  @Input() items: (WeaponDefinition | SigilDefinition)[] = [];
  @Input() selectedId: string | null = null;
  @Input() slotIndex: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<string | null>();

  activeId: string | null = null;
  setFilter = 'all';
  statFilter = 'all';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] || changes['items'] || changes['mode']) {
      if (this.open) {
        this.resetState();
      }
    }
  }

  get isSigilMode(): boolean {
    return this.mode === 'sigil';
  }

  get title(): string {
    if (this.mode === 'weapon') return 'Armory';
    const slotLabel = this.slotIndex !== null ? `Slot ${this.slotIndex + 1}` : 'Slot';
    return `Select Sigil (${slotLabel})`;
  }

  get confirmLabel(): string {
    return this.mode === 'weapon' ? 'Equip Weapon' : 'Equip Sigil';
  }

  get availableSets(): FilterOption[] {
    if (!this.isSigilMode) return [];
    const sets = new Set(this.sigilItems().map(item => item.setKey));
    return [{ id: 'all', label: 'All Sets' }].concat(
      Array.from(sets).map(key => ({ id: key, label: SIGIL_SETS[key]?.name ?? key }))
    );
  }

  get availableStats(): FilterOption[] {
    if (!this.isSigilMode) return [];
    const types = new Set(this.sigilItems().map(item => item.mainStat.type));
    return [{ id: 'all', label: 'All Stats' }].concat(
      Array.from(types).map(type => ({ id: type, label: this.statFilterLabel(type) }))
    );
  }

  get filteredItems(): (WeaponDefinition | SigilDefinition)[] {
    if (!this.isSigilMode) return this.items as WeaponDefinition[];
    return this.sigilItems().filter(item => {
      const setMatch = this.setFilter === 'all' || item.setKey === this.setFilter;
      const statMatch = this.statFilter === 'all' || item.mainStat.type === this.statFilter;
      return setMatch && statMatch;
    });
  }

  get activeItem(): WeaponDefinition | SigilDefinition | null {
    if (!this.activeId) return null;
    return this.items.find(item => item.id === this.activeId) ?? null;
  }

  close(): void {
    this.closed.emit();
  }

  selectItem(id: string | null): void {
    this.activeId = id;
  }

  confirm(): void {
    this.confirmed.emit(this.activeId);
  }

  weaponStatLabel(weapon: WeaponDefinition): string {
    if (weapon.secondaryStat.type === 'energyRegen') {
      return `Energy Regen +${weapon.secondaryStat.value}%`;
    }
    const percent = Math.round(weapon.secondaryStat.value * 100);
    return weapon.secondaryStat.type === 'critRate'
      ? `Crit Rate +${percent}%`
      : `Crit DMG +${percent}%`;
  }

  weaponFlatLabel(weapon: WeaponDefinition): string {
    return weapon.flatStat.type === 'atk' ? `ATK +${weapon.flatStat.value}` : `HP +${weapon.flatStat.value}`;
  }

  sigilStatLabel(type: SigilStatType, value: number): string {
    if (type === 'crit_rate_percent' || type === 'crit_damage_percent') {
      return `+${Math.round(value * 100)}%`;
    }
    if (type.endsWith('_percent')) {
      return `+${value}%`;
    }
    return `+${value}`;
  }

  statFilterLabel(type: SigilStatType): string {
    switch (type) {
      case 'hp_flat':
      case 'hp_percent':
        return 'HP';
      case 'atk_flat':
      case 'atk_percent':
        return 'ATK';
      case 'crit_rate_percent':
        return 'Crit Rate';
      case 'crit_damage_percent':
        return 'Crit DMG';
      case 'damage_percent':
        return 'Damage';
      case 'energy_regen_percent':
        return 'Energy Regen';
      case 'damage_reduction_percent':
        return 'Damage Reduction';
      case 'heal_percent':
        return 'Heal Bonus';
      default:
        return 'Stat';
    }
  }

  setLabel(key: string): string {
    return SIGIL_SETS[key]?.name ?? key;
  }

  private resetState(): void {
    if (this.mode === 'sigil' && this.selectedId === null) {
      this.activeId = null;
    } else {
      this.activeId = this.selectedId ?? (this.items[0]?.id ?? null);
    }
    this.setFilter = 'all';
    this.statFilter = 'all';
  }

  private sigilItems(): SigilDefinition[] {
    return (this.items as SigilDefinition[]).filter(item => !!item?.setKey);
  }
}


