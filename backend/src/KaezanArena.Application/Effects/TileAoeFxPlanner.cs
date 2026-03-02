namespace KaezanArena.Application.Effects;

public sealed class TileAoeFxPlanner : ITileAoeFxPlanner
{
    public IReadOnlyList<AoePlanSpawn> Plan(AoePlanRequest request)
    {
        if (!string.Equals(request.Shape, "square", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Only shape 'square' is supported.", nameof(request));
        }

        var radius = Math.Max(0, request.Radius);
        var spawns = new List<AoePlanSpawn>((radius * 2 + 1) * (radius * 2 + 1));

        for (var tileY = request.CenterY - radius; tileY <= request.CenterY + radius; tileY += 1)
        {
            for (var tileX = request.CenterX - radius; tileX <= request.CenterX + radius; tileX += 1)
            {
                spawns.Add(new AoePlanSpawn(tileX, tileY, request.FxId));
            }
        }

        return spawns;
    }
}
