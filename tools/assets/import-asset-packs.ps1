param(
    [Parameter(Mandatory = $true)]
    [string]$DestinationRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$archives = @(
    "/mnt/data/0x72_DungeonTilesetII_v1.7.zip",
    "/mnt/data/60 Retro Effect 32x32 Pack 1 Free.rar",
    "/mnt/data/Super Package Retro Pixel Effects 32x32 pack 2 Free.rar",
    "/mnt/data/Pixel UI pack 3.zip"
)

Write-Host "Destination: $DestinationRoot"
Write-Host "Archives to process:"
$archives | ForEach-Object { Write-Host " - $_" }

Write-Host ""
Write-Host "Policy checks:"
Write-Host " - Validate source URL and license before copying files."
Write-Host " - Import only redistributable assets."
Write-Host " - Map imported files to semantic IDs in asset-pack.json manifests."
Write-Host ""
Write-Host "Extraction is intentionally manual in this script to force license verification."
