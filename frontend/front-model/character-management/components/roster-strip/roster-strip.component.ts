import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { KaelisDefinition, KaelisId } from '../../../../core/models/kaelis.model';

@Component({
  selector: 'app-roster-strip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './roster-strip.component.html',
  styleUrls: ['./roster-strip.component.scss']
})
export class RosterStripComponent {
  @Input() kaelis: KaelisDefinition[] = [];
  @Input() selectedId?: KaelisId;
  @Output() selectKaelis = new EventEmitter<KaelisId>();
  @Output() previousKaelis = new EventEmitter<void>();
  @Output() nextKaelis = new EventEmitter<void>();

  @ViewChild('viewport') viewport?: ElementRef<HTMLDivElement>;

  scrollLeft(): void {
    this.scrollBy(-140);
    this.previousKaelis.emit();
  }

  scrollRight(): void {
    this.scrollBy(140);
    this.nextKaelis.emit();
  }

  select(id: KaelisId): void {
    this.selectKaelis.emit(id);
  }

  trackById(_: number, item: KaelisDefinition): string {
    return item.id;
  }

  initialFor(name: string): string {
    return name?.slice(0, 1).toUpperCase() ?? '?';
  }

  private scrollBy(amount: number): void {
    this.viewport?.nativeElement.scrollBy({ left: amount, behavior: 'smooth' });
  }
}
