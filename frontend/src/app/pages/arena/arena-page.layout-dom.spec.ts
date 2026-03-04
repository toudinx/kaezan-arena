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
    fixture.detectChanges();
    return fixture;
  }

  it("renders level_up and card_chosen messages in Events tab", () => {
    const fixture = TestBed.createComponent(ArenaPageComponent);
    fixture.componentInstance.isInRun = true;
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
});
