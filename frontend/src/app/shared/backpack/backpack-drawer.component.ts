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
