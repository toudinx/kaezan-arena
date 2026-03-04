using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class InMemoryBattleStoreDeterminismTests
{
    private const int StepDeltaMs = 250;
    private const int RunDurationTargetSeconds = 480;
    private const int RunDurationTargetMs = RunDurationTargetSeconds * 1000;
    private const int RunDurationTargetTick = RunDurationTargetMs / StepDeltaMs;
    private const int MaxDeterminismDamageSteps = 120;
    private const int MaxStepsToFindCardChoice = 1800;
    private const int MaxStepsToKillElite = 2500;
    private const int EliteDeterminismSteps = 180;

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
    public void StartBattle_ScalingDirector_BeginsAtBaseMultipliers()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-start", "player-scaling-start", 1337);

        Assert.Equal(0L, start.RunTimeMs);
        Assert.InRange(start.CurrentMobHpMult, 1.0d, 1.000001d);
        Assert.InRange(start.CurrentMobDmgMult, 1.0d, 1.000001d);
    }

    [Fact]
    public void StepBattle_ScalingDirector_ReachesConfiguredMaxNearTargetDuration()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-end", "player-scaling-end", 1337);
        SetBattleTick(store, start.BattleId, RunDurationTargetTick - 1);

        var step = store.StepBattle(start.BattleId, clientTick: null, commands: []);

        Assert.Equal((long)RunDurationTargetMs, step.RunTimeMs);
        Assert.InRange(step.CurrentMobHpMult, 2.199d, 2.200001d);
        Assert.InRange(step.CurrentMobDmgMult, 1.799d, 1.800001d);
    }

    [Fact]
    public void StepBattle_LateMobSpawn_HasHigherMaxHpThanEarlySpawn()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-late-spawn", "player-scaling-late-spawn", 1337);
        var earlyNormal = start.Actors
            .Where(actor => actor.Kind == "mob" && !actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .First();

        SetBattleTick(store, start.BattleId, RunDurationTargetTick - 2);
        ForceMobRespawn(store, start.BattleId, earlyNormal.ActorId);
        var lateStep = store.StepBattle(start.BattleId, clientTick: null, commands: []);
        var lateMob = Assert.Single(lateStep.Actors, actor => actor.ActorId == earlyNormal.ActorId);

        Assert.True(
            lateMob.MaxHp > earlyNormal.MaxHp,
            $"Expected late-spawn max HP ({lateMob.MaxHp}) to exceed early max HP ({earlyNormal.MaxHp}).");
    }

    [Fact]
    public void StepBattle_ScalingDirector_IsDeterministicForSameSeedAndTimeline()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();
        var first = store.StartBattle("arena-scaling-det-a", "player-scaling-det", seed);
        var second = store.StartBattle("arena-scaling-det-b", "player-scaling-det", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        for (var stepIndex = 0; stepIndex < 200; stepIndex += 1)
        {
            first = store.StepBattle(first.BattleId, firstTick, []);
            second = store.StepBattle(second.BattleId, secondTick, []);
            firstTick = first.Tick;
            secondTick = second.Tick;

            Assert.Equal(first.RunTimeMs, second.RunTimeMs);
            Assert.Equal(first.CurrentMobHpMult, second.CurrentMobHpMult);
            Assert.Equal(first.CurrentMobDmgMult, second.CurrentMobDmgMult);
        }
    }

    [Fact]
    public void StepBattle_RunEndsAtTargetDuration_WithVictoryTime()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-run-end-victory", "player-run-end-victory", 1337);
        SetBattleTick(store, start.BattleId, RunDurationTargetTick - 1);

        var step = store.StepBattle(start.BattleId, clientTick: null, commands: []);
        var runEndedEvent = Assert.Single(step.Events.OfType<RunEndedEventDto>());

        Assert.True(step.IsRunEnded);
        Assert.Equal("victory_time", step.RunEndReason);
        Assert.Equal((long)RunDurationTargetMs, step.RunEndedAtMs);
        Assert.Equal((long)RunDurationTargetMs, step.RunTimeMs);
        Assert.Equal("victory", step.BattleStatus);
        Assert.Equal("victory_time", runEndedEvent.Reason);
        Assert.Equal(step.RunEndedAtMs, runEndedEvent.TimestampMs);
    }

    [Fact]
    public void StepBattle_PlayerDeathEndsRun_WithDefeatDeath()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-run-end-defeat", "player-run-end-defeat", 1337);
        var playerActorId = Assert.Single(start.Actors.Where(actor => actor.Kind == "player")).ActorId;
        SetActorHp(store, start.BattleId, playerActorId, hp: 0);

        var step = store.StepBattle(start.BattleId, clientTick: null, commands: []);
        var runEndedEvent = Assert.Single(step.Events.OfType<RunEndedEventDto>());

        Assert.True(step.IsRunEnded);
        Assert.Equal("defeat_death", step.RunEndReason);
        Assert.Equal("defeat", step.BattleStatus);
        Assert.NotNull(step.RunEndedAtMs);
        Assert.Equal(step.RunEndedAtMs, runEndedEvent.TimestampMs);
        Assert.Equal("defeat_death", runEndedEvent.Reason);
    }

    [Fact]
    public void StepBattle_AfterRunEnd_FreezesTickAndEmitsNoFurtherEvents()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-run-end-freeze", "player-run-end-freeze", 1337);
        SetBattleTick(store, start.BattleId, RunDurationTargetTick - 1);

        var ended = store.StepBattle(start.BattleId, clientTick: null, commands: BuildAggressiveCommands());
        var followUp = store.StepBattle(start.BattleId, clientTick: ended.Tick, commands: BuildAggressiveCommands());

        Assert.True(ended.IsRunEnded);
        Assert.Single(ended.Events.OfType<RunEndedEventDto>());
        Assert.Equal(ended.Tick, followUp.Tick);
        Assert.Equal(ended.RunTimeMs, followUp.RunTimeMs);
        Assert.True(followUp.IsRunEnded);
        Assert.Empty(followUp.Events);
        Assert.Empty(followUp.CommandResults);
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

    [Fact]
    public void StartBattle_EliteBuffs_UpToThreeNormalMobs()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-elite-buff-cap", "player-elite-buff-cap", 1337);
        var snapshot = WaitForSnapshot(
            store,
            start,
            step => step.Actors.Any(actor => actor.Kind == "mob" && actor.IsElite),
            maxSteps: 1000);

        var elites = snapshot.Actors
            .Where(actor => actor.Kind == "mob" && actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        Assert.NotEmpty(elites);

        foreach (var elite in elites)
        {
            var buffedCount = snapshot.Actors.Count(actor =>
                actor.Kind == "mob" &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, elite.ActorId, StringComparison.Ordinal));
            Assert.InRange(buffedCount, 0, 3);
        }

        Assert.Contains(elites, elite =>
            snapshot.Actors.Count(actor =>
                actor.Kind == "mob" &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, elite.ActorId, StringComparison.Ordinal)) == 3);
    }

    [Fact]
    public void StartBattle_EliteBuffs_PreferSameSpecies()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-elite-prefer-species", "player-elite-prefer-species", 1337);
        var snapshot = WaitForSnapshot(
            store,
            start,
            step => step.Actors.Any(actor => actor.Kind == "mob" && actor.IsElite),
            maxSteps: 1000);

        var elites = snapshot.Actors
            .Where(actor => actor.Kind == "mob" && actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        Assert.NotEmpty(elites);

        foreach (var elite in elites)
        {
            var ownedTargets = snapshot.Actors
                .Where(actor =>
                    actor.Kind == "mob" &&
                    !actor.IsElite &&
                    string.Equals(actor.BuffSourceEliteId, elite.ActorId, StringComparison.Ordinal))
                .ToList();
            var hasOffSpeciesTarget = ownedTargets.Any(actor => actor.MobType != elite.MobType);
            var hasUnbuffedSameSpecies = snapshot.Actors.Any(actor =>
                actor.Kind == "mob" &&
                !actor.IsElite &&
                actor.MobType == elite.MobType &&
                actor.BuffSourceEliteId is null);

            Assert.False(
                hasOffSpeciesTarget && hasUnbuffedSameSpecies,
                $"Elite '{elite.ActorId}' assigned an off-species target while an unbuffed same-species target existed.");
        }
    }

    [Fact]
    public void StartBattle_EliteBuffs_DoNotStackOnSameMob()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-elite-no-stack", "player-elite-no-stack", 1337);
        var snapshot = WaitForSnapshot(
            store,
            start,
            step => step.Actors.Count(actor => actor.Kind == "mob" && actor.IsElite) >= 2,
            maxSteps: 1400);

        var elites = snapshot.Actors
            .Where(actor => actor.Kind == "mob" && actor.IsElite)
            .ToList();
        Assert.True(elites.Count >= 2, "Expected at least two elite mobs in the opening wave.");

        var allBuffTargets = elites
            .SelectMany(elite => snapshot.Actors
                .Where(actor =>
                    actor.Kind == "mob" &&
                    !actor.IsElite &&
                    string.Equals(actor.BuffSourceEliteId, elite.ActorId, StringComparison.Ordinal))
                .Select(actor => actor.ActorId))
            .ToList();
        Assert.Equal(allBuffTargets.Count, allBuffTargets.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void StartBattle_ElitesNeverBuffOtherElites()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-elite-no-elite-targets", "player-elite-no-elite-targets", 1337);
        var snapshot = WaitForSnapshot(
            store,
            start,
            step => step.Actors.Any(actor => actor.Kind == "mob" && actor.IsElite),
            maxSteps: 1000);

        var elites = snapshot.Actors
            .Where(actor => actor.Kind == "mob" && actor.IsElite)
            .ToList();
        Assert.NotEmpty(elites);
        Assert.All(elites, elite => Assert.Null(elite.BuffSourceEliteId));
    }

    [Fact]
    public void StepBattle_KillingElite_RemovesCommanderBuffs()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-elite-kill-removes-buffs", "player-elite-kill-removes-buffs", 1337);
        var step = WaitForSnapshot(
            store,
            start,
            snapshot => snapshot.Actors.Any(actor =>
                actor.Kind == "mob" &&
                actor.IsElite &&
                snapshot.Actors.Any(candidate =>
                    candidate.Kind == "mob" &&
                    !candidate.IsElite &&
                    string.Equals(candidate.BuffSourceEliteId, actor.ActorId, StringComparison.Ordinal))),
            maxSteps: 1400);
        var tick = step.Tick;

        var targetEliteId = step.Actors
            .Where(actor => actor.Kind == "mob" && actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .First(eliteId => step.Actors.Any(actor =>
                actor.Kind == "mob" &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, eliteId, StringComparison.Ordinal)));
        SetActorHp(store, step.BattleId, targetEliteId, hp: 1);

        for (var stepIndex = 0; stepIndex < MaxStepsToKillElite; stepIndex += 1)
        {
            step = AdvanceBattleSelectingCards(
                store,
                step.BattleId,
                tick,
                BuildAggressiveCommandsTargeting(targetEliteId));
            tick = step.Tick;

            var eliteDeath = step.Events
                .OfType<EliteDiedEventDto>()
                .FirstOrDefault(evt => string.Equals(evt.EliteEntityId, targetEliteId, StringComparison.Ordinal));
            if (eliteDeath is null)
            {
                continue;
            }

            Assert.DoesNotContain(
                step.Actors,
                actor =>
                    actor.Kind == "mob" &&
                    !actor.IsElite &&
                    string.Equals(actor.BuffSourceEliteId, targetEliteId, StringComparison.Ordinal));
            Assert.Contains(
                step.Events,
                evt => evt is EliteBuffRemovedEventDto removed &&
                       string.Equals(removed.EliteEntityId, targetEliteId, StringComparison.Ordinal));
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected the targeted elite to die and clear commander buffs.");
    }

    [Fact]
    public void StepBattle_EliteBuffAssignments_AreDeterministicForSameSeed()
    {
        const int seed = 2468;
        var store = new InMemoryBattleStore();
        var first = store.StartBattle("arena-elite-det-a", "player-elite-det", seed);
        var second = store.StartBattle("arena-elite-det-b", "player-elite-det", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        var firstAssignments = new List<string> { BuildEliteAssignmentSignature(first) };
        var secondAssignments = new List<string> { BuildEliteAssignmentSignature(second) };

        for (var stepIndex = 0; stepIndex < EliteDeterminismSteps; stepIndex += 1)
        {
            first = AdvanceBattleSelectingCards(store, first.BattleId, firstTick, BuildAggressiveCommands());
            second = AdvanceBattleSelectingCards(store, second.BattleId, secondTick, BuildAggressiveCommands());
            firstTick = first.Tick;
            secondTick = second.Tick;

            var firstSignature = BuildEliteAssignmentSignature(first);
            var secondSignature = BuildEliteAssignmentSignature(second);
            firstAssignments.Add(firstSignature);
            secondAssignments.Add(secondSignature);
            Assert.Equal(firstSignature, secondSignature);
        }

        Assert.Equal(firstAssignments, secondAssignments);
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

    private static IReadOnlyList<BattleCommandDto> BuildAggressiveCommandsTargeting(string targetEliteId)
    {
        return
        [
            new BattleCommandDto("set_target", TargetEntityId: targetEliteId),
            new BattleCommandDto("cast_skill", SkillId: "exori"),
            new BattleCommandDto("cast_skill", SkillId: "exori_min"),
            new BattleCommandDto("cast_skill", SkillId: "exori_mas"),
            new BattleCommandDto("cast_skill", SkillId: "avalanche")
        ];
    }

    private static BattleSnapshot AdvanceBattleSelectingCards(
        InMemoryBattleStore store,
        string battleId,
        int tick,
        IReadOnlyList<BattleCommandDto> commands)
    {
        var step = store.StepBattle(battleId, tick, commands);
        if (!step.IsAwaitingCardChoice)
        {
            return step;
        }

        var selectedCardId = step.OfferedCards[0].Id;
        return store.ChooseCard(step.BattleId, step.PendingChoiceId!, selectedCardId);
    }

    private static string BuildEliteAssignmentSignature(BattleSnapshot snapshot)
    {
        var elites = snapshot.Actors
            .Where(actor => actor.Kind == "mob" && actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .ToList();
        var assignments = snapshot.Actors
            .Where(actor =>
                actor.Kind == "mob" &&
                !actor.IsElite &&
                actor.BuffSourceEliteId is not null)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => $"{actor.ActorId}>{actor.BuffSourceEliteId}")
            .ToList();

        return $"{snapshot.Tick}|elites:{string.Join(",", elites)}|buffs:{string.Join(",", assignments)}";
    }

    private static BattleSnapshot WaitForSnapshot(
        InMemoryBattleStore store,
        BattleSnapshot start,
        Func<BattleSnapshot, bool> predicate,
        int maxSteps)
    {
        var step = start;
        var tick = start.Tick;
        for (var index = 0; index < maxSteps; index += 1)
        {
            step = AdvanceBattleSelectingCards(
                store,
                step.BattleId,
                tick,
                BuildAggressiveCommands());
            tick = step.Tick;

            if (predicate(step))
            {
                return step;
            }

            if (step.IsGameOver)
            {
                break;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected battle condition was not reached within the step budget.");
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

    private static void SetActorHp(InMemoryBattleStore store, string battleId, string actorId, int hp)
    {
        var state = GetStoredBattle(store, battleId);
        var actorsProperty = state.GetType().GetProperty("Actors");
        Assert.NotNull(actorsProperty);
        var actors = actorsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(actors);
        var actor = actors[actorId];
        Assert.NotNull(actor);

        var hpProperty = actor.GetType().GetProperty("Hp");
        Assert.NotNull(hpProperty);
        hpProperty.SetValue(actor, Math.Max(0, hp));
    }

    private static void SetBattleTick(InMemoryBattleStore store, string battleId, int tick)
    {
        var state = GetStoredBattle(store, battleId);
        var tickProperty = state.GetType().GetProperty("Tick");
        Assert.NotNull(tickProperty);
        tickProperty.SetValue(state, Math.Max(0, tick));
    }

    private static void ForceMobRespawn(InMemoryBattleStore store, string battleId, string actorId)
    {
        var state = GetStoredBattle(store, battleId);

        var actorsProperty = state.GetType().GetProperty("Actors");
        Assert.NotNull(actorsProperty);
        var actors = actorsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(actors);
        actors.Remove(actorId);

        var mobSlotsProperty = state.GetType().GetProperty("MobSlots");
        Assert.NotNull(mobSlotsProperty);
        var mobSlots = mobSlotsProperty.GetValue(state);
        Assert.NotNull(mobSlots);

        foreach (var entry in (IEnumerable)mobSlots)
        {
            var valueProperty = entry.GetType().GetProperty("Value");
            Assert.NotNull(valueProperty);
            var slot = valueProperty.GetValue(entry);
            Assert.NotNull(slot);

            var slotActorIdProperty = slot.GetType().GetProperty("ActorId");
            Assert.NotNull(slotActorIdProperty);
            var slotActorId = slotActorIdProperty.GetValue(slot) as string;
            if (!string.Equals(slotActorId, actorId, StringComparison.Ordinal))
            {
                continue;
            }

            var respawnRemainingMsProperty = slot.GetType().GetProperty("RespawnRemainingMs");
            Assert.NotNull(respawnRemainingMsProperty);
            respawnRemainingMsProperty.SetValue(slot, 0);
            return;
        }

        throw new Xunit.Sdk.XunitException($"Mob slot was not found for actor '{actorId}'.");
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
