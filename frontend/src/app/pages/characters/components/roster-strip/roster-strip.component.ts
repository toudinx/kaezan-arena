import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RosterEntry {
  id: string;
  name: string;
  imageUrl?: string | null;
  portrait?: CharacterPortrait | null;
  kitBadge?: string | null;
  masteryLevel?: number | null;
}

export interface CharacterPortrait {
  imageUrl?: string | null;
  monogram?: string;
  tone?: string;
}

@Component({
  selector: 'app-kaelis-roster-strip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './roster-strip.component.html',
  styleUrl: './roster-strip.component.css'
})
export class KaelisRosterStripComponent {
  @Input() entries: RosterEntry[] = [];
  @Input() selectedId?: string;
  @Output() selectEntry = new EventEmitter<string>();
  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  @ViewChild('viewport') viewport?: ElementRef<HTMLDivElement>;

  scrollLeft(): void {
    this.scrollBy(-140);
    this.previous.emit();
  }

  scrollRight(): void {
    this.scrollBy(140);
    this.next.emit();
  }

  select(id: string): void {
    this.selectEntry.emit(id);
  }

  initialFor(name: string): string {
    return name?.slice(0, 1).toUpperCase() ?? '?';
  }

  resolveToneClass(entry: RosterEntry): string {
    const tone = (entry.portrait?.tone ?? "").trim().toLowerCase();
    return tone.length > 0 ? `tone-${tone}` : "tone-slate";
  }

  private scrollBy(amount: number): void {
    this.viewport?.nativeElement.scrollBy({ left: amount, behavior: 'smooth' });
  }
}
