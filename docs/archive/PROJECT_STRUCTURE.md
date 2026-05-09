This document explains how the Kaezan: Arena repository is organized, what each main folder is responsible for, and where new code should be added.

Its purpose is to help:

new developers understand the repo quickly

future AI/code assistants work with the correct context

avoid duplicated logic and misplaced files

keep the project scalable as new systems are added

1. Repository Overview

The project is split into two main parts:

backend/
frontend/

High-level rule:

backend owns all gameplay logic and simulation

frontend only renders snapshots and sends player commands

This is a backend-authoritative deterministic game.

2. Top-Level Layout

Example top-level structure:

/
├── backend/
├── frontend/
├── docs/
├── tools/                  (optional helper scripts / local utilities)
├── docker-compose.yml      (optional local infra/dev setup)
├── README.md
└── .gitignore
3. Backend Structure

Backend is written in C# / .NET.

Main solution:

backend/KaezanArena.sln

Expected project layout:

backend/
├── KaezanArena.sln
├── src/
│   ├── KaezanArena.Api/
│   ├── KaezanArena.Application/
│   ├── KaezanArena.Domain/
│   └── KaezanArena.Infrastructure/
└── tests/
    ├── KaezanArena.Api.Tests/
    └── KaezanArena.Application.Tests/
3.1 KaezanArena.Api

This is currently the main executable backend and contains most of the MVP gameplay logic.

Typical structure:

backend/src/KaezanArena.Api/
├── Program.cs
├── appsettings.json
├── Battle/
├── Controllers/
├── Contracts/
├── Account/
├── Items/
├── Bestiary/
└── Effects/
Responsibilities

expose REST API

host deterministic battle simulation

store in-memory battle/account state

map internal state to DTOs

act as integration point between systems

3.2 Battle/

This is the most important folder in the current MVP.

Typical contents:

Battle/
├── InMemoryBattleStore.cs
├── ArenaConfig.cs
├── BattleSnapshot.cs
├── ...
Responsibilities

battle lifecycle (StartBattle, StepBattle, ChooseCard)

tick progression

command processing

actor movement

combat resolution

enemy spawning

elite logic

card offering

chest / POI logic

scaling

deterministic RNG usage

Important rule

All gameplay/simulation logic belongs here unless a subsystem has been cleanly extracted.

Key files

InMemoryBattleStore.cs
Current simulation core.

ArenaConfig.cs
Core tuning values like run duration, grid size, tick interval.

BattleSnapshot.cs
Internal aggregate state used to build frontend DTOs.

3.3 Controllers/

Typical structure:

Controllers/
├── BattleV1Controller.cs
├── AccountV1Controller.cs
├── ItemsV1Controller.cs
├── BestiaryV1Controller.cs
├── EffectsV1Controller.cs
├── HealthController.cs
└── PingController.cs
Responsibilities

expose API endpoints

validate requests

delegate to services/stores

map internal results to response DTOs

Important rule

Controllers should not contain gameplay logic.
They should remain thin.

3.4 Contracts/

This folder contains DTOs used between backend and frontend.

Typical structure:

Contracts/
├── Battle/
├── Account/
├── Items/
├── Bestiary/
└── Effects/
Responsibilities

request DTOs

response DTOs

snapshot DTOs

event DTOs

command result DTOs

Important rule

Anything serialized over the API belongs here.

Do not leak internal simulation types directly to the frontend.

3.5 Account/

This area contains persistent-ish account and character logic for the MVP.

Typical contents:

Account/
├── InMemoryAccountStateStore.cs
├── AccountCatalog.cs
├── ...
Responsibilities

active character selection

character inventory

equipment state

account currencies

item ownership

drop awarding

character gear persistence between runs

Important rule

Run state must remain separate from account state.

3.6 Items/

Handles crafting/refine/salvage style systems.

Responsibilities

item definitions

item crafting/refining/salvaging

item rewards and upgrades

item economy rules

3.7 Bestiary/

Contains permanent progression logic tied to species.

Responsibilities

kill tracking by species

thresholds

species progression

species-related rewards

future charm hooks

3.8 Effects/

Used for special helper systems like AoE planning.

Example:

area projection

visual planning helpers

utility endpoints for the frontend

4. Backend Support Projects
4.1 KaezanArena.Application

This project should host extracted gameplay/application logic that is not API-specific.

Current / expected responsibilities:

pure gameplay helpers

reusable planners

stat calculators

shared business logic not tied to HTTP

