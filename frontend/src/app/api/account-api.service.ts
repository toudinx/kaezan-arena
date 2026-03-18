import { Injectable } from "@angular/core";

export interface OwnedEquipmentInstance {
  instanceId: string;
  definitionId: string;
  isLocked: boolean;
  originSpeciesId?: string | null;
  slot?: string | null;
  rarity?: string | null;
}

export interface CharacterInventory {
  materialStacks: Record<string, number>;
  equipmentInstances: Record<string, OwnedEquipmentInstance>;
}

export interface CharacterEquipment {
  weaponInstanceId?: string | null;
  armorInstanceId?: string | null;
  relicInstanceId?: string | null;
}

export interface CharacterState {
  characterId: string;
  name: string;
  level: number;
  xp: number;
  inventory: CharacterInventory;
  equipment: CharacterEquipment;
  bestiaryKillsBySpecies: Record<string, number>;
  primalCoreBySpecies: Record<string, number>;
}

export interface AccountState {
  accountId: string;
  activeCharacterId: string;
  version: number;
  echoFragmentsBalance: number;
  characters: Record<string, CharacterState>;
}

export interface CharacterCatalogEntry {
  characterId: string;
  displayName: string;
  subtitle: string;
  isProvisional: boolean;
  fixedWeaponIds: string[];
  fixedWeaponNames: string[];
}

export interface ItemDefinition {
  itemId: string;
  displayName: string;
  kind: "material" | "equipment";
  stackable: boolean;
  rarity: string;
}

export interface EquipmentDefinition {
  itemId: string;
  slot: string;
  weaponClass: string;
  weaponElement?: string | null;
  gameplayModifiers: Record<string, string>;
}

export interface DropSource {
  tick: number;
  sourceType: "mob" | "chest";
  sourceId: string;
  species?: string | null;
}

export interface DropEvent {
  dropEventId: string;
  accountId: string;
  characterId: string;
  battleId: string;
  tick: number;
  sourceType: "mob" | "chest";
  sourceId: string;
  itemId: string;
  quantity: number;
  equipmentInstanceId?: string | null;
  rewardKind: "item" | "echo_fragments" | "primal_core";
  species?: string | null;
  awardedAtUtc: string;
}

export interface AccountStateResponse {
  account: AccountState;
  characterCatalog: CharacterCatalogEntry[];
  itemCatalog: ItemDefinition[];
  equipmentCatalog: EquipmentDefinition[];
}

export interface BestiarySpecies {
  speciesId: string;
  displayName: string;
}

export interface CharacterBestiaryState {
  characterId: string;
  name: string;
  bestiaryKillsBySpecies: Record<string, number>;
  primalCoreBySpecies: Record<string, number>;
}

export interface BestiaryOverviewResponse {
  speciesCatalog: BestiarySpecies[];
  character: CharacterBestiaryState;
}

export type BestiaryCraftSlot = "Weapon" | "Armor" | "Relic";

export interface BestiaryCraftResponse {
  echoFragmentsBalance: number;
  character: CharacterState;
  craftedItem: OwnedEquipmentInstance;
}

export interface ItemRefineResponse {
  echoFragmentsBalance: number;
  character: CharacterState;
  refinedItem: OwnedEquipmentInstance;
}

export interface ItemSalvageResponse {
  echoFragmentsBalance: number;
  character: CharacterState;
  salvagedItemInstanceId: string;
  speciesId: string;
  primalCoreAwarded: number;
}

export interface AwardDropsResponse {
  awarded: DropEvent[];
  character: CharacterState;
}

export type EquipmentSlot = "weapon" | "armor" | "relic";

@Injectable({ providedIn: "root" })
export class AccountApiService {
  async getState(accountId: string): Promise<AccountStateResponse> {
    const encodedAccountId = encodeURIComponent(accountId.trim());
    return this.getJson<AccountStateResponse>(
      `/api/v1/account/state?accountId=${encodedAccountId}`,
      "Account state"
    );
  }

  async setActiveCharacter(accountId: string, characterId: string): Promise<AccountState> {
    return this.postJson<{ accountId: string; characterId: string }, AccountState>(
      "/api/v1/account/active-character",
      { accountId, characterId },
      "Set active character"
    );
  }

  async getBestiaryOverview(accountId: string): Promise<BestiaryOverviewResponse> {
    const encodedAccountId = encodeURIComponent(accountId.trim());
    return this.getJson<BestiaryOverviewResponse>(
      `/api/v1/account/bestiary?accountId=${encodedAccountId}`,
      "Account bestiary"
    );
  }

  async craftBestiaryItem(accountId: string, speciesId: string, slot: BestiaryCraftSlot): Promise<BestiaryCraftResponse> {
    const encodedAccountId = encodeURIComponent(accountId.trim());
    return this.postJson<{ speciesId: string; slot: BestiaryCraftSlot }, BestiaryCraftResponse>(
      `/api/v1/bestiary/craft?accountId=${encodedAccountId}`,
      { speciesId, slot },
      "Bestiary craft"
    );
  }

  async refineItem(accountId: string, itemInstanceId: string): Promise<ItemRefineResponse> {
    const encodedAccountId = encodeURIComponent(accountId.trim());
    return this.postJson<{ itemInstanceId: string }, ItemRefineResponse>(
      `/api/v1/items/refine?accountId=${encodedAccountId}`,
      { itemInstanceId },
      "Item refine"
    );
  }

