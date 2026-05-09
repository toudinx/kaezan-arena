# Architecture

## Backend Layers

Projects:

1. `KaezanArena.Domain`
2. `KaezanArena.Application`
3. `KaezanArena.Infrastructure`
4. `KaezanArena.Api`

Dependency rules:

- `Domain` depends on nothing.
- `Application` depends only on `Domain`.
- `Infrastructure` depends on `Application` and `Domain`.
- `Api` depends on `Application` and `Infrastructure`.
- Circular references are not allowed.

## Frontend Arena Architecture

Arena folders:

- `frontend/src/app/arena/engine` for pure engine logic (no Angular imports)
- `frontend/src/app/arena/render` for canvas rendering pipeline
- `frontend/src/app/arena/assets` for manifests, resolver, preloader
- `frontend/src/app/arena/ui` for skinable UI widgets

## Asset Pack Strategy

- Gameplay code must use semantic IDs (`tile.floor.default`, `fx.hit.small`, `ui.hp.frame`).
- Concrete file paths belong only to asset resolver/preloader modules.
- Asset packs are declared through `asset-pack.json` manifests.

## AoE FX Rule

- Tibia mode: area effects spawn one FX per tile (sqm).
- API provides `/api/v1/effects/aoe-plan` to compute deterministic tile plans for server-driven AoE.
- Frontend engine applies FX from a plan regardless of source (backend plan or local fallback planner).
