import { Injectable } from "@angular/core";

export interface OwnedEquipmentInstance {
  instanceId: string;
  definitionId: string;
  isLocked: boolean;
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
}

export interface AccountState {
  accountId: string;
  activeCharacterId: string;
  version: number;
  characters: Record<string, CharacterState>;
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
  awardedAtUtc: string;
}

export interface AccountStateResponse {
  account: AccountState;
  itemCatalog: ItemDefinition[];
  equipmentCatalog: EquipmentDefinition[];
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
    sources: DropSource[]
  ): Promise<AwardDropsResponse> {
    return this.postJson<
      { accountId: string; characterId: string; battleId: string; sources: DropSource[] },
      AwardDropsResponse
    >("/api/v1/account/award-drops", { accountId, characterId, battleId, sources }, "Award drops");
  }

  private async getJson<TResponse>(url: string, operationName: string): Promise<TResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      throw new Error(`${operationName} failed: url=${url}; networkError=${this.stringifyError(error)}`);
    }

    return this.readJsonResponse<TResponse>(response, url, operationName);
  }

  private async postJson<TRequest, TResponse>(
    url: string,
    payload: TRequest,
    operationName: string
  ): Promise<TResponse> {
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
      throw new Error(`${operationName} failed: url=${url}; networkError=${this.stringifyError(error)}`);
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

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
