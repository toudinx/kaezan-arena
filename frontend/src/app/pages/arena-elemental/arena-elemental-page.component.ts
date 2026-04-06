import { ChangeDetectionStrategy, Component } from "@angular/core";
import { Router } from "@angular/router";

type ElementalArenaKey = "fire" | "ice" | "earth" | "energy";

type ElementalArenaCard = Readonly<{
  arenaId: string;
  displayName: string;
  elementKey: ElementalArenaKey;
  elementLabel: string;
  coreDrop: string;
  dustDrop: string;
  description: string;
}>;

const ELEMENTAL_ARENA_CARDS: ReadonlyArray<ElementalArenaCard> = [
  {
    arenaId: "arena:forge_of_ash",
    displayName: "Forge of Ash",
    elementKey: "fire",
    elementLabel: "Fire",
    coreDrop: "EmberCore",
    dustDrop: "EmberDust",
    description: "Scorched battlegrounds. Fire mobs run hot."
  },
  {
    arenaId: "arena:frozen_vault",
    displayName: "Frozen Vault",
    elementKey: "ice",
    elementLabel: "Ice",
    coreDrop: "FrostCore",
    dustDrop: "FrostDust",
    description: "Glacial crypts. Cold enemies, colder drops."
  },
  {
    arenaId: "arena:grove_of_ruin",
    displayName: "Grove of Ruin",
    elementKey: "earth",
    elementLabel: "Earth",
    coreDrop: "StoneCore",
    dustDrop: "StoneDust",
    description: "Overgrown ruins. Earth creatures hold their ground."
  },
  {
    arenaId: "arena:storm_sanctum",
    displayName: "Storm Sanctum",
    elementKey: "energy",
    elementLabel: "Energy",
    coreDrop: "VoltCore",
    dustDrop: "VoltDust",
    description: "Crackling sanctum. Energy mobs strike without warning."
  }
];

@Component({
  selector: "app-arena-elemental-page",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./arena-elemental-page.component.html",
  styleUrl: "./arena-elemental-page.component.css"
})
export class ArenaElementalPageComponent {
  readonly arenaCards = ELEMENTAL_ARENA_CARDS;

  constructor(private readonly router: Router) {}

  enterArena(arenaId: string): void {
    void this.router.navigate(["/arena"], { queryParams: { arenaId } });
  }

  goBack(): void {
    void this.router.navigateByUrl("/arena-select");
  }
}
