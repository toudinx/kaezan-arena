namespace KaezanArena.Api.Battle;

public static class ArenaConfig
{
    public const int DefaultStepDeltaMs = 250;
    public const int MinStepDeltaMs = 50;
    public const int MaxStepDeltaMs = 2000;
    public const int Width = 7;
    public const int Height = 7;
    public const int PlayerTileX = 3;
    public const int PlayerTileY = 3;
    public const int MaxAliveMobs = 10;
    public const long RunDurationMs = 180_000;
    public const long RunMidgameTargetMs = RunDurationMs / 2;

    public static int NormalizeStepDeltaMs(int? configuredStepDeltaMs)
    {
        if (!configuredStepDeltaMs.HasValue)
        {
            return DefaultStepDeltaMs;
        }

        return Math.Clamp(configuredStepDeltaMs.Value, MinStepDeltaMs, MaxStepDeltaMs);
    }
}
