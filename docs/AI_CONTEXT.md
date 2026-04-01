This file is a compact, high-signal context document for AI assistants working on Kaezan: Arena.

Its purpose is to let a new chat/session understand the project quickly without relying on previous conversation history.

1. Project Identity

Kaezan: Arena is a short-session deterministic arena combat game inspired by Tibia.

Core pitch:

“Tibia for adults without time sinks.”

The game is designed around:

short runs (~3 minutes)

tactical micro-positioning

backend-authoritative deterministic combat

progressive chaos

permanent progression outside runs

replayable run builds

It is not trying to be:

an MMO

a giant open-world RPG

a click-heavy action game

a pure idle game with no agency

It is closer to:

Tibia combat
+ Hades build identity
+ LoL-style skill leveling
+ Vampire Survivors chaos curve
2. Core Design Philosophy

The game should feel like:

calm → pressure → chaos

A good run should create moments like:

“I almost died, but survived.”

“This chest changed my whole run.”

“This build became insane near the end.”

“I should have positioned better.”

The game must avoid:

long grind

excessive session length

unreadable chaos from second 1

fake choices

mechanics that reward pure APM over good decisions

3. Player Fantasy

The player fantasy is:

smart positioning

chaotic but readable combat

short but meaningful progression

experimenting with builds

making occasional high-impact decisions

This is not a reflex-heavy game.
It should be:

low-APM
decision-driven
positioning-aware
4. Core Gameplay Loop

Main loop:

Home / Kaelis (Overview + Loadout + Bestiary tab)
↓
Enter Arena
↓
3-minute run
↓
Gain progression / drops / bestiary progress
↓
Improve character
↓
Run again

During a run:

survive (player is fixed at center — no movement)
choose level-up cards (skill cards unlock new skills; passive cards boost stats)
open chests (passive cards only)
lock targets via right-click to guide the assist system
manage chaos
5. Arena Rules

Arena size:

7x7 grid
Planned future change: 9x7 (wider, same height). Do not implement until explicitly requested.

Core rules:

1 entity per tile

Chebyshev distance for melee

Tibia-style diagonal corner blocking

The player is fixed at the center tile (3,3).

There is no WASD movement. The player does not move.

Player agency comes from:

right-click target locking (guides the assist system)
left-click POI interaction (chests, altars)
level-up and chest card choices
free weapon slot selection (one attack weapon per run, chosen via card)

The 7x7 is a core identity constraint.
Do not casually expand it into large-map gameplay unless explicitly planned.

6. Run Structure

Run length target:

180 seconds

Expected pacing:

0:00–0:30 → calm, readable, low density

0:30–1:30 → pressure builds

1:30–2:30 → strong arena tension

2:30–3:00 → satisfying chaos / survival test

The run should not start already at maximum chaos.

7. Combat Structure

Combat is backend-authoritative.

Damage order:

Shield → HP

Key combat ideas:

player auto-attacks

enemies auto-attack

skills are important

elites create priority targets

movement and target selection matter

combat should reward good positioning, not spam clicking

8. Weapon Kit System

Each character has a fixed weapon kit defining their attack identity.
Heal and Guard are removed from the player kit — survivability comes exclusively from passive cards (Vampiric Spikes, lifesteal, etc.).
Auto-attack single-target melee is removed — kit melee weapons replace it.

Character kits (3 fixed slots + 1 free slot):

Kina:
  Fixed: Exori Min (frontal melee, 800ms) + Exori (square AoE r=1, 1200ms) + Exori Mas (diamond AoE r=2, 2000ms)
  Free: 1 attack weapon chosen per run via card

Ranged Prototype:
  Fixed: Sigil Bolt (single-target ranged, 800ms) + Shotgun (dragon-wave cone AoE, 800ms) + Void Ricochet (bounce + pierce, 2000ms)
  Free: 1 attack weapon chosen per run via card
  Current product status: selectable on Characters page as provisional "Prototype" (subtitle: "Ranged Kit [WIP]") for ranged testing

Archer (future):
  Fixed: AA Ranged + Shotgun + Pierce Bolt
  Free: 1 attack weapon chosen per run via card

Mage (future):
  Fixed: AA Ranged + Pierce Bolt + Void Ricochet
  Free: 1 attack weapon chosen per run via card

Free weapon slot rules:

Player chooses one attack/damage weapon per run via a card choice.
Ultimate is gauge-based and auto-fires when full (no manual equip per run).
Current placeholder effect: flat AoE burst around the player.
This is currently an always-available combat lane, not a run-configurable slot.

All weapons fire automatically via the Assist System.

Assist priority order (offensive only):

Class-kit-driven potency-first order (resolved from active class fixed kit), then Ultimate auto-fire when ready
  - Kina: Exori Mas -> Exori -> Exori Min
  - Ranged Prototype: Void Ricochet -> Shotgun -> Sigil Bolt

Max 1 auto-cast per tick.

Current state: Ultimate gauge starts at 0 every run and fills via kills/damage taken.
When full, Ultimate auto-fires during assist evaluation and resets to 0.

Ranged weapons:

Sigil Bolt - implemented (single target, ranged auto-attack)
Shotgun - implemented (dragon-wave cone AoE; all mobs in cone take damage; knockback 1 tile in primary cone direction when destination is free)
Void Ricochet - implemented (reflects on arena borders, pierces all mobs per segment, emits one projectile event per segment)
Pierce Bolt - future

Destructible obstacles: planned after ranged weapons are implemented.

8b. Rune System

Each character unlocks a powerful evolved weapon rune when obtained.

Character runes:

Velvet / Kina rune: Exori Mas Rune (evolved AoE melee)
Archer rune: Shotgun + Pierce combined
Mage rune: Pierce + Void Ricochet combined

Rune rules:

A character's rune can be equipped in the free weapon slot of other characters.
Prerequisites: player must have the base weapons of the target character unlocked
  (e.g. equipping Velvet's rune requires AA Ranged + Shotgun + Pierce unlocked)
The free weapon slot is the only slot where runes can be equipped.

Design purpose:

Character collection has real gameplay value beyond cosmetics.
Lore: absorbing another Kaeli's Sigil grants access to their signature power.

Important:

Do not confuse the old "skill upgrade via run level" model with the current kit model.
Skill upgrade cards are postponed — not implementing now.

9. Card System

Two sources of card choices:

Level-up card choice:
  - Offers passive cards
  - Skill upgrade cards: postponed — not currently implemented
  - Weapon card for free slot: offered as a one-time run choice

Chest card choice (left-click to open chest):
  - Offers passive cards only
  - No skill cards are ever offered from chests

Design role of passive cards:

modify the run globally

create surprise and strong identity

encourage risk/reward decisions when going for chests

Passive card constraints:

Max 4 distinct passive card types per run
Max 3 stacks per passive card type
Max 12 total card selections per run

Current passive card pool examples:

Bloodletter Edge — +22% damage, +2 HP on hit
Frenzy Clockwork — +35% attack speed, +8% damage
Arcane Tempo — +30% global cooldown reduction
Colossus Heart — +40% max HP, +6 damage
Butcher Mark — +12 flat damage
Iron Fortress — +55% max HP
Warlord Banner — +18% damage, +20% max HP

Avoid false choices:

3 options must not be trivial numeric variants of the same effect

10. Character System

Characters are persistent entities outside runs.

Characters have:

equipment

inventory

progression

future identity via skill kit and build paths

Important design direction:

One character should support multiple builds.

This means:

do not require too many characters too early

a single character can generate variety through skill-upgrade branches + run cards

11. Permanent Progression

The game leans more toward permanent progression than pure run-only progression.

This is closer to Tibia philosophy.

Permanent progression layers include:

characters

equipment

bestiary progression

future charms

future species-related progression

account currency

Temporary run progression includes:

run levels

skill upgrades during the run

cards from chests

temporary run modifiers

Recommended mental model:

Permanent progression = account / character layer
Run progression = build / moment-to-moment layer
12. Bestiary

Bestiary is a permanent progression system tied to species.

Bestiary should track:

kills per species

thresholds / ranks

rewards / unlocks

future charm hooks

Bestiary is a major retention driver because it gives players a reason to return even after failed runs.

13. Currency

Main account-wide currency:

Echo Fragments

Portuguese:

Fragmentos de Eco

This naming is already established and should remain consistent.

14. Technical Architecture
Backend

C#

.NET

deterministic simulation

backend-authoritative combat

in-memory battle/account state for MVP

Frontend

Angular

renders snapshots only

sends player commands

no gameplay simulation

Pipeline:

StartBattle
↓
StepBattle
↓
Apply Commands
↓
Advance Simulation
↓
Return Snapshot
↓
Render

Ranged foundation status (infrastructure + active ranged weapons):

- Shared ranged projectile event exists: `ranged_projectile_fired` (`RangedProjectileFiredEventDto`)
- Shared knockback event exists: `mob_knocked_back` (`MobKnockedBackEventDto`)
- Shared backend ranged helpers now exist:
  - `HasLineOfSight(TilePos from, TilePos to, StoredBattle state)`
  - `ResolveRangedTarget(StoredBattle state, int maxRange, bool requireLOS)`
  - `ApplyRangedDamageToMob(StoredBattle state, StoredActor target, int damage, string weaponId, List<BattleEventDto> events)`
- LOS is intentionally stubbed now (returns true) and documented to be populated when destructible obstacles are implemented
- Frontend projectile visuals are driven by the ranged event and ranged snapshot config (`ProjectileAnimator`)
- Frontend knockback visuals are driven by `mob_knocked_back` via short actor slide interpolation (render-only)
- Shotgun uses cone AoE damage and also emits 5 representative visual projectile lines per cast for cone readability
- Sigil Bolt, Shotgun, and Void Ricochet are active for ranged-kit characters
- Void Ricochet emits one projectile event per bounce segment and frontend renders segments sequentially
- Kina remains unchanged and never casts Sigil Bolt, Shotgun, or Void Ricochet

15. Determinism Rules

Determinism is critical.

Same:

seed

starting state

command sequence

tick timing

must always produce the same run outcome.

Important rules:

frontend never decides gameplay

backend owns combat truth

all gameplay RNG comes from battle seed

no real-world time in gameplay logic

no unstable collection iteration affecting gameplay

replay is the main determinism validation

If determinism breaks, treat it as a serious technical issue.

16. Tick / Feel / Responsiveness

The simulation tick is configurable.

Default:

250ms (configurable via Battle:StepDeltaMs, range 50–2000ms)

The player is fixed at center — there is no movement to feel sluggish.

HTTP polling:

Currently MAX_TICK_DEBT = 0 → one HTTP request per tick (4 req/s at 250ms).

Batch step is implemented (up to 16 steps per request via stepCount).
Increasing MAX_TICK_DEBT batches multiple ticks per request (lower req/s, higher latency visibility).

Frontend schedules steps based on the backend-provided stepDeltaMs value.

17. Run Telemetry

The project now supports structured run-result logging.

Telemetry is important for:

balancing

identifying bad pacing

comparing runs

validating design assumptions

Typical logged fields include:

battleSeed

duration

kills

eliteKills

XP

run level

damage dealt

damage taken

min HP

chosen cards

drops

Balancing should be based on real run telemetry, not only intuition.

18. Current Product Areas

Current major product areas include:

Arena page (player fixed at center, Vampire Survivors skill unlock, assist auto-cast)

Home page

Kaelis page
  - Kina + Prototype are selectable
  - Prototype is explicitly marked as provisional ranged test character ("Ranged Kit [WIP]")
  - Bestiary lives inside Kaelis as a character-context tab (not a top-level sibling page)

Backpack drawer

Replay export/import

Run logger / telemetry (kills, damageDealt, damageTaken, minHpObserved, xpGained)

Simulation invariants

Configurable step delta

HTTP batch step (MAX_TICK_DEBT = 0 currently)

ArenaConfig.cs — centralized constants (all simulation tuning values)

Tibia-style UI layout with skills and passives in right panel

The project is no longer “just an arena prototype”; it already has meaningful product structure outside combat.

19. Design Principles for New Suggestions

Before proposing a new feature, check:

A. Does it strengthen the 7x7 arena fantasy?

Good:

things that improve positioning decisions

things that create readable chaos

things that create build identity

Bad:

systems that encourage wandering aimlessly

systems that dilute arena pressure

features that turn the game into generic map exploration

B. Does it fit short sessions?

Good:

immediate impact

short feedback loops

permanent but compact progression

Bad:

long chore-like progression

systems that require long uninterrupted sessions

C. Does it create meaningful choice?

Good:

trade-offs

style differences

risk/reward

Bad:

“same effect but bigger number”

obviously dominant options

20. What the Game Should Avoid

Avoid these directions unless explicitly requested:

turning the game into a giant map crawler

overloading the run with too many simultaneous systems too early

making the game fully idle with no meaningful player decisions

making all progression purely permanent and removing run excitement

making all progression purely run-based and removing retention

introducing heavy complexity before baseline balance is stable

21. Recommended Assistant Behavior

When helping with Kaezan Arena, prioritize:

preserving deterministic architecture

preserving 7x7 positional identity

preserving short-session design

preferring incremental safe changes

separating build systems clearly

avoiding feature bloat

using telemetry-informed balance reasoning

When proposing implementation:

prefer small prompts

avoid giant refactors unless explicitly requested

keep prompts structured and safe

mention model/reasoning level if asked for Codex prompts

22. Current Strategic Priorities

At the latest known state, the biggest priorities are:

baseline combat balance (spawn pacing, mob damage, player survivability)

run telemetry collection and analysis (telemetry is now correctly capturing all key fields)

defining run pacing (calm → pressure → chaos curve)

build variety via skill unlock combos + passive card stacking

building permanent progression layers cleanly

The current balance is not final.
The project is in the stage of:

instrument

test runs

collect data

iterate

23. High-Level Design Direction Going Forward

Current confirmed system split:

Run Level → card choice (skill cards unlock new skills; passive cards boost stats)
Chest → card choice (passive cards only)
Bestiary / future charms → permanent progression
Equipment → persistent character progression

This creates a clear system split:

skill unlock choices at level-up define the run build core

passive card stacking defines run power curve

chests offer passive card power, not skill unlocks

permanent progression creates long-term retention

24. If You Are an AI Assistant Continuing This Project

Assume the following unless the user says otherwise:

backend is authoritative

frontend must not simulate combat

7x7 is intentional (9x7 is a planned future change — do not implement until requested)

the game should start calmer and ramp to chaos

player is fixed at tile (3,3) — no WASD movement

all weapons fire via the assist system — no manual casting

each character has a fixed 3-slot weapon kit + 1 Ultimate slot

the Ultimate gauge starts at 0 every run and charges via combat events

Ultimate is no longer rune-equipped; it auto-fires from gauge when ready

Heal and Guard are removed from kit — survivability comes from passives only

skill upgrade cards are postponed — not implementing now

chests offer passive cards only — never skill cards or weapon cards

passive card caps: max 4 distinct types, max 3 stacks per type

rune-equipping flow is superseded by the Ultimate gauge system

all constants are in ArenaConfig.cs — never hardcode simulation values

ranged infrastructure exists (projectile + knockback events, LOS stub, shared helpers); Sigil Bolt, Shotgun, and Void Ricochet are active for ranged-kit characters, and Kina remains unchanged

short-run fun matters more than large-system complexity

mechanics > raw stats

false choices are bad

deterministic replay/debugging is a major asset

If proposing new systems, explain:

what design problem they solve

how they preserve the game identity

how they interact with determinism and current architecture

whether they should be permanent progression or run-only progression
