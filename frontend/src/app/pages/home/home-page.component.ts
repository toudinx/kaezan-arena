import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from "@angular/core";
import { AccountStore } from "../../account/account-store.service";
import { HomeBackgroundComponent } from "./components/home-background/home-background.component";
import { HomeCharacterStageComponent } from "./components/home-character-stage/home-character-stage.component";
import { HomeTopLeftHudComponent } from "./components/home-top-left-hud/home-top-left-hud.component";
import {
  HomeTopRightActionsComponent,
  type HomeActionItem
} from "./components/home-top-right-actions/home-top-right-actions.component";
import {
  HomeMainNavigationComponent,
  type HomeNavItem
} from "./components/home-main-navigation/home-main-navigation.component";
import {
  DailyContractsModalComponent,
  type DailyContractRowViewModel
} from "../../shared/contracts/daily-contracts-modal.component";
import {
  resolveCharacterDisplayName,
  resolveCharacterPortraitVisual
} from "../../shared/characters/character-visuals.helpers";

type DailyElementKey = "fire" | "ice" | "earth" | "energy";
type DailyWidgetTab = "contracts" | "element";

type DailyElementVisual = Readonly<{
  key: DailyElementKey;
  label: string;
  iconLabel: string;
  counterElementLabel: string;
}>;

const DAILY_ELEMENT_VISUALS: Readonly<Record<DailyElementKey, DailyElementVisual>> = {
  fire: { key: "fire", label: "Fire", iconLabel: "FR", counterElementLabel: "Ice" },
  ice: { key: "ice", label: "Ice", iconLabel: "IC", counterElementLabel: "Fire" },
  earth: { key: "earth", label: "Earth", iconLabel: "EA", counterElementLabel: "Energy" },
  energy: { key: "energy", label: "Energy", iconLabel: "EN", counterElementLabel: "Earth" }
};

@Component({
  selector: "app-home-page",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HomeBackgroundComponent,
    HomeCharacterStageComponent,
    HomeTopLeftHudComponent,
    HomeTopRightActionsComponent,
    HomeMainNavigationComponent,
    DailyContractsModalComponent
  ],
  templateUrl: "./home-page.component.html",
  styleUrl: "./home-page.component.css"
})
export class HomePageComponent implements OnInit, OnDestroy {
  constructor(
    private readonly accountStore: AccountStore,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {}
  private readonly resetAtLabel = "Resets at 00:00 UTC";
  private readonly dailyWidgetRotateEveryMs = 5000;
  private readonly dailyWidgetManualSuspendMs = 12000;
  private dailyWidgetRotationTimerId: number | null = null;
  private dailyWidgetManualSuspendTimerId: number | null = null;
  private isDailyWidgetAutoRotationSuspended = false;

  dailyContractsOpen = false;
  dailyContractsRefreshing = false;
  dailyContractsError: string | null = null;
  selectedBackgroundIndex = 0;
  activeDailyWidgetTab: DailyWidgetTab = "contracts";
  isDailyWidgetHovered = false;

  readonly homeBackgrounds: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly shellBackground: string;
    readonly overlay: string;
    readonly imageUrl: string | null;
  }> = [
    {
      id: "void",
      label: "Void",
      shellBackground: "linear-gradient(180deg, #090914 0%, #050511 100%)",
      overlay: "linear-gradient(180deg, rgba(14, 14, 32, 0.28) 0%, rgba(5, 5, 17, 0.62) 100%)",
      imageUrl: null
    },
    {
      id: "crimson",
      label: "Crimson",
      shellBackground: "linear-gradient(180deg, #14090d 0%, #050511 100%)",
      overlay: "linear-gradient(180deg, rgba(66, 18, 26, 0.28) 0%, rgba(10, 5, 17, 0.66) 100%)",
      imageUrl: null
    },
    {
      id: "azure",
      label: "Azure",
      shellBackground: "linear-gradient(180deg, #08101f 0%, #050511 100%)",
      overlay: "linear-gradient(180deg, rgba(16, 44, 82, 0.28) 0%, rgba(5, 5, 17, 0.66) 100%)",
      imageUrl: null
    }
  ];

  async ngOnInit(): Promise<void> {
    try {
      await this.accountStore.load();
    } catch {
      // Render uses store error state.
    } finally {
      this.startDailyWidgetRotation();
    }
  }

  ngOnDestroy(): void {
    this.clearDailyWidgetRotationTimer();
    this.clearDailyWidgetManualSuspendTimer();
  }

  get commanderName(): string {
    const character = this.accountStore.activeCharacter();
    if (!character) return "Commander";
    const catalog = this.accountStore.catalogs().characterById[character.characterId];
    const preferredName = catalog?.displayName ?? character.name ?? "Commander";
    return resolveCharacterDisplayName({
      characterId: character.characterId,
      preferredName
    }) || "Commander";
  }

  get hudAccountLabel(): string {
    return "Account";
  }

  get accountLevel(): number {
    return Math.max(1, Math.floor(this.accountStore.state()?.accountLevel ?? 1));
  }

  get xpProgress(): number {
    const required = Math.max(0, Math.floor(this.accountStore.state()?.accountXpRequiredForNextLevel ?? 0));
    const current = Math.max(0, Math.floor(this.accountStore.state()?.accountXpForCurrentLevel ?? 0));
    if (required <= 0) return 1;
    return Math.min(1, Math.max(0, current / required));
  }

  get characterImageUrl(): string | null {
    const character = this.accountStore.activeCharacter();
    if (!character) return null;
    const portrait = resolveCharacterPortraitVisual({
      characterId: character.characterId,
      displayName: this.commanderName,
      context: "homepage"
    });
    return portrait.imageUrl ?? null;
  }

  get homeBackgroundImageUrl(): string | null {
    return this.shouldUseCharacterHomepageAsBackground
      ? this.characterImageUrl
      : this.currentBackground.imageUrl;
  }

  get homeBackgroundOverlay(): string | null {
    return this.shouldUseCharacterHomepageAsBackground ? null : this.currentBackground.overlay;
  }

  get stageCharacterImageUrl(): string | null {
    // When homepage art exists, render it as full-screen background instead of center-stage sprite.
    if (this.shouldUseCharacterHomepageAsBackground) {
      return null;
    }

    const character = this.accountStore.activeCharacter();
    if (!character) return null;
    const portrait = resolveCharacterPortraitVisual({
      characterId: character.characterId,
      displayName: this.commanderName,
      context: "kaelis"
    });
    return portrait.imageUrl ?? null;
  }

  private get shouldUseCharacterHomepageAsBackground(): boolean {
    const url = this.characterImageUrl;
    if (!url) {
      return false;
    }

    // Treat high-resolution painted homepage assets as full-screen backgrounds.
    return /\.jpe?g($|\?)/i.test(url);
  }

  get currentBackground(): {
    readonly id: string;
    readonly label: string;
    readonly shellBackground: string;
    readonly overlay: string;
    readonly imageUrl: string | null;
  } {
    return this.homeBackgrounds[this.selectedBackgroundIndex] ?? this.homeBackgrounds[0];
  }

  get contractsBannerLabel(): string {
    return `Contracts Active (${this.pendingContractsCount})`;
  }

  get pendingContractsCount(): number {
    const contracts = this.accountStore.state()?.dailyContracts?.contracts ?? [];
    return contracts.filter(c => !c.isCompleted).length;
  }

  get dailyContractsAssignedDateLabel(): string {
    const assignedDate = this.accountStore.state()?.dailyContracts?.assignedDate;
    if (!assignedDate) {
      return "today";
    }

    const parsed = new Date(assignedDate);
    if (Number.isNaN(parsed.getTime())) {
      return assignedDate;
    }

    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  }

  get dailyContractsResetLabel(): string {
    return this.resetAtLabel;
  }

  get dailyContractsLoadError(): string | null {
    return this.dailyContractsError ?? this.accountStore.error();
  }

  get accountXpHint(): string {
    const state = this.accountStore.state();
    if (!state) {
      return "";
    }

    const current = Math.max(0, Math.floor(state.accountXpForCurrentLevel ?? 0));
    const required = Math.max(0, Math.floor(state.accountXpRequiredForNextLevel ?? 0));
    if (required <= 0) {
      return "";
    }

    return `Account XP ${current}/${required}`;
  }

  get todayZoneElementLabel(): string {
    return this.resolveElementDisplayName(this.accountStore.state()?.todayZoneElement);
  }

  get todayZoneElementIconLabel(): string {
    return this.resolveElementIconLabel(this.accountStore.state()?.todayZoneElement);
  }

  get todayZoneElementThemeClass(): string {
    return this.resolveElementThemeClass(this.accountStore.state()?.todayZoneElement);
  }

  get todayZoneElementHeadlineLabel(): string {
    return this.todayZoneElementLabel.toUpperCase();
  }

  get todayZoneElementStrengthHint(): string {
    return `${this.todayZoneElementLabel} mobs are +15% stronger today`;
  }

  get todayZoneElementCounterHint(): string {
    return this.resolveCounterElementHint(this.accountStore.state()?.todayZoneElement);
  }

  get todayZoneElementTooltip(): string {
    return `${this.todayZoneElementStrengthHint}. ${this.todayZoneElementCounterHint}.`;
  }

  get dailyContractRows(): ReadonlyArray<DailyContractRowViewModel> {
    const contracts = this.accountStore.state()?.dailyContracts?.contracts ?? [];
    return contracts.map(contract => {
      const targetValue = Math.max(1, Math.floor(contract.targetValue ?? 0));
      const currentProgress = Math.max(0, Math.floor(contract.currentProgress ?? 0));
      const progressPercent = Math.min(100, Math.round((currentProgress / targetValue) * 100));
      const claimable = !contract.isCompleted && currentProgress >= targetValue;
      const status = contract.isCompleted
        ? "resolved"
        : claimable
          ? "claimable"
          : "in_progress";

      return {
        contractId: contract.contractId,
        description: contract.description,
        progressText: `${currentProgress}/${targetValue}`,
        progressPercent,
        kaerosReward: Math.max(0, Math.floor(contract.kaerosReward ?? 0)),
        accountXpRewardLabel: null,
        status,
        statusLabel: status === "resolved" ? "Resolved" : status === "claimable" ? "Claimable" : "In Progress",
        statusHint:
          status === "resolved"
            ? "Contract completed."
            : status === "claimable"
              ? "Ready to claim on next sync."
              : "Complete runs to progress this contract."
      };
    });
  }

  openDailyContracts(): void {
    this.dailyContractsOpen = true;
    if (this.dailyContractRows.length === 0 && !this.dailyContractsRefreshing) {
      void this.refreshDailyContracts();
    }
  }

  closeDailyContracts(): void {
    this.dailyContractsOpen = false;
  }

  async refreshDailyContracts(): Promise<void> {
    this.dailyContractsRefreshing = true;
    this.dailyContractsError = null;
    try {
      await this.accountStore.refresh();
    } catch (error) {
      this.dailyContractsError = error instanceof Error ? error.message : String(error);
    } finally {
      this.dailyContractsRefreshing = false;
    }
  }

  cycleBackground(): void {
    this.selectedBackgroundIndex = (this.selectedBackgroundIndex + 1) % this.homeBackgrounds.length;
  }

  setDailyWidgetTab(tab: DailyWidgetTab): void {
    this.activeDailyWidgetTab = tab;
    this.suspendDailyWidgetAutoRotation();
  }

  onDailyWidgetMouseEnter(): void {
    this.isDailyWidgetHovered = true;
  }

  onDailyWidgetMouseLeave(): void {
    this.isDailyWidgetHovered = false;
  }

  resolveElementDisplayName(element: string | null | undefined): string {
    return this.resolveElementVisual(element).label;
  }

  resolveCounterElementHint(element: string | null | undefined): string {
    const counterElement = this.resolveElementVisual(element).counterElementLabel;
    return `Bring ${counterElement} weapons`;
  }

  resolveElementThemeClass(element: string | null | undefined): string {
    const key = this.resolveElementVisual(element).key;
    return `daily-widget--${key}`;
  }

  readonly mainNavItems: HomeNavItem[] = [
    {
      id: 'arena',
      title: 'Arena',
      subtitle: 'Enter the Arena',
      route: '/arena-select',
      tone: 'arena'
    },
    {
      id: 'backpack',
      title: 'Backpack',
      subtitle: 'Gear & Items',
      route: '/backpack',
      tone: 'backpack'
    },
    {
      id: 'kaelis',
      title: 'Kaelis',
      subtitle: 'Squad & Loadout',
      route: '/kaelis',
      tone: 'kaelis'
    },
    {
      id: 'recruit',
      title: 'Recruit',
      subtitle: 'New Kaelis Available',
      route: '/recruit',
      tone: 'recruit'
    }
  ];

  readonly actionItems: HomeActionItem[] = [
    {
      id: 'mail',
      label: 'Mail',
      iconPath: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z'
    },
    {
      id: 'calendar',
      label: 'Calendar',
      iconPath: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z'
    },
    {
      id: 'shop',
      label: 'Shop',
      iconPath: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 5.9 17 7 17h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 5H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.9 2 1.99 2 2-.9 2-2-.9-2-2-2z',
      tone: 'gold'
    },
    {
      id: 'settings',
      label: 'Settings',
      iconPath: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
    }
  ];

  private resolveElementIconLabel(element: string | null | undefined): string {
    return this.resolveElementVisual(element).iconLabel;
  }

  private resolveElementVisual(element: string | null | undefined): DailyElementVisual {
    const normalizedElement = (element ?? "").trim().toLowerCase();
    if (normalizedElement === "fire" || normalizedElement === "ice" || normalizedElement === "earth" || normalizedElement === "energy") {
      return DAILY_ELEMENT_VISUALS[normalizedElement];
    }

    return DAILY_ELEMENT_VISUALS.fire;
  }

  private startDailyWidgetRotation(): void {
    if (this.dailyWidgetRotationTimerId !== null) {
      return;
    }

    this.dailyWidgetRotationTimerId = window.setInterval(() => {
      if (this.isDailyWidgetHovered || this.isDailyWidgetAutoRotationSuspended) {
        return;
      }

      this.activeDailyWidgetTab = this.activeDailyWidgetTab === "contracts" ? "element" : "contracts";
      this.changeDetectorRef.markForCheck();
    }, this.dailyWidgetRotateEveryMs);
  }

  private suspendDailyWidgetAutoRotation(): void {
    this.isDailyWidgetAutoRotationSuspended = true;
    this.clearDailyWidgetManualSuspendTimer();
    this.dailyWidgetManualSuspendTimerId = window.setTimeout(() => {
      this.isDailyWidgetAutoRotationSuspended = false;
      this.dailyWidgetManualSuspendTimerId = null;
      this.changeDetectorRef.markForCheck();
    }, this.dailyWidgetManualSuspendMs);
  }

  private clearDailyWidgetRotationTimer(): void {
    if (this.dailyWidgetRotationTimerId === null) {
      return;
    }

    window.clearInterval(this.dailyWidgetRotationTimerId);
    this.dailyWidgetRotationTimerId = null;
  }

  private clearDailyWidgetManualSuspendTimer(): void {
    if (this.dailyWidgetManualSuspendTimerId === null) {
      return;
    }

    window.clearTimeout(this.dailyWidgetManualSuspendTimerId);
    this.dailyWidgetManualSuspendTimerId = null;
  }
}
