using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class InMemoryBattleStoreDeterminismTests
{
    private const int MaxDeterminismDamageSteps = 120;

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

    [Fact]
    public void StepBattle_DamageSequence_IsDeterministicForSameSeed()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();

        var first = store.StartBattle("arena-damage-seq-a", "player-damage-seq", seed);
        var second = store.StartBattle("arena-damage-seq-b", "player-damage-seq", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        var firstDamageSequence = new List<string>();
        var secondDamageSequence = new List<string>();

        for (var stepIndex = 0; stepIndex < MaxDeterminismDamageSteps; stepIndex += 1)
        {
            var firstStep = store.StepBattle(first.BattleId, firstTick, []);
            var secondStep = store.StepBattle(second.BattleId, secondTick, []);
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;

            var firstStepDamages = firstStep.Events
                .OfType<DamageNumberEventDto>()
                .Select(ToDamageSignature)
                .ToList();
            var secondStepDamages = secondStep.Events
                .OfType<DamageNumberEventDto>()
                .Select(ToDamageSignature)
                .ToList();

            Assert.Equal(firstStepDamages, secondStepDamages);
            firstDamageSequence.AddRange(firstStepDamages);
            secondDamageSequence.AddRange(secondStepDamages);
        }

        Assert.NotEmpty(firstDamageSequence);
        Assert.Equal(firstDamageSequence, secondDamageSequence);
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

    private static string ToDamageSignature(DamageNumberEventDto damage)
    {
        return string.Join(
            ":",
            damage.AttackerEntityId,
            damage.AttackerTileX,
            damage.AttackerTileY,
            damage.TargetEntityId,
            damage.TargetTileX,
            damage.TargetTileY,
            damage.DamageAmount,
            (int)damage.ElementType,
            damage.IsKill,
            damage.IsCrit,
            damage.ShieldDamageAmount,
            damage.HpDamageAmount,
            damage.HitKind);
    }
}
