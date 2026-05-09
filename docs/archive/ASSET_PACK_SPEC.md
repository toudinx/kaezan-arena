# Asset Pack Strategy

## Goal

Ensure gameplay logic is stable even if files, folders, or full visual packs are replaced.

## Manifest Contract

Each pack ships an `asset-pack.json` with:

- `packId`: unique pack identifier
- `version`: pack version
- `baseUrl`: base folder URL for this pack
- `assets`: map of semantic ID to relative path + metadata

Example:

```json
{
  "packId": "kaezan-core-v1",
  "version": "1.0.0",
  "baseUrl": "/assets/packs/core",
  "assets": {
    "tile.floor.default": { "path": "tiles/floor_default.png", "kind": "image" },
    "fx.hit.small": { "path": "fx/hit_small.png", "kind": "image" },
    "ui.hp.frame": { "path": "ui/hp_frame.png", "kind": "image" }
  }
}
```

## Resolver Rule

Only `AssetResolver` and `AssetPreloader` may read `path` values from manifests.

- Engine/render/UI modules receive semantic IDs only.
- No direct references to `/assets/...` outside resolver/preloader.

## Pack Replacement

To swap visuals:

1. Add or update a manifest.
2. Keep semantic IDs stable.
3. Avoid changing gameplay code.

