import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CharacterManagementTab } from '../../character-management-state.service';
import { KaelisDefinition } from '../../../../core/models/kaelis.model';
import { SkinDefinition } from '../../../../core/models/skin.model';
import { AppButtonComponent } from '../../../../shared/components';
import { SigilPentagonComponent } from '../sigil-pentagon/sigil-pentagon.component';

@Component({
  selector: 'app-center-preview',
  standalone: true,
  imports: [CommonModule, AppButtonComponent, SigilPentagonComponent],
  templateUrl: './center-preview.component.html',
  styleUrls: ['./center-preview.component.scss']
})
export class CenterPreviewComponent {
  @Input() activeTab: CharacterManagementTab = 'details';
  @Input() kaelis?: KaelisDefinition;
  @Input() slots: (string | null)[] = [];
  @Input() selectedIndex = 0;
  @Input() previewSkin?: SkinDefinition | null;
  @Input() equippedSkin?: SkinDefinition | null;
  @Input() weaponImageUrl?: string | null;
  @Input() canPrevSkin = false;
  @Input() canNextSkin = false;
  @Input() isSkinOwned = false;
  @Input() isSkinEquipped = false;

  @Output() slotClick = new EventEmitter<number>();
  @Output() prevSkin = new EventEmitter<void>();
  @Output() nextSkin = new EventEmitter<void>();
  @Output() equipSkin = new EventEmitter<void>();

  get characterImageUrl(): string | undefined {
    return this.kaelis?.imageUrl || this.kaelis?.portrait;
  }

  get skinImageUrl(): string | undefined {
    return this.previewSkin?.imageUrl || this.characterImageUrl;
  }

  get previewImageUrl(): string | undefined {
    if (this.activeTab === 'weapon') {
      return this.weaponImageUrl || this.characterImageUrl;
    }
    if (this.activeTab === 'details') {
      return this.previewSkin?.imageUrl || this.equippedSkin?.imageUrl || this.characterImageUrl;
    }
    return this.equippedSkin?.imageUrl || this.characterImageUrl;
  }

  onSlotClick(index: number): void {
    this.slotClick.emit(index);
  }

  prevSkinClick(): void {
    if (this.canPrevSkin) {
      this.prevSkin.emit();
    }
  }

  nextSkinClick(): void {
    if (this.canNextSkin) {
      this.nextSkin.emit();
    }
  }

  get equipSkinLabel(): string {
    return this.isSkinEquipped ? 'Equipped' : 'Equip Skin';
  }

  equipSkinClick(): void {
    if (this.isSkinEquipped) return;
    this.equipSkin.emit();
  }
}