Good candidates to move here over time:

damage calculators

scaling calculators

skill upgrade resolvers

card offer logic

replay validators

4.2 KaezanArena.Domain

This project represents long-term domain purity, but in the MVP it may still be thin.

Expected responsibilities:

core domain concepts

enums/value objects

domain-only abstractions

This can stay minimal until extraction becomes worth it.

4.3 KaezanArena.Infrastructure

Expected responsibilities:

persistence

external services

file storage

database adapters

telemetry sinks

This may remain light until the game needs real persistence beyond in-memory MVP state.

5. Backend Tests

Typical layout:

backend/tests/
├── KaezanArena.Api.Tests/
└── KaezanArena.Application.Tests/
5.1 KaezanArena.Api.Tests

Main test suite for the current MVP.

Important tests usually live here because simulation still resides mostly in the API project.

Typical responsibilities

determinism tests

controller endpoint tests

battle store behavior tests

replay/seed consistency tests

invariant tests

Important files

InMemoryBattleStoreDeterminismTests.cs

replay-related tests

movement regression tests

API endpoint integration tests

5.2 KaezanArena.Application.Tests

Used for pure helper/unit tests extracted from application logic.

Best place for:

planners

calculators

data transforms

balance helper tests

6. Frontend Structure

Frontend is written in Angular.

Typical layout:

frontend/
├── package.json
├── angular.json
├── tsconfig.json
└── src/
    ├── main.ts
    ├── styles.css
    └── app/
6.1 src/app/

Main Angular application folder.

Typical structure:

src/app/
├── app.routes.ts
├── api/
├── arena/
├── pages/
├── shared/
├── shell/
└── core/       (optional, depending on current repo state)
6.2 api/

This folder contains frontend API access and generated contracts.

Typical structure:

api/
├── battle-api.service.ts
├── account-api.service.ts
├── generated/
└── ...
Responsibilities

call backend endpoints

define typed request/response contracts

isolate HTTP code from UI components

Important rule

No page should manually handcraft HTTP calls if a service already exists here.

6.3 arena/

This folder contains arena-specific rendering and engine code.

Typical structure:

arena/
├── engine/
├── render/
├── assets/
├── ui/
└── ...
Responsibilities

visual scene state

canvas rendering

sprite/assets loading

rendering helpers

visual-only state transforms

Important rule

No gameplay logic should live here.

The arena frontend should only:

consume snapshots

render entities/effects

show UI state

collect input

6.4 pages/

Pages are route-level UI screens.

Typical structure:

pages/
├── arena/
├── home/
├── characters/
└── bestiary/

Each folder usually contains:

page-name/
├── page-name.component.ts
├── page-name.component.html
├── page-name.component.css
└── tests / specs
pages/arena/

This is the gameplay page.

Responsibilities

orchestrate start/step loop

capture input

open card choice modal

manage run state UI

show logs/analyzers

feed snapshots into renderer

record replay / run telemetry

Important files

arena-page.component.ts

arena-page.component.html

arena-page.component.css

Important rule

This page can orchestrate gameplay UI, but raw simulation rules must stay backend-side.

pages/home/

Main dashboard / hub page.

Responsibilities

active character summary

last run summary

shortcuts to Arena / Kaelis (including Bestiary tab)

account progression overview

pages/characters/

Kaelis parent page (character management + subviews).

Responsibilities

list characters

set active character

view character equipment

host Kaelis subviews/tabs (Overview / Loadout / Bestiary)

entry point to backpack / arena

pages/bestiary/

Bestiary subview component consumed inside Kaelis.

Responsibilities

species list

progression thresholds

craft/refine/salvage related UI

bestiary progression visibility scoped to the selected Kaelis context

6.5 shared/

Shared components and helpers reusable across multiple pages.

Typical structure:

shared/
├── backpack/
├── replay/
├── run-results/
└── ...
Responsibilities

reusable UI components

reusable view helpers

lightweight shared services

Important rule

If something is used in multiple pages, it should eventually live here instead of inside pages/arena.

shared/backpack/

Contains the shared backpack drawer and reusable inventory UI.

Responsibilities

open/close drawer

show inventory

show equipment summary

support equipping items from non-arena pages

shared/replay/

Contains replay import/export helpers.

Responsibilities

replay format definitions

validation

JSON import/export

clipboard/download helpers

shared/run-results/

Contains run telemetry logger or helpers related to exported run summaries.

Responsibilities

