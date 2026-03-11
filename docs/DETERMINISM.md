This document defines what determinism means in Kaezan: Arena, why it matters, what rules must never be broken, and how future changes should be validated.

This is one of the most important technical documents in the project.

1. Why Determinism Matters

Kaezan: Arena is a backend-authoritative deterministic arena game.

That means:

the backend is the source of truth

combat outcomes must be reproducible

the frontend never decides gameplay results

the same battle seed + same command sequence must always produce the same outcome

Determinism is important because it enables:

replay reproducibility
debugging
balance testing
safe refactors
trustworthy combat behavior

Without determinism, the game becomes much harder to test, debug, and scale.

2. Determinism Definition

A battle is deterministic if:

Given the same initial battle state, the same seed, and the same sequence of commands at the same ticks, the simulation always produces the same snapshots and outcomes.

This includes:

enemy spawns

damage rolls

elite spawns

card offers

chest behavior

movement blocking

status application

run end state

3. Core Deterministic Contract

The game must respect this contract:

StartBattle(seed, initialState)
+
StepBattle(commands at tick N)
=
same resulting state every time

If that is not true, something broke determinism.

4. What Must Be Deterministic

The following systems must always be deterministic.

4.1 Battle Start

Battle initialization must be deterministic with respect to:

battle seed

selected character / loadout

configured arena settings

start options

This includes:

initial actor state

initial RNG state

initial spawn setup

initial POI state if any

4.2 Tick Progression

Each step must:

advance time in a stable way

use the configured tick interval consistently

produce the same results for the same inputs

Formula:

nowMs = tick * stepDeltaMs

This relationship must always hold.

4.3 Enemy Spawns

Enemy spawn timing and spawn type must be deterministic.

This includes:

spawn rate decisions

elite decisions

species selection

position selection

If spawn randomness is involved, it must always come from deterministic RNG tied to the battle seed.

4.4 Damage Resolution

All combat outcomes must be deterministic:

damage amount

crits

life leech

reflect

shield vs HP ordering

death resolution

No external timing or frontend state may affect results.

4.5 Card Offers

When a chest or other card choice appears, the offer list must be deterministic.

The same run state and seed must always generate the same 3-card offer set.

Card ordering must also be deterministic.

4.6 Movement Validation

Movement legality must be deterministic:

bounds

occupied tile checks

corner blocking

move cooldown

accepted/blocked result reason

Movement cannot depend on client frame rate or input timing outside the recorded step/command timeline.

4.7 Replay

Replay mode must be fully deterministic.

A replay must reproduce:

actor states

enemy count

kills

cards chosen

end reason

run duration

important snapshot fields

If replay diverges from original run, determinism is broken.

5. What Must NOT Affect Determinism

The following must never affect battle results.

5.1 Frontend Rendering

Rendering speed, FPS, animation timing, interpolation, or canvas behavior must never influence combat outcomes.

Frontend may only:

render snapshots

collect player input

show UI state

Frontend must not:

predict combat

resolve damage

decide movement legality

simulate enemy logic

5.2 Real-World Time

Real clock time must not influence simulation results.

Examples of forbidden sources:

DateTime.Now

Date.now()

wall-clock-based random behavior

request duration affecting combat outcomes

Simulation time must come from:

tick count

configured step interval

5.3 Non-Deterministic Collection Ordering

Simulation logic must not rely on unstable iteration order.

Dangerous examples:

unordered dictionary traversal

hash-based collection order

platform-dependent ordering

If iteration order matters for gameplay decisions, inputs must be explicitly sorted.

5.4 Machine-Specific State

Battle results must not depend on:

local machine id

environment timing

current OS state

frontend device performance

different browser speeds

6. RNG Rules

Randomness is allowed only if it is deterministic.

6.1 Battle Seed

Each battle has a seed:

battleSeed

All gameplay randomness must derive from this seed.

6.2 RNG Ownership

RNG usage belongs to the backend simulation only.

Frontend must not generate gameplay randomness.

6.3 RNG Consumption Stability

One of the most important determinism rules:

The same battle must consume RNG in the same order every time.

This means:

do not add conditional extra RNG calls casually

do not iterate unsorted collections before random choice

do not add debug-only RNG usage in gameplay code

Even harmless-looking changes can break replays if RNG call order changes.

6.4 Separate RNG Streams

If the code uses separate RNG streams for:

combat

POIs

crits

bestiary

other systems

they must remain stable and clearly owned.

Do not casually mix responsibilities between RNG streams.

7. Command Rules

Commands are the only player-driven inputs into the simulation.

7.1 Commands Must Be Explicit

Examples:

move

target

interact

choose card

trigger skill

Each command must be:

serializable

replayable

applied in a deterministic step order

7.2 Step-Time Matters

The same command at different ticks may produce different outcomes.

So determinism requires:

same command

same tick

same sequence

7.3 Client Must Not Hide Inputs

The client may buffer input for UX, but the actual simulation must only depend on the commands sent to the backend.

Replay should reconstruct from the sent commands, not from raw key state history unless that key state is itself formalized.

8. Invariants

Invariants are rules that should always hold during simulation.

Examples:

all actors are inside the grid
no two actors share the same tile
hp >= 0
shield >= 0
hp <= maxHp
nowMs == tick * stepDeltaMs
paused/card-choice state does not advance tick

Invariant violations are strong indicators of broken simulation state.

In debug/test environments, they should throw immediately.

9. Safe Change Rules

Whenever changing gameplay code, follow these rules.

9.1 Small Changes First

Avoid combining:

new features

refactors

balance changes

RNG changes

in one large patch.

Determinism bugs become much harder to track when many changes are mixed.

9.2 Preserve Order

If gameplay behavior depends on a list of actors, POIs, cards, or spawn slots:

keep ordering stable

sort when needed

document why ordering matters

9.3 Avoid Hidden Time Dependencies

Do not use:

real-time delays

async timing for gameplay decisions

animation completion as a gameplay trigger

All gameplay must flow from tick-based state.

9.4 Avoid Frontend “Fixes” for Backend Logic

If combat feels wrong, fix the backend logic.

Do not patch gameplay behavior in the frontend renderer.

Frontend-only fixes are acceptable only for:

visuals

logs

UI feedback

debug overlays

10. Testing Determinism

Determinism is not a belief. It must be tested.

10.1 Core Determinism Test

The main deterministic test pattern is:

Start same battle seed
Apply same command sequence
Compare resulting snapshots or snapshot hashes

These should match exactly.

10.2 Replay Validation

Replay tests should verify:

imported replay reproduces same run

no account/economy mutation occurs during replay

important outcomes remain identical

10.3 Invariant Validation

Invariant checks should run in:

debug builds

test runs

battle step validation

10.4 Regression Tests

Whenever a determinism bug is found, add a regression test.

Especially for:

movement

chest/card pauses

RNG changes

spawn logic

elite logic

11. Signs Determinism May Be Broken

Common warning signs:

replay diverges from original run
same seed produces different enemy waves
movement sometimes resolves differently on identical inputs
card offers differ between repeated test runs
one machine reproduces a bug but another cannot
snapshot hashes drift over time

If any of these happen, treat it as a determinism investigation first.

12. Common Determinism Failure Patterns
12.1 Unstable Iteration

Example:

iterating a dictionary of actors and picking the “first” valid target

Problem:

order may differ across runs/platforms

Fix:

sort by stable key first

12.2 Extra RNG Call Added

Example:

new optional visual debug feature calls RNG during gameplay logic

Problem:

all future RNG outcomes shift

Fix:

never use gameplay RNG for debug-only operations

12.3 Real-Time Dependency

Example:

using elapsed wall time instead of tick-derived time

Problem:

results vary with request timing or performance

Fix:

derive everything from tick and stepDeltaMs

12.4 Frontend Prediction

Example:

frontend tries to “feel better” by moving actor optimistically

Problem:

visual state drifts from authoritative simulation

Fix:

only interpolate visuals between authoritative snapshots

13. Determinism and Balance

Determinism is critical for balancing because it lets the team:

replay exact runs

compare tweaks against known seeds

test changes on fixed scenarios

reason about cause/effect confidently

Without determinism, balance work becomes guesswork.

14. Determinism and Scale

Determinism also helps future scale because:

battles become reproducible units

debugging production issues becomes easier

server-side validation remains simple

replay/debug tooling becomes powerful

Even if the transport layer changes later (HTTP → WebSocket, batch steps, etc.), the simulation core should remain deterministic.

15. Final Rules

These rules should never be forgotten:

Backend owns gameplay truth

Frontend never simulates combat

All gameplay randomness comes from battle seed

Tick/time must be derived, not observed

Stable ordering matters

Replay is the truth test

If replay breaks, determinism broke

If determinism breaks, treat it as a critical issue

16. Practical Checklist Before Merging Gameplay Changes

Before merging any gameplay-related change, ask:

Does this change introduce new RNG usage?

Does this change alter iteration order?

Does this change depend on wall-clock time?

Does this change affect replay?

Does this change need a new determinism regression test?

Does this change belong in backend instead of frontend?

If any answer is unclear, stop and validate before merging.