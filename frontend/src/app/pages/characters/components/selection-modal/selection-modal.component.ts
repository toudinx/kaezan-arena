import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type SelectionModalMode = 'weapon' | 'sigil';

export interface SelectionItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  description?: string;
  // weapon-specific
  flatStatLabel?: string;
  secondaryStatLabel?: string;
  passive?: string;
  // sigil-specific
  setKey?: string;
  setName?: string;
  mainStatLabel?: string;
  mainStatValue?: string;
  subStats?: Array<{ label: string; value: string }>;
  tierId?: string;
  tierName?: string;
  sigilSlotIndex?: number;
  sigilLevel?: number;
  hpBonus?: number;
  isEquipped?: boolean;
  equippedByLabel?: string;
  isCompatible?: boolean;
  isSelectable?: boolean;
  unavailableReason?: string;
}

export interface SigilSelectionContext {
  slotIndex: number;
  slotTierName: string;
  isSlotUsable: boolean;
  lockReason?: string | null;
  currentEquippedInstanceId?: string | null;
}

@Component({
  selector: 'app-kaelis-selection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './selection-modal.component.html',
  styleUrl: './selection-modal.component.css'
})
export class KaelisSelectionModalComponent implements OnChanges {
  @Input() open = false;
  @Input() mode: SelectionModalMode = 'weapon';
  @Input() items: SelectionItem[] = [];
  @Input() selectedId: string | null = null;
  @Input() slotIndex: number | null = null;
  @Input() sigilContext: SigilSelectionContext | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<string | null>();

  activeId: string | null = null;
  tierFilter = 'slot';
  equippedFilter: 'all' | 'equipped' | 'unequipped' = 'all';
  sortBy: 'recommended' | 'level_desc' | 'hp_desc' | 'tier_then_level' = 'recommended';

  ngOnChanges(changes: SimpleChanges): void {
    const openChange = changes['open'];
    if (openChange && openChange.currentValue === true && openChange.previousValue !== true) {
      this.activeId = this.selectedId ?? null;
      this.resetFiltersForMode();
      this.ensureActiveSelection();
    }
  }

  get isSigilMode(): boolean {
    return this.mode === 'sigil';
  }

  get title(): string {
    if (this.mode === 'weapon') return 'Armory';
    const slotLabel = this.slotIndex !== null ? `Slot ${this.slotIndex}` : 'Slot';
    const slotTier = this.sigilContext?.slotTierName ? ` - ${this.sigilContext.slotTierName}` : '';
    return `Select Sigil (${slotLabel}${slotTier})`;
  }

  get currentEquippedItem(): SelectionItem | null {
    if (!this.isSigilMode) {
      return null;
    }

    const equippedId = this.sigilContext?.currentEquippedInstanceId ?? null;
    if (!equippedId) {
      return null;
    }

    return this.items.find((item) => item.id === equippedId) ?? null;
  }

  get sigilTierOptions(): Array<{ id: string; label: string }> {
    if (!this.isSigilMode) {
      return [];
    }

    const tiers = new Map<string, { label: string; order: number }>();
    for (const item of this.items) {
      const key = (item.tierId && item.tierId.trim().length > 0)
        ? item.tierId
        : (item.tierName && item.tierName.trim().length > 0 ? item.tierName : null);
      if (!key) {
        continue;
      }

      const order = item.sigilSlotIndex ?? Number.MAX_SAFE_INTEGER;
      tiers.set(key, { label: item.tierName ?? key, order });
    }

    const ordered = Array.from(tiers.entries())
      .sort((left, right) => {
        const byOrder = left[1].order - right[1].order;
        if (byOrder !== 0) {
          return byOrder;
        }

        return left[1].label.localeCompare(right[1].label, undefined, { sensitivity: 'base' });
      })
      .map(([id, entry]) => ({ id, label: entry.label }));

    return [
      { id: 'slot', label: 'Current Slot Tier' },
      { id: 'all', label: 'All Tiers' },
      ...ordered
    ];
  }

  get filteredItems(): SelectionItem[] {
    if (!this.isSigilMode) {
      return this.items;
    }

    return this.items
      .filter((item) => this.matchesTierFilter(item))
      .filter((item) => this.matchesEquippedFilter(item))
      .sort((left, right) => this.compareSigils(left, right));
  }

  get hasAnySigils(): boolean {
    return this.items.length > 0;
  }

  get hasCompatibleSigils(): boolean {
    if (!this.isSigilMode) {
      return true;
    }

    return this.items.some((item) => this.isCompatibleWithCurrentSlot(item));
  }

  get activeItemIsUnavailable(): boolean {
    if (!this.isSigilMode || !this.activeItem) {
      return false;
    }

    return this.activeItem.isSelectable === false;
  }

  get activeItem(): SelectionItem | null {
    if (!this.activeId) return null;
    return this.items.find(item => item.id === this.activeId) ?? null;
  }

  get isSigilClearSelection(): boolean {
    return this.isSigilMode && this.activeId === null;
  }

  get selectedSigilForComparison(): SelectionItem | null {
    return this.activeItem;
  }

  get comparisonRows(): Array<{
    label: string;
    currentValue: string;
    selectedValue: string;
    deltaValue: string;
    deltaDirection: 'up' | 'down' | 'neutral';
  }> {
    if (!this.isSigilMode) {
      return [];
    }

    const current = this.currentEquippedItem;
    const selected = this.selectedSigilForComparison;
    const currentLevel = current?.sigilLevel ?? 0;
    const selectedLevel = selected?.sigilLevel ?? 0;
    const currentHp = current?.hpBonus ?? 0;
    const selectedHp = selected?.hpBonus ?? 0;

    return [
      this.buildComparisonRow('Sigil Level', currentLevel, selectedLevel),
      this.buildComparisonRow('HP Bonus', currentHp, selectedHp)
    ];
  }

