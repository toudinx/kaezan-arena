using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class InMemoryBattleStoreDeterminismTests
{
    [Fact]
    public void StartBattle_MobInitialAutoAttackCooldowns_AreNonZero_Deterministic_AndDesynchronized()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();

        var first = store.StartBattle("arena-aa-offset-a", "player-aa-offset", seed);
        var second = store.StartBattle("arena-aa-offset-b", "player-aa-offset", seed);

        var firstCooldowns = GetActiveMobAttackCooldowns(store, first);
        var secondCooldowns = GetActiveMobAttackCooldowns(store, second);

        Assert.NotEmpty(firstCooldowns);
        Assert.Equal(firstCooldowns, secondCooldowns);
        Assert.All(firstCooldowns, cooldown => Assert.True(cooldown > 0, "Expected spawned mob initial attack cooldown to be > 0."));
        Assert.True(firstCooldowns.Distinct().Count() > 1, "Expected deterministic desynchronization across spawned mob initial attack cooldowns.");
    }

    private static IReadOnlyList<int> GetActiveMobAttackCooldowns(InMemoryBattleStore store, BattleSnapshot snapshot)
    {
        var activeMobActorIds = snapshot.Actors
            .Where(actor => string.Equals(actor.Kind, "mob", StringComparison.Ordinal))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .ToList();

        var state = GetStoredBattle(store, snapshot.BattleId);
        var cooldownByActorId = ReadMobAttackCooldownByActorId(state);

        return activeMobActorIds
            .Select(actorId => cooldownByActorId[actorId])
            .ToList();
    }

    private static object GetStoredBattle(InMemoryBattleStore store, string battleId)
    {
        var battlesField = typeof(InMemoryBattleStore).GetField("_battles", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(battlesField);
        var battles = battlesField.GetValue(store);
        Assert.NotNull(battles);

        var indexer = battles.GetType().GetProperty("Item");
        Assert.NotNull(indexer);
        var state = indexer.GetValue(battles, [battleId]);
        Assert.NotNull(state);
        return state!;
    }

    private static Dictionary<string, int> ReadMobAttackCooldownByActorId(object storedBattle)
    {
        var mobSlotsProperty = storedBattle.GetType().GetProperty("MobSlots");
        Assert.NotNull(mobSlotsProperty);
        var mobSlots = mobSlotsProperty.GetValue(storedBattle);
        Assert.NotNull(mobSlots);

        var cooldownByActorId = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var entry in (IEnumerable)mobSlots)
        {
            var valueProperty = entry.GetType().GetProperty("Value");
            Assert.NotNull(valueProperty);
            var slot = valueProperty.GetValue(entry);
            Assert.NotNull(slot);

            var actorIdProperty = slot.GetType().GetProperty("ActorId");
            var attackCooldownProperty = slot.GetType().GetProperty("AttackCooldownRemainingMs");
            Assert.NotNull(actorIdProperty);
            Assert.NotNull(attackCooldownProperty);

            var actorId = actorIdProperty.GetValue(slot) as string;
            var attackCooldown = attackCooldownProperty.GetValue(slot) as int?;
            Assert.False(string.IsNullOrWhiteSpace(actorId));
            Assert.NotNull(attackCooldown);

            cooldownByActorId[actorId!] = attackCooldown!.Value;
        }

        return cooldownByActorId;
    }
}