  async salvageItem(accountId: string, itemInstanceId: string): Promise<ItemSalvageResponse> {
    const encodedAccountId = encodeURIComponent(accountId.trim());
    return this.postJson<{ itemInstanceId: string }, ItemSalvageResponse>(
      `/api/v1/items/salvage?accountId=${encodedAccountId}`,
      { itemInstanceId },
      "Item salvage"
    );
  }

  async equipWeapon(accountId: string, characterId: string, weaponInstanceId: string): Promise<CharacterState> {
    return this.postJson<{ accountId: string; characterId: string; weaponInstanceId: string }, CharacterState>(
      "/api/v1/account/equip-weapon",
      { accountId, characterId, weaponInstanceId },
      "Equip weapon"
    );
  }

  async equipItem(
    accountId: string,
    characterId: string,
    slot: EquipmentSlot,
    equipmentInstanceId: string
  ): Promise<CharacterState> {
    return this.postJson<
      { accountId: string; characterId: string; slot: EquipmentSlot; equipmentInstanceId: string },
      CharacterState
    >(
      "/api/v1/account/equip-item",
      { accountId, characterId, slot, equipmentInstanceId },
      "Equip item"
    );
  }

  async awardDrops(
    accountId: string,
    characterId: string,
    battleId: string,
    sources: DropSource[],
    runId: string | null = null
  ): Promise<AwardDropsResponse> {
    return this.postJson<
      { accountId: string; characterId: string; battleId: string; runId?: string; sources: DropSource[] },
      AwardDropsResponse
    >(
      "/api/v1/account/award-drops",
      {
        accountId,
        characterId,
        battleId,
        ...(runId && runId.trim().length > 0 ? { runId: runId.trim() } : {}),
        sources
      },
      "Award drops"
    );
  }

  private async getJson<TResponse>(url: string, operationName: string): Promise<TResponse> {
    this.warnIfAbsoluteUrl(url);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      const networkError = this.describeNetworkError(url, error);
      this.warnIfProxyMayBeBypassed(url, error);
      throw new Error(`${operationName} failed: url=${url}; networkError=${networkError}`);
    }

    return this.readJsonResponse<TResponse>(response, url, operationName);
  }

  private async postJson<TRequest, TResponse>(
    url: string,
    payload: TRequest,
    operationName: string
  ): Promise<TResponse> {
    this.warnIfAbsoluteUrl(url);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const networkError = this.describeNetworkError(url, error);
      this.warnIfProxyMayBeBypassed(url, error);
      throw new Error(`${operationName} failed: url=${url}; networkError=${networkError}`);
    }

    return this.readJsonResponse<TResponse>(response, url, operationName);
  }

  private async readJsonResponse<TResponse>(response: Response, url: string, operationName: string): Promise<TResponse> {
    const contentType = response.headers.get("content-type") ?? "unknown";
    const responseBody = await response.text();
    const bodyPreview = responseBody.slice(0, 200);

    if (!response.ok) {
      throw new Error(
        `${operationName} failed: url=${url}; status=${response.status}; content-type=${contentType}; body-preview=${bodyPreview}`
      );
    }

    try {
      return JSON.parse(responseBody) as TResponse;
    } catch (error) {
      throw new Error(
        `${operationName} failed: url=${url}; status=${response.status}; content-type=${contentType}; body-preview=${bodyPreview}; parseError=${this.stringifyError(error)}`
      );
    }
  }

  private stringifyError(error: unknown): string {
    if (!error) {
      return "unknown error";
    }

    if (error instanceof Error) {
      const causeMessage =
        error.cause instanceof Error
          ? `${error.cause.name}: ${error.cause.message}`
          : error.cause
            ? String(error.cause)
            : null;
      return causeMessage
        ? `${error.name}: ${error.message}; cause=${causeMessage}`
        : `${error.name}: ${error.message}`;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private describeNetworkError(url: string, error: unknown): string {
    const baseError = this.stringifyError(error);
    const requestOrigin = typeof window !== "undefined" ? window.location.origin : "unknown";
    return `error=${baseError}; requestOrigin=${requestOrigin}; isRelativeApiPath=${this.isRelativeApiPath(url)}`;
  }

  private warnIfAbsoluteUrl(url: string): void {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    console.warn(
      `[AccountApiService] Absolute URL detected (${url}). Use relative /api paths so Angular proxy can route requests.`
    );
  }

  private warnIfProxyMayBeBypassed(url: string, error: unknown): void {
    if (!this.isRelativeApiPath(url) || !this.isLikelyFetchNetworkError(error)) {
      return;
    }

    console.warn(
      "[AccountApiService] Relative /api request failed. Check Angular dev server proxy (--proxy-config proxy.conf.json) and backend at https://localhost:7174."
    );
  }

  private isRelativeApiPath(url: string): boolean {
    return /^\/api(?:\/|\?|$)/.test(url);
  }

  private isLikelyFetchNetworkError(error: unknown): boolean {
    return error instanceof Error && /failed to fetch|network/i.test(`${error.name} ${error.message}`);
  }
}
