import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

const SIGIL_SLOT_POSITIONS = [
  { index: 0, left: '50%', top: '8%' },
  { index: 1, left: '90%', top: '37%' },
  { index: 2, left: '75%', top: '84%' },
  { index: 3, left: '25%', top: '84%' },
  { index: 4, left: '10%', top: '37%' }
];

@Component({
  selector: 'app-kaelis-sigil-pentagon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sigil-pentagon.component.html',
  styleUrl: './sigil-pentagon.component.css'
})
export class KaelisSigilPentagonComponent {
  @Input() slots: (string | null)[] = [];
  @Input() selectedIndex = 0;
  @Output() slotClick = new EventEmitter<number>();

  readonly slotPositions = SIGIL_SLOT_POSITIONS;

  slotAt(index: number): string | null {
    return this.slots[index] ?? null;
  }

  selectSlot(index: number): void {
    this.slotClick.emit(index);
  }
}
