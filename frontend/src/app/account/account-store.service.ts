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
  type CharacterSigilLoadoutStateResponse,
  type DropSource,
  type EquipmentDefinition,
  type EquipmentSlot,
  type ItemDefinition,
  type ItemRefineResponse,
  type SigilInventoryResponse,
  type SigilLoadoutMutationResponse
} from "../api/account-api.service";
import { AccountSessionService } from "./account-session.service";
import {
  DEFAULT_PLAYABLE_CHARACTER_ID,
  PLAYABLE_CHARACTER_IDS,
  isPlayableCharacterId,
  normalizeCharacterIdForPlayableRoster
} from "../shared/characters/playable-characters";

export type AccountCatalogs = Readonly<{
  characterCatalog: ReadonlyArray<CharacterCatalogEntry>;
  itemCatalog: ReadonlyArray<ItemDefinition>;
  equipmentCatalog: ReadonlyArray<EquipmentDefinition>;
  speciesCatalog: ReadonlyArray<BestiarySpecies>;
  characterById: Readonly<Record<string, CharacterCatalogEntry>>;
  itemById: Readonly<Record<string, ItemDefinition>>;
  equipmentById: Readonly<Record<string, EquipmentDefinition>>;
  speciesById: Readonly<Record<string, BestiarySpecies>>;
  bestiaryRankThresholds: ReadonlyArray<number>;
}>;

const EMPTY_CATALOGS: AccountCatalogs = {
  characterCatalog: [],
  itemCatalog: [],
  equipmentCatalog: [],
  speciesCatalog: [],
  characterById: {},
  itemById: {},
  equipmentById: {},
  speciesById: {},
  bestiaryRankThresholds: [0, 10, 30, 60, 100]
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
    if (state) {
      return this.resolvePreferredCharacterId(state);
    }

    return normalizeCharacterIdForPlayableRoster(this.session.activeCharacterId()) ?? DEFAULT_PLAYABLE_CHARACTER_ID;
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

  async getSigilInventory(): Promise<SigilInventoryResponse> {
    const accountId = this.session.accountId();
    this.errorSignal.set(null);
    return this.accountApi.getSigilInventory(accountId);
  }

  async getCharacterSigilLoadout(characterId: string): Promise<CharacterSigilLoadoutStateResponse> {
    const accountId = this.session.accountId();
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    this.errorSignal.set(null);
    return this.accountApi.getCharacterSigilLoadout(accountId, normalizedCharacterId);
  }

  async equipSigilToSlot(
    characterId: string,
    slotIndex: number,
    sigilInstanceId: string
  ): Promise<SigilLoadoutMutationResponse> {
    const accountId = this.session.accountId();
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedSigilInstanceId = this.normalizeRequired(sigilInstanceId, "Sigil instance ID");
    const normalizedSlotIndex = Math.max(1, Math.floor(slotIndex));
    this.errorSignal.set(null);

    try {
      const mutation = await this.accountApi.equipSigilToSlot(
        accountId,
        normalizedCharacterId,
        normalizedSlotIndex,
        normalizedSigilInstanceId
      );
      this.applySigilMutation(normalizedCharacterId, mutation);
      return mutation;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async unequipSigilFromSlot(characterId: string, slotIndex: number): Promise<SigilLoadoutMutationResponse> {
    const accountId = this.session.accountId();
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedSlotIndex = Math.max(1, Math.floor(slotIndex));
    this.errorSignal.set(null);

    try {
      const mutation = await this.accountApi.unequipSigilFromSlot(
        accountId,
        normalizedCharacterId,
        normalizedSlotIndex
      );
      this.applySigilMutation(normalizedCharacterId, mutation);
      return mutation;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async craftBestiaryItem(
    speciesId: string,
    slot: BestiaryCraftSlot,
    characterId: string | null = null
  ): Promise<BestiaryCraftResponse> {
    const accountId = this.session.accountId();
    const normalizedSpeciesId = this.normalizeRequired(speciesId, "Species ID");
    const normalizedCharacterId = characterId?.trim() ?? "";
    this.errorSignal.set(null);

    try {
      const crafted = await this.accountApi.craftBestiaryItem(
        accountId,
        normalizedSpeciesId,
        slot,
        normalizedCharacterId.length > 0 ? normalizedCharacterId : null
      );
      this.applyCharacterUpdate(crafted.character, crafted.echoFragmentsBalance);
      return crafted;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async refineItem(itemInstanceId: string, characterId: string | null = null): Promise<ItemRefineResponse> {
    const accountId = this.session.accountId();
    const normalizedItemInstanceId = this.normalizeRequired(itemInstanceId, "Item instance ID");
    const normalizedCharacterId = characterId?.trim() ?? "";
    this.errorSignal.set(null);

    try {
      const refined = await this.accountApi.refineItem(
        accountId,
        normalizedItemInstanceId,
        normalizedCharacterId.length > 0 ? normalizedCharacterId : null
      );
      this.applyCharacterUpdate(refined.character, refined.echoFragmentsBalance);
      return refined;
    } catch (error) {
      this.errorSignal.set(this.stringifyError(error));
      throw error;
    }
  }

  async enchantWeapon(
    characterId: string,
    weaponInstanceId: string,
    slot: "damage" | "resistance",
    materialId: string
  ): Promise<CharacterState> {
    const accountId = this.session.accountId();
    const normalizedCharacterId = this.normalizeRequired(characterId, "Character ID");
    const normalizedWeaponInstanceId = this.normalizeRequired(weaponInstanceId, "Weapon instance ID");
    this.errorSignal.set(null);

    try {
      const character = await this.accountApi.enchantWeapon(
        accountId,
        normalizedCharacterId,
        normalizedWeaponInstanceId,
        slot,
        materialId
      );
      this.applyCharacterUpdate(character);
      return character;
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
          bestiaryOverview?.speciesCatalog ?? this.catalogsSignal().speciesCatalog,
          stateResponse.bestiaryRankThresholds ?? this.catalogsSignal().bestiaryRankThresholds
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

  private applySigilMutation(characterId: string, mutation: SigilLoadoutMutationResponse): void {
    const current = this.stateSignal();
    if (!current) {
      return;
    }

    const existingCharacter = current.characters[characterId];
    if (!existingCharacter) {
      return;
    }

    this.stateSignal.set({
      ...current,
      sigilInventory: mutation.inventory.sigils,
      characters: {
        ...current.characters,
        [characterId]: {
          ...existingCharacter,
          sigilLoadout: mutation.characterLoadout.loadout
        }
      }
    });
  }

  private normalizeAccountState(account: AccountState): AccountState {
    const normalizedCharacters = this.normalizePlayableCharacters(account.characters);
    const normalizedAccount = {
      ...account,
      characters: normalizedCharacters
    };
    const activeCharacterId = this.resolvePreferredCharacterId(normalizedAccount);
    if (
      activeCharacterId === account.activeCharacterId &&
      Object.keys(normalizedCharacters).length === Object.keys(account.characters).length
    ) {
      return account;
    }

    return {
      ...normalizedAccount,
      activeCharacterId
    };
  }

  private resolvePreferredCharacterId(account: AccountState): string {
    const normalizedActiveId = normalizeCharacterIdForPlayableRoster(account.activeCharacterId);
    if (normalizedActiveId && account.characters[normalizedActiveId]) {
      return normalizedActiveId;
    }

    const sessionCharacterId = normalizeCharacterIdForPlayableRoster(this.session.activeCharacterId());
    if (sessionCharacterId && account.characters[sessionCharacterId]) {
      return sessionCharacterId;
    }

    if (account.characters[DEFAULT_PLAYABLE_CHARACTER_ID]) {
      return DEFAULT_PLAYABLE_CHARACTER_ID;
    }

    for (const characterId of PLAYABLE_CHARACTER_IDS) {
      if (account.characters[characterId]) {
        return characterId;
      }
    }

    const sorted = Object.values(account.characters).sort((left, right) => {
      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : left.characterId.localeCompare(right.characterId);
    });

    return sorted[0]?.characterId ?? DEFAULT_PLAYABLE_CHARACTER_ID;
  }

  private normalizePlayableCharacters(
    characters: Readonly<Record<string, CharacterState>>
  ): Record<string, CharacterState> {
    const playableCharacters: Record<string, CharacterState> = {};
    for (const characterId of PLAYABLE_CHARACTER_IDS) {
      const character = characters[characterId];
      if (character) {
        playableCharacters[characterId] = character;
      }
    }

    if (Object.keys(playableCharacters).length > 0) {
      return playableCharacters;
    }

    return { ...characters };
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
    speciesCatalog: ReadonlyArray<BestiarySpecies>,
    bestiaryRankThresholds: ReadonlyArray<number> = [0, 10, 30, 60, 100]
  ): AccountCatalogs {
    const filteredCharacterCatalog = characterCatalog
      .filter((character) => isPlayableCharacterId(character.characterId))
      .sort((left, right) => {
        const leftIndex = PLAYABLE_CHARACTER_IDS.indexOf(left.characterId as (typeof PLAYABLE_CHARACTER_IDS)[number]);
        const rightIndex = PLAYABLE_CHARACTER_IDS.indexOf(right.characterId as (typeof PLAYABLE_CHARACTER_IDS)[number]);
        return leftIndex - rightIndex;
      });

    const characterById: Record<string, CharacterCatalogEntry> = {};
    for (const character of filteredCharacterCatalog) {
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
      characterCatalog: filteredCharacterCatalog,
      itemCatalog,
      equipmentCatalog,
      speciesCatalog,
      characterById,
      itemById,
      equipmentById,
      speciesById,
      bestiaryRankThresholds
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
