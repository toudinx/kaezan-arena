This document defines the recommended long-term development roadmap for Kaezan: Arena.

Its purpose is to:

organize the project into clear phases

avoid feature chaos

help prioritize what should happen next

protect the core identity of the game

align product, gameplay, and technical evolution

This roadmap is intentionally staged.
Not every idea should be implemented immediately.

1. Roadmap Philosophy

Kaezan: Arena should grow in layers, not by adding random systems.

Development should follow this order:

solid combat foundation
→ stable progression loop
→ build variety
→ content expansion
→ replayability systems
→ long-term progression depth

The project should always protect:

short runs

7x7 positional identity

deterministic simulation

low-friction sessions

meaningful progression

2. Current State

At the current stage, the project already has a strong MVP foundation:

deterministic backend battle loop
7x7 arena combat (player fixed at center tile 3,3)
enemy spawning + progressive pacing
elite commander system
Vampire Survivors–style skill progression:
  - character starts with Exori Min + Heal + Guard
  - Exori, Exori Mas, Avalanche unlocked via level-up skill cards
all skills fire automatically via assist system (no manual casting)
card system fully implemented:
  - level-up → skill cards + passive cards
  - chest → passive cards only
  - passive caps: max 4 distinct types, max 3 stacks per type
left-click POI interaction (chests, altar)
right-click target lock
ArenaConfig.cs — all constants centralized
HTTP batch step (MAX_TICK_DEBT = 0 currently)
inventory/backpack
characters page
bestiary page
home page
replay system
run telemetry (kills, damageDealt, damageTaken, minHpObserved, xpGained)
simulation invariants
Tibia-style UI with skills + passives in right panel
configurable tick (50ms – 2000ms)

This means the project is no longer in “prototype-only” stage.
It is now moving from technical MVP into playable product shaping.
The skill unlock system (Vampire Survivors model) is complete and working.
The current focus should be on balance tuning using real telemetry data.

3. Development Phases
Phase 1 — Combat Baseline Stabilization
Goal

Establish the core “feel” of the arena before adding major new systems.

Main questions to answer

Does movement feel good?

Is the early/mid/late pacing correct?

Is combat readable?

Is the player too weak or too strong?

Is the arena too chaotic too early?

How many mobs feel good in a 7x7?

Does the game already feel fun without advanced progression?

Key tasks

fine-tune tick / responsiveness

validate movement behavior

run telemetry collection

balance spawn pacing

balance mob HP / damage

balance elite frequency

validate chest timing

validate run duration

Exit criteria

This phase is complete when:

average runs have a healthy survival curve

movement feels reliable

chaos ramps instead of starting maxed

telemetry supports the balance decisions

the base combat is already fun

Phase 2 — Skill Identity & Build Depth  ✅ FOUNDATION COMPLETE
Goal

Make skill unlock choices and passive card stacking feel build-defining.

Current state (implemented):

Vampire Survivors skill unlock model is live.
Character starts with Exori Min + Heal + Guard.
Level-up cards offer skill unlocks (Exori, Exori Mas, Avalanche) + passive cards.
All skills fire via the assist system automatically.
Passive card caps: max 4 distinct types, max 3 stacks per type.

Main design goal

A player should finish a run thinking:

“This became an Exori Mas build.”

“I got Avalanche early and it changed the whole run.”

“I stacked 3x Arcane Tempo — skills are firing constantly.”

Remaining tasks for this phase:

validate that skill unlock timing feels good (run level pacing)

ensure each combination of unlocked skills produces a different play experience

tune passive card power so stacking feels meaningful but not trivial

consider if any additional skill upgrade depth is needed (currently skill levels reduce cooldowns only)

Exit criteria

This phase is complete when:

skill unlock choices feel meaningful and different builds are recognizable

passive card stacking creates clear power spikes

the same run can feel dramatically different based on which skills were unlocked

Phase 3 — Chest Cards / Run Modifiers
Goal

Make chests a major source of run variety and surprise.

Direction

Chests should provide:

3-card choices

meaningful trade-offs

modifiers that affect the whole run

risk/reward moments

Cards should not duplicate the role of skill upgrades.

Recommended separation:

skill upgrades = character build core

cards = global run modifiers

Key tasks

define initial card pool

avoid false choices

define rarity or offer weighting

define card categories

integrate chest timing with run pacing

ensure cards generate memorable runs

Exit criteria

This phase is complete when:

chest interaction feels exciting

cards significantly alter run identity

players want to take risks for chests

card choices are not obvious auto-picks

Phase 4 — Permanent Progression Loop
Goal

Create the reason players return after multiple sessions.

Main loop
run
→ kill enemies
→ gain rewards
→ progress bestiary / inventory / gear
→ improve character
→ run again
Systems in scope

bestiary progression

equipment progression

currencies

reward clarity

stronger product loop outside arena

Key tasks

strengthen reward loop

refine inventory progression

make home/characters/bestiary pages useful

connect run results to permanent progress

define future meta hooks cleanly

Exit criteria

This phase is complete when:

every run advances something permanent

the player clearly understands what improved

non-arena pages feel like real game systems, not placeholders

Phase 5 — Character Identity Expansion
Goal

