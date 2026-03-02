namespace KaezanArena.Api.Battle;

public static class MobShapePlanner
{
    private const string FacingUp = "up";
    private const string FacingDown = "down";
    private const string FacingLeft = "left";
    private const string FacingRight = "right";

    public static IReadOnlyList<(int TileX, int TileY)> BuildForwardLineTiles(
        int originX,
        int originY,
        string facingDirection,
        int length)
    {
        var tiles = new List<(int TileX, int TileY)>();
        var safeLength = Math.Max(0, length);
        var normalizedFacing = NormalizeDirection(facingDirection) ?? FacingUp;
        for (var step = 1; step <= safeLength; step += 1)
        {
            var offset = normalizedFacing switch
            {
                FacingUp => (OffsetX: 0, OffsetY: -step),
                FacingDown => (OffsetX: 0, OffsetY: step),
                FacingLeft => (OffsetX: -step, OffsetY: 0),
                FacingRight => (OffsetX: step, OffsetY: 0),
                _ => (OffsetX: 0, OffsetY: -step)
            };

            tiles.Add((originX + offset.OffsetX, originY + offset.OffsetY));
        }

        return tiles;
    }

    public static IReadOnlyList<(int TileX, int TileY)> BuildForwardConeTiles(
        int originX,
        int originY,
        string facingDirection)
    {
        // Base orientation is FacingUp.
        var baseOffsets = new (int OffsetX, int OffsetY)[]
        {
            (0, -1),
            (-1, -2),
            (0, -2),
            (1, -2),
            (-2, -3),
            (-1, -3),
            (0, -3),
            (1, -3),
            (2, -3)
        };

        var normalizedFacing = NormalizeDirection(facingDirection) ?? FacingUp;
        var tiles = new List<(int TileX, int TileY)>(baseOffsets.Length);
        foreach (var offset in baseOffsets)
        {
            var rotated = RotateOffset(offset, normalizedFacing);
            tiles.Add((originX + rotated.OffsetX, originY + rotated.OffsetY));
        }

        return tiles;
    }

    private static (int OffsetX, int OffsetY) RotateOffset((int OffsetX, int OffsetY) offset, string facingDirection)
    {
        return facingDirection switch
        {
            FacingUp => offset,
            FacingRight => (-offset.OffsetY, offset.OffsetX),
            FacingDown => (-offset.OffsetX, -offset.OffsetY),
            FacingLeft => (offset.OffsetY, -offset.OffsetX),
            _ => offset
        };
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
            FacingUp => FacingUp,
            FacingDown => FacingDown,
            FacingLeft => FacingLeft,
            FacingRight => FacingRight,
            _ => null
        };
    }
}
