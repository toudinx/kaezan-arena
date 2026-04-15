# Kaezan: Arena

**Kaezan: Arena** is a short-session deterministic arena combat game inspired by Tibia.

## Core Pitch

> **Tibia for adults without time sinks.**

The game focuses on:

- short runs (~3 minutes)
- tactical micro-positioning
- backend-authoritative deterministic combat
- progressive chaos
- permanent progression outside runs
- replayable build variation inside runs

This project combines ideas from:

- **Tibia** → grid combat, spacing, target priority, controlled chaos
- **Hades** → run identity and build experimentation
- **League of Legends** → skill leveling / skill upgrade decisions
- **Vampire Survivors** → escalating arena pressure and satisfying chaos

---

# Project Status

Kaezan: Arena is currently in the **playable MVP foundation** stage.

The project already has:

- deterministic backend battle loop
- 7x7 arena combat
- enemy spawning and elite systems
- inventory / equipment support
- characters page
- bestiary page
- home page
- replay import/export
- movement reliability improvements
- configurable simulation tick
- simulation invariants
- structured run telemetry

The project is no longer just a combat baseline.  
It now has a real game/product structure and is entering the phase of:

> **balance, build identity, progression clarity, and long-term replayability**

---

# Vision

Kaezan: Arena should feel like:

- **short**
- **readable**
- **chaotic**
- **tactical**
- **progressive**
- **replayable**

A good run should create moments like:

- “I almost died, but survived.”
- “This chest changed the whole run.”
- “This build became insane.”
- “I should have positioned better.”

The game should **not** become:

- a giant MMO-like grind
- a high-APM action game
- a map-wandering dungeon crawler
- a fully idle game with no meaningful decisions

---

# Core Design Principles

## 1. Short sessions are sacred
Runs should stay around **3 minutes**.

## 2. Positioning must matter
The soul of the game is **micro-positioning inside a 7x7 arena**.

## 3. 7x7 is a feature, not a limitation
The arena should feel dense, sharp, and tactical.

## 4. Calm → Pressure → Chaos
Runs should escalate naturally instead of starting at maximum intensity.

## 5. Low APM, high decision quality
The game should reward:
- positioning
- prioritization
- build choices
- risk/reward decisions

Not:
- button spam
- constant micromanagement
- reflex-heavy play

## 6. Mechanics over raw numbers
Prefer changes that create new gameplay behavior over simple stat inflation.

## 7. Meaningful choices over fake choices
Cards, upgrades, and progression decisions must create real trade-offs.

---

# Gameplay Overview

## Arena
- Fixed **7x7** combat grid
- **1 entity per tile**
- 8-direction movement
- Tibia-style diagonal corner blocking
- Chebyshev distance for melee interactions

## Runs
- Runs last about **180 seconds**
- The player enters the arena, fights waves, interacts with chests, and builds power during the run
- The run should start calmer and ramp into satisfying chaos

## Combat
- Shield is consumed before HP
- Backend resolves all combat
- Frontend only renders snapshots and sends commands

## Enemies
- Mobs spawn progressively over the run
- Elites create priority targets and pressure
- Arena pacing is controlled through deterministic spawn logic

---

# Build Structure

Kaezan: Arena uses layered progression.

## During the run
### Run Level
Run levels should mainly drive **skill upgrades / skill variations**.

This is intended to define the core identity of the run.

Example direction:
- Exori damage path
- Exori cooldown path
- Avalanche control/freeze path

### Chests
Chests provide **1-of-3 card choices**.

Cards should act as:
- global run modifiers
- strong situational build enhancers
- risk/reward moments

Cards should complement skills, not replace them.

## Outside the run
### Character progression
Characters persist between runs.

### Equipment
Persistent gear:
- weapon
- armor
- relic

### Bestiary
Permanent species progression tied to kills and future unlocks.

### Currency
Account-wide currency:
- **Echo Fragments**
- PT-BR: **Fragmentos de Eco**

---

# Technical Pillars

## Backend authoritative
The backend is the source of truth for all gameplay.

## Deterministic simulation
Same:
- battle seed
- starting state
- commands
- tick sequence

must always produce the same outcome.

## Snapshot-based frontend
Frontend:
- renders snapshots
- captures inputs
- never simulates gameplay logic

## Replayable runs
Runs can be exported/imported and replayed deterministically.

## Telemetry-driven balancing
Run result logs exist to support real balancing instead of guesswork.

---

# High-Level Architecture

## Backend
- C#
- .NET
- battle simulation
- account state
- deterministic RNG
- controllers / DTO contracts

## Frontend
- Angular
- arena renderer
- pages outside the arena
- shared backpack / replay / telemetry helpers

## Main flow

`StartBattle -> StepBattle -> Apply Commands -> Advance Simulation -> Emit Snapshot -> Render`

---

# Repository Structure

## Top level

```text
/
├── backend/
├── frontend/
├── docs/
├── tools/
├── README.md
└── .gitignore
Backend
backend/
├── KaezanArena.sln
├── src/
│   ├── KaezanArena.Api/
│   ├── KaezanArena.Application/
│   ├── KaezanArena.Domain/
│   └── KaezanArena.Infrastructure/
└── tests/
Frontend
frontend/
└── src/
    └── app/
        ├── api/
        ├── arena/
        ├── pages/
        ├── shared/
        └── shell/

For the full structural guide, see:

docs/PROJECT_STRUCTURE.md

Documentation Map

This README is the entry point, not the only source of truth.

Detailed project documentation lives in docs/.

Core docs

docs/KAEZAN_ARENA_GDD_TDD.md → full game design + technical design

docs/CONTENT_PIPELINE.md → how to add mobs, skills, cards, characters, events

docs/BALANCING_GUIDE.md → balancing philosophy and targets

docs/PROJECT_STRUCTURE.md → where code belongs

docs/DETERMINISM.md → simulation safety rules

docs/DESIGN_PRINCIPLES.md → identity guardrails

docs/FUTURE_ROADMAP.md → long-term phased roadmap

docs/AI_CONTEXT.md → compact context for AI/Codex/new chats

Current Priorities

At the current stage, the main priorities are:

movement feel / responsiveness

combat baseline balance

run pacing

skill-upgrade design

card role clarity

permanent progression loop clarity

The current balance is not final.
The project is in the phase of:

instrument → test runs → collect data → iterate

Recommended Development Order
Near term

balance the base arena experience

improve movement feel

define skill upgrade structure

define chest card role

use telemetry to guide tuning

Mid term

strengthen permanent progression loop

deepen bestiary relevance

expand character identity

increase content variety

Later

future charms

difficulty layers

more characters

arena events and advanced “arena life” systems

deeper retention systems

Development Rules
1. Prefer incremental safe changes

Avoid giant mixed patches.

2. Keep gameplay logic in the backend

Do not patch gameplay rules in the frontend.

3. Protect determinism

If replay breaks, treat it as a critical issue.

4. Keep the 7x7 identity intact

Do not add systems that dilute positional combat without a strong reason.

5. Build depth through interaction, not feature bloat

New systems must solve a real design problem.

How to Work With AI / Codex

When using AI or Codex for this project:

Start by pointing it to:

README.md

docs/AI_CONTEXT.md

docs/PROJECT_STRUCTURE.md

For gameplay/system work, also include:

docs/DETERMINISM.md

docs/DESIGN_PRINCIPLES.md

docs/BALANCING_GUIDE.md

Prefer small, numbered prompts

Avoid asking for giant refactors unless necessary

Require changed-files summary and verify commands after each implementation prompt

Documentation Is Living

This documentation is not static.

It must evolve with the project.

Rule of thumb

If a PR changes any of these, update the docs in the same PR:

game rules

progression structure

architecture ownership

repo structure

balancing philosophy

build systems

AI workflow assumptions

Minimum expectation

Every meaningful change should update at least one of:

README.md

relevant file in docs/

Practical guideline

README = project entry point

docs = deeper source of truth

code = implementation truth

replay/telemetry = reality check

If docs drift away from the game, the project becomes harder to maintain and harder to continue with AI support.

Final Project Goal

Kaezan: Arena should become:

a short-session arena game with memorable combat, strong build identity, meaningful progression, and excellent replayability

If a feature helps that, it probably belongs.
If it weakens that, it probably should wait.
