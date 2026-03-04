namespace KaezanArena.Api.Battle;

public static class ArenaConfig
{
    public const int Width = 7;
    public const int Height = 7;
    public const int PlayerTileX = 3;
    public const int PlayerTileY = 3;
    public const int MaxAliveMobs = 10;
    public const long RunDurationMs = 180_000;
    public const long RunMidgameTargetMs = RunDurationMs / 2;
}
