using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class StormCollapseGeometryTests
{
    [Theory]
    [InlineData(0, 1)]
    [InlineData(3, 2)]
    [InlineData(6, 3)]
    public void ManualStormCollapse_ResolvesExpectedGeometryByUltimateLevel(int totalCardsCollected, int expectedLevel)
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle(
            $"arena-storm-collapse-{expectedLevel}",
            ArenaConfig.CharacterIds.Velvet,
            31337);

        SetSelectedCardsForTotalCards(store, start.BattleId, totalCardsCollected);
        SetBattleIntProperty(store, start.BattleId, "UltimateGauge", ArenaConfig.UltimateConfig.GaugeMax);
        SetBattleBoolProperty(store, start.BattleId, "UltimateReady", true);
        var lockedTargetActorId = ConfigureSingleLockedTarget(store, start.BattleId);

        var step = store.StepBattle(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto(
                    ArenaConfig.SetAssistConfigCommandType,
                    AssistConfig: new AssistConfigDto(
                        Enabled: false,
                        AutoOffenseEnabled: false,
                        MaxAutoCastsPerTick: 0)),
                new BattleCommandDto(
                    ArenaConfig.CastSkillCommandType,
                    SkillId: ArenaConfig.SkillIds.VelvetStormCollapse)
            ]);

        var stormEvent = Assert.Single(step.Events.OfType<StormCollapseDetonatedEventDto>());
        Assert.Equal(expectedLevel, stormEvent.UltimateLevel);
        var hit = Assert.Single(stormEvent.Hits);
        Assert.Equal(lockedTargetActorId, hit.MobId);
        Assert.Equal(stormEvent.TargetPosition, hit.MobPosition);

        var expectedTiles = BuildExpectedStormCollapseTiles(expectedLevel, stormEvent.TargetPosition.X, stormEvent.TargetPosition.Y);
        var actualTiles = stormEvent.AffectedTiles
            .Select(tile => (TileX: tile.X, TileY: tile.Y))
            .ToHashSet();
        Assert.Equal(expectedTiles, actualTiles);
    }

    private static HashSet<(int TileX, int TileY)> BuildExpectedStormCollapseTiles(int level, int centerX, int centerY)
    {
        var clampedLevel = Math.Clamp(level, 1, 3);
        var radius = clampedLevel >= 3
            ? ArenaConfig.SkillConfig.StormCollapseDiamondRadiusL3
            : ArenaConfig.SkillConfig.StormCollapseDiamondRadiusL1;
        var expectedTiles = new HashSet<(int TileX, int TileY)>();
        for (var tileY = 0; tileY < ArenaConfig.Height; tileY += 1)
        {
            for (var tileX = 0; tileX < ArenaConfig.Width; tileX += 1)
            {
                if (Math.Abs(tileX - centerX) + Math.Abs(tileY - centerY) <= radius)
                {
                    expectedTiles.Add((tileX, tileY));
                }
            }
        }

        return expectedTiles;
    }

    private static string ConfigureSingleLockedTarget(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var actorsProperty = state.GetType().GetProperty("Actors");
        Assert.NotNull(actorsProperty);
        var actors = actorsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(actors);
        string? targetActorId = null;

        foreach (DictionaryEntry entry in actors)
        {
            var actor = entry.Value;
            Assert.NotNull(actor);
            var kindProperty = actor.GetType().GetProperty("Kind");
            var actorKind = kindProperty?.GetValue(actor) as string;
            if (!string.Equals(actorKind, "mob", StringComparison.Ordinal))
            {
                continue;
            }

            var hpProperty = actor.GetType().GetProperty("Hp");
            var maxHpProperty = actor.GetType().GetProperty("MaxHp");
            Assert.NotNull(hpProperty);
            Assert.NotNull(maxHpProperty);
            var maxHp = (int)(maxHpProperty.GetValue(actor) ?? 1);

            if (targetActorId is null)
            {
                targetActorId = entry.Key as string;
                hpProperty.SetValue(actor, maxHp);
                continue;
            }

            hpProperty.SetValue(actor, 0);
        }

        Assert.False(string.IsNullOrWhiteSpace(targetActorId));
        var lockedTargetProperty = state.GetType().GetProperty("LockedTargetEntityId");
        Assert.NotNull(lockedTargetProperty);
        lockedTargetProperty.SetValue(state, targetActorId);
        return targetActorId!;
    }

    private static void SetSelectedCardsForTotalCards(InMemoryBattleStore store, string battleId, int totalCardsCollected)
    {
        var state = GetStoredBattle(store, battleId);
        var selectedCardIdsProperty = state.GetType().GetProperty("SelectedCardIds");
        var selectedCardStacksProperty = state.GetType().GetProperty("SelectedCardStacks");
        Assert.NotNull(selectedCardIdsProperty);
        Assert.NotNull(selectedCardStacksProperty);

        var selectedCardIds = selectedCardIdsProperty.GetValue(state) as IList;
        var selectedCardStacks = selectedCardStacksProperty.GetValue(state) as IDictionary;
        Assert.NotNull(selectedCardIds);
        Assert.NotNull(selectedCardStacks);
        selectedCardIds.Clear();
        selectedCardStacks.Clear();

        if (totalCardsCollected <= 0)
        {
            SetBattleIntProperty(store, battleId, "TotalCardsCollected", 0);
            return;
        }

        var cardCycle = new[]
        {
            "butcher_mark",
            "bloodletter_edge",
            "warlord_banner"
        };

        var remaining = totalCardsCollected;
        var cardIndex = 0;
        while (remaining > 0)
        {
            var cardId = cardCycle[Math.Min(cardIndex, cardCycle.Length - 1)];
            var addCount = Math.Min(3, remaining);
            for (var i = 0; i < addCount; i += 1)
            {
                selectedCardIds.Add(cardId);
            }

            selectedCardStacks[cardId] = addCount;
            remaining -= addCount;
            cardIndex += 1;
        }

        SetBattleIntProperty(store, battleId, "TotalCardsCollected", totalCardsCollected);
    }

    private static void SetBattleIntProperty(InMemoryBattleStore store, string battleId, string propertyName, int value)
    {
        var state = GetStoredBattle(store, battleId);
        var property = state.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        property.SetValue(state, value);
    }

    private static void SetBattleBoolProperty(InMemoryBattleStore store, string battleId, string propertyName, bool value)
    {
        var state = GetStoredBattle(store, battleId);
        var property = state.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        property.SetValue(state, value);
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
}
