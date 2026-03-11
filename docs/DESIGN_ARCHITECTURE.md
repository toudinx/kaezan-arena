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
8-direction movement
Chebyshev distance for melee
Tibia-style diagonal corner blocking

The player usually begins in the center.

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

Skills are the core build system of the run.

Instead of unlocking skills via cards, skills evolve through run level upgrades.

Example skills:

Auto Attack
Exori
Exori Min
Exori Mas
Avalanche
Skill Leveling

Each level up allows upgrading a skill.

Example:

Level 2 → upgrade skill
Level 3 → upgrade skill
Level 4 → upgrade skill
Level 5 → upgrade skill

Each skill has multiple upgrade paths.

Example:

Exori:

Path A → Damage
Path B → Cooldown
Path C → AoE

This creates different builds for the same character.

Chest System

Chests appear during runs.

They pause the simulation.

The player chooses 1 of 3 cards.

Cards are run modifiers, not skill upgrades.

Example cards:

Blood Feast
+40% life leech
Chain Explosion
Enemies explode on death
Overpopulation
+40% spawn rate
+40% XP
Card Design Rules

Cards should avoid false choices.

Bad design:

+10% damage
+20% damage
+30% damage

Good design:

Damage
Survival
Risk modifier

Cards should modify the gameplay system, not just numbers.

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

Movement System

Movement commands are sent every step while keys are held.

Movement results:

Accepted
Blocked

Block reasons:

occupied
corner block
cooldown
out of bounds

This improves responsiveness and debugging.

Tick System

Simulation tick is configurable.

Default:

250ms

Configurable via:

Battle:StepDeltaMs

Possible experimentation values:

150ms
100ms

Frontend schedules steps using the backend-provided value.

Run Telemetry

Runs generate structured telemetry.

Example run result fields:

battleSeed
duration
kills
eliteKills
runLevel
xpGained
damageDealt
damageTaken
minHP
maxHP
cardsChosen
drops

Results are:

printed to console
stored in localStorage
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

arena combat
enemy spawning
elite system
run XP
skill leveling
chest cards
backpack inventory
characters page
bestiary page
replay system
movement fixes
simulation invariants
run telemetry

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