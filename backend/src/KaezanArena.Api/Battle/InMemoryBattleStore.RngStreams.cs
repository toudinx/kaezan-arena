namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    // Keep RNG stream usage explicit and reviewable to protect deterministic replay behavior.
    private static int NextIntFromBattleRng(StoredBattle state, int maxExclusive)
    {
        return state.Rng.Next(maxExclusive);
    }

    private static int NextIntFromBattleRng(StoredBattle state, int minInclusive, int maxExclusive)
    {
        return state.Rng.Next(minInclusive, maxExclusive);
    }

    private static double NextUnitDoubleFromBattleRng(StoredBattle state)
    {
        return state.Rng.NextDouble();
    }

    private static int NextIntFromPoiRng(StoredBattle state, int maxExclusive)
    {
        return state.PoiRng.Next(maxExclusive);
    }

    private static int NextIntFromCritRng(StoredBattle state, int maxExclusive)
    {
        return state.CritRng.Next(maxExclusive);
    }

    private static int NextIntFromBestiaryRng(StoredBattle state, int maxExclusive)
    {
        return state.BestiaryRng.Next(maxExclusive);
    }

    private static int NextIntFromBestiaryRng(Random bestiaryRng, int maxExclusive)
    {
        return bestiaryRng.Next(maxExclusive);
    }
}