aggregate run metrics

serialize run results

localStorage persistence

copy/export support

6.6 shell/

Contains AppShell and global non-arena layout.

Typical contents:

shell/
└── app-shell.component.*
Responsibilities

top navigation

global backpack entry

layout wrapper for non-arena routes

Important rule

Arena can remain shell-less/full-screen to preserve gameplay focus.

7. Docs Structure

Recommended docs folder:

docs/
├── KA EZAN_ARENA_GDD_TDD.md
├── CONTENT_PIPELINE.md
├── BALANCING_GUIDE.md
├── PROJECT_STRUCTURE.md
├── DETERMINISM.md
├── DESIGN_PRINCIPLES.md
├── FUTURE_ROADMAP.md
└── AI_CONTEXT.md

Each file has a distinct purpose:

GDD/TDD → full design + tech overview

CONTENT_PIPELINE → how to add content safely

BALANCING_GUIDE → balancing philosophy and targets

PROJECT_STRUCTURE → repo map and ownership

DETERMINISM → simulation safety rules

DESIGN_PRINCIPLES → preserve game identity

FUTURE_ROADMAP → phased development

AI_CONTEXT → compact promptable project context

8. Where New Code Should Go

This is one of the most important sections.

8.1 New gameplay rule

Examples:

enemy buff logic

chest behavior

skill resolution

combat rule

run progression rule

Put it in:

backend/src/KaezanArena.Api/Battle/

Or extract to Application/ if already modular enough.

8.2 New API endpoint

Examples:

new battle route

new account action

new bestiary route

Put it in:

backend/src/KaezanArena.Api/Controllers/

And corresponding DTOs in:

backend/src/KaezanArena.Api/Contracts/
8.3 New snapshot/request/response DTO

Put it in:

backend/src/KaezanArena.Api/Contracts/
8.4 New inventory / account behavior

Put it in:

backend/src/KaezanArena.Api/Account/
8.5 New page

Put it in:

frontend/src/app/pages/<page-name>/
8.6 New shared reusable component

Put it in:

frontend/src/app/shared/
8.7 New arena renderer visual helper

Put it in:

frontend/src/app/arena/
8.8 New frontend API call

Put it in:

frontend/src/app/api/
8.9 New test

Put tests near the system they validate.

Examples:

backend simulation test → backend/tests/KaezanArena.Api.Tests/

pure helper test → backend/tests/KaezanArena.Application.Tests/

page behavior test → alongside frontend page/component specs

9. Ownership Rules

These rules are critical.

Backend owns

combat logic

movement validation

collisions

RNG

enemy AI

chest/card offer generation

damage calculation

XP and run level logic

replay correctness

Frontend owns

rendering

UI state

keyboard/mouse input

opening modals

local developer telemetry

replay export/import UI

run result export UI

Frontend must not own

damage formulas

movement legality

enemy behavior

RNG outcomes

card offer generation

drop generation

10. Current Architectural Reality

The long-term architecture aims for clean separation, but today the MVP still concentrates a lot of logic in:

backend/src/KaezanArena.Api/Battle/InMemoryBattleStore.cs

That is acceptable for the MVP, as long as:

behavior remains deterministic

changes stay incremental

refactors are done safely

Do not force premature abstractions.

11. Safe Refactor Strategy

When extracting large files/systems, follow this order:

extract pure helpers

extract calculators

extract DTO mappers

extract subsystems with minimal behavior change

rerun determinism tests after every step

Never combine:

behavior changes

major folder moves

new features

architecture rewrites

in the same patch unless absolutely necessary.

12. Recommended Mental Model

Think of the repo as four layers:

1. Simulation Layer
   backend/Battle

2. API Layer
   backend/Controllers + Contracts

3. Product/UI Layer
   frontend/pages + shell + shared

4. Renderer Layer
   frontend/arena

This mental model helps decide where code belongs.

13. Practical Example

Example: adding a new chest card.

Backend

add card definition / effect resolution in battle logic

ensure card offer system can produce it

expose chosen card in snapshot/events if needed

Frontend

render card in chest choice modal

show its description

maybe include in run summary

Docs

add card to content pipeline / balancing notes

14. Final Rule

Before creating a new file or changing an existing one, ask:

Is this gameplay logic, API contract, page UI, shared UI, or rendering code?

That answer should determine where it belongs.

If the answer is unclear, the safest default is:

gameplay → backend

visual-only → frontend

reusable UI → shared

route screen → pages
