# Kaezan Arena Monorepo

Long-term repository for Kaezan Arena with backend, frontend, docs, and tooling.

## Structure

- `backend/` ASP.NET Core + Clean Architecture project layout
- `frontend/` Angular workspace with Home and Arena pages
- `docs/` architecture and asset/license documentation
- `tools/` helper scripts for asset and project workflows

## Prerequisites

- .NET SDK 8+
- Node.js 22+
- npm 10+
- Docker Desktop (for future compose flow)

## Run Backend

```powershell
cd backend/src/KaezanArena.Api
dotnet run --launch-profile https
```

This profile exposes both:
- `https://localhost:7174`
- `http://localhost:5168`

Health check:

```text
GET http://localhost:5168/health
```

OpenAPI (used for frontend client generation):

```text
http://localhost:5168/swagger/v1/swagger.json
```

Account state persistence (backend):
- Account state is persisted to JSON files on disk.
- Default storage directory: `backend/src/KaezanArena.Api/.data/accounts` (relative to the API content root).
- Configure a custom directory with `AccountState:StorageDirectory` in configuration/environment variables.
- If the directory or files are missing, backend starts safely and seeds accounts in memory as before.

## Run Frontend

```powershell
cd frontend
npm install
npm run api:generate
npm run start
```

Frontend includes routing (`/`, `/arena`), Tailwind setup, and Arena module boundaries (`assets`, `engine`, `render`, `ui`).
If you change `frontend/proxy.conf.json`, restart the frontend dev server (`npm run start`) so proxy updates take effect.
The frontend dev proxy forwards `/api/*` to `https://localhost:7174` (self-signed cert allowed via `secure: false` in dev proxy config).

`api:generate` requires backend running. The generator script first checks `OPENAPI_URL` (if set), then defaults to `http://localhost:5168/swagger/v1/swagger.json`.

Generator choice: `openapi-typescript` + `openapi-fetch` for a lightweight, framework-agnostic, type-safe client with minimal lock-in. Generated code is isolated under `frontend/src/app/api/generated`.

## Future Docker Compose Flow

```powershell
docker compose up --build
```

Current `docker-compose.yml` is a development skeleton with backend (`5080`) and frontend (`4200`) services.

## Current Gameplay

- Player is fixed at the center tile (3,3) — no WASD movement
- All weapons fire automatically via the assist system — no manual casting
- Each character has a **fixed 3-slot weapon kit** + **1 free slot (rune slot)**
  - Kina / Velvet kit: Exori Min + Exori + Exori Mas (fixed)
  - Free slot (`StoredBattle.FreeSlotWeaponId`) starts **null** every run — filled by the future rune system
  - Assist order: ExoriMas → Exori → ExoriMin → [free slot weapon if set]
- Avalanche is **not** auto-cast from the fixed kit; it re-enters the assist once the rune system assigns it to the free slot
- Heal and Guard removed from kit — survivability comes from passive cards only
- **Left-click** a POI (chest, altar) to interact
- **Right-click** a mob to lock it as the priority target
- Level-up card choices offer passive cards (skill upgrade cards postponed)
- Chest card choices offer passive cards only (max 4 distinct types, max 3 stacks per type)
- All simulation constants are in `backend/src/KaezanArena.Api/Battle/ArenaConfig.cs`

## Stable ID System

All weapon, character, and species IDs are defined as named constants in `backend/src/KaezanArena.Api/Battle/ArenaConfig.cs`:

- `ArenaConfig.WeaponIds` — stable weapon/skill IDs (e.g. `WeaponIds.ExoriMin = "weapon:exori_min"`)
- `ArenaConfig.CharacterIds` — stable character IDs (e.g. `CharacterIds.Kina = "character:kina"`)
- `ArenaConfig.SpeciesIds` — mob species ID strings used in snapshots and the account bestiary

`ArenaConfig.DisplayNames` is the **single source of truth** for all entity display names, keyed by the stable IDs above. No display name strings should appear anywhere else in the codebase.

The `SkillStateDto` carries a `displayName` field (populated server-side) so Angular components never need their own name mappings.

## Code Style

- Follow `.editorconfig` at repository root.
- Keep backend layering strict: `Domain <- Application <- Infrastructure <- Api`.
- Keep frontend arena boundaries strict: `engine`, `render`, `assets`, `ui`.
- Use semantic asset IDs; only resolver/preloader modules should map to concrete file paths.

## Asset Mapping Helper

Use the semi-automatic mapper to propose semantic IDs from extracted pack files:

```powershell
node tools/assets/propose-asset-pack.mjs
```

Details (manual spritesheet config + merge flow): `docs/ASSET_MAPPER.md`.
