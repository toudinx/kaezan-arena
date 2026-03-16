using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static int GenerateSeed(int battleIndex)
    {
        unchecked
        {
            return 0x5F3759DF + battleIndex * 7919;
        }
    }

    private static int GeneratePoiSeed(int battleSeed)
    {
        unchecked
        {
            return (battleSeed * 486187739) ^ 0x2C1B3C6D;
        }
    }

    private static int GenerateBestiarySeed(int battleSeed)
    {
        unchecked
        {
            return (battleSeed * 92821) ^ 0x41D2A7C3;
        }
    }

    private static int GenerateCritSeed(int battleSeed)
    {
        unchecked
        {
            return (battleSeed * 214013) ^ 0x1A2B3C4D;
        }
    }

    private static int ComputeChebyshevDistance(StoredActor actor, int centerX, int centerY)
    {
        var deltaX = Math.Abs(actor.TileX - centerX);
        var deltaY = Math.Abs(actor.TileY - centerY);
        return Math.Max(deltaX, deltaY);
    }

    private static int ComputeChebyshevDistance(int sourceX, int sourceY, int targetX, int targetY)
    {
        var deltaX = Math.Abs(sourceX - targetX);
        var deltaY = Math.Abs(sourceY - targetY);
        return Math.Max(deltaX, deltaY);
    }

    private static int ComputeManhattanDistance(int sourceX, int sourceY, int targetX, int targetY)
    {
        var deltaX = Math.Abs(sourceX - targetX);
        var deltaY = Math.Abs(sourceY - targetY);
        return deltaX + deltaY;
    }

    private static long GetElapsedMsForTick(int tick)
    {
        return (long)tick * StepDeltaMs;
    }

    private static double Lerp(double start, double end, double t)
    {
        var clampedT = Clamp01(t);
        return start + ((end - start) * clampedT);
    }

    private static double Clamp01(double value)
    {
        return Math.Clamp(value, 0d, 1d);
    }

    private static string NormalizeCommandType(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeSkillId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeChoiceId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string? NormalizeCardId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizePoiId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string? NormalizeDirection(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim().ToLowerInvariant();
        return normalized switch
        {
            "n" or "north" => ArenaConfig.FacingUp,
            ArenaConfig.FacingUp => ArenaConfig.FacingUp,
            "ne" or "north_east" or "northeast" or "up-right" or "up_right" => ArenaConfig.FacingUpRight,
            "e" or "east" => ArenaConfig.FacingRight,
            "se" or "south_east" or "southeast" or "down-right" or "down_right" => ArenaConfig.FacingDownRight,
            "s" or "south" => ArenaConfig.FacingDown,
            ArenaConfig.FacingDown => ArenaConfig.FacingDown,
            "sw" or "south_west" or "southwest" or "down-left" or "down_left" => ArenaConfig.FacingDownLeft,
            "w" or "west" => ArenaConfig.FacingLeft,
            ArenaConfig.FacingLeft => ArenaConfig.FacingLeft,
            ArenaConfig.FacingRight => ArenaConfig.FacingRight,
            "nw" or "north_west" or "northwest" or "up-left" or "up_left" => ArenaConfig.FacingUpLeft,
            _ => null
        };
    }

    private static bool IsInBounds(int tileX, int tileY)
    {
        return tileX >= 0 &&
               tileY >= 0 &&
               tileX < ArenaConfig.Width &&
               tileY < ArenaConfig.Height;
    }
}
