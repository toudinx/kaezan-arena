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

  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<string | null>();

  activeId: string | null = null;
  setFilter = 'all';

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['items'] || changes['mode']) && this.open) {
      this.activeId = this.selectedId ?? (this.items[0]?.id ?? null);
      this.setFilter = 'all';
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

  get availableSets(): Array<{ id: string; label: string }> {
    if (!this.isSigilMode) return [];
    const sets = new Map<string, string>();
    this.items.forEach(item => {
      if (item.setKey && item.setName) sets.set(item.setKey, item.setName);
    });
    return [{ id: 'all', label: 'All Sets' }, ...Array.from(sets.entries()).map(([id, label]) => ({ id, label }))];
  }

  get filteredItems(): SelectionItem[] {
    if (!this.isSigilMode) return this.items;
    return this.items.filter(item =>
      this.setFilter === 'all' || item.setKey === this.setFilter
    );
  }

  get activeItem(): SelectionItem | null {
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
}
