import { Injectable, signal } from "@angular/core";

const DEFAULT_ACCOUNT_ID = "dev_account";
const ACCOUNT_ID_STORAGE_KEY = "kaezan_account_id_v1";
const ACTIVE_CHARACTER_ID_STORAGE_KEY = "kaezan_active_character_id_v1";

@Injectable({ providedIn: "root" })
export class AccountSessionService {
  private readonly accountIdState = signal<string>(this.readStoredAccountId());
  private readonly activeCharacterIdState = signal<string | null>(this.readStoredActiveCharacterId());

  readonly accountId = this.accountIdState.asReadonly();
  readonly activeCharacterId = this.activeCharacterIdState.asReadonly();

  setAccountId(accountId: string | null | undefined): void {
    const normalized = this.normalizeAccountId(accountId);
    if (normalized === this.accountIdState()) {
      return;
    }

    this.accountIdState.set(normalized);
    this.persistAccountId(normalized);
  }

  setActiveCharacterId(characterId: string | null | undefined): void {
    const normalized = this.normalizeCharacterId(characterId);
    if (normalized === this.activeCharacterIdState()) {
      return;
    }

    this.activeCharacterIdState.set(normalized);
    this.persistActiveCharacterId(normalized);
  }

  clearActiveCharacterId(): void {
    this.setActiveCharacterId(null);
  }

  private readStoredAccountId(): string {
    if (!this.canUseStorage()) {
      return DEFAULT_ACCOUNT_ID;
    }

    try {
      const raw = window.localStorage.getItem(ACCOUNT_ID_STORAGE_KEY);
      return this.normalizeAccountId(raw);
    } catch {
      return DEFAULT_ACCOUNT_ID;
    }
  }

  private readStoredActiveCharacterId(): string | null {
    if (!this.canUseStorage()) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(ACTIVE_CHARACTER_ID_STORAGE_KEY);
      return this.normalizeCharacterId(raw);
    } catch {
      return null;
    }
  }

  private persistAccountId(accountId: string): void {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      window.localStorage.setItem(ACCOUNT_ID_STORAGE_KEY, accountId);
    } catch {
      // Ignore storage failures so account operations are never blocked.
    }
  }

  private persistActiveCharacterId(characterId: string | null): void {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      if (characterId) {
        window.localStorage.setItem(ACTIVE_CHARACTER_ID_STORAGE_KEY, characterId);
      } else {
        window.localStorage.removeItem(ACTIVE_CHARACTER_ID_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures so account operations are never blocked.
    }
  }

  private normalizeAccountId(value: string | null | undefined): string {
    const normalized = value?.trim() ?? "";
    return normalized.length > 0 ? normalized : DEFAULT_ACCOUNT_ID;
  }

  private normalizeCharacterId(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? "";
    return normalized.length > 0 ? normalized : null;
  }

  private canUseStorage(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return typeof window.localStorage !== "undefined";
    } catch {
      return false;
    }
  }
}
