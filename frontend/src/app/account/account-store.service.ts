import { Injectable, computed, signal } from "@angular/core";
import {
  AccountApiService,
  type AccountState,
  type AwardDropsResponse,
  type BestiaryCraftResponse,
  type BestiaryCraftSlot,
  type BestiaryOverviewResponse,
  type BestiarySpecies,
  type CharacterCatalogEntry,
  type CharacterState,
  type DropSource,
  type EquipmentDefinition,
  type EquipmentSlot,
  type ItemDefinition,
  type ItemRefineResponse,
  type ItemSalvageResponse
} from "../api/account-api.service";
import { AccountSessionService } from "./account-session.service";

export type AccountCatalogs = Readonly<{
  characterCatalog: ReadonlyArray<CharacterCatalogEntry>;
  itemCatalog: ReadonlyArray<ItemDefinition>;
  equipmentCatalog: ReadonlyArray<EquipmentDefinition>;
  speciesCatalog: ReadonlyArray<BestiarySpecies>;
  characterById: Readonly<Record<string, CharacterCatalogEntry>>;
  itemById: Readonly<Record<string, ItemDefinition>>;
  equipmentById: Readonly<Record<string, EquipmentDefinition>>;
  speciesById: Readonly<Record<string, BestiarySpecies>>;
}>;

const EMPTY_CATALOGS: AccountCatalogs = {
  characterCatalog: [],
  itemCatalog: [],
  equipmentCatalog: [],
  speciesCatalog: [],
  characterById: {},
  itemById: {},
  equipmentById: {},
  speciesById: {}
};

@Injectable({ providedIn: "root" })
export class AccountStore {
  private readonly stateSignal = signal<AccountState | null>(null);
  private readonly catalogsSignal = signal<AccountCatalogs>(EMPTY_CATALOGS);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  private refreshInFlight: Promise<void> | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly catalogs = this.catalogsSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly accountId = computed(() => this.session.accountId());
  readonly activeCharacterId = computed(() => {
    const state = this.stateSignal();
    const preferred = this.session.activeCharacterId();

    if (state && preferred && state.characters[preferred]) {
      return preferred;
    }

    if (state && state.activeCharacterId && state.characters[state.activeCharacterId]) {
      return state.activeCharacterId;
    }

    if (state) {
      const fallback = Object.values(state.characters)[0]?.characterId ?? null;
      return fallback;
    }

    return preferred;
  });

  readonly activeCharacter = computed<CharacterState | null>(() => {
    const state = this.stateSignal();
    const activeCharacterId = this.activeCharacterId();
    if (!state || !activeCharacterId) {
      return null;
    }

    return state.characters[activeCharacterId] ?? null;
  });

  constructor(
    private readonly accountApi: AccountApiService = new AccountApiService(),
    private readonly session: AccountSessionService = new AccountSessionService()
  ) {}

  async load(): Promise<void> {
    if (this.stateSignal()) {
      return;
    }

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.performRefresh();
    return this.refreshInFlight;
  }

