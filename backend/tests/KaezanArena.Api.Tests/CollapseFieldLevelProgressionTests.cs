using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class CollapseFieldLevelProgressionTests
{
    [Fact]
    public void ManualCollapseField_PullsLivingMobsInDeterministicClosestFirstOrder()
    {
        var store = new InMemoryBattleStore();
        var setup = PrepareMiraiCollapseFieldScenario(store, "arena-collapse-field-order", aliveMobCount: 2);
        var ordered = setup.AliveMobIds
            .OrderBy(actorId => actorId, StringComparer.Ordinal)
            .ToArray();

        // Two equal-distance targets; ActorId must break the tie deterministically.
        ConfigureMob(store, setup.BattleId, ordered[0], tileX: 1, tileY: 1, hp: 200);
        ConfigureMob(store, setup.BattleId, ordered[1], tileX: 1, tileY: 5, hp: 200);

        var step = CastCollapseField(store, setup.BattleId, setup.StartTick);

        var collapseEvent = Assert.Single(step.Events.OfType<CollapseFieldActivatedEventDto>());
        Assert.Equal(new[] { ordered[0], ordered[1] }, collapseEvent.PulledMobs.Select(mob => mob.MobId).ToArray());
        Assert.Equal(new TilePos(1, 1), collapseEvent.PulledMobs[0].FromPosition);
        Assert.Equal(new TilePos(2, 2), collapseEvent.PulledMobs[0].ToPosition);
        Assert.Equal(new TilePos(1, 5), collapseEvent.PulledMobs[1].FromPosition);
        Assert.Equal(new TilePos(2, 4), collapseEvent.PulledMobs[1].ToPosition);
    }

    [Fact]
    public void ManualCollapseField_AdjacentMobIsNotPulled_ButStillReceivesDamageAndStun()
    {
        var store = new InMemoryBattleStore();
        var setup = PrepareMiraiCollapseFieldScenario(store, "arena-collapse-field-adjacent", aliveMobCount: 2);
        var adjacentMobId = setup.AliveMobIds[0];
        var farMobId = setup.AliveMobIds[1];

        ConfigureMob(store, setup.BattleId, adjacentMobId, tileX: 4, tileY: 3, hp: 200);
        ConfigureMob(store, setup.BattleId, farMobId, tileX: 0, tileY: 3, hp: 200);

        var step = CastCollapseField(store, setup.BattleId, setup.StartTick);

        var collapseEvent = Assert.Single(step.Events.OfType<CollapseFieldActivatedEventDto>());
        var pulled = Assert.Single(collapseEvent.PulledMobs);
        Assert.Equal(farMobId, pulled.MobId);
        Assert.Equal(new TilePos(0, 3), pulled.FromPosition);
        Assert.Equal(new TilePos(2, 3), pulled.ToPosition);

        AssertActorTile(store, setup.BattleId, adjacentMobId, expectedTileX: 4, expectedTileY: 3);
        AssertActorTile(store, setup.BattleId, farMobId, expectedTileX: 2, expectedTileY: 3);
        AssertActorStun(store, setup.BattleId, adjacentMobId, expectedStunned: true);
        AssertActorStun(store, setup.BattleId, farMobId, expectedStunned: true);

        var damagedMobIds = step.Events
            .OfType<DamageNumberEventDto>()
            .Select(eventDto => eventDto.TargetEntityId)
            .Where(entityId => !string.IsNullOrWhiteSpace(entityId))
            .ToHashSet(StringComparer.Ordinal);
        Assert.Contains(adjacentMobId, damagedMobIds);
        Assert.Contains(farMobId, damagedMobIds);
    }

    [Fact]
    public void ManualCollapseField_AppliesReflectState_AndReflectDamagesAttacker()
    {
        var store = new InMemoryBattleStore();
        var setup = PrepareMiraiCollapseFieldScenario(store, "arena-collapse-field-reflect", aliveMobCount: 1);
        var attackerMobId = setup.AliveMobIds[0];
        ConfigureMob(store, setup.BattleId, attackerMobId, tileX: 4, tileY: 3, hp: 200);

        var castStep = CastCollapseField(store, setup.BattleId, setup.StartTick);
        Assert.True(castStep.ReflectRemainingMs > 0);
        Assert.Equal(ArenaConfig.SkillConfig.CollapseFieldReflectPercent, castStep.ReflectPercent);

        // Collapse Field stuns mobs on cast; clear only this attacker to verify reflect retaliation.
        SetActorBoolProperty(store, setup.BattleId, attackerMobId, "IsStunned", false);
        SetActorIntProperty(store, setup.BattleId, attackerMobId, "StunRemainingMs", 0);
        SetMobSlotAttackCooldown(store, setup.BattleId, attackerMobId, 0);
        SetMobSlotMoveCooldown(store, setup.BattleId, attackerMobId, 999_999);
        SetBattleIntProperty(store, setup.BattleId, "ReflectPercent", 100);

        var hpBefore = ReadActorIntProperty(store, setup.BattleId, attackerMobId, "Hp");
        var attackStep = store.StepBattle(setup.BattleId, castStep.Tick, Array.Empty<BattleCommandDto>());

        var reflectEvent = Assert.Single(attackStep.Events.OfType<ReflectEventDto>());
        Assert.Equal(attackerMobId, reflectEvent.TargetEntityId);
        Assert.True(reflectEvent.Amount > 0);
        Assert.True(ReadActorIntProperty(store, setup.BattleId, attackerMobId, "Hp") < hpBefore);

        var current = attackStep;
        for (var index = 0; index < 20 && current.ReflectRemainingMs > 0; index += 1)
        {
            current = store.StepBattle(setup.BattleId, current.Tick, Array.Empty<BattleCommandDto>());
        }

        Assert.Equal(0, current.ReflectRemainingMs);
        Assert.Equal(0, current.ReflectPercent);
    }

    private static BattleSnapshot CastCollapseField(InMemoryBattleStore store, string battleId, int tick)
    {
        var commands = new[]
        {
            new BattleCommandDto(
                ArenaConfig.SetAssistConfigCommandType,
                AssistConfig: new AssistConfigDto(
                    Enabled: false,
                    AutoOffenseEnabled: false,
                    MaxAutoCastsPerTick: 0)),
            new BattleCommandDto(
                ArenaConfig.CastSkillCommandType,
                SkillId: ArenaConfig.SkillIds.MiraiCollapseField)
        };

        return store.StepBattle(battleId, tick, commands);
    }

    private static CollapseFieldScenario PrepareMiraiCollapseFieldScenario(
        InMemoryBattleStore store,
        string battleId,
        int aliveMobCount)
    {
        var start = store.StartBattle(battleId, ArenaConfig.CharacterIds.Mirai, 1337);
        var startedBattleId = start.BattleId;
        var mobIds = start.Actors
            .Where(actor => string.Equals(actor.Kind, "mob", StringComparison.Ordinal))
            .Select(actor => actor.ActorId)
            .OrderBy(actorId => actorId, StringComparer.Ordinal)
            .ToList();

        Assert.True(mobIds.Count >= aliveMobCount, "Expected enough mobs for Collapse Field scenario setup.");
        SetBattleIntProperty(store, startedBattleId, "PlayerAttackCooldownRemainingMs", 999_999);
        SetAllMobCooldowns(store, startedBattleId, 999_999);

        var aliveMobIds = mobIds.Take(aliveMobCount).ToArray();
        foreach (var mobId in mobIds)
        {
            SetActorBoolProperty(store, startedBattleId, mobId, "IsStunned", false);
            SetActorIntProperty(store, startedBattleId, mobId, "StunRemainingMs", 0);
            SetActorBoolProperty(store, startedBattleId, mobId, "IsImmobilized", false);
            SetActorIntProperty(store, startedBattleId, mobId, "ImmobilizeRemainingMs", 0);
            SetActorIntProperty(store, startedBattleId, mobId, "BleedingMarkStacks", 0);
            SetActorIntProperty(store, startedBattleId, mobId, "CorrosionStacks", 0);

            if (!aliveMobIds.Contains(mobId, StringComparer.Ordinal))
            {
                SetActorIntProperty(store, startedBattleId, mobId, "Hp", 0);
            }
        }

        return new CollapseFieldScenario(startedBattleId, start.Tick, aliveMobIds);
    }

    private static void ConfigureMob(
        InMemoryBattleStore store,
        string battleId,
        string mobId,
        int tileX,
        int tileY,
        int hp)
    {
        var safeHp = Math.Max(1, hp);
        SetActorIntProperty(store, battleId, mobId, "TileX", tileX);
        SetActorIntProperty(store, battleId, mobId, "TileY", tileY);
        SetActorIntProperty(store, battleId, mobId, "Hp", safeHp);
        SetActorIntProperty(store, battleId, mobId, "MaxHp", safeHp);
    }

    private static void AssertActorTile(
        InMemoryBattleStore store,
        string battleId,
        string actorId,
        int expectedTileX,
        int expectedTileY)
    {
        Assert.Equal(expectedTileX, ReadActorIntProperty(store, battleId, actorId, "TileX"));
        Assert.Equal(expectedTileY, ReadActorIntProperty(store, battleId, actorId, "TileY"));
    }

    private static void AssertActorStun(
        InMemoryBattleStore store,
        string battleId,
        string actorId,
        bool expectedStunned)
    {
        Assert.Equal(expectedStunned, ReadActorBoolProperty(store, battleId, actorId, "IsStunned"));
        var remainingMs = ReadActorIntProperty(store, battleId, actorId, "StunRemainingMs");
        if (expectedStunned)
        {
            Assert.Equal(ArenaConfig.SkillConfig.CollapseFieldImmobilizeDurationMs, remainingMs);
            return;
        }

        Assert.Equal(0, remainingMs);
    }

    private static void SetAllMobCooldowns(InMemoryBattleStore store, string battleId, int cooldownRemainingMs)
    {
        var state = GetStoredBattle(store, battleId);
        var mobSlotsProperty = state.GetType().GetProperty("MobSlots");
        Assert.NotNull(mobSlotsProperty);
        var mobSlots = mobSlotsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(mobSlots);

        foreach (DictionaryEntry entry in mobSlots)
        {
            var slot = entry.Value;
            Assert.NotNull(slot);
            var moveCooldownProperty = slot.GetType().GetProperty("MoveCooldownRemainingMs");
            var attackCooldownProperty = slot.GetType().GetProperty("AttackCooldownRemainingMs");
            var abilityCooldownProperty = slot.GetType().GetProperty("AbilityCooldownRemainingMs");
            Assert.NotNull(moveCooldownProperty);
            Assert.NotNull(attackCooldownProperty);
            Assert.NotNull(abilityCooldownProperty);
            moveCooldownProperty.SetValue(slot, Math.Max(0, cooldownRemainingMs));
            attackCooldownProperty.SetValue(slot, Math.Max(0, cooldownRemainingMs));
            abilityCooldownProperty.SetValue(slot, Math.Max(0, cooldownRemainingMs));
        }
    }

    private static void SetMobSlotAttackCooldown(
        InMemoryBattleStore store,
        string battleId,
        string actorId,
        int cooldownRemainingMs)
    {
        var state = GetStoredBattle(store, battleId);
        var mobSlotsProperty = state.GetType().GetProperty("MobSlots");
        Assert.NotNull(mobSlotsProperty);
        var mobSlots = mobSlotsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(mobSlots);

        foreach (DictionaryEntry entry in mobSlots)
        {
            var slot = entry.Value;
            Assert.NotNull(slot);
            var actorIdProperty = slot.GetType().GetProperty("ActorId");
            var attackCooldownProperty = slot.GetType().GetProperty("AttackCooldownRemainingMs");
            Assert.NotNull(actorIdProperty);
            Assert.NotNull(attackCooldownProperty);
            var slotActorId = actorIdProperty.GetValue(slot) as string;
            if (!string.Equals(slotActorId, actorId, StringComparison.Ordinal))
            {
                continue;
            }

            attackCooldownProperty.SetValue(slot, Math.Max(0, cooldownRemainingMs));
            return;
        }

        throw new Xunit.Sdk.XunitException($"Could not find mob slot for actor '{actorId}'.");
    }

    private static void SetMobSlotMoveCooldown(
        InMemoryBattleStore store,
        string battleId,
        string actorId,
        int cooldownRemainingMs)
    {
        var state = GetStoredBattle(store, battleId);
        var mobSlotsProperty = state.GetType().GetProperty("MobSlots");
        Assert.NotNull(mobSlotsProperty);
        var mobSlots = mobSlotsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(mobSlots);

        foreach (DictionaryEntry entry in mobSlots)
        {
            var slot = entry.Value;
            Assert.NotNull(slot);
            var actorIdProperty = slot.GetType().GetProperty("ActorId");
            var moveCooldownProperty = slot.GetType().GetProperty("MoveCooldownRemainingMs");
            Assert.NotNull(actorIdProperty);
            Assert.NotNull(moveCooldownProperty);
            var slotActorId = actorIdProperty.GetValue(slot) as string;
            if (!string.Equals(slotActorId, actorId, StringComparison.Ordinal))
            {
                continue;
            }

            moveCooldownProperty.SetValue(slot, Math.Max(0, cooldownRemainingMs));
            return;
        }

        throw new Xunit.Sdk.XunitException($"Could not find mob slot for actor '{actorId}'.");
    }

    private static void SetBattleIntProperty(InMemoryBattleStore store, string battleId, string propertyName, int value)
    {
        var state = GetStoredBattle(store, battleId);
        var property = state.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        property.SetValue(state, value);
    }

    private static int ReadActorIntProperty(InMemoryBattleStore store, string battleId, string actorId, string propertyName)
    {
        var actor = GetStoredActor(store, battleId, actorId);
        var property = actor.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        var value = property.GetValue(actor);
        Assert.NotNull(value);
        return Assert.IsType<int>(value);
    }

    private static bool ReadActorBoolProperty(InMemoryBattleStore store, string battleId, string actorId, string propertyName)
    {
        var actor = GetStoredActor(store, battleId, actorId);
        var property = actor.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        var value = property.GetValue(actor);
        Assert.NotNull(value);
        return Assert.IsType<bool>(value);
    }

    private static void SetActorIntProperty(InMemoryBattleStore store, string battleId, string actorId, string propertyName, int value)
    {
        var actor = GetStoredActor(store, battleId, actorId);
        var property = actor.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        property.SetValue(actor, value);
    }

    private static void SetActorBoolProperty(InMemoryBattleStore store, string battleId, string actorId, string propertyName, bool value)
    {
        var actor = GetStoredActor(store, battleId, actorId);
        var property = actor.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        property.SetValue(actor, value);
    }

    private static object GetStoredActor(InMemoryBattleStore store, string battleId, string actorId)
    {
        var state = GetStoredBattle(store, battleId);
        var actorsProperty = state.GetType().GetProperty("Actors");
        Assert.NotNull(actorsProperty);
        var actors = actorsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(actors);
        var actor = actors[actorId];
        Assert.NotNull(actor);
        return actor!;
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

    private sealed record CollapseFieldScenario(
        string BattleId,
        int StartTick,
        string[] AliveMobIds);
}
