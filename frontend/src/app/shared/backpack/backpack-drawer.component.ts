import { NgIf } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { type CharacterState, type EquipmentDefinition, type ItemDefinition } from "../../api/account-api.service";
import { AccountStore } from "../../account/account-store.service";
import { type BackpackEquipRequest, BackpackWindowComponent } from "./backpack-window.component";

@Component({
  selector: "app-backpack-drawer",
  standalone: true,
  imports: [NgIf, BackpackWindowComponent],
  templateUrl: "./backpack-drawer.component.html",
  styleUrl: "./backpack-drawer.component.css"
})
export class BackpackDrawerComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Output() readonly closed = new EventEmitter<void>();
  equipInFlight = false;
  salvageInFlight = false;
  equipFeedbackMessage = "";
  equipFeedbackIsError = false;

  constructor(private readonly accountStore: AccountStore = new AccountStore()) {}

  ngOnInit(): void {
    this.ensureLoaded();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["isOpen"]?.currentValue === true) {
      this.ensureLoaded();
    }
  }

  get isLoading(): boolean {
    return this.accountStore.isLoading();
  }

  get errorMessage(): string | null {
    return this.accountStore.error();
  }

  get activeCharacter(): CharacterState | null {
    return this.accountStore.activeCharacter();
  }

  get activeCharacterName(): string {
    return this.activeCharacter?.name ?? "No active character";
  }

  get activeCharacterLevel(): number {
    return Math.max(0, this.activeCharacter?.level ?? 0);
  }

  get activeCharacterXp(): number {
    return Math.max(0, this.activeCharacter?.xp ?? 0);
  }

  get echoFragmentsBalance(): number {
    return Math.max(0, this.accountStore.state()?.echoFragmentsBalance ?? 0);
  }

  get equippedItemsCount(): number {
    const character = this.activeCharacter;
    if (!character) {
      return 0;
    }

    let total = 0;
    if (character.equipment.weaponInstanceId) {
      total += 1;
    }

    if (character.equipment.armorInstanceId) {
      total += 1;
    }

    if (character.equipment.relicInstanceId) {
      total += 1;
    }

    return total;
  }

  get storedItemsCount(): number {
    const character = this.activeCharacter;
    if (!character) {
      return 0;
    }

    const totalInstances = Object.keys(character.inventory.equipmentInstances).length;
    return Math.max(0, totalInstances - this.equippedItemsCount);
  }

  get itemCatalogById(): Readonly<Record<string, ItemDefinition>> {
    return this.accountStore.catalogs().itemById;
  }

  get equipmentCatalogByItemId(): Readonly<Record<string, EquipmentDefinition>> {
    return this.accountStore.catalogs().equipmentById;
  }

  async onEquipRequested(request: BackpackEquipRequest): Promise<void> {
    const character = this.activeCharacter;
    if (!character || this.equipInFlight) {
      return;
    }

    this.equipInFlight = true;
    this.equipFeedbackMessage = "";
    this.equipFeedbackIsError = false;

    try {
      await this.accountStore.equipItem(character.characterId, request.slot, request.instanceId);
      await this.accountStore.refresh();
      this.equipFeedbackMessage = "Item equipped.";
      this.equipFeedbackIsError = false;
    } catch (error) {
      const storeError = this.accountStore.error();
      this.equipFeedbackMessage = storeError ?? String(error);
      this.equipFeedbackIsError = true;
    } finally {
      this.equipInFlight = false;
    }
  }

  async onSalvageRequested(instanceId: string): Promise<void> {
    const character = this.activeCharacter;
    if (!character || this.salvageInFlight) {
      return;
    }

    this.salvageInFlight = true;
    this.equipFeedbackMessage = "";
    this.equipFeedbackIsError = false;

    try {
      const result = await this.accountStore.salvageItem(instanceId);
      await this.accountStore.refresh();
      this.equipFeedbackMessage = `Item salvaged: +${result.primalCoreAwarded} Primal Core`;
      this.equipFeedbackIsError = false;
    } catch (error) {
      const storeError = this.accountStore.error();
      this.equipFeedbackMessage = storeError ?? String(error);
      this.equipFeedbackIsError = true;
    } finally {
      this.salvageInFlight = false;
    }
  }

  requestClose(): void {
    this.closed.emit();
  }

  onPanelClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  private ensureLoaded(): void {
    void this.accountStore.load();
  }
}