  async setActiveCharacter(characterId: string): Promise<AccountState> {
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const accountId = this.session.accountId();
    this.errorSignal.set(null);

    try {
      const updated = await this.accountApi.setActiveCharacter(accountId, normalizedCharacterId);
      this.stateSignal.set(this.normalizeAccountState(updated));
      this.syncSessionFromAccount(updated);
      return updated;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async spendHollowEssenceBarrier(characterId: string): Promise<AccountState> {
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const accountId = this.session.accountId();
    this.errorSignal.set(null);

    try {
      const updated = await this.accountApi.spendHollowEssenceBarrier(accountId, normalizedCharacterId);
      this.stateSignal.set(this.normalizeAccountState(updated));
      this.syncSessionFromAccount(updated);
      return updated;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async equipSigil(characterId: string, sigilInstanceId: string): Promise<AccountState> {
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedSigilInstanceId = this.normalizeRequired(sigilInstanceId, "Sigil instance ID");
    const accountId = this.session.accountId();
    this.errorSignal.set(null);

    try {
      const updated = await this.accountApi.equipSigil(accountId, normalizedCharacterId, normalizedSigilInstanceId);
      this.stateSignal.set(this.normalizeAccountState(updated));
      this.syncSessionFromAccount(updated);
      return updated;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async unequipSigil(characterId: string, slotIndex: number): Promise<AccountState> {
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedSlotIndex = Math.max(1, Math.floor(slotIndex));
    const accountId = this.session.accountId();
    this.errorSignal.set(null);

    try {
      const updated = await this.accountApi.unequipSigil(accountId, normalizedCharacterId, normalizedSlotIndex);
      this.stateSignal.set(this.normalizeAccountState(updated));
      this.syncSessionFromAccount(updated);
      return updated;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async equipItem(
    characterId: string,
    slot: EquipmentSlot,
    equipmentInstanceId: string
  ): Promise<CharacterState> {
    const accountId = this.session.accountId();
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedEquipmentInstanceId = this.normalizeRequired(equipmentInstanceId, "Equipment instance ID");
    this.errorSignal.set(null);

    try {
      const updatedCharacter = await this.accountApi.equipItem(
        accountId,
        normalizedCharacterId,
        slot,
        normalizedEquipmentInstanceId
      );
      this.applyCharacterUpdate(updatedCharacter);
      return updatedCharacter;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async craftBestiaryItem(speciesId: string, slot: BestiaryCraftSlot): Promise<BestiaryCraftResponse> {
    const accountId = this.session.accountId();
    const normalizedSpeciesId = this.normalizeRequired(speciesId, "Species ID");
    this.errorSignal.set(null);

    try {
      const crafted = await this.accountApi.craftBestiaryItem(accountId, normalizedSpeciesId, slot);
      this.applyCharacterUpdate(crafted.character, crafted.echoFragmentsBalance);
      return crafted;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async refineItem(itemInstanceId: string): Promise<ItemRefineResponse> {
    const accountId = this.session.accountId();
    const normalizedItemInstanceId = this.normalizeRequired(itemInstanceId, "Item instance ID");
    this.errorSignal.set(null);

    try {
      const refined = await this.accountApi.refineItem(accountId, normalizedItemInstanceId);
      this.applyCharacterUpdate(refined.character, refined.echoFragmentsBalance);
      return refined;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async salvageItem(itemInstanceId: string): Promise<ItemSalvageResponse> {
    const accountId = this.session.accountId();
    const normalizedItemInstanceId = this.normalizeRequired(itemInstanceId, "Item instance ID");
    this.errorSignal.set(null);

    try {
      const salvaged = await this.accountApi.salvageItem(accountId, normalizedItemInstanceId);
      this.applyCharacterUpdate(salvaged.character, salvaged.echoFragmentsBalance);
      return salvaged;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async awardDrops(
    characterId: string,
    battleId: string,
    sources: DropSource[],
    runId: string | null = null
  ): Promise<AwardDropsResponse> {
    const accountId = this.session.accountId();
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedBattleId = this.normalizeRequired(battleId, "Battle ID");
    this.errorSignal.set(null);

    try {
      const response = await this.accountApi.awardDrops(
        accountId,
        normalizedCharacterId,
        normalizedBattleId,
        sources,
        runId
      );
      this.applyCharacterUpdate(response.character);
      return response;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  private async performRefresh(): Promise<void> {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    const accountId = this.session.accountId();
    this.session.setAccountId(accountId);

    try {
      const [stateResponse, bestiaryOverview] = await Promise.all([
        this.accountApi.getState(accountId),
        this.safeLoadBestiaryOverview(accountId)
      ]);

      const normalizedState = this.normalizeAccountState(stateResponse.account);
      this.stateSignal.set(normalizedState);
      this.catalogsSignal.set(
        this.buildCatalogs(
          stateResponse.characterCatalog ?? [],
          stateResponse.itemCatalog,
          stateResponse.equipmentCatalog,
          bestiaryOverview?.speciesCatalog ?? this.catalogsSignal().speciesCatalog
        )
      );
      this.syncSessionFromAccount(normalizedState);
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    } finally {
      this.isLoadingSignal.set(false);
      this.refreshInFlight = null;
    }
  }

  private async safeLoadBestiaryOverview(accountId: string): Promise<BestiaryOverviewResponse | null> {
    const api = this.accountApi as Partial<AccountApiService>;
    if (typeof api.getBestiaryOverview !== "function") {
      return null;
    }

    try {
      return await api.getBestiaryOverview.call(this.accountApi, accountId);
    } catch {
      return null;
    }
  }

  private applyCharacterUpdate(character: CharacterState, echoFragmentsBalance?: number): void {
    const current = this.stateSignal();
    if (!current) {
      return;
    }

    this.stateSignal.set({
      ...current,
      ...(typeof echoFragmentsBalance === "number"
        ? { echoFragmentsBalance: Math.max(0, Math.floor(echoFragmentsBalance)) }
        : {}),
      characters: {
        ...current.characters,
        [character.characterId]: character
      }
    });
  }

  private normalizeAccountState(account: AccountState): AccountState {
    const activeCharacterId = this.resolvePreferredCharacterId(account);
    if (activeCharacterId === account.activeCharacterId) {
      return account;
    }

    return {
      ...account,
      activeCharacterId
    };
  }

  private resolvePreferredCharacterId(account: AccountState): string {
    if (account.activeCharacterId && account.characters[account.activeCharacterId]) {
      return account.activeCharacterId;
    }

    const sessionCharacterId = this.session.activeCharacterId();
    if (sessionCharacterId && account.characters[sessionCharacterId]) {
      return sessionCharacterId;
    }

    const sorted = Object.values(account.characters).sort((left, right) => {
      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
    });

    return sorted[0]?.characterId ?? "";
  }

  private syncSessionFromAccount(account: AccountState): void {
    const preferredCharacterId = this.resolvePreferredCharacterId(account);
    if (preferredCharacterId.length > 0) {
      this.session.setActiveCharacterId(preferredCharacterId);
    } else {
      this.session.clearActiveCharacterId();
    }
  }

  private buildCatalogs(
    characterCatalog: ReadonlyArray<CharacterCatalogEntry>,
    itemCatalog: ReadonlyArray<ItemDefinition>,
    equipmentCatalog: ReadonlyArray<EquipmentDefinition>,
    speciesCatalog: ReadonlyArray<BestiarySpecies>
  ): AccountCatalogs {
    const characterById: Record<string, CharacterCatalogEntry> = {};
    for (const character of characterCatalog) {
      characterById[character.characterId] = character;
    }

    const itemById: Record<string, ItemDefinition> = {};
    for (const item of itemCatalog) {
      itemById[item.itemId] = item;
    }

    const equipmentById: Record<string, EquipmentDefinition> = {};
    for (const equipment of equipmentCatalog) {
      equipmentById[equipment.itemId] = equipment;
    }

    const speciesById: Record<string, BestiarySpecies> = {};
    for (const species of speciesCatalog) {
      speciesById[species.speciesId] = species;
    }

    return {
      characterCatalog,
      itemCatalog,
      equipmentCatalog,
      speciesCatalog,
      characterById,
      itemById,
      equipmentById,
      speciesById
    };
  }

  private normalizeRequired(value: string | null | undefined, label: string): string {
    const normalized = value?.trim() ?? "";
    if (normalized.length === 0) {
      throw new Error(`${label} is required.`);
    }

    return normalized;
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (!error) {
      return "Unknown error";
    }

    return String(error);
  }
}
