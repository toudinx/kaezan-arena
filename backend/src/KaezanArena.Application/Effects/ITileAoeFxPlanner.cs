namespace KaezanArena.Application.Effects;

public interface ITileAoeFxPlanner
{
    IReadOnlyList<AoePlanSpawn> Plan(AoePlanRequest request);
}
