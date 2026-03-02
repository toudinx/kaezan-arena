using KaezanArena.Application.Effects;

namespace KaezanArena.Application.Tests;

public sealed class TileAoeFxPlannerTests
{
    private readonly TileAoeFxPlanner _planner = new();

    [Fact]
    public void Plan_SquareRadiusOne_ReturnsNineDeterministicSpawns()
    {
        var request = new AoePlanRequest(
            CenterX: 3,
            CenterY: 4,
            Radius: 1,
            Shape: "square",
            FxId: "fx.hit.small");

        var spawns = _planner.Plan(request);

        Assert.Equal(9, spawns.Count);
        Assert.Equal(new AoePlanSpawn(2, 3, "fx.hit.small"), spawns[0]);
        Assert.Equal(new AoePlanSpawn(3, 4, "fx.hit.small"), spawns[4]);
        Assert.Equal(new AoePlanSpawn(4, 5, "fx.hit.small"), spawns[8]);
    }

    [Fact]
    public void Plan_UnsupportedShape_ThrowsArgumentException()
    {
        var request = new AoePlanRequest(
            CenterX: 1,
            CenterY: 1,
            Radius: 1,
            Shape: "circle",
            FxId: "fx.hit.small");

        Assert.Throws<ArgumentException>(() => _planner.Plan(request));
    }
}
