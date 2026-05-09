# Third-Party Assets

## Important

Do not redistribute third-party asset archives or extracted files until license terms are verified and explicitly permit redistribution.

## Uploaded Archives in This Environment

1. `/mnt/data/0x72_DungeonTilesetII_v1.7.zip`
2. `/mnt/data/60 Retro Effect 32x32 Pack 1 Free.rar`
3. `/mnt/data/Super Package Retro Pixel Effects 32x32 pack 2 Free.rar`
4. `/mnt/data/Pixel UI pack 3.zip`
5. `/mnt/data/RPG Effect All Free` (already extracted folder)

## Extraction Output (Current)

Pack root:

- `frontend/src/assets/packs/arena_v1_0x72_bdragon/`

Environment note:

- If `/mnt/data` is not directly mounted (common in Windows sessions), use the mirrored workspace path `mnt/data/`.

Organized folders:

- `tiles/` from `0x72_DungeonTilesetII_v1.7.zip` tile/atlas files
- `sprites/` from `0x72_DungeonTilesetII_v1.7.zip` frame files
- `fx/retro_fx_pack1/` from `60 Retro Effect 32x32 Pack 1 Free.rar`
- `fx/retro_fx_pack2/` from `Super Package Retro Pixel Effects 32x32 pack 2 Free.rar`
- `fx/rpg_effect_all_free/` copied from extracted `RPG Effect All Free/` folder
- `ui/pixel_ui_pack_3/` from `Pixel UI pack 3.zip`
- `raw/` with copied original extracted folder structures

Current default semantic combat FX (`fx.hit.small`, `fx.skill.exori`, `fx.skill.exori_min`, `fx.skill.exori_mas`) now resolve to the RPG Effect pack.
The retro FX packs remain in-repo for fallback/testing only.

## Re-Extract Commands

Linux/macOS (from repo root):

```bash
PACK=frontend/src/assets/packs/arena_v1_0x72_bdragon
mkdir -p "$PACK/raw/0x72" "$PACK/raw/fx1" "$PACK/raw/fx2" "$PACK/raw/ui"

unzip -o "/mnt/data/0x72_DungeonTilesetII_v1.7.zip" -d "$PACK/raw/0x72"
unzip -o "/mnt/data/Pixel UI pack 3.zip" -d "$PACK/raw/ui"

unrar x -o+ "/mnt/data/60 Retro Effect 32x32 Pack 1 Free.rar" "$PACK/raw/fx1/"
unrar x -o+ "/mnt/data/Super Package Retro Pixel Effects 32x32 pack 2 Free.rar" "$PACK/raw/fx2/"
cp -R "/mnt/data/RPG Effect All Free" "$PACK/fx/rpg_effect_all_free"
```

Windows PowerShell (from repo root):

```powershell
$pack = "frontend/src/assets/packs/arena_v1_0x72_bdragon"
New-Item -ItemType Directory -Force -Path "$pack/raw/0x72","$pack/raw/fx1","$pack/raw/fx2","$pack/raw/ui" | Out-Null

Expand-Archive -Path "/mnt/data/0x72_DungeonTilesetII_v1.7.zip" -DestinationPath "$pack/raw/0x72" -Force
Expand-Archive -Path "/mnt/data/Pixel UI pack 3.zip" -DestinationPath "$pack/raw/ui" -Force

unrar x -o+ "/mnt/data/60 Retro Effect 32x32 Pack 1 Free.rar" "$pack/raw/fx1/"
unrar x -o+ "/mnt/data/Super Package Retro Pixel Effects 32x32 pack 2 Free.rar" "$pack/raw/fx2/"
Copy-Item -Path "C:\\AI PROJECT\\kaezan-arena\\mnt\\data\\RPG Effect All Free\\*" -Destination "$pack/fx/rpg_effect_all_free" -Recurse -Force
```

If `unrar` is unavailable:

1. Install it (`sudo apt-get install unrar` on Debian/Ubuntu, or equivalent).
2. Or use `7z` fallback:

```bash
7z x "/mnt/data/60 Retro Effect 32x32 Pack 1 Free.rar" -o"$PACK/raw/fx1" -y
7z x "/mnt/data/Super Package Retro Pixel Effects 32x32 pack 2 Free.rar" -o"$PACK/raw/fx2" -y
```

## License Summary Placeholders

| Archive | Source URL | License Type | Redistribution Allowed | Notes |
|---|---|---|---|---|
| 0x72_DungeonTilesetII_v1.7.zip | TODO | TODO | TODO | Confirm exact attribution/commercial terms. |
| 60 Retro Effect 32x32 Pack 1 Free.rar | TODO | TODO | TODO | "Free" label is not enough; check full text. |
| Super Package Retro Pixel Effects 32x32 pack 2 Free.rar | TODO | TODO | TODO | Verify if pack includes non-redistributable content. |
| Pixel UI pack 3.zip | TODO | TODO | TODO | Confirm if modified redistribution is allowed. |
| RPG Effect All Free | TODO | TODO | TODO | Confirm attribution/commercial/redistribution terms before shipping. |
