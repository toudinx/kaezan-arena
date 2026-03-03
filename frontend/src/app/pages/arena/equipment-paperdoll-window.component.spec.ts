import { TestBed } from "@angular/core/testing";
import { EquipmentPaperdollWindowComponent } from "./equipment-paperdoll-window.component";

describe("EquipmentPaperdollWindowComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentPaperdollWindowComponent]
    }).compileComponents();
  });

  it("renders exactly 3 slots with W/A/R glyphs", () => {
    const fixture = TestBed.createComponent(EquipmentPaperdollWindowComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const slots = host.querySelectorAll(".paperdoll__slot");
    const glyphs = Array.from(host.querySelectorAll(".paperdoll__slot-glyph")).map((element) => element.textContent?.trim());

    expect(slots.length).toBe(3);
    expect(glyphs).toEqual(["W", "A", "R"]);
  });

  it("applies rarity classes per slot", () => {
    const fixture = TestBed.createComponent(EquipmentPaperdollWindowComponent);
    fixture.componentInstance.weaponRarity = "rare";
    fixture.componentInstance.armorRarity = "epic";
    fixture.componentInstance.relicRarity = "legendary";
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const slots = host.querySelectorAll(".paperdoll__slot");
    expect(slots[0]?.classList.contains("paperdoll__slot--rarity-rare")).toBe(true);
    expect(slots[1]?.classList.contains("paperdoll__slot--rarity-epic")).toBe(true);
    expect(slots[2]?.classList.contains("paperdoll__slot--rarity-legendary")).toBe(true);
  });

  it("sets tooltip text for each slot", () => {
    const fixture = TestBed.createComponent(EquipmentPaperdollWindowComponent);
    fixture.componentInstance.equippedWeaponLabel = "Iron Blade";
    fixture.componentInstance.equippedArmorLabel = "Guard Plate";
    fixture.componentInstance.equippedRelicLabel = "Rune Orb";
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const slots = host.querySelectorAll(".paperdoll__slot");
    expect(slots[0]?.getAttribute("title")).toBe("Weapon: Iron Blade");
    expect(slots[1]?.getAttribute("title")).toBe("Armor: Guard Plate");
    expect(slots[2]?.getAttribute("title")).toBe("Relic: Rune Orb");
  });
});
