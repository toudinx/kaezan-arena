import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import type { CharacterState } from "../../api/account-api.service";

@Component({
  selector: "app-equipment-paperdoll-window",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./equipment-paperdoll-window.component.html",
  styleUrl: "./equipment-paperdoll-window.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipmentPaperdollWindowComponent {
  @Input() character: CharacterState | null = null;
  @Input() equippedWeaponLabel = "None";
  @Input() equippedArmorLabel = "None";
  @Input() equippedRelicLabel = "None";
  @Input() weaponRarity: string | null = null;
  @Input() armorRarity: string | null = null;
  @Input() relicRarity: string | null = null;
  @Input() weaponFilterMode = false;

  @Output() readonly weaponSlotActivated = new EventEmitter<void>();

  onWeaponSlotClick(): void {
    this.weaponSlotActivated.emit();
  }

  getSlotRarityClass(rarity: string | null | undefined): string {
    switch ((rarity ?? "").toLowerCase()) {
      case "common":
        return "paperdoll__slot--rarity-common";
      case "rare":
        return "paperdoll__slot--rarity-rare";
      case "epic":
        return "paperdoll__slot--rarity-epic";
      case "legendary":
        return "paperdoll__slot--rarity-legendary";
      case "ascendant":
        return "paperdoll__slot--rarity-ascendant";
      default:
        return "";
    }
  }

  slotTooltip(slotLabel: string, itemLabel: string): string {
    return `${slotLabel}: ${itemLabel && itemLabel.trim().length > 0 ? itemLabel : "Empty"}`;
  }
}
