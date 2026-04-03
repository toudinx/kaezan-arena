import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KaelisTab } from '../side-navigation/side-navigation.component';
import { KaelisSigilPentagonComponent } from '../sigil-pentagon/sigil-pentagon.component';

@Component({
  selector: 'app-kaelis-center-preview',
  standalone: true,
  imports: [CommonModule, KaelisSigilPentagonComponent],
  templateUrl: './center-preview.component.html',
  styleUrl: './center-preview.component.css'
})
export class KaelisCenterPreviewComponent {
  @Input() activeTab: KaelisTab = 'details';
  @Input() characterImageUrl?: string | null;
  @Input() characterName = '';
  @Input() weaponImageUrl?: string | null;
  @Input() sigilSlots: (string | null)[] = [];
  @Input() selectedSigilIndex = 0;
  @Input() skinName?: string | null;
  @Input() skinDescription?: string | null;
  @Input() canPrevSkin = false;
  @Input() canNextSkin = false;

  @Output() slotClick = new EventEmitter<number>();
  @Output() prevSkin = new EventEmitter<void>();
  @Output() nextSkin = new EventEmitter<void>();

  get previewImageUrl(): string | null | undefined {
    if (this.activeTab === 'weapon') {
      return this.weaponImageUrl || this.characterImageUrl;
    }
    return this.characterImageUrl;
  }
}
