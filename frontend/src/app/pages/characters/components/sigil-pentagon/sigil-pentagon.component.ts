import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SigilSlotCardViewModel {
  slotIndex: number;
  tierName: string;
  isUnlockedByMastery: boolean;
  isPrerequisiteSatisfied: boolean;
  isAscendantUnlocked: boolean;
  canEquipNow: boolean;
  lockReason?: string | null;
  ascendantProgressLabel?: string | null;
  equippedSigil?: Readonly<{
    instanceId: string;
    speciesDisplayName: string;
    sigilLevel: number;
    hpBonus: number;
  }> | null;
  canUnequip: boolean;
}

@Component({
  selector: 'app-kaelis-sigil-pentagon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sigil-pentagon.component.html',
  styleUrl: './sigil-pentagon.component.css'
})
export class KaelisSigilPentagonComponent {
  @Input() slots: SigilSlotCardViewModel[] = [];
  @Input() busySlotIndex: number | null = null;
  @Output() slotClick = new EventEmitter<number>();
  @Output() unequipClick = new EventEmitter<number>();

  trackBySlotIndex(_: number, slot: SigilSlotCardViewModel): number {
    return slot.slotIndex;
  }

  onSlotClick(slot: SigilSlotCardViewModel): void {
    if (!slot.canEquipNow || this.busySlotIndex === slot.slotIndex) {
      return;
    }

    this.slotClick.emit(slot.slotIndex);
  }

  onUnequipClick(event: Event, slot: SigilSlotCardViewModel): void {
    event.stopPropagation();
    if (!slot.equippedSigil || !slot.canUnequip || this.busySlotIndex === slot.slotIndex) {
      return;
    }

    this.unequipClick.emit(slot.slotIndex);
  }
}
