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

Home / Character / Bestiary
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

survive
position
upgrade skills via run level
choose cards from chests
manage chaos
5. Arena Rules

Arena size:

7x7 grid

Core rules:

1 entity per tile

movement in 8 directions

Chebyshev distance for melee

Tibia-style diagonal corner blocking

player positioning matters

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

8. Skill System

Skills are a major part of build identity.

Known skill examples:

Auto Attack

Exori

Exori Min

Exori Mas

Avalanche

Design direction:

Run level upgrades should mainly improve skills

skill upgrades may include branching variations

different skill upgrade choices should create different builds for the same character

Examples of interesting skill upgrades:

Exori → damage path / cooldown path / AoE path
Avalanche → damage / slow / freeze utility

Important distinction:

Skill upgrades = character build core during the run

Cards = broader run modifiers

Do not make cards and skill upgrades overlap too much.

9. Card System

Cards are obtained primarily from chests.

Chest flow:

interact with chest
↓
pause run
↓
choose 1 of 3 cards

Design role of cards:

modify the run globally

create surprise and strong identity

complement skill upgrades

encourage risk/reward decisions when going for chests

Cards should not mostly be “+X% to one skill” if that belongs to the skill-upgrade system.

Better card examples:

life leech
enemy explosion on death
spawn rate increase
shield regen modifier
risk/reward modifiers

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

Default historically was:

250ms

This may feel too sluggish for movement.

Important distinction:

movement responsiveness matters a lot

AI does not necessarily need to “think” more often just because tick is smaller

simulation tick and AI think interval may eventually be separated if needed

Current design concern:

movement should feel reliable

player should not feel like movement commands are being ignored

blocked movement reasons should be visible/debuggable

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

Arena page

Home page

Characters page

Bestiary page

Backpack drawer

Replay export/import

Run logger / telemetry

Simulation invariants

Movement reliability improvements

Configurable step delta

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

movement feel / responsiveness

baseline combat balance

run telemetry collection

defining run pacing

solidifying skill-upgrade vs chest-card roles

building permanent progression layers cleanly

The current balance is not final.
The project is in the stage of:

instrument

test runs

collect data

iterate

23. High-Level Design Direction Going Forward

Strong likely direction:

Run Level → upgrade skills / choose skill variations
Chest → choose 1 of 3 cards (global run modifiers)
Bestiary / future charms → permanent progression
Equipment → persistent character progression

This creates a clear system split:

skills define the run build core

cards define run modifiers and surprise

permanent progression creates long-term retention

24. If You Are an AI Assistant Continuing This Project

Assume the following unless the user says otherwise:

backend is authoritative

frontend must not simulate combat

7x7 is intentional

the game should start calmer and ramp to chaos

movement feel is currently a key issue

short-run fun matters more than large-system complexity

mechanics > raw stats

false choices are bad

deterministic replay/debugging is a major asset

If proposing new systems, explain:

what design problem they solve

how they preserve the game identity

how they interact with determinism and current architecture

whether they should be permanent progression or run-only progression