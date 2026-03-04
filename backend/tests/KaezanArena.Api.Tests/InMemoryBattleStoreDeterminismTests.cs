using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class InMemoryBattleStoreDeterminismTests
{
    private const int MaxDeterminismDamageSteps = 120;
    private const int MaxStepsToFindCardChoice = 1800;

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

    [Fact]
    public void StepBattle_FirstCardOffer_IsDeterministicForSameSeedAndHistory()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();

        var firstStart = store.StartBattle("arena-card-offer-a", "player-card-offer", seed);
        var secondStart = store.StartBattle("arena-card-offer-b", "player-card-offer", seed);

        var firstCardStep = WaitForCardChoiceStep(store, firstStart.BattleId, firstStart.Tick);
        var secondCardStep = WaitForCardChoiceStep(store, secondStart.BattleId, secondStart.Tick);

        Assert.True(firstCardStep.IsAwaitingCardChoice);
        Assert.True(secondCardStep.IsAwaitingCardChoice);
        Assert.Equal(firstCardStep.PendingChoiceId, secondCardStep.PendingChoiceId);
        Assert.Equal(
            firstCardStep.OfferedCards.Select(card => card.Id).ToList(),
            secondCardStep.OfferedCards.Select(card => card.Id).ToList());
    }

    [Fact]
    public void StepBattle_WhenAwaitingCardChoice_FreezesTickUntilChooseCard()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-card-freeze", "player-card-freeze", seed);

        var cardStep = WaitForCardChoiceStep(store, start.BattleId, start.Tick);
        var frozen = store.StepBattle(
            start.BattleId,
            cardStep.Tick,
            [new BattleCommandDto("cast_skill", SkillId: "exori")]);

        Assert.True(cardStep.IsAwaitingCardChoice);
        Assert.Equal(cardStep.Tick, frozen.Tick);
        Assert.True(frozen.IsAwaitingCardChoice);
        Assert.Equal(cardStep.PendingChoiceId, frozen.PendingChoiceId);

        var frozenResult = Assert.Single(frozen.CommandResults);
        Assert.False(frozenResult.Ok);
        Assert.Equal("awaiting_card_choice", frozenResult.Reason);
    }

    [Fact]
    public void ChooseCard_ValidatesSelection_AndResumesSimulation()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-card-choose", "player-card-choose", seed);
        var cardStep = WaitForCardChoiceStep(store, start.BattleId, start.Tick);

        var selected = cardStep.OfferedCards[0].Id;
        Assert.Throws<InvalidOperationException>(() =>
            store.ChooseCard(cardStep.BattleId, cardStep.PendingChoiceId!, "not_offered_card"));

        var chosen = store.ChooseCard(cardStep.BattleId, cardStep.PendingChoiceId!, selected);
        Assert.False(chosen.IsAwaitingCardChoice);
        Assert.Contains(chosen.SelectedCards, card => card.Id == selected);
        Assert.Contains(chosen.Events, evt => evt is CardChosenEventDto);

        var next = store.StepBattle(chosen.BattleId, chosen.Tick, []);
        Assert.True(next.Tick > chosen.Tick);
    }

    [Fact]
    public void CardOffers_DoNotRepeatPreviouslyChosenCards()
    {
        const int seed = 4242;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-card-no-repeat", "player-card-no-repeat", seed);

        var firstOffer = WaitForCardChoiceStep(store, start.BattleId, start.Tick);
        var firstSelected = firstOffer.OfferedCards[0].Id;
        var afterFirstChoice = store.ChooseCard(firstOffer.BattleId, firstOffer.PendingChoiceId!, firstSelected);

        var secondOffer = WaitForCardChoiceStep(store, afterFirstChoice.BattleId, afterFirstChoice.Tick);
        Assert.DoesNotContain(secondOffer.OfferedCards, card => card.Id == firstSelected);
    }

    [Fact]
    public void CardChoiceCap_StopsOfferingAfterEightSelections()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();
        var step = store.StartBattle("arena-card-cap", "player-card-cap", seed);
        var tick = step.Tick;
        var selectedChoices = 0;
        var sawLevelUpAfterCapWithoutChoice = false;

        for (var index = 0; index < 5000; index += 1)
        {
            step = store.StepBattle(step.BattleId, tick, BuildAggressiveCommands());
            tick = step.Tick;

            if (step.IsAwaitingCardChoice)
            {
                var firstCard = step.OfferedCards[0].Id;
                step = store.ChooseCard(step.BattleId, step.PendingChoiceId!, firstCard);
                tick = step.Tick;
                selectedChoices += 1;
                continue;
            }

            if (selectedChoices >= 8 && step.Events.OfType<LevelUpEventDto>().Any())
            {
                sawLevelUpAfterCapWithoutChoice = true;
                break;
            }
        }

        Assert.Equal(8, selectedChoices);
        Assert.True(sawLevelUpAfterCapWithoutChoice);
        Assert.False(step.IsAwaitingCardChoice);
    }

    private static BattleSnapshot WaitForCardChoiceStep(InMemoryBattleStore store, string battleId, int initialTick)
    {
        var tick = initialTick;
        for (var stepIndex = 0; stepIndex < MaxStepsToFindCardChoice; stepIndex += 1)
        {
            var step = store.StepBattle(battleId, tick, BuildAggressiveCommands());
            tick = step.Tick;
            if (step.IsAwaitingCardChoice)
            {
                Assert.NotNull(step.PendingChoiceId);
                Assert.NotEmpty(step.OfferedCards);
                Assert.InRange(step.OfferedCards.Count, 1, 3);
                return step;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected a pending card choice but none was offered within the step budget.");
    }

    private static IReadOnlyList<BattleCommandDto> BuildAggressiveCommands()
    {
        return
        [
            new BattleCommandDto("cast_skill", SkillId: "exori"),
            new BattleCommandDto("cast_skill", SkillId: "exori_min"),
            new BattleCommandDto("cast_skill", SkillId: "exori_mas"),
            new BattleCommandDto("cast_skill", SkillId: "avalanche")
        ];
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