  get isConfirmDisabled(): boolean {
    if (!this.isSigilMode) {
      return !this.activeId;
    }

    if (this.sigilContext && !this.sigilContext.isSlotUsable) {
      return true;
    }

    const currentId = this.sigilContext?.currentEquippedInstanceId ?? null;
    if (this.activeId === null) {
      return !currentId;
    }

    if (!this.activeItem) {
      return true;
    }

    if (this.activeItem.isSelectable === false) {
      return true;
    }

    return this.activeItem.id === currentId;
  }

  get confirmLabel(): string {
    if (!this.isSigilMode) {
      return 'Equip Weapon';
    }

    const currentId = this.sigilContext?.currentEquippedInstanceId ?? null;
    if (this.activeId === null) {
      return currentId ? 'Unequip Sigil' : 'No Change';
    }

    if (this.activeId === currentId) {
      return 'Already Equipped';
    }

    return 'Equip Sigil';
  }

  close(): void {
    this.closed.emit();
  }

  selectItem(id: string | null): void {
    this.activeId = id;
  }

  onSigilFiltersChanged(): void {
    this.ensureActiveSelection();
  }

  confirm(): void {
    this.confirmed.emit(this.activeId);
  }

  private resetFiltersForMode(): void {
    if (!this.isSigilMode) {
      return;
    }

    this.tierFilter = 'slot';
    this.equippedFilter = 'all';
    this.sortBy = 'recommended';
  }

  private ensureActiveSelection(): void {
    if (!this.isSigilMode) {
      if (this.activeId && !this.items.some((item) => item.id === this.activeId)) {
        this.activeId = this.items[0]?.id ?? null;
      }
      return;
    }

    if (this.activeId === null) {
      return;
    }

    if (!this.filteredItems.some((item) => item.id === this.activeId)) {
      this.activeId = this.filteredItems[0]?.id ?? null;
    }
  }

  private matchesTierFilter(item: SelectionItem): boolean {
    if (this.tierFilter === 'all') {
      return true;
    }

    if (this.tierFilter === 'slot') {
      return this.isCompatibleWithCurrentSlot(item);
    }

    if (item.tierId && item.tierId === this.tierFilter) {
      return true;
    }

    return item.tierName === this.tierFilter;
  }

  private matchesEquippedFilter(item: SelectionItem): boolean {
    if (this.equippedFilter === 'all') {
      return true;
    }

    if (this.equippedFilter === 'equipped') {
      return item.isEquipped === true;
    }

    return item.isEquipped !== true;
  }

  private compareSigils(left: SelectionItem, right: SelectionItem): number {
    if (this.sortBy === 'level_desc') {
      return this.byLevelThenId(left, right);
    }

    if (this.sortBy === 'hp_desc') {
      const hpDelta = (right.hpBonus ?? 0) - (left.hpBonus ?? 0);
      return hpDelta !== 0 ? hpDelta : this.byLevelThenId(left, right);
    }

    if (this.sortBy === 'tier_then_level') {
      const leftTier = left.tierName ?? '';
      const rightTier = right.tierName ?? '';
      const byTier = leftTier.localeCompare(rightTier, undefined, { sensitivity: 'base' });
      return byTier !== 0 ? byTier : this.byLevelThenId(left, right);
    }

    const leftCompatible = Number(this.isCompatibleWithCurrentSlot(left));
    const rightCompatible = Number(this.isCompatibleWithCurrentSlot(right));
    if (rightCompatible !== leftCompatible) {
      return rightCompatible - leftCompatible;
    }

    const leftSelectable = Number(left.isSelectable !== false);
    const rightSelectable = Number(right.isSelectable !== false);
    if (rightSelectable !== leftSelectable) {
      return rightSelectable - leftSelectable;
    }

    const leftCurrent = Number(left.id === (this.sigilContext?.currentEquippedInstanceId ?? null));
    const rightCurrent = Number(right.id === (this.sigilContext?.currentEquippedInstanceId ?? null));
    if (rightCurrent !== leftCurrent) {
      return rightCurrent - leftCurrent;
    }

    return this.byLevelThenId(left, right);
  }

  private byLevelThenId(left: SelectionItem, right: SelectionItem): number {
    const levelDelta = (right.sigilLevel ?? 0) - (left.sigilLevel ?? 0);
    if (levelDelta !== 0) {
      return levelDelta;
    }

    const hpDelta = (right.hpBonus ?? 0) - (left.hpBonus ?? 0);
    if (hpDelta !== 0) {
      return hpDelta;
    }

    return left.id.localeCompare(right.id, undefined, { sensitivity: 'base' });
  }

  private isCompatibleWithCurrentSlot(item: SelectionItem): boolean {
    if (item.isCompatible !== undefined) {
      return item.isCompatible;
    }

    const slotIndex = this.sigilContext?.slotIndex ?? this.slotIndex ?? null;
    if (!slotIndex || !item.sigilSlotIndex) {
      return true;
    }

    return item.sigilSlotIndex === slotIndex;
  }

  private buildComparisonRow(label: string, currentValue: number, selectedValue: number): {
    label: string;
    currentValue: string;
    selectedValue: string;
    deltaValue: string;
    deltaDirection: 'up' | 'down' | 'neutral';
  } {
    const delta = selectedValue - currentValue;
    return {
      label,
      currentValue: `${currentValue}`,
      selectedValue: `${selectedValue}`,
      deltaValue: this.formatSigned(delta),
      deltaDirection: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'
    };
  }

  private formatSigned(value: number): string {
    if (value > 0) {
      return `+${value}`;
    }

    return `${value}`;
  }
}