Make characters feel distinct without requiring huge content volume immediately.

Direction

Characters should differ primarily through:

base stats

skill kits

thematic identity

build directions

A single character should already support multiple builds.
Then additional characters expand the design space.

Key tasks

define character archetypes

define how new characters differ

keep kit sizes manageable

ensure every new character adds gameplay identity, not only visuals

Exit criteria

This phase is complete when:

at least one character has multiple valid builds

new characters can be designed through a repeatable pipeline

character choice feels meaningful

Phase 6 — Bestiary Depth + Future Charms
Goal

Expand the permanent-progression fantasy inspired by Tibia.

Direction

Bestiary should evolve from a tracking system into a true long-term progression layer.

Potential future additions:

species ranks

species rewards

charms

species-linked crafting

anti-species specializations

Key tasks

define charm philosophy

ensure charms complement, not replace, cards/builds

avoid permanent power creep becoming overwhelming

connect species progression to replay motivation

Exit criteria

This phase is complete when:

bestiary feels rewarding by itself

species progression changes player goals

players return because they want to unlock species-based options

Phase 7 — Content Expansion
Goal

Increase gameplay variety without breaking the core game.

Content types

new enemies

new elites

new skill variations

new cards

new characters

new visual/event patterns

Important rule

Content expansion should follow the established content pipeline.
No new content should be added ad hoc.

Key tasks

expand enemy roster carefully

create elite identities

add more cards

add more skill branches

increase build variety

preserve readability

Exit criteria

This phase is complete when:

runs feel varied

enemy roster supports multiple tactical situations

content expansion does not damage readability or pacing

Phase 8 — Arena “Life” / Dynamic Events
Goal

Make the arena feel more alive without breaking the 7x7 identity.

Important note

Arena life should not turn the game into map wandering or dungeon exploration.

It should remain:

compact

pressurized

readable

positional

Examples of acceptable future systems

event director

hazard tiles

temporary arena zones

special waves

elite variants

altar / chest / POI evolution

Examples of risky systems

large room exploration

wandering through many maps

systems that reduce combat density too much

Exit criteria

This phase is complete when:

the arena feels more dynamic

the player makes more interesting positioning decisions

the game still feels like a sharp 7x7 arena

Phase 9 — Difficulty Layers / Mastery
Goal

Create long-term mastery and replay depth for experienced players.

Possible systems

difficulty presets

ascension-like modifiers

harder arena rules

elite-enhanced runs

challenge runs

build-specific achievements

Design rule

These systems should reward mastery without making the base experience inaccessible.

Exit criteria

This phase is complete when:

experienced players have more to chase

the game supports mastery without mandatory grind

challenge modes enhance retention

Phase 10 — Productization / Public Release Readiness
Goal

Prepare the game to be played by people beyond internal/friend testing.

Areas in scope

onboarding clarity

game hub polish

UX clarity

replay/export reliability

run result readability

balancing confidence

performance sanity

patch discipline

documentation completeness

Key tasks

polish the product shell

improve first-run clarity

improve visual readability

package the game properly

define release strategy

Exit criteria

This phase is complete when:

a new player can understand the loop quickly

the game is fun in short sessions

progression is visible

the product feels coherent, not like a dev sandbox

4. What Should NOT Be Prioritized Too Early

These ideas may be good later, but should not jump ahead of the roadmap:

large-map exploration

overcomplicated meta systems

too many currencies

too many characters too early

feature-heavy UI before combat is balanced

content explosion before identity is stable

heavy persistence infra before the design is proven

MMO-style systems

The project wins by being:

focused

clean

readable

replayable

Not by being huge too early.

5. Current Recommended Immediate Priorities

Based on the current project state, the most important near-term priorities are:

Priority 1

Combat baseline balance

collect runs using working telemetry

analyze kills, damageDealt, damageTaken, minHpObserved, xpGained

adjust spawn pacing, mob damage, player survivability

Priority 2

Skill unlock pacing

validate that skill card offers happen at the right run levels

ensure players unlock at least 1–2 additional skills before the run ends

tune assist system thresholds for the fixed-player combat model

Priority 3

Passive card power curve

validate stacking feels meaningful (not too weak, not too dominant)

check the 4-distinct-type cap creates real trade-off decisions

Priority 4

Permanent progression clarity

reinforce reason to come back

connect rewards to runs cleanly

These four priorities will shape the entire game.

6. Example Timeline (Recommended)

This is not fixed, but is a strong recommended order.

Near-term
balance runs
improve movement feel
define skill upgrade system
define chest card system
Mid-term
strengthen bestiary loop
refine equipment progression
add meaningful content variety
Later
charms
difficulty layers
more characters
event director
deeper retention systems
7. Roadmap Success Test

A roadmap phase is successful if it improves at least one of these:

run feel

build identity

progression clarity

replayability

retention

readability

product coherence

If a phase adds complexity but improves none of these, it should be questioned.

8. Final Rule

Kaezan: Arena should grow by reinforcing its identity, not by chasing generic feature lists.

The long-term goal is not:

“a game with many systems”

The long-term goal is:

a short-session arena game with memorable combat, strong build identity, meaningful progression, and excellent replayability

Every future phase should move closer to that.