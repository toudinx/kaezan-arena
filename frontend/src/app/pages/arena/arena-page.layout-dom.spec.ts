import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent layout DOM", () => {
  beforeEach(async () => {
    vi.spyOn(ArenaPageComponent.prototype, "ngAfterViewInit").mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [ArenaPageComponent],
      providers: [
        {
          provide: Router,
          useValue: {
            navigate: vi.fn()
          }
        }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ArenaPageComponent);
    fixture.componentInstance.isInRun = true;
    fixture.componentInstance.showRunIntelPanel = true;
    fixture.detectChanges();
    return fixture;
  }

  it("renders level_up and card_chosen messages in Events tab", () => {
    const fixture = TestBed.createComponent(ArenaPageComponent);
    fixture.componentInstance.isInRun = true;
    fixture.componentInstance.showRunIntelPanel = true;
    fixture.componentInstance.selectedTopLeftTab = "events";
    fixture.componentInstance.eventFeedEntries = [
      {
        id: "evt-1",
        tick: 1,
        runTimeMs: 5000,
        type: "level_up",
        message: "Level up: Run Lv. 2 (5/40 XP)"
      },
      {
        id: "evt-2",
        tick: 2,
        runTimeMs: 7000,
        type: "card_chosen",
        message: "Card chosen: Colossus Heart"
      }
    ];
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const eventsFeed = host.querySelector(".events-feed");
    expect(eventsFeed).not.toBeNull();
    expect(eventsFeed?.textContent).toContain("Level up: Run Lv. 2");
    expect(eventsFeed?.textContent).toContain("Card chosen: Colossus Heart");
  });

  it("switches Tools tabs between Helper and Bestiary", () => {
    const fixture = createFixture();
    const host = fixture.nativeElement as HTMLElement;
    const tabButtons = Array.from(host.querySelectorAll('[aria-label="Tools tabs"] .tab-row__tab'));
    const helperTab = tabButtons.find((button) => button.textContent?.trim() === "Helper") as HTMLButtonElement | undefined;
    const bestiaryTab = tabButtons.find((button) => button.textContent?.trim() === "Bestiary") as HTMLButtonElement | undefined;

    expect(helperTab).toBeDefined();
    expect(bestiaryTab).toBeDefined();

    bestiaryTab!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedToolsTab).toBe("bestiary");
    expect(host.textContent).toContain("Bestiary");

    helperTab!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedToolsTab).toBe("helper");
    expect(host.querySelector("app-helper-assist-window")).not.toBeNull();
  });

  it("keeps Status as a dedicated right-column panel without right-side tabs", () => {
    const fixture = createFixture();
    const host = fixture.nativeElement as HTMLElement;

    const statusPanel = host.querySelector(".right-pane__status");
    const rightTabs = host.querySelector('[aria-label="Secondary right tabs"]');

    expect(statusPanel).not.toBeNull();
    expect(statusPanel?.textContent).toContain("Status");
    expect(rightTabs).toBeNull();
  });

  it("keeps the shield bar visible when shield is zero and renders depleted state", () => {
    const fixture = createFixture();
    fixture.componentInstance.ui = {
      ...fixture.componentInstance.ui,
      player: {
        ...fixture.componentInstance.ui.player,
        hp: 84,
        maxHp: 100,
        shield: 0,
        maxShield: 80
      }
    };
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const shieldRow = host.querySelector(".top-hud__vital-row--shield") as HTMLElement | null;
    const shieldFill = host.querySelector(".top-hud__vitals-fill--shield") as HTMLElement | null;

    expect(shieldRow).not.toBeNull();
    expect(shieldRow?.classList.contains("top-hud__vital-row--shield-depleted")).toBe(true);
    expect(shieldRow?.textContent).toContain("0 / 80");
    expect(shieldFill?.style.width).toBe("0%");
  });

  it("uses low and active shield visual classes from current shield percent", () => {
    const fixture = createFixture();

    fixture.componentInstance.ui = {
      ...fixture.componentInstance.ui,
      player: {
        ...fixture.componentInstance.ui.player,
        shield: 20,
        maxShield: 80
      }
    };
    fixture.detectChanges();
    let shieldRow = fixture.nativeElement.querySelector(".top-hud__vital-row--shield") as HTMLElement | null;
    expect(shieldRow?.classList.contains("top-hud__vital-row--shield-low")).toBe(true);

    fixture.componentInstance.ui = {
      ...fixture.componentInstance.ui,
      player: {
        ...fixture.componentInstance.ui.player,
        shield: 68,
        maxShield: 80
      }
    };
    fixture.detectChanges();
    shieldRow = fixture.nativeElement.querySelector(".top-hud__vital-row--shield") as HTMLElement | null;
    expect(shieldRow?.classList.contains("top-hud__vital-row--shield-active")).toBe(true);
  });

  it("renders run complete summary metrics and selected cards", () => {
    const fixture = TestBed.createComponent(ArenaPageComponent);
    fixture.componentInstance.isInRun = true;
    fixture.componentInstance.isRunEnded = true;
    fixture.componentInstance.runEndReason = "victory_time";
    fixture.componentInstance.runEndedAtMs = 180_000;
    fixture.componentInstance.timeSurvivedMs = 180_000;
    fixture.componentInstance.runTimeMs = 180_000;
    fixture.componentInstance.runDurationMs = 180_000;
    fixture.componentInstance.runLevel = 9;
    fixture.componentInstance.runTotalKills = 143;
    fixture.componentInstance.runEliteKills = 17;
    fixture.componentInstance.runChestsOpened = 5;
    fixture.componentInstance.economyTotalEchoFragments = 42;
    fixture.componentInstance.economyTotalPrimalCore = 7;
    fixture.componentInstance.runLootSourceMobCount = 12;
    fixture.componentInstance.runLootSourceChestCount = 3;
    fixture.componentInstance.runAwardedDropEventsCount = 15;
    fixture.componentInstance.runAwardedItemDropCount = 4;
    fixture.componentInstance.selectedCards = [
      {
        id: "colossus_heart",
        name: "Colossus Heart",
        description: "",
        tags: ["defense"],
        rarityWeight: 40,
        maxStacks: 3,
        isSkillCard: false,
        currentStacks: 1,
        rarityTierLabel: "Epic",
        categoryLabel: "Defense",
        impactLines: ["+40% Max HP"],
        stackStateLabel: "Current stack 1/3",
        stackStateTone: "growing"
      },
      {
        id: "avenger_instinct",
        name: "Avenger Instinct",
        description: "",
        tags: ["offense"],
        rarityWeight: 80,
        maxStacks: 3,
        isSkillCard: false,
        currentStacks: 1,
        rarityTierLabel: "Uncommon",
        categoryLabel: "Offense",
        impactLines: ["+12 Damage"],
        stackStateLabel: "Current stack 1/3",
        stackStateTone: "growing"
      }
    ];
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const overlay = host.querySelector(".run-complete");
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain("Victory");
    expect(overlay?.textContent).toContain("Run level reached");
    expect(overlay?.textContent).toContain("Total kills");
    expect(overlay?.textContent).toContain("Elite kills");
    expect(overlay?.textContent).toContain("Chests opened");
    expect(overlay?.textContent).toContain("Run payout");
    expect(overlay?.textContent).toContain("Echo Fragments from drops");
    expect(overlay?.textContent).toContain("Primal Core from drops");
    expect(overlay?.textContent).toContain("Colossus Heart");
    expect(overlay?.textContent).toContain("Avenger Instinct");
  });
});
