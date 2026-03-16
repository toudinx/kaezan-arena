Kaezan: Arena — Design & Architecture Documentation
Overview

Kaezan: Arena is a deterministic arena combat game inspired by the chaotic combat of Tibia, but designed for short sessions and modern roguelike progression systems.

Core philosophy:

“Tibia for adults without time sinks.”

The game focuses on:

short runs (~3 minutes)

tactical micro-positioning

deterministic combat simulation

build experimentation

permanent progression outside runs

The gameplay combines elements from:

Tibia (grid combat and positioning)

Hades (build variation)

League of Legends (skill leveling)

Vampire Survivors (chaotic arena combat)

Core Game Philosophy

The design follows three key principles.

1. Short Sessions

Runs last ~3 minutes.

Players should be able to:

start a run instantly

complete a run quickly

always make progression

This makes the game ideal for short play sessions.

2. Tactical Chaos

Combat should be:

readable

chaotic

positional

Key gameplay comes from:

boxing enemies
avoiding ranged mobs
prioritizing elites
risking chests

The arena becomes increasingly chaotic as the run progresses.

3. Deterministic Simulation

The game is backend authoritative.

The frontend never simulates combat logic.

Instead it renders snapshots from the backend simulation.

This ensures:

deterministic replays

debugging reproducibility

no client cheating

simpler architecture

Core Architecture
Technology Stack

Backend:

C#
.NET
Deterministic simulation loop

Frontend:

Angular
Snapshot-based rendering
Simulation Model

The simulation runs in fixed ticks.

tick interval = configurable (default 250ms)

The game loop follows this pipeline:

Start Battle
↓
Step
↓
Apply Commands
↓
Update State
↓
Emit Snapshot
↓
Render
Determinism

Each battle has:

battleSeed

All RNG is derived from this seed.

This ensures:

identical outcomes with same seed + commands

deterministic replays

reproducible debugging

Arena Rules

Arena grid:

7x7

Rules:

1 entity per tile
Chebyshev distance for melee
Tibia-style diagonal corner blocking

The player is fixed at the center tile (3,3).

There is no player movement — positioning advantage comes from target selection and skill range decisions.

Enemies spawn dynamically during the run.

Combat System
Damage Order

Damage is applied in this order:

Shield
↓
HP

Rules:

damage first removes shield
remaining damage hits HP
HP <= 0 → player dies
Actor Types

Actors in combat:

Player
Mob
Elite

Each actor has:

position
hp
shield
cooldowns
status effects
Enemy System

Enemies spawn progressively during the run.

Spawn pacing increases over time.

Early run:

1–2 enemies

Mid run:

4–6 enemies

Late run:

7–10 enemies

This creates the "chaos curve".

Elite Commander System

Some enemies spawn as Elites.

Elites provide buffs to nearby mobs.

Rules:

Elite buffs up to 3 mobs
No stacking buffs
Prefer same species
Buff removed when elite dies

The snapshot exposes:

eliteId
buffSourceId
Run Progression

Runs are 3 minutes long.

During the run the player gains:

Run XP
Run Levels

Run level always resets at the start of each run.

Skill System

Skills are the core build system of the run — Vampire Survivors style.

The character starts with:

Exori Min (frontal melee — unlocked from start)
Heal (self-heal — unlocked from start)
Guard (shield — unlocked from start)

Additional skills are unlocked during the run via skill cards chosen at level-up:

Exori — square AoE around the player (Chebyshev r=1)
Exori Mas — wide diamond AoE (r=2)
Avalanche — ground-targeted AoE zone

All skills fire automatically via the Assist System.

The assist fires defensive skills (Guard → Heal) when HP/shield is low, then offensive skills in priority order (Avalanche → Exori Mas → Exori → Exori Min).

Max 1 auto-cast per tick.

Skill Leveling

Each level up triggers a card choice screen.

Level-up card choice offers both:

Skill cards — unlock new skills (available until the skill is already owned)
Passive cards — global run modifiers (max 3 stacks per card, max 4 distinct passives per run)

Chest card choice offers passive cards only — no skill cards.

Each skill's cooldown is reduced automatically as it gains levels via run progression.

Passive card cap:

Max 4 distinct passive cards per run
Max 3 stacks per passive card type

Chest System

Chests appear during runs and are opened via left-click.

They pause the simulation.

The player chooses 1 of 3 passive cards (chests never offer skill cards).

Example passive cards:

Bloodletter Edge — +22% damage, +2 HP on hit
Frenzy Clockwork — +35% attack speed, +8% damage
Arcane Tempo — +30% global cooldown reduction
Colossus Heart — +40% max HP, +6 damage
Overclocked Reflex — +25% global cooldown reduction, +20% attack speed

Card Design Rules

Cards should avoid false choices.

Bad design:

+10% damage
+20% damage
+30% damage

Good design:

Damage vs Survival vs Speed trade-offs

Cards modify global run stats (damage, attack speed, HP, cooldown reduction, HP on hit).

System split:

Level-up → skill cards (unlock skills) + passive cards
Chest → passive cards only

Character System

Characters exist outside runs.

Characters have:

inventory
equipment
progression

Example equipment slots:

weapon
armor
relic

Equipment persists between runs.

Backpack System

Inventory is accessible through a Backpack Drawer.

The drawer:

opens via UI button
opens via key "B"

The backpack shows:

inventory items
equipped items
equipment summary

Items can be equipped directly from the drawer.

Bestiary System

Bestiary tracks kills per species.

Example progression:

Skeleton
50 kills → Rank 1
200 kills → Rank 2
500 kills → Rank 3

Rewards may include:

materials
crafting
future charms
Home Page

The Home Page functions as the main game hub.

It displays:

active character
equipped items
stats
currency

Main actions:

Enter Arena
Characters
Bestiary
Replay System

The game supports deterministic replay.

Replays contain:

battleSeed
command timeline
config fingerprint

Replays can be:

exported
imported
replayed

Replay mode does not affect account state.

Simulation Invariants

The engine enforces strict invariants.

Examples:

actors must remain inside grid
only 1 entity per tile
hp >= 0
shield >= 0
hp <= maxHp

Violations throw errors in debug builds.

Controls & Targeting

The player is fixed at tile (3,3) — there is no WASD movement.

Active controls:

Left-click on a POI tile → interact (open chest, activate altar)
Right-click on a mob → lock target (assist prioritizes the locked target)

The F key has been removed. POI interaction is now left-click only.

Mob targeting:

The assist system automatically attacks the nearest valid target.
Right-clicking a mob locks it as the priority attack target.
Right-clicking empty space clears the lock.

Tick System

Simulation tick is configurable.

Default:

250ms

Configurable via:

Battle:StepDeltaMs

Range: 50ms – 2000ms.

Frontend schedules steps using the backend-provided value.

HTTP Batch Step:

Batch step is implemented (up to 16 steps per request via stepCount parameter).
Currently MAX_TICK_DEBT = 0: one HTTP request is sent per tick (standard polling).
Increasing MAX_TICK_DEBT would batch multiple ticks per request, reducing request rate.

Possible experimentation values:

150ms
100ms

Run Telemetry

Runs generate structured telemetry.

Run result fields (all correctly captured):

battleSeed
duration
kills
eliteKills
runLevel
xpGained
damageDealt
damageTaken
minHpObserved
cardsChosen
drops

Results are:

stored in localStorage (max 30 runs)
exportable for analysis

Telemetry enables real balance tuning.

Economy

Account-wide currency:

Echo Fragments

Used for:

future crafting
meta progression

Future resource:

Species cores

Generated from killing monsters.

Future Systems

Planned systems include:

charms
species crafting
meta progression
new characters
skill synergies
Development Philosophy

The project follows these principles:

incremental safe refactors
deterministic gameplay
minimal backend state
no premature databases

Focus is always on playable MVP first.

Current MVP Status

The MVP currently includes:

arena combat (player fixed at center tile 3,3)
enemy spawning + progressive pacing
elite commander system
Vampire Survivors–style skill progression:
  - character starts with Exori Min + Heal + Guard
  - Exori, Exori Mas, Avalanche unlocked via level-up skill cards
all skills fire automatically via assist system
card system: level-up → skill cards + passive cards; chest → passive cards only
passive card caps: max 4 distinct, max 3 stacks per card
left-click POI interaction (F key removed)
right-click target lock
ArenaConfig.cs centralizes all simulation constants
HTTP batch step implemented (MAX_TICK_DEBT = 0 currently)
Tibia-style UI with skills + passives in right panel
backpack inventory
characters page
bestiary page
replay system
simulation invariants
run telemetry: kills, damageDealt, damageTaken, minHpObserved, xpGained

The foundation for the full game is complete.

Design Goal

The final experience should feel like:

Tibia combat
+
Hades build variety
+
LoL skill progression
+
Vampire Survivors chaos

All condensed into 3-minute runs.