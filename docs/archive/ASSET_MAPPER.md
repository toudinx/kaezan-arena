# Asset Pack Mapper Tool

Use this helper to propose semantic asset mappings without editing `asset-pack.json` directly.

## Script

- `tools/assets/propose-asset-pack.mjs`

Default target pack:

- `frontend/src/assets/packs/arena_v1_0x72_bdragon`

Default output:

- `frontend/src/assets/packs/arena_v1_0x72_bdragon/asset-pack.proposed.json`

## Run

```powershell
node tools/assets/propose-asset-pack.mjs
```

If the output file already exists:

```powershell
node tools/assets/propose-asset-pack.mjs --force
```

## Manual Spritesheet Config

To mark specific files as spritesheets (instead of default `image`), create:

- `frontend/src/assets/packs/arena_v1_0x72_bdragon/asset-mapper.config.json`

You can start from:

- `tools/assets/asset-mapper.config.example.json`

Frame-size examples:

- tiles: `16x16`
- fx: `32x32`

The mapper only applies spritesheet frame metadata when config rules explicitly match files.

## Merge Strategy

1. Generate `asset-pack.proposed.json`.
2. Review `proposedAssets` semantic IDs and paths.
3. Copy selected entries into `asset-pack.json` under `assets`.
4. Add or update `maps` aliases (`tiles`, `sprites`, `fx`, `uiFrames`) as needed.
5. Keep engine/render code referencing semantic IDs only.
