using System.Collections;
using System.Reflection;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class InMemoryBattleStoreDeterminismTests
{
    private const int StepDeltaMs = 250;
    private const long RunDurationTargetMs = ArenaConfig.RunDurationMs;
    private const int RunDurationTargetTick = (int)(RunDurationTargetMs / StepDeltaMs);
    private const long MidRunTargetMs = RunDurationTargetMs / 2;
    private const int MidRunTargetTick = (int)(MidRunTargetMs / StepDeltaMs);
    private const long NearEndTargetMs = RunDurationTargetMs - StepDeltaMs;
    private const int NearEndTargetTick = RunDurationTargetTick - 1;
    private const int RunInitialLevel = 1;
    private const double MobHpMultStart = 1.0d;
    private const double MobHpMultEnd = 3.2d;
    private const double MobDmgMultStart = 0.70d;
    private const double MobDmgMultEnd = 2.6d;
    private const double EliteHpMultiplierFactor = 1.35d;
    private const double EliteDmgMultiplierFactor = 1.30d;
    private const bool IsRunLevelHpSeasoningEnabled = true;
    private const double RunLevelHpSeasoningPerLevel = 0.015d;
    private const double ScalingTolerance = 0.000001d;
    private const int MaxDeterminismDamageSteps = 120;
    private const int MaxCommandDeterminismSteps = 220;
    private const int LongRunDeterminismStepBudget = RunDurationTargetTick + 600;
    private const int MaxStepsToFindCardChoice = 1800;
    private const int MaxStepsToKillElite = 2500;
    private const int EliteDeterminismSteps = 180;
    private const int MaxGlobalCooldownReductionPercent = 60;
    private const int SkillInitialLevel = 1;
    private const int SkillCooldownReductionPerLevelPercent = 4;
    private const int SkillCooldownReductionMaxPercent = 32;
    private const int ExoriBaseCooldownMs = 1200;
    private const int ExoriMasBaseCooldownMs = 2000;
    private const int ExoriMinBaseCooldownMs = 800;
    private const int AvalancheBaseCooldownMs = 2500;
    private const int HealBaseCooldownMs = 7000;
    private const int GuardBaseCooldownMs = 10000;

    [Fact]
    public void StartAndStepBattle_NormalRun_DoesNotThrowInvariantValidation()
    {
        var store = new InMemoryBattleStore();

        var exception = Record.Exception(() =>
        {
            var start = store.StartBattle("arena-invariants-normal", "player-invariants-normal", 1337);
            _ = store.StepBattle(start.BattleId, start.Tick, []);
        });

        Assert.Null(exception);
    }

    [Fact]
    public void StepBattle_RepeatedMoveCommandWhileBlocked_EmitsBlockedResultUntilPathIsFree()
    {
        // Player movement is disabled — move_player always returns Ok=false, Reason="unknown_command".
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-move-repeat-blocked", "player-move-repeat-blocked", 1337);
        var player = Assert.Single(start.Actors, actor => string.Equals(actor.Kind, "player", StringComparison.Ordinal));
        var moveRight = new[] { new BattleCommandDto("move_player", Dir: "right") };

        var firstStep = store.StepBattle(start.BattleId, start.Tick, moveRight);
        var firstResult = Assert.Single(firstStep.CommandResults, r =>
            string.Equals(r.Type, "move_player", StringComparison.Ordinal));
        Assert.False(firstResult.Ok);
        Assert.Equal(ArenaConfig.UnknownCommandReason, firstResult.Reason);
        AssertActorTile(firstStep, player.ActorId, player.TileX, player.TileY);

        var secondStep = store.StepBattle(start.BattleId, firstStep.Tick, moveRight);
        var secondResult = Assert.Single(secondStep.CommandResults, r =>
            string.Equals(r.Type, "move_player", StringComparison.Ordinal));
        Assert.False(secondResult.Ok);
        Assert.Equal(ArenaConfig.UnknownCommandReason, secondResult.Reason);
        AssertActorTile(secondStep, player.ActorId, player.TileX, player.TileY);
    }

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
    public void StepBattle_SameSeedAndCommands_ProducesIdenticalKeySnapshotFields()
    {
        const int seed = 4242;
        var store = new InMemoryBattleStore();

        var first = store.StartBattle("arena-commands-det-a", "player-commands-det", seed);
        var second = store.StartBattle("arena-commands-det-b", "player-commands-det", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        AssertDeterministicKeySnapshotFields(first, second);

        for (var stepIndex = 0; stepIndex < MaxCommandDeterminismSteps; stepIndex += 1)
        {
            var commands = BuildDeterministicCommandBatch(stepIndex);
            first = store.StepBattle(first.BattleId, firstTick, commands);
            second = store.StepBattle(second.BattleId, secondTick, commands);
            firstTick = first.Tick;
            secondTick = second.Tick;
            AssertDeterministicKeySnapshotFields(first, second);

            if (first.IsAwaitingCardChoice || second.IsAwaitingCardChoice)
            {
                Assert.True(first.IsAwaitingCardChoice);
                Assert.True(second.IsAwaitingCardChoice);
                Assert.Equal(first.PendingChoiceId, second.PendingChoiceId);
                Assert.Equal(
                    first.OfferedCards.Select(card => card.Id).ToList(),
                    second.OfferedCards.Select(card => card.Id).ToList());

                var selectedCardId = first.OfferedCards[0].Id;
                first = store.ChooseCard(first.BattleId, first.PendingChoiceId!, selectedCardId);
                second = store.ChooseCard(second.BattleId, second.PendingChoiceId!, selectedCardId);
                firstTick = first.Tick;
                secondTick = second.Tick;
                AssertDeterministicKeySnapshotFields(first, second);
            }

            if (first.IsRunEnded || second.IsRunEnded)
            {
                Assert.Equal(first.IsRunEnded, second.IsRunEnded);
                break;
            }
        }
    }

    [Fact]
    public void StepBattle_PauseResumeTimeline_IsDeterministicAndFreezesClockUntilResume()
    {
        const int seed = 51515;
        var store = new InMemoryBattleStore();
        var first = store.StartBattle("arena-pause-det-a", "player-pause-det", seed);
        var second = store.StartBattle("arena-pause-det-b", "player-pause-det", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        var pauseCommands = new[]
        {
            new BattleCommandDto("set_paused", Paused: true),
            new BattleCommandDto("cast_skill", SkillId: "exori"),
            new BattleCommandDto("move_player", Dir: "right")
        };

        first = store.StepBattle(first.BattleId, firstTick, pauseCommands);
        second = store.StepBattle(second.BattleId, secondTick, pauseCommands);
        AssertDeterministicKeySnapshotFields(first, second);
        Assert.Equal(firstTick, first.Tick);
        Assert.Equal(secondTick, second.Tick);
        Assert.Equal(0L, first.RunTimeMs);
        Assert.Equal(0L, second.RunTimeMs);
        AssertCommandResult(first, index: 0, expectedType: "set_paused", expectedOk: true, expectedReason: null);
        AssertCommandResult(first, index: 1, expectedType: "cast_skill", expectedOk: false, expectedReason: "paused");
        AssertCommandResult(first, index: 2, expectedType: "move_player", expectedOk: false, expectedReason: "paused");
        AssertCommandResult(second, index: 0, expectedType: "set_paused", expectedOk: true, expectedReason: null);
        AssertCommandResult(second, index: 1, expectedType: "cast_skill", expectedOk: false, expectedReason: "paused");
        AssertCommandResult(second, index: 2, expectedType: "move_player", expectedOk: false, expectedReason: "paused");

        firstTick = first.Tick;
        secondTick = second.Tick;
        first = store.StepBattle(first.BattleId, firstTick, [new BattleCommandDto("cast_skill", SkillId: "exori_mas")]);
        second = store.StepBattle(second.BattleId, secondTick, [new BattleCommandDto("cast_skill", SkillId: "exori_mas")]);
        AssertDeterministicKeySnapshotFields(first, second);
        Assert.Equal(firstTick, first.Tick);
        Assert.Equal(secondTick, second.Tick);
        AssertCommandResult(first, index: 0, expectedType: "cast_skill", expectedOk: false, expectedReason: "paused");
        AssertCommandResult(second, index: 0, expectedType: "cast_skill", expectedOk: false, expectedReason: "paused");

        firstTick = first.Tick;
        secondTick = second.Tick;
        var resumeCommands = new[]
        {
            new BattleCommandDto("set_paused", Paused: false),
            new BattleCommandDto("cast_skill", SkillId: "exori_min")
        };
        first = store.StepBattle(first.BattleId, firstTick, resumeCommands);
        second = store.StepBattle(second.BattleId, secondTick, resumeCommands);
        AssertDeterministicKeySnapshotFields(first, second);
        Assert.Equal(firstTick + 1, first.Tick);
        Assert.Equal(secondTick + 1, second.Tick);
        Assert.Equal(StepDeltaMs, first.RunTimeMs);
        Assert.Equal(StepDeltaMs, second.RunTimeMs);
        AssertCommandResult(first, index: 0, expectedType: "set_paused", expectedOk: true, expectedReason: null);
        AssertCommandResult(second, index: 0, expectedType: "set_paused", expectedOk: true, expectedReason: null);
        Assert.NotEqual("paused", Assert.Single(first.CommandResults, result => result.Index == 1).Reason);
        Assert.NotEqual("paused", Assert.Single(second.CommandResults, result => result.Index == 1).Reason);
    }

    [Fact]
    public void StepBattle_LongRunsWithFixedSeedAndCommands_RepeatedExecutionsProduceEquivalentTimelines()
    {
        const int seed = 112233;
        const int runCount = 4;
        var timelinesByRun = new List<IReadOnlyList<string>>();

        for (var runIndex = 0; runIndex < runCount; runIndex += 1)
        {
            var store = new InMemoryBattleStore();
            var step = store.StartBattle($"arena-long-det-repeat-{runIndex}", "player-long-det-repeat", seed);
            var tick = step.Tick;
            var timeline = new List<string> { BuildCoreDeterminismSignature(step) };

            for (var stepIndex = 0; stepIndex < LongRunDeterminismStepBudget; stepIndex += 1)
            {
                var commands = BuildDeterministicCommandBatch(stepIndex);
                step = store.StepBattle(step.BattleId, tick, commands);
                tick = step.Tick;
                timeline.Add(BuildCoreDeterminismSignature(step));

                if (step.IsAwaitingCardChoice)
                {
                    var selectedCardId = step.OfferedCards[0].Id;
                    step = store.ChooseCard(step.BattleId, step.PendingChoiceId!, selectedCardId);
                    tick = step.Tick;
                    timeline.Add(BuildCoreDeterminismSignature(step));
                }

                if (step.IsRunEnded)
                {
                    break;
                }
            }

            Assert.True(
                step.IsRunEnded,
                $"Expected deterministic long run {runIndex} to reach end state within the configured step budget.");
            Assert.True(
                timeline.Count > (RunDurationTargetTick / 2),
                "Expected a sufficiently long deterministic timeline before run end.");
            timelinesByRun.Add(timeline);
        }

        var baseline = timelinesByRun[0];
        foreach (var timeline in timelinesByRun.Skip(1))
        {
            Assert.Equal(baseline, timeline);
        }
    }

    [Fact]
    public void StartBattle_ScalingDirector_BeginsAtBaseMultipliers()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-start", "player-scaling-start", 1337);

        Assert.Equal(0L, start.RunTimeMs);
        Assert.InRange(start.CurrentMobHpMult, 1.0d, 1.000001d);
        Assert.InRange(start.CurrentMobDmgMult, 0.70d, 0.700001d);
        Assert.InRange(start.Scaling.NormalHpMult, 1.0d, 1.000001d);
        Assert.InRange(start.Scaling.NormalDmgMult, 0.70d, 0.700001d);
        Assert.InRange(start.Scaling.EliteHpMult, 1.35d, 1.350001d);
        Assert.InRange(start.Scaling.EliteDmgMult, 0.9099d, 0.910001d);
        Assert.InRange(start.Scaling.LvlFactor, 1.0d, 1.000001d);
        Assert.True(start.Scaling.IsLvlFactorEnabled);
        AssertScalingMatchesExpected(start, expectedRunTimeMs: 0L, runLevel: RunInitialLevel);
    }

    [Fact]
    public void StepBattle_ScalingDirector_Midpoint_InterpolatesDeterministically()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-mid", "player-scaling-mid", 1337);
        SetBattleTick(store, start.BattleId, MidRunTargetTick - 1);

        var step = store.StepBattle(start.BattleId, clientTick: null, commands: []);

        Assert.Equal(MidRunTargetMs, step.RunTimeMs);
        AssertScalingMatchesExpected(step, expectedRunTimeMs: MidRunTargetMs, runLevel: RunInitialLevel);
    }

    [Fact]
    public void StepBattle_ScalingDirector_NearEnd_ApproachesConfiguredMaxWithoutOvershoot()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-near-end", "player-scaling-near-end", 1337);
        SetBattleTick(store, start.BattleId, NearEndTargetTick - 1);

        var step = store.StepBattle(start.BattleId, clientTick: null, commands: []);

        Assert.Equal(NearEndTargetMs, step.RunTimeMs);
        AssertScalingMatchesExpected(step, expectedRunTimeMs: NearEndTargetMs, runLevel: RunInitialLevel);
        Assert.True(step.CurrentMobHpMult < MobHpMultEnd);
        Assert.True(step.CurrentMobDmgMult < MobDmgMultEnd);
    }

    [Fact]
    public void StepBattle_ScalingDirector_ReachesConfiguredMaxNearTargetDuration()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-end", "player-scaling-end", 1337);
        SetBattleTick(store, start.BattleId, RunDurationTargetTick - 1);

        var step = store.StepBattle(start.BattleId, clientTick: null, commands: []);

        Assert.Equal((long)RunDurationTargetMs, step.RunTimeMs);
        Assert.InRange(step.CurrentMobHpMult, 3.2d, 3.200001d);
        Assert.InRange(step.CurrentMobDmgMult, 2.6d, 2.600001d);
        Assert.InRange(step.Scaling.NormalHpMult, 3.2d, 3.200001d);
        Assert.InRange(step.Scaling.NormalDmgMult, 2.6d, 2.600001d);
        Assert.InRange(step.Scaling.EliteHpMult, 4.32d, 4.320001d);
        Assert.InRange(step.Scaling.EliteDmgMult, 3.38d, 3.380001d);
        Assert.InRange(step.Scaling.LvlFactor, 1.0d, 1.000001d);
        AssertScalingMatchesExpected(step, expectedRunTimeMs: RunDurationTargetMs, runLevel: RunInitialLevel);
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
    public void ScalingDirector_LateMobDamage_IsHigherForSameArchetype()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-late-damage", "player-scaling-late-damage", 1337);
        var attacker = start.Actors
            .Where(actor => actor.Kind == "mob" && !actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .First();

        const int baseDamage = 2;
        var earlyDamage = ResolveMobOutgoingDamageViaReflection(store, start.BattleId, attacker.ActorId, baseDamage);

        SetBattleTick(store, start.BattleId, RunDurationTargetTick - 1);
        var lateDamage = ResolveMobOutgoingDamageViaReflection(store, start.BattleId, attacker.ActorId, baseDamage);

        Assert.True(
            lateDamage > earlyDamage,
            $"Expected late damage ({lateDamage}) to exceed early damage ({earlyDamage}) for actor '{attacker.ActorId}'.");
    }

    [Fact]
    public void ScalingDirector_EliteCommanderBuff_StacksAfterTimeScaling()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-scaling-elite-buff-order", "player-scaling-elite-buff-order", 1337);
        var attacker = start.Actors
            .Where(actor => actor.Kind == "mob" && !actor.IsElite)
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .First();

        SetBattleTick(store, start.BattleId, 880);
        const int baseDamage = 2;
        var scaledDamage = ResolveMobOutgoingDamageViaReflection(store, start.BattleId, attacker.ActorId, baseDamage);

        SetMobBuffSourceEliteId(store, start.BattleId, attacker.ActorId, "mob.elite.test");
        var buffedDamage = ResolveMobOutgoingDamageViaReflection(store, start.BattleId, attacker.ActorId, baseDamage);
        var expectedBuffedDamage = (int)Math.Floor(scaledDamage * 1.4d);

        Assert.Equal(expectedBuffedDamage, buffedDamage);
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
            Assert.Equal(first.Scaling, second.Scaling);
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
    public void CardOffers_AreDeterministicAcrossMultipleChoices_WithSameSeedAndHistory()
    {
        const int seed = 1337;
        var store = new InMemoryBattleStore();
        var first = store.StartBattle("arena-card-offer-multi-a", "player-card-offer-multi", seed);
        var second = store.StartBattle("arena-card-offer-multi-b", "player-card-offer-multi", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        for (var offerIndex = 0; offerIndex < 2; offerIndex += 1)
        {
            var firstOffer = WaitForCardChoiceStep(store, first.BattleId, firstTick);
            var secondOffer = WaitForCardChoiceStep(store, second.BattleId, secondTick);

            Assert.Equal(
                firstOffer.OfferedCards.Select(card => card.Id).ToList(),
                secondOffer.OfferedCards.Select(card => card.Id).ToList());

            var firstSelected = firstOffer.OfferedCards[0].Id;
            var secondSelected = secondOffer.OfferedCards[0].Id;
            Assert.Equal(firstSelected, secondSelected);

            first = store.ChooseCard(firstOffer.BattleId, firstOffer.PendingChoiceId!, firstSelected);
            second = store.ChooseCard(secondOffer.BattleId, secondOffer.PendingChoiceId!, secondSelected);
            firstTick = first.Tick;
            secondTick = second.Tick;
        }
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
    public void CardStacking_RespectsMaxStacks_AndStopsOfferingCappedCards()
    {
        const int seed = 2026;
        const string cardId = "butcher_mark";
        const int maxStacks = 3;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-card-stack-cap", "player-card-stack-cap", seed);
        var tick = start.Tick;

        for (var stack = 1; stack <= maxStacks; stack += 1)
        {
            var choiceId = $"forced-stack-choice-{stack:D2}";
            ForcePendingCardChoice(store, start.BattleId, choiceId, [cardId]);
            var chosen = store.ChooseCard(start.BattleId, choiceId, cardId);
            tick = chosen.Tick;

            Assert.Equal(stack, GetSelectedCardStackCount(store, start.BattleId, cardId));
            Assert.Equal(stack, chosen.SelectedCards.Count(card => string.Equals(card.Id, cardId, StringComparison.Ordinal)));
        }

        ForcePendingCardChoice(store, start.BattleId, "forced-stack-choice-overcap", [cardId]);
        Assert.Throws<InvalidOperationException>(() =>
            store.ChooseCard(start.BattleId, "forced-stack-choice-overcap", cardId));
        ClearPendingCardChoice(store, start.BattleId);
        Assert.Equal(maxStacks, GetSelectedCardStackCount(store, start.BattleId, cardId));

        var postCapOffer = WaitForCardChoiceStep(store, start.BattleId, tick);
        Assert.DoesNotContain(postCapOffer.OfferedCards, card => string.Equals(card.Id, cardId, StringComparison.Ordinal));
    }

    [Fact]
    public void ChooseCard_ApplyingCard_ChangesExpectedPlayerStats()
    {
        const int seed = 9090;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-card-apply-stats", "player-card-apply-stats", seed);
        var offer = WaitForCardChoiceStep(store, start.BattleId, start.Tick);
        var selectedCard = offer.OfferedCards[0];

        var beforeModifiers = ReadPlayerModifiers(store, offer.BattleId);
        var beforePlayer = Assert.Single(offer.Actors, actor => actor.Kind == "player");
        var expectedCardEffects = ReadCardEffectsForStack(store, selectedCard.Id, stackCount: 1);

        var chosen = store.ChooseCard(offer.BattleId, offer.PendingChoiceId!, selectedCard.Id);
        var afterModifiers = ReadPlayerModifiers(store, chosen.BattleId);
        var afterPlayer = Assert.Single(chosen.Actors, actor => actor.Kind == "player");

        Assert.Equal(beforeModifiers.FlatDamageBonus + expectedCardEffects.FlatDamageBonus, afterModifiers.FlatDamageBonus);
        Assert.Equal(beforeModifiers.PercentDamageBonus + expectedCardEffects.PercentDamageBonus, afterModifiers.PercentDamageBonus);
        Assert.Equal(
            beforeModifiers.PercentAttackSpeedBonus + expectedCardEffects.PercentAttackSpeedBonus,
            afterModifiers.PercentAttackSpeedBonus);
        Assert.Equal(beforeModifiers.PercentMaxHpBonus + expectedCardEffects.PercentMaxHpBonus, afterModifiers.PercentMaxHpBonus);
        Assert.Equal(beforeModifiers.FlatHpOnHit + expectedCardEffects.FlatHpOnHit, afterModifiers.FlatHpOnHit);
        Assert.Equal(
            Math.Clamp(
                beforeModifiers.GlobalCooldownReductionPercent + expectedCardEffects.GlobalCooldownReductionPercent,
                0,
                MaxGlobalCooldownReductionPercent),
            afterModifiers.GlobalCooldownReductionPercent);

        var expectedMaxHp = ResolvePlayerMaxHpForPercentBonus(beforePlayer.MaxHp, expectedCardEffects.PercentMaxHpBonus);
        Assert.Equal(expectedMaxHp, afterPlayer.MaxHp);
        Assert.Equal(selectedCard.Id, Assert.Single(chosen.Events.OfType<CardChosenEventDto>()).Card.Id);
    }

    [Fact]
    public void CardChoiceCap_StopsOfferingAfterTwelveSelections()
    {
        // With new balance, organic runs produce ~6 card choices; use forced choices to reach the cap of 12.
        const int seed = 1337;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-card-cap", "player-card-cap", seed);
        var tick = start.Tick;

        // Force 12 card choices to hit the cap (4 card IDs × 3 stacks each = 12 total).
        // butcher_mark/bloodletter_edge/frenzy_clockwork/colossus_heart each have MaxStacks=3.
        var capCardIds = new[] { "butcher_mark", "bloodletter_edge", "frenzy_clockwork", "colossus_heart" };
        var choiceCount = 0;
        foreach (var capCardId in capCardIds)
        {
            for (var stack = 1; stack <= 3; stack += 1)
            {
                choiceCount += 1;
                var choiceId = $"forced-cap-choice-{choiceCount:D2}";
                ForcePendingCardChoice(store, start.BattleId, choiceId, [capCardId]);
                var chosen = store.ChooseCard(start.BattleId, choiceId, capCardId);
                tick = chosen.Tick;
            }
        }

        // ForcePendingCardChoice sets PendingCardChoice via reflection but does NOT increment
        // CardSelectionsGranted. Manually set it to 12 so TryOfferCardChoice blocks organic offers.
        {
            var capState = GetStoredBattle(store, start.BattleId);
            var grantedProp = capState.GetType().GetProperty("CardSelectionsGranted");
            Assert.NotNull(grantedProp);
            grantedProp!.SetValue(capState, 12);
        }

        // After cap is reached, forced choices should throw (butcher_mark is already at max stacks 3).
        ForcePendingCardChoice(store, start.BattleId, "forced-cap-choice-overcap", ["butcher_mark"]);
        Assert.Throws<InvalidOperationException>(() =>
            store.ChooseCard(start.BattleId, "forced-cap-choice-overcap", "butcher_mark"));
        ClearPendingCardChoice(store, start.BattleId);

        // Running the battle further should not offer new card choices organically.
        for (var index = 0; index < 200; index += 1)
        {
            var step = store.StepBattle(start.BattleId, tick, BuildAggressiveCommands());
            tick = step.Tick;
            Assert.False(step.IsAwaitingCardChoice, $"Expected no card choice after cap but got one at step {index}.");
            if (step.BattleStatus == "defeat")
            {
                return;
            }
        }
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
    public void StepBattle_EliteDeathTransition_IsDeterministicAcrossRepeatedFixedSeedExecutions()
    {
        const int seed = 81818;
        const int runCount = 4;
        var transitionSignatures = new List<string>();

        for (var runIndex = 0; runIndex < runCount; runIndex += 1)
        {
            var store = new InMemoryBattleStore();
            var start = store.StartBattle($"arena-elite-death-repeat-{runIndex}", "player-elite-death-repeat", seed);
            var step = WaitForSnapshot(
                store,
                start,
                snapshot => snapshot.Actors.Any(actor => actor.Kind == "mob" && actor.IsElite),
                maxSteps: 1400);
            var tick = step.Tick;
            var targetElite = step.Actors
                .Where(actor => actor.Kind == "mob" && actor.IsElite)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .FirstOrDefault();
            Assert.NotNull(targetElite);
            var targetEliteId = targetElite!.ActorId;

            SetActorHp(store, step.BattleId, targetEliteId, hp: 1);

            var foundTransition = false;
            for (var stepIndex = 0; stepIndex < MaxStepsToKillElite; stepIndex += 1)
            {
                step = AdvanceBattleSelectingCards(
                    store,
                    step.BattleId,
                    tick,
                    BuildAggressiveCommandsTargeting(targetEliteId));
                tick = step.Tick;

                if (!step.Events.OfType<EliteDiedEventDto>().Any(evt =>
                        string.Equals(evt.EliteEntityId, targetEliteId, StringComparison.Ordinal)))
                {
                    if (step.IsRunEnded)
                    {
                        break;
                    }

                    continue;
                }

                transitionSignatures.Add(BuildEliteDeathTransitionSignature(step, targetEliteId));
                Assert.DoesNotContain(
                    step.Actors,
                    actor =>
                        actor.Kind == "mob" &&
                        !actor.IsElite &&
                        string.Equals(actor.BuffSourceEliteId, targetEliteId, StringComparison.Ordinal));
                foundTransition = true;
                break;
            }

            Assert.True(foundTransition, $"Expected deterministic elite-death transition in run index {runIndex}.");
        }

        var baseline = transitionSignatures[0];
        foreach (var signature in transitionSignatures.Skip(1))
        {
            Assert.Equal(baseline, signature);
        }
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

    [Fact]
    public void StepBattle_SpawnAndEliteDirector_SignaturesAreDeterministicForSameSeed()
    {
        const int seed = 97531;
        const int maxSteps = 420;
        var store = new InMemoryBattleStore();
        var first = store.StartBattle("arena-spawn-director-det-a", "player-spawn-director-det", seed);
        var second = store.StartBattle("arena-spawn-director-det-b", "player-spawn-director-det", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;

        var firstSignatures = new List<string> { BuildSpawnEliteSignature(first) };
        var secondSignatures = new List<string> { BuildSpawnEliteSignature(second) };

        for (var stepIndex = 0; stepIndex < maxSteps; stepIndex += 1)
        {
            first = AdvanceBattleSelectingCards(store, first.BattleId, firstTick, BuildAggressiveCommands());
            second = AdvanceBattleSelectingCards(store, second.BattleId, secondTick, BuildAggressiveCommands());
            firstTick = first.Tick;
            secondTick = second.Tick;

            var firstSignature = BuildSpawnEliteSignature(first);
            var secondSignature = BuildSpawnEliteSignature(second);
            firstSignatures.Add(firstSignature);
            secondSignatures.Add(secondSignature);

            Assert.Equal(firstSignature, secondSignature);
            if (first.IsRunEnded || second.IsRunEnded)
            {
                break;
            }
        }

        Assert.True(firstSignatures.Count > 50, "Expected to collect enough spawn timeline signatures before run end.");
        Assert.Equal(firstSignatures, secondSignatures);
    }

    [Fact]
    public void StartBattle_SkillProgressionState_InitializesAtLevelOneWithBaseCooldowns()
    {
        const int seed = 6060;
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-skill-leveling-initial-state", "player-skill-leveling-initial-state", seed);

        var expectedSkillIds = new[]
        {
            "exori",
            "exori_mas",
            "exori_min",
        };

        foreach (var skillId in expectedSkillIds)
        {
            Assert.Equal(1, ReadStoredSkillLevel(store, start.BattleId, skillId));
            AssertSkillCooldownTotal(
                start,
                skillId,
                ResolveExpectedSkillCooldownTotal(GetBaseSkillCooldownTotal(skillId), skillLevel: 1));
        }

        Assert.All(start.Skills, skill => Assert.Equal(0, skill.CooldownRemainingMs));
    }

    [Fact]
    public void RunLeveling_FirstLevelUp_AppliesDeterministicSkillUpgradeState()
    {
        const int seed = 6060;
        var store = new InMemoryBattleStore();
        var step = store.StartBattle("arena-skill-leveling-first-upgrade", "player-skill-leveling-first-upgrade", seed);
        var tick = step.Tick;

        for (var index = 0; index < 3000; index += 1)
        {
            step = store.StepBattle(step.BattleId, tick, BuildAggressiveCommands());
            tick = step.Tick;

            if (step.RunLevel < 2)
            {
                if (step.IsRunEnded)
                {
                    break;
                }

                continue;
            }

            Assert.Equal(2, step.RunLevel);
            // RunLevelSkillUpgradeOrder[0] = Exori → exori reaches level 2 first
            Assert.Equal(2, ReadStoredSkillLevel(store, step.BattleId, "exori"));
            Assert.Equal(1, ReadStoredSkillLevel(store, step.BattleId, "exori_min"));
            Assert.Equal(1, ReadStoredSkillLevel(store, step.BattleId, "exori_mas"));

            AssertSkillCooldownTotal(step, "exori", ResolveExpectedSkillCooldownTotal(ExoriBaseCooldownMs, skillLevel: 2));
            AssertSkillCooldownTotal(step, "exori_min", ResolveExpectedSkillCooldownTotal(ExoriMinBaseCooldownMs, skillLevel: 1));
            AssertSkillCooldownTotal(step, "exori_mas", ResolveExpectedSkillCooldownTotal(ExoriMasBaseCooldownMs, skillLevel: 1));
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected run level 2 skill upgrade state to be reached deterministically.");
    }

    [Fact]
    public void RunLeveling_SequentialEarlyLevelUps_FollowDeterministicUpgradeOrderWithoutRegressingOtherSkills()
    {
        const int seed = 6060;
        var store = new InMemoryBattleStore();
        var step = store.StartBattle("arena-skill-leveling-sequential-upgrades", "player-skill-leveling-sequential-upgrades", seed);
        var tick = step.Tick;

        for (var index = 0; index < 4000 && step.RunLevel < 3 && !step.IsRunEnded; index += 1)
        {
            step = store.StepBattle(step.BattleId, tick, BuildAggressiveCommands());
            tick = step.Tick;

            if (step.IsAwaitingCardChoice)
            {
                ClearPendingCardChoice(store, step.BattleId);
            }
        }

        Assert.True(step.RunLevel >= 3, "Expected deterministic progression to reach run level 3.");
        // RunLevelSkillUpgradeOrder: [Exori, ExoriMin, ExoriMas] → levels 2+3 upgrade Exori then ExoriMin
        Assert.Equal(2, ReadStoredSkillLevel(store, step.BattleId, "exori"));
        Assert.Equal(2, ReadStoredSkillLevel(store, step.BattleId, "exori_min"));
        Assert.Equal(1, ReadStoredSkillLevel(store, step.BattleId, "exori_mas"));

        AssertSkillCooldownTotal(step, "exori", ResolveExpectedSkillCooldownTotal(ExoriBaseCooldownMs, skillLevel: 2));
        AssertSkillCooldownTotal(step, "exori_min", ResolveExpectedSkillCooldownTotal(ExoriMinBaseCooldownMs, skillLevel: 2));
        AssertSkillCooldownTotal(step, "exori_mas", ResolveExpectedSkillCooldownTotal(ExoriMasBaseCooldownMs, skillLevel: 1));
    }

    [Fact]
    public void RunLeveling_ExoriUpgrade_ReducesCooldownAfterFirstLevelUp()
    {
        const int seed = 6060;
        var store = new InMemoryBattleStore();
        var step = store.StartBattle("arena-skill-leveling-exori-cooldown", "player-skill-leveling-exori-cooldown", seed);
        var tick = step.Tick;

        for (var index = 0; index < 3000 && step.RunLevel < 2 && !step.IsRunEnded; index += 1)
        {
            step = store.StepBattle(step.BattleId, tick, BuildAggressiveCommands());
            tick = step.Tick;

            if (step.IsAwaitingCardChoice)
            {
                ClearPendingCardChoice(store, step.BattleId);
            }
        }

        Assert.True(step.RunLevel >= 2, "Expected deterministic progression to reach run level 2.");
        // RunLevelSkillUpgradeOrder[0] = Exori → exori is upgraded first
        Assert.Equal(2, ReadStoredSkillLevel(store, step.BattleId, "exori"));

        // At level 2, exori cooldown should be reduced by the skill scaling factor
        AssertSkillCooldownTotal(step, "exori", ResolveExpectedSkillCooldownTotal(ExoriBaseCooldownMs, skillLevel: 2));
    }

    [Fact]
    public void RunLeveling_SameSeedAndCommandTimeline_ProducesDeterministicSkillProgression()
    {
        const int seed = 42424;
        var store = new InMemoryBattleStore();
        var first = store.StartBattle("arena-skill-leveling-det-a", "player-skill-leveling-det", seed);
        var second = store.StartBattle("arena-skill-leveling-det-b", "player-skill-leveling-det", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;
        var sawLevelUp = false;
        var sawSkillCooldownUpgrade = false;

        for (var stepIndex = 0; stepIndex < 750; stepIndex += 1)
        {
            var commands = BuildDeterministicCommandBatch(stepIndex);
            first = store.StepBattle(first.BattleId, firstTick, commands);
            second = store.StepBattle(second.BattleId, secondTick, commands);
            firstTick = first.Tick;
            secondTick = second.Tick;
            AssertDeterministicKeySnapshotFields(first, second);

            sawLevelUp |= first.RunLevel > RunInitialLevel;
            sawSkillCooldownUpgrade |= first.Skills.Any(skill =>
                skill.CooldownTotalMs < ResolveExpectedSkillCooldownTotal(GetBaseSkillCooldownTotal(skill.SkillId), skillLevel: 1));

            if (first.IsAwaitingCardChoice || second.IsAwaitingCardChoice)
            {
                Assert.True(first.IsAwaitingCardChoice);
                Assert.True(second.IsAwaitingCardChoice);
                Assert.Equal(first.PendingChoiceId, second.PendingChoiceId);
                Assert.Equal(
                    first.OfferedCards.Select(card => card.Id).ToList(),
                    second.OfferedCards.Select(card => card.Id).ToList());
                ClearPendingCardChoice(store, first.BattleId);
                ClearPendingCardChoice(store, second.BattleId);
            }

            if (first.IsRunEnded || second.IsRunEnded)
            {
                Assert.Equal(first.IsRunEnded, second.IsRunEnded);
                break;
            }
        }

        Assert.True(sawLevelUp, "Expected deterministic run-level progression to trigger at least one level-up.");
        Assert.True(sawSkillCooldownUpgrade, "Expected deterministic skill progression to alter at least one skill cooldown total.");
    }

    [Fact]
    public void RunLeveling_RepeatedRunsWithSameSeedAndCommands_ProduceEquivalentSignatures()
    {
        const int seed = 9001;
        const int runCount = 4;
        const int maxSteps = 750;
        var store = new InMemoryBattleStore();
        var timelineSignaturesByRun = new List<IReadOnlyList<string>>();

        for (var runIndex = 0; runIndex < runCount; runIndex += 1)
        {
            var step = store.StartBattle($"arena-skill-leveling-repeat-{runIndex}", "player-skill-leveling-repeat", seed);
            var tick = step.Tick;
            var signatures = new List<string> { BuildSkillProgressSignature(step) };
            var reachedLevelUp = step.RunLevel > RunInitialLevel;

            for (var stepIndex = 0; stepIndex < maxSteps; stepIndex += 1)
            {
                var commands = BuildDeterministicCommandBatch(stepIndex);
                step = store.StepBattle(step.BattleId, tick, commands);
                tick = step.Tick;
                signatures.Add(BuildSkillProgressSignature(step));
                reachedLevelUp |= step.RunLevel > RunInitialLevel;

                if (step.IsAwaitingCardChoice)
                {
                    ClearPendingCardChoice(store, step.BattleId);
                }

                if (step.IsRunEnded)
                {
                    break;
                }
            }

            Assert.True(reachedLevelUp, "Expected each repeated deterministic run to include at least one level-up.");
            timelineSignaturesByRun.Add(signatures);
        }

        var baseline = timelineSignaturesByRun[0];
        foreach (var current in timelineSignaturesByRun.Skip(1))
        {
            Assert.Equal(baseline, current);
        }
    }

    [Fact]
    public void ResolveRangedTarget_ReturnsLockedTargetThenNearestThenNull()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-ranged-target-resolution", "player-ranged-target-resolution", 1337);
        var player = Assert.Single(start.Actors, actor => string.Equals(actor.Kind, "player", StringComparison.Ordinal));
        var mobs = start.Actors
            .Where(actor => string.Equals(actor.Kind, "mob", StringComparison.Ordinal))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        Assert.True(mobs.Count >= 2, "Expected at least two mobs to validate ranged target fallback behavior.");

        var lockedTarget = mobs[0];
        var fallbackNearest = mobs[1];

        SetActorTile(store, start.BattleId, lockedTarget.ActorId, player.TileX + 1, player.TileY);
        SetActorTile(store, start.BattleId, fallbackNearest.ActorId, player.TileX + 2, player.TileY);
        for (var index = 2; index < mobs.Count; index += 1)
        {
            SetActorTile(store, start.BattleId, mobs[index].ActorId, 0, 0);
        }

        SetLockedTargetEntityId(store, start.BattleId, lockedTarget.ActorId);
        var resolvedLocked = ResolveRangedTargetActorIdViaReflection(
            store,
            start.BattleId,
            ArenaConfig.AutoAttackRangedMaxRange,
            requireLos: true);
        Assert.Equal(lockedTarget.ActorId, resolvedLocked);

        SetLockedTargetEntityId(store, start.BattleId, null);
        SetActorTile(store, start.BattleId, lockedTarget.ActorId, player.TileX + 3, player.TileY);
        SetActorTile(store, start.BattleId, fallbackNearest.ActorId, player.TileX + 1, player.TileY);
        var resolvedFallback = ResolveRangedTargetActorIdViaReflection(
            store,
            start.BattleId,
            ArenaConfig.AutoAttackRangedMaxRange,
            requireLos: true);
        Assert.Equal(fallbackNearest.ActorId, resolvedFallback);

        RemoveAllMobs(store, start.BattleId);
        var resolvedEmpty = ResolveRangedTargetActorIdViaReflection(
            store,
            start.BattleId,
            ArenaConfig.AutoAttackRangedMaxRange,
            requireLos: true);
        Assert.Null(resolvedEmpty);
    }

    [Fact]
    public void BuildShotgunConeTiles_ProducesExpectedTileSets_ExcludesOutOfBounds_AndUsesUpForDegenerateTarget()
    {
        var from = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY);

        var upwardCone = BuildShotgunConeTilesViaReflection(
            from,
            new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY - 2),
            maxRange: 3);
        Assert.Equal(
            new HashSet<TilePos>
            {
                new(3, 2),
                new(2, 1), new(3, 1), new(4, 1),
                new(1, 0), new(2, 0), new(3, 0), new(4, 0), new(5, 0)
            },
            upwardCone.ToHashSet());

        var diagonalCone = BuildShotgunConeTilesViaReflection(
            from,
            new TilePos(ArenaConfig.PlayerTileX + 2, ArenaConfig.PlayerTileY - 2),
            maxRange: 2);
        Assert.Equal(
            new HashSet<TilePos>
            {
                new(4, 2),
                new(5, 1), new(4, 1), new(5, 2)
            },
            diagonalCone.ToHashSet());

        var clippedCone = BuildShotgunConeTilesViaReflection(
            new TilePos(1, 1),
            new TilePos(1, -1),
            maxRange: 3);
        Assert.Single(clippedCone);
        Assert.Equal(new TilePos(1, 0), clippedCone[0]);
        Assert.All(clippedCone, tile =>
        {
            Assert.InRange(tile.X, 0, ArenaConfig.Width - 1);
            Assert.InRange(tile.Y, 0, ArenaConfig.Height - 1);
        });

        var degenerateCone = BuildShotgunConeTilesViaReflection(from, from, maxRange: 2);
        Assert.Equal(
            new HashSet<TilePos>
            {
                new(3, 2),
                new(2, 1), new(3, 1), new(4, 1)
            },
            degenerateCone.ToHashSet());
    }

    [Fact]
    public void Shotgun_AssistCast_HitsAllMobsInCone_LeavesOutsideMobsUntouched_AndAppliesPrimaryDirectionKnockback()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-shotgun-cone-aoe", ArenaConfig.CharacterIds.RangedPrototype, 1337);
        Assert.Contains(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));
        Assert.DoesNotContain(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.ExoriSkillId, StringComparison.Ordinal));

        SpawnAllMobSlotsViaReflection(store, start.BattleId);
        SetAllMobMoveCooldownViaReflection(store, start.BattleId, cooldownRemainingMs: 10_000);

        var mobIds = GetMobActorIds(store, start.BattleId);
        Assert.True(mobIds.Count >= 7, "Expected at least seven mobs for cone-hit, block, and outside-cone validation.");

        var frontMobId = mobIds[0];
        var leftMidMobId = mobIds[1];
        var blockerMidMobId = mobIds[2];
        var rightMidMobId = mobIds[3];
        var leftFarMobId = mobIds[4];
        var fragileFarMobId = mobIds[5];
        var outsideMobId = mobIds[6];

        var hitMobIds = new[]
        {
            frontMobId,
            leftMidMobId,
            blockerMidMobId,
            rightMidMobId,
            leftFarMobId,
            fragileFarMobId
        };

        SetActorTile(store, start.BattleId, frontMobId, 3, 2);
        SetActorTile(store, start.BattleId, leftMidMobId, 2, 1);
        SetActorTile(store, start.BattleId, blockerMidMobId, 3, 1);
        SetActorTile(store, start.BattleId, rightMidMobId, 4, 1);
        SetActorTile(store, start.BattleId, leftFarMobId, 1, 0);
        SetActorTile(store, start.BattleId, fragileFarMobId, 5, 0);
        SetActorTile(store, start.BattleId, outsideMobId, 0, 6);
        SetActorHp(store, start.BattleId, fragileFarMobId, 1);

        var stagingTiles = new[]
        {
            new TilePos(1, 6),
            new TilePos(2, 6),
            new TilePos(3, 6),
            new TilePos(4, 6),
            new TilePos(5, 6),
            new TilePos(6, 6),
            new TilePos(6, 5),
            new TilePos(0, 5)
        };
        for (var index = 7; index < mobIds.Count; index += 1)
        {
            var tile = stagingTiles[(index - 7) % stagingTiles.Length];
            SetActorTile(store, start.BattleId, mobIds[index], tile.X, tile.Y);
        }

        SetLockedTargetEntityId(store, start.BattleId, blockerMidMobId);

        var assistConfigCommand = new BattleCommandDto(
            ArenaConfig.SetAssistConfigCommandType,
            AssistConfig: new AssistConfigDto(
                Enabled: true,
                AutoHealEnabled: false,
                HealAtHpPercent: 40,
                AutoGuardEnabled: false,
                GuardAtHpPercent: 60,
                AutoOffenseEnabled: true,
                OffenseMode: ArenaConfig.AssistOffenseModeCooldownSpam,
                AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                {
                    [ArenaConfig.ExoriMasSkillId] = false,
                    [ArenaConfig.ShotgunSkillId] = true,
                    [ArenaConfig.VoidRicochetSkillId] = false,
                    [ArenaConfig.SigilBoltSkillId] = false
                },
                MaxAutoCastsPerTick: 1));

        var step = store.StepBattle(start.BattleId, start.Tick, [assistConfigCommand]);

        Assert.Contains(
            step.Events.OfType<AssistCastEventDto>(),
            evt => string.Equals(evt.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));

        var shotgunProjectiles = step.Events
            .OfType<RangedProjectileFiredEventDto>()
            .Where(evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.ShotgunId, StringComparison.Ordinal))
            .ToList();
        Assert.All(shotgunProjectiles, evt => Assert.False(evt.Pierces));
        Assert.Equal(ArenaConfig.ShotgunVisualProjectileCount, shotgunProjectiles.Count(evt => evt.TargetActorId is null));
        Assert.Equal(hitMobIds.Length, shotgunProjectiles.Count(evt => evt.TargetActorId is not null));

        var damageNumbers = step.Events.OfType<DamageNumberEventDto>().ToList();
        foreach (var hitMobId in hitMobIds)
        {
            Assert.Contains(
                damageNumbers,
                evt => string.Equals(evt.TargetEntityId, hitMobId, StringComparison.Ordinal));
        }
        Assert.DoesNotContain(
            damageNumbers,
            evt => string.Equals(evt.TargetEntityId, outsideMobId, StringComparison.Ordinal));

        var knockedBackEvents = step.Events.OfType<MobKnockedBackEventDto>().ToList();
        Assert.DoesNotContain(knockedBackEvents, evt => string.Equals(evt.ActorId, frontMobId, StringComparison.Ordinal));
        Assert.DoesNotContain(knockedBackEvents, evt => string.Equals(evt.ActorId, fragileFarMobId, StringComparison.Ordinal));
        Assert.All(knockedBackEvents, evt =>
        {
            Assert.Equal(evt.FromTile.X, evt.ToTile.X);
            Assert.Equal(evt.FromTile.Y - 1, evt.ToTile.Y);
        });

        AssertActorTile(step, frontMobId, 3, 2);
        AssertActorTile(step, leftMidMobId, 2, 0);
        AssertActorTile(step, blockerMidMobId, 3, 0);
        AssertActorTile(step, rightMidMobId, 4, 0);
        AssertActorTile(step, leftFarMobId, 1, 0);
        Assert.DoesNotContain(
            step.Actors,
            actor => string.Equals(actor.ActorId, fragileFarMobId, StringComparison.Ordinal));
        AssertActorTile(step, outsideMobId, 0, 6);

        var shotgunSkill = Assert.Single(step.Skills, skill =>
            string.Equals(skill.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));
        Assert.Equal(ArenaConfig.ShotgunCooldownMs, shotgunSkill.CooldownRemainingMs);
        Assert.Equal(ArenaConfig.PlayerGlobalCooldownMs, step.GlobalCooldownRemainingMs);
    }

    [Fact]
    public void Shotgun_NoTarget_DoesNotConsumeCooldownOrGlobalCooldown()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-shotgun-no-target", ArenaConfig.CharacterIds.RangedPrototype, 1337);
        Assert.Contains(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));

        RemoveAllMobs(store, start.BattleId);
        var step = store.StepBattle(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto(
                    ArenaConfig.SetAssistConfigCommandType,
                    AssistConfig: new AssistConfigDto(
                        Enabled: true,
                        AutoHealEnabled: false,
                        HealAtHpPercent: 40,
                        AutoGuardEnabled: false,
                        GuardAtHpPercent: 60,
                        AutoOffenseEnabled: true,
                        OffenseMode: ArenaConfig.AssistOffenseModeCooldownSpam,
                        AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                        {
                            [ArenaConfig.ExoriMasSkillId] = false,
                            [ArenaConfig.ShotgunSkillId] = true,
                            [ArenaConfig.VoidRicochetSkillId] = false,
                            [ArenaConfig.SigilBoltSkillId] = false
                        },
                        MaxAutoCastsPerTick: 1))
            ]);

        Assert.DoesNotContain(
            step.Events.OfType<AssistCastEventDto>(),
            evt => string.Equals(evt.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));
        Assert.DoesNotContain(
            step.Events.OfType<RangedProjectileFiredEventDto>(),
            evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.ShotgunId, StringComparison.Ordinal));

        var shotgunSkill = Assert.Single(step.Skills, skill =>
            string.Equals(skill.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));
        Assert.Equal(0, shotgunSkill.CooldownRemainingMs);
        Assert.Equal(0, step.GlobalCooldownRemainingMs);
    }

    [Fact]
    public void Shotgun_DoesNotFireForKina()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-shotgun-kina", ArenaConfig.CharacterIds.Kina, 1337);
        Assert.DoesNotContain(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 30; stepIndex += 1)
        {
            var step = store.StepBattle(start.BattleId, currentTick, []);
            currentTick = step.Tick;

            Assert.DoesNotContain(
                step.Events.OfType<AssistCastEventDto>(),
                evt => string.Equals(evt.SkillId, ArenaConfig.ShotgunSkillId, StringComparison.Ordinal));
            Assert.DoesNotContain(
                step.Events.OfType<RangedProjectileFiredEventDto>(),
                evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.ShotgunId, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void BuildVoidRicochetPath_PathNeverLeavesBounds()
    {
        var from = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY);
        var segments = BuildVoidRicochetPathViaReflection(
            from,
            new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY - 1),
            ArenaConfig.VoidRicochetMaxBounces,
            ArenaConfig.VoidRicochetMaxTotalTiles);

        Assert.NotEmpty(segments);
        foreach (var segment in segments)
        {
            var tiles = ReadRicochetSegmentTiles(segment);
            Assert.NotEmpty(tiles);
            foreach (var tile in tiles)
            {
                Assert.InRange(tile.X, 0, ArenaConfig.Width - 1);
                Assert.InRange(tile.Y, 0, ArenaConfig.Height - 1);
            }
        }
    }

    [Fact]
    public void BuildVoidRicochetPath_BounceCountNeverExceedsConfiguredMax()
    {
        var from = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY);
        var segments = BuildVoidRicochetPathViaReflection(
            from,
            new TilePos(ArenaConfig.PlayerTileX + 1, ArenaConfig.PlayerTileY - 1),
            maxBounces: ArenaConfig.VoidRicochetMaxBounces,
            maxTotalTiles: ArenaConfig.VoidRicochetMaxTotalTiles);

        Assert.NotEmpty(segments);
        Assert.InRange(segments.Count - 1, 0, ArenaConfig.VoidRicochetMaxBounces);
    }

    [Fact]
    public void BuildVoidRicochetPath_TotalTilesNeverExceedsSafetyCap()
    {
        var from = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY);
        var segments = BuildVoidRicochetPathViaReflection(
            from,
            new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY - 1),
            maxBounces: ArenaConfig.VoidRicochetMaxBounces,
            maxTotalTiles: 5);

        Assert.Equal(5, segments.Sum(segment => ReadRicochetSegmentTiles(segment).Count));
    }

    [Fact]
    public void BuildVoidRicochetPath_DegenerateFromEqualsTarget_UsesUpAsInitialDirection()
    {
        var from = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY);
        var segments = BuildVoidRicochetPathViaReflection(
            from,
            from,
            maxBounces: ArenaConfig.VoidRicochetMaxBounces,
            maxTotalTiles: ArenaConfig.VoidRicochetMaxTotalTiles);

        Assert.NotEmpty(segments);
        var firstSegmentTiles = ReadRicochetSegmentTiles(segments[0]);
        Assert.NotEmpty(firstSegmentTiles);
        Assert.Equal(new TilePos(from.X, from.Y - 1), firstSegmentTiles[0]);
    }

    [Fact]
    public void BuildVoidRicochetPath_SameInputAcrossTwentyRuns_IsNotAlwaysIdentical()
    {
        var from = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY);
        var target = new TilePos(ArenaConfig.PlayerTileX, ArenaConfig.PlayerTileY - 1);
        var signatures = new HashSet<string>(StringComparer.Ordinal);

        for (var runIndex = 0; runIndex < 20; runIndex += 1)
        {
            var segments = BuildVoidRicochetPathViaReflection(
                from,
                target,
                maxBounces: ArenaConfig.VoidRicochetMaxBounces,
                maxTotalTiles: ArenaConfig.VoidRicochetMaxTotalTiles);
            var signature = string.Join(
                "|",
                segments.Select(segment => string.Join(
                    ";",
                    ReadRicochetSegmentTiles(segment).Select(tile => $"{tile.X},{tile.Y}"))));
            signatures.Add(signature);
        }

        Assert.True(signatures.Count > 1, "Expected non-deterministic ricochet paths, but all 20 runs were identical.");
    }

    [Fact]
    public void VoidRicochet_AssistCast_HitsMobsAcrossSegments_AndEmitsOneProjectilePerSegment()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-void-ricochet-segments", ArenaConfig.CharacterIds.RangedPrototype, 1337);
        Assert.Contains(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));

        SpawnAllMobSlotsViaReflection(store, start.BattleId);
        SetAllMobMoveCooldownViaReflection(store, start.BattleId, cooldownRemainingMs: 10_000);

        var mobIds = GetMobActorIds(store, start.BattleId);
        Assert.True(mobIds.Count >= 6, "Expected at least six mobs for ricochet segment validation.");

        var targetMobId = mobIds[0];
        var midLaneMobId = mobIds[1];
        var topBorderMobId = mobIds[2];
        var bottomBorderMobId = mobIds[3];
        var outsideConeMobId = mobIds[4];

        SetActorTile(store, start.BattleId, targetMobId, 3, 2);
        SetActorTile(store, start.BattleId, midLaneMobId, 3, 1);
        SetActorTile(store, start.BattleId, topBorderMobId, 3, 0);
        SetActorTile(store, start.BattleId, bottomBorderMobId, 3, 6);
        SetActorTile(store, start.BattleId, outsideConeMobId, 0, 6);

        var stagingTiles = new[]
        {
            new TilePos(1, 6),
            new TilePos(2, 6),
            new TilePos(4, 6),
            new TilePos(5, 6),
            new TilePos(6, 6)
        };
        for (var index = 5; index < mobIds.Count; index += 1)
        {
            var tile = stagingTiles[(index - 5) % stagingTiles.Length];
            SetActorTile(store, start.BattleId, mobIds[index], tile.X, tile.Y);
        }

        SetLockedTargetEntityId(store, start.BattleId, targetMobId);

        var assistConfigCommand = new BattleCommandDto(
            ArenaConfig.SetAssistConfigCommandType,
            AssistConfig: new AssistConfigDto(
                Enabled: true,
                AutoHealEnabled: false,
                HealAtHpPercent: 40,
                AutoGuardEnabled: false,
                GuardAtHpPercent: 60,
                AutoOffenseEnabled: true,
                OffenseMode: ArenaConfig.AssistOffenseModeCooldownSpam,
                AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                {
                    [ArenaConfig.VoidRicochetSkillId] = true,
                    [ArenaConfig.ShotgunSkillId] = false,
                    [ArenaConfig.SigilBoltSkillId] = false
                },
                MaxAutoCastsPerTick: 1));

        var step = store.StepBattle(start.BattleId, start.Tick, [assistConfigCommand]);

        Assert.Contains(
            step.Events.OfType<AssistCastEventDto>(),
            evt => string.Equals(evt.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));

        var projectileSegments = step.Events
            .OfType<RangedProjectileFiredEventDto>()
            .Where(evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.VoidRicochetId, StringComparison.Ordinal))
            .ToList();
        Assert.InRange(projectileSegments.Count, 1, ArenaConfig.VoidRicochetMaxBounces + 1);

        foreach (var projectileSegment in projectileSegments)
        {
            Assert.Null(projectileSegment.TargetActorId);
            Assert.True(projectileSegment.Pierces);
            Assert.InRange(projectileSegment.FromTile.X, 0, ArenaConfig.Width - 1);
            Assert.InRange(projectileSegment.FromTile.Y, 0, ArenaConfig.Height - 1);
            Assert.InRange(projectileSegment.ToTile.X, 0, ArenaConfig.Width - 1);
            Assert.InRange(projectileSegment.ToTile.Y, 0, ArenaConfig.Height - 1);
        }

        var damageNumbers = step.Events.OfType<DamageNumberEventDto>().ToList();
        Assert.Contains(damageNumbers, evt => string.Equals(evt.TargetEntityId, targetMobId, StringComparison.Ordinal));
        Assert.Contains(damageNumbers, evt => string.Equals(evt.TargetEntityId, midLaneMobId, StringComparison.Ordinal));
        Assert.Contains(damageNumbers, evt => string.Equals(evt.TargetEntityId, topBorderMobId, StringComparison.Ordinal));
        Assert.True(damageNumbers.Count >= 3, "Expected at least three deterministic hits on the initial upward segment.");

        var skill = Assert.Single(step.Skills, entry => string.Equals(entry.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));
        Assert.Equal(ArenaConfig.VoidRicochetCooldownMs, skill.CooldownRemainingMs);
        Assert.Equal(ArenaConfig.PlayerGlobalCooldownMs, step.GlobalCooldownRemainingMs);
    }

    [Fact]
    public void VoidRicochet_NoTarget_DoesNotConsumeCooldownOrGlobalCooldown()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-void-ricochet-no-target", ArenaConfig.CharacterIds.RangedPrototype, 1337);
        Assert.Contains(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));

        RemoveAllMobs(store, start.BattleId);
        var step = store.StepBattle(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto(
                    ArenaConfig.SetAssistConfigCommandType,
                    AssistConfig: new AssistConfigDto(
                        Enabled: true,
                        AutoHealEnabled: false,
                        HealAtHpPercent: 40,
                        AutoGuardEnabled: false,
                        GuardAtHpPercent: 60,
                        AutoOffenseEnabled: true,
                        OffenseMode: ArenaConfig.AssistOffenseModeCooldownSpam,
                        AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                        {
                            [ArenaConfig.VoidRicochetSkillId] = true,
                            [ArenaConfig.ShotgunSkillId] = false,
                            [ArenaConfig.SigilBoltSkillId] = false
                        },
                        MaxAutoCastsPerTick: 1))
            ]);

        Assert.DoesNotContain(
            step.Events.OfType<AssistCastEventDto>(),
            evt => string.Equals(evt.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));
        Assert.DoesNotContain(
            step.Events.OfType<RangedProjectileFiredEventDto>(),
            evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.VoidRicochetId, StringComparison.Ordinal));

        var skill = Assert.Single(step.Skills, entry =>
            string.Equals(entry.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));
        Assert.Equal(0, skill.CooldownRemainingMs);
        Assert.Equal(0, step.GlobalCooldownRemainingMs);
    }

    [Fact]
    public void VoidRicochet_DoesNotFireForKina()
    {
        var store = new InMemoryBattleStore();
        var start = store.StartBattle("arena-void-ricochet-kina", ArenaConfig.CharacterIds.Kina, 1337);
        Assert.DoesNotContain(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 30; stepIndex += 1)
        {
            var step = store.StepBattle(start.BattleId, currentTick, []);
            currentTick = step.Tick;

            Assert.DoesNotContain(
                step.Events.OfType<AssistCastEventDto>(),
                evt => string.Equals(evt.SkillId, ArenaConfig.VoidRicochetSkillId, StringComparison.Ordinal));
            Assert.DoesNotContain(
                step.Events.OfType<RangedProjectileFiredEventDto>(),
                evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.VoidRicochetId, StringComparison.Ordinal));
        }
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

    private static IReadOnlyList<BattleCommandDto> BuildDeterministicCommandBatch(int stepIndex)
    {
        var directions = new[]
        {
            "up",
            "up_right",
            "right",
            "down_right",
            "down",
            "down_left",
            "left",
            "up_left"
        };
        var direction = directions[stepIndex % directions.Length];
        var commands = new List<BattleCommandDto>
        {
            new BattleCommandDto("set_facing", Dir: direction)
        };

        if (stepIndex % 2 == 0)
        {
            commands.Add(new BattleCommandDto("move_player", Dir: direction));
        }

        if (stepIndex % 3 == 0)
        {
            commands.Add(new BattleCommandDto("cast_skill", SkillId: "exori_min"));
        }

        if (stepIndex % 4 == 0)
        {
            commands.Add(new BattleCommandDto(
                "set_ground_target",
                GroundTileX: ArenaConfig.PlayerTileX,
                GroundTileY: ArenaConfig.PlayerTileY));
        }

        if (stepIndex % 7 == 0)
        {
            commands.Add(new BattleCommandDto("set_target", TargetEntityId: null));
        }

        if (stepIndex % 11 == 0)
        {
            commands.Add(new BattleCommandDto(
                "set_assist_config",
                AssistConfig: new AssistConfigDto(
                    Enabled: true,
                    AutoHealEnabled: true,
                    HealAtHpPercent: 40,
                    AutoGuardEnabled: true,
                    GuardAtHpPercent: 60,
                    AutoOffenseEnabled: true,
                    OffenseMode: "cooldown_spam",
                    AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                    {
                        ["exori"] = true,
                        ["exori_min"] = true,
                        ["exori_mas"] = true,
                        ["avalanche"] = true
                    },
                    MaxAutoCastsPerTick: 1)));
        }

        return commands;
    }

    private static void AssertDeterministicKeySnapshotFields(BattleSnapshot first, BattleSnapshot second)
    {
        Assert.Equal(first.Tick, second.Tick);
        Assert.Equal(first.BattleStatus, second.BattleStatus);
        Assert.Equal(first.IsRunEnded, second.IsRunEnded);
        Assert.Equal(first.RunEndReason, second.RunEndReason);
        Assert.Equal(first.RunEndedAtMs, second.RunEndedAtMs);
        Assert.Equal(first.RunXp, second.RunXp);
        Assert.Equal(first.RunLevel, second.RunLevel);
        Assert.Equal(first.XpToNextLevel, second.XpToNextLevel);
        Assert.Equal(first.TotalKills, second.TotalKills);
        Assert.Equal(first.EliteKills, second.EliteKills);
        Assert.Equal(first.ChestsOpened, second.ChestsOpened);
        Assert.Equal(first.RunTimeMs, second.RunTimeMs);
        Assert.Equal(first.TimeSurvivedMs, second.TimeSurvivedMs);
        Assert.Equal(first.GlobalCooldownRemainingMs, second.GlobalCooldownRemainingMs);
        Assert.Equal(first.GlobalCooldownTotalMs, second.GlobalCooldownTotalMs);
        Assert.Equal(first.AltarCooldownRemainingMs, second.AltarCooldownRemainingMs);
        Assert.Equal(first.FacingDirection, second.FacingDirection);
        Assert.Equal(first.EffectiveTargetEntityId, second.EffectiveTargetEntityId);
        Assert.Equal(first.LockedTargetEntityId, second.LockedTargetEntityId);
        Assert.Equal(first.IsAwaitingCardChoice, second.IsAwaitingCardChoice);
        Assert.Equal(first.PendingChoiceId, second.PendingChoiceId);
        Assert.Equal(
            first.OfferedCards.Select(card => card.Id).ToList(),
            second.OfferedCards.Select(card => card.Id).ToList());
        Assert.Equal(
            first.SelectedCards.Select(card => card.Id).ToList(),
            second.SelectedCards.Select(card => card.Id).ToList());
        Assert.Equal(
            first.Actors
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.Kind}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}:{actor.MaxHp}:{actor.MaxShield}:{actor.IsElite}:{actor.BuffSourceEliteId}")
                .ToList(),
            second.Actors
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.Kind}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}:{actor.MaxHp}:{actor.MaxShield}:{actor.IsElite}:{actor.BuffSourceEliteId}")
                .ToList());
        Assert.Equal(
            first.Skills
                .OrderBy(skill => skill.SkillId, StringComparer.Ordinal)
                .Select(skill => $"{skill.SkillId}:{skill.CooldownRemainingMs}:{skill.CooldownTotalMs}")
                .ToList(),
            second.Skills
                .OrderBy(skill => skill.SkillId, StringComparer.Ordinal)
                .Select(skill => $"{skill.SkillId}:{skill.CooldownRemainingMs}:{skill.CooldownTotalMs}")
                .ToList());
        Assert.Equal(
            first.CommandResults.Select(result => $"{result.Index}:{result.Type}:{result.Ok}:{result.Reason}").ToList(),
            second.CommandResults.Select(result => $"{result.Index}:{result.Type}:{result.Ok}:{result.Reason}").ToList());
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

    private static BattleCommandDto BuildAssistDisableCommand()
    {
        return new BattleCommandDto(
            "set_assist_config",
            AssistConfig: new AssistConfigDto(
                Enabled: false,
                AutoHealEnabled: false,
                HealAtHpPercent: 40,
                AutoGuardEnabled: false,
                GuardAtHpPercent: 60,
                AutoOffenseEnabled: false,
                OffenseMode: "cooldown_spam",
                AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal),
                MaxAutoCastsPerTick: 1));
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

    private static string BuildSpawnEliteSignature(BattleSnapshot snapshot)
    {
        var mobs = snapshot.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .ToList();
        var mobIds = mobs
            .Select(actor => $"{actor.ActorId}:{(actor.IsElite ? "elite" : "normal")}")
            .ToList();
        var eliteSpawnEvents = snapshot.Events
            .OfType<EliteSpawnedEventDto>()
            .OrderBy(evt => evt.EliteEntityId, StringComparer.Ordinal)
            .Select(evt => evt.EliteEntityId)
            .ToList();

        return string.Join(
            "|",
            snapshot.Tick,
            snapshot.RunTimeMs,
            snapshot.TotalKills,
            snapshot.EliteKills,
            $"alive={mobs.Count}",
            $"eliteAlive={mobs.Count(actor => actor.IsElite)}",
            $"eliteSpawns={string.Join(",", eliteSpawnEvents)}",
            $"mobs={string.Join(",", mobIds)}");
    }

    private static string BuildCoreDeterminismSignature(BattleSnapshot snapshot)
    {
        var player = snapshot.Actors.FirstOrDefault(actor => string.Equals(actor.Kind, "player", StringComparison.Ordinal));
        var mobActors = snapshot.Actors
            .Where(actor => string.Equals(actor.Kind, "mob", StringComparison.Ordinal))
            .ToList();
        var eventTypes = snapshot.Events
            .Select(evt => evt.GetType().Name)
            .ToList();
        var selectedCards = snapshot.SelectedCards
            .Select(card => card.Id)
            .ToList();

        return string.Join(
            "|",
            snapshot.Tick,
            snapshot.RunTimeMs,
            snapshot.BattleStatus,
            snapshot.IsRunEnded,
            snapshot.RunEndReason,
            snapshot.RunLevel,
            snapshot.RunXp,
            snapshot.TotalKills,
            snapshot.EliteKills,
            snapshot.IsAwaitingCardChoice,
            $"choice={snapshot.PendingChoiceId}",
            $"playerHp={player?.Hp ?? -1}",
            $"playerShield={player?.Shield ?? -1}",
            $"mobs={mobActors.Count}",
            $"elites={mobActors.Count(actor => actor.IsElite)}",
            $"events={string.Join(",", eventTypes)}",
            $"cards={string.Join(",", selectedCards)}");
    }

    private static string BuildEliteDeathTransitionSignature(BattleSnapshot snapshot, string eliteEntityId)
    {
        var removedTargets = snapshot.Events
            .OfType<EliteBuffRemovedEventDto>()
            .Where(evt => string.Equals(evt.EliteEntityId, eliteEntityId, StringComparison.Ordinal))
            .Select(evt => evt.TargetEntityId)
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        var lingeringTargets = snapshot.Actors
            .Where(actor =>
                actor.Kind == "mob" &&
                !actor.IsElite &&
                string.Equals(actor.BuffSourceEliteId, eliteEntityId, StringComparison.Ordinal))
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .ToList();
        var eliteDeaths = snapshot.Events
            .OfType<EliteDiedEventDto>()
            .Count(evt => string.Equals(evt.EliteEntityId, eliteEntityId, StringComparison.Ordinal));

        return string.Join(
            "|",
            snapshot.Tick,
            snapshot.RunTimeMs,
            snapshot.RunLevel,
            snapshot.TotalKills,
            snapshot.EliteKills,
            $"elite={eliteEntityId}",
            $"deaths={eliteDeaths}",
            $"removed={string.Join(",", removedTargets)}",
            $"lingering={string.Join(",", lingeringTargets)}");
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

    private static void SetActorTile(InMemoryBattleStore store, string battleId, string actorId, int tileX, int tileY)
    {
        var actor = GetStoredActor(store, battleId, actorId);
        var tileXProperty = actor.GetType().GetProperty("TileX");
        Assert.NotNull(tileXProperty);
        tileXProperty.SetValue(actor, tileX);

        var tileYProperty = actor.GetType().GetProperty("TileY");
        Assert.NotNull(tileYProperty);
        tileYProperty.SetValue(actor, tileY);
    }

    private static void SetLockedTargetEntityId(InMemoryBattleStore store, string battleId, string? targetEntityId)
    {
        var state = GetStoredBattle(store, battleId);
        var lockedTargetProperty = state.GetType().GetProperty("LockedTargetEntityId");
        Assert.NotNull(lockedTargetProperty);
        lockedTargetProperty.SetValue(state, targetEntityId);
    }

    private static string? ResolveRangedTargetActorIdViaReflection(
        InMemoryBattleStore store,
        string battleId,
        int maxRange,
        bool requireLos)
    {
        var state = GetStoredBattle(store, battleId);
        var resolveMethod = typeof(InMemoryBattleStore).GetMethod(
            "ResolveRangedTarget",
            BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(resolveMethod);

        var resolved = resolveMethod.Invoke(null, [state, maxRange, requireLos]);
        if (resolved is null)
        {
            return null;
        }

        var actorIdProperty = resolved.GetType().GetProperty("ActorId");
        Assert.NotNull(actorIdProperty);
        var actorId = actorIdProperty.GetValue(resolved);
        Assert.NotNull(actorId);
        return Assert.IsType<string>(actorId);
    }

    private static IReadOnlyList<TilePos> BuildShotgunConeTilesViaReflection(
        TilePos from,
        TilePos target,
        int maxRange)
    {
        var buildMethod = typeof(InMemoryBattleStore).GetMethod(
            "BuildShotgunConeTiles",
            BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(buildMethod);

        var coneTiles = buildMethod.Invoke(null, [from, target, maxRange]);
        Assert.NotNull(coneTiles);
        return Assert.IsAssignableFrom<IReadOnlyList<TilePos>>(coneTiles);
    }

    private static IReadOnlyList<object> BuildVoidRicochetPathViaReflection(
        TilePos from,
        TilePos target,
        int maxBounces,
        int maxTotalTiles)
    {
        var buildMethod = typeof(InMemoryBattleStore).GetMethod(
            "BuildVoidRicochetPath",
            BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(buildMethod);

        var segments = buildMethod.Invoke(null, [from, target, maxBounces, maxTotalTiles]);
        Assert.NotNull(segments);

        var enumerable = Assert.IsAssignableFrom<IEnumerable>(segments);
        return enumerable.Cast<object>().ToList();
    }

    private static TilePos ReadRicochetSegmentDirection(object segment)
    {
        var directionProperty = segment.GetType().GetProperty("Direction");
        Assert.NotNull(directionProperty);
        var direction = directionProperty.GetValue(segment);
        Assert.NotNull(direction);
        return Assert.IsType<TilePos>(direction);
    }

    private static IReadOnlyList<TilePos> ReadRicochetSegmentTiles(object segment)
    {
        var tilesProperty = segment.GetType().GetProperty("Tiles");
        Assert.NotNull(tilesProperty);
        var tiles = tilesProperty.GetValue(segment);
        Assert.NotNull(tiles);

        var enumerable = Assert.IsAssignableFrom<IEnumerable>(tiles);
        var resolvedTiles = new List<TilePos>();
        foreach (var entry in enumerable)
        {
            Assert.NotNull(entry);
            resolvedTiles.Add(Assert.IsType<TilePos>(entry));
        }

        return resolvedTiles;
    }

    private static void SpawnAllMobSlotsViaReflection(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var mobSlotsProperty = state.GetType().GetProperty("MobSlots");
        Assert.NotNull(mobSlotsProperty);
        var mobSlots = mobSlotsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(mobSlots);

        var spawnMethod = typeof(InMemoryBattleStore).GetMethod(
            "TrySpawnMobInSlot",
            BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(spawnMethod);

        foreach (DictionaryEntry entry in mobSlots)
        {
            var slot = entry.Value;
            Assert.NotNull(slot);
            _ = spawnMethod.Invoke(null, [state, slot, null]);
        }
    }

    private static void SetAllMobMoveCooldownViaReflection(
        InMemoryBattleStore store,
        string battleId,
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
            var moveCooldownProperty = slot.GetType().GetProperty("MoveCooldownRemainingMs");
            Assert.NotNull(moveCooldownProperty);
            moveCooldownProperty.SetValue(slot, Math.Max(0, cooldownRemainingMs));
        }
    }

    private static List<string> GetMobActorIds(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var actorsProperty = state.GetType().GetProperty("Actors");
        Assert.NotNull(actorsProperty);
        var actors = actorsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(actors);

        var mobActorIds = new List<string>();
        foreach (DictionaryEntry entry in actors)
        {
            var actor = entry.Value;
            Assert.NotNull(actor);
            var kindProperty = actor.GetType().GetProperty("Kind");
            Assert.NotNull(kindProperty);
            var kind = Assert.IsType<string>(kindProperty.GetValue(actor));
            if (!string.Equals(kind, "mob", StringComparison.Ordinal))
            {
                continue;
            }

            var actorId = entry.Key as string;
            Assert.False(string.IsNullOrWhiteSpace(actorId));
            mobActorIds.Add(actorId!);
        }

        mobActorIds.Sort(StringComparer.Ordinal);
        return mobActorIds;
    }

    private static void RemoveAllMobs(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var actorsProperty = state.GetType().GetProperty("Actors");
        Assert.NotNull(actorsProperty);
        var actors = actorsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(actors);

        var mobIds = new List<string>();
        foreach (DictionaryEntry entry in actors)
        {
            var actor = entry.Value;
            Assert.NotNull(actor);
            var kindProperty = actor.GetType().GetProperty("Kind");
            Assert.NotNull(kindProperty);
            var kind = kindProperty.GetValue(actor) as string;
            if (string.Equals(kind, "mob", StringComparison.Ordinal))
            {
                var actorId = entry.Key as string;
                Assert.False(string.IsNullOrWhiteSpace(actorId));
                mobIds.Add(actorId!);
            }
        }

        foreach (var mobId in mobIds)
        {
            actors.Remove(mobId);
        }
    }

    private static void AssertCommandResult(
        BattleSnapshot snapshot,
        int index,
        string expectedType,
        bool expectedOk,
        string? expectedReason)
    {
        var result = Assert.Single(snapshot.CommandResults, entry => entry.Index == index);
        Assert.Equal(expectedType, result.Type);
        Assert.Equal(expectedOk, result.Ok);
        Assert.Equal(expectedReason, result.Reason);
    }

    private static void AssertMoveCommandResult(
        BattleSnapshot snapshot,
        bool expectedOk,
        string expectedStatus,
        string expectedMovementReason,
        string? expectedLegacyReason,
        int? expectedBlockedTileX,
        int? expectedBlockedTileY,
        string? expectedBlockedByActorId)
    {
        var result = Assert.Single(snapshot.CommandResults, entry =>
            string.Equals(entry.Type, "move_player", StringComparison.Ordinal));
        Assert.Equal(expectedOk, result.Ok);
        Assert.Equal(expectedStatus, result.Status);
        Assert.Equal(expectedMovementReason, result.MovementReason);
        Assert.Equal(expectedLegacyReason, result.Reason);
        Assert.Equal(expectedBlockedTileX, result.BlockedTileX);
        Assert.Equal(expectedBlockedTileY, result.BlockedTileY);
        Assert.Equal(expectedBlockedByActorId, result.BlockedByActorId);
    }

    private static void AssertActorTile(BattleSnapshot snapshot, string actorId, int expectedTileX, int expectedTileY)
    {
        var actor = Assert.Single(snapshot.Actors, entry => string.Equals(entry.ActorId, actorId, StringComparison.Ordinal));
        Assert.Equal(expectedTileX, actor.TileX);
        Assert.Equal(expectedTileY, actor.TileY);
    }

    private static (int TileX, int TileY) FindUnoccupiedTile(
        BattleSnapshot snapshot,
        params (int TileX, int TileY)[] excludedTiles)
    {
        var occupiedTiles = snapshot.Actors
            .Select(actor => (actor.TileX, actor.TileY))
            .ToHashSet();
        foreach (var excluded in excludedTiles)
        {
            occupiedTiles.Add((excluded.TileX, excluded.TileY));
        }

        for (var tileY = 0; tileY < ArenaConfig.Height; tileY += 1)
        {
            for (var tileX = 0; tileX < ArenaConfig.Width; tileX += 1)
            {
                if (!occupiedTiles.Contains((tileX, tileY)))
                {
                    return (tileX, tileY);
                }
            }
        }

        throw new Xunit.Sdk.XunitException("No unoccupied tile was available for test setup.");
    }

    private static void SetMobBuffSourceEliteId(InMemoryBattleStore store, string battleId, string actorId, string? buffSourceEliteId)
    {
        var actor = GetStoredActor(store, battleId, actorId);
        var buffSourceEliteIdProperty = actor.GetType().GetProperty("BuffSourceEliteId");
        Assert.NotNull(buffSourceEliteIdProperty);
        buffSourceEliteIdProperty.SetValue(actor, buffSourceEliteId);
    }

    private static void SetBattleTick(InMemoryBattleStore store, string battleId, int tick)
    {
        var state = GetStoredBattle(store, battleId);
        var tickProperty = state.GetType().GetProperty("Tick");
        Assert.NotNull(tickProperty);
        tickProperty.SetValue(state, Math.Max(0, tick));
    }

    private static void SetPlayerGlobalCooldownRemaining(InMemoryBattleStore store, string battleId, int cooldownMs)
    {
        var state = GetStoredBattle(store, battleId);
        var property = state.GetType().GetProperty("PlayerGlobalCooldownRemainingMs");
        Assert.NotNull(property);
        property.SetValue(state, Math.Max(0, cooldownMs));
    }

    private static void SetSkillCooldownRemaining(
        InMemoryBattleStore store,
        string battleId,
        string skillId,
        int cooldownMs)
    {
        var state = GetStoredBattle(store, battleId);
        var skillsProperty = state.GetType().GetProperty("Skills");
        Assert.NotNull(skillsProperty);
        var skills = skillsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(skills);
        var skill = skills[skillId];
        Assert.NotNull(skill);

        var cooldownProperty = skill.GetType().GetProperty("CooldownRemainingMs");
        Assert.NotNull(cooldownProperty);
        cooldownProperty.SetValue(skill, Math.Max(0, cooldownMs));
    }

    private static void ClearActiveBuffs(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var activeBuffsProperty = state.GetType().GetProperty("ActiveBuffs");
        Assert.NotNull(activeBuffsProperty);
        var activeBuffs = activeBuffsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(activeBuffs);
        activeBuffs.Clear();
    }

    private static int ResolveMobOutgoingDamageViaReflection(
        InMemoryBattleStore store,
        string battleId,
        string actorId,
        int baseDamage)
    {
        var state = GetStoredBattle(store, battleId);
        var actor = GetStoredActor(store, battleId, actorId);
        var method = typeof(InMemoryBattleStore).GetMethod(
            "ResolveMobOutgoingDamage",
            BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);

        var result = method.Invoke(null, [state, actor, baseDamage]);
        Assert.NotNull(result);
        return Assert.IsType<int>(result);
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

    private static void ForcePendingCardChoice(
        InMemoryBattleStore store,
        string battleId,
        string choiceId,
        IReadOnlyList<string> offeredCardIds)
    {
        var state = GetStoredBattle(store, battleId);
        var pendingChoiceType = typeof(InMemoryBattleStore).GetNestedType("PendingCardChoiceState", BindingFlags.NonPublic);
        Assert.NotNull(pendingChoiceType);
        var pendingChoiceCtor = pendingChoiceType!.GetConstructor(
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            [typeof(string), typeof(IReadOnlyList<string>)],
            modifiers: null);
        Assert.NotNull(pendingChoiceCtor);
        var pendingChoice = pendingChoiceCtor!.Invoke([choiceId, offeredCardIds.ToList()]);

        var pendingChoiceProperty = state.GetType().GetProperty("PendingCardChoice");
        Assert.NotNull(pendingChoiceProperty);
        pendingChoiceProperty.SetValue(state, pendingChoice);
    }

    private static void ClearPendingCardChoice(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var pendingChoiceProperty = state.GetType().GetProperty("PendingCardChoice");
        Assert.NotNull(pendingChoiceProperty);
        pendingChoiceProperty.SetValue(state, null);
    }

    private static int GetSelectedCardStackCount(InMemoryBattleStore store, string battleId, string cardId)
    {
        var state = GetStoredBattle(store, battleId);
        var selectedCardStacksProperty = state.GetType().GetProperty("SelectedCardStacks");
        Assert.NotNull(selectedCardStacksProperty);
        var selectedCardStacks = selectedCardStacksProperty.GetValue(state) as IDictionary;
        Assert.NotNull(selectedCardStacks);

        return selectedCardStacks.Contains(cardId)
            ? Assert.IsType<int>(selectedCardStacks[cardId])
            : 0;
    }

    private static PlayerModifierSnapshot ReadPlayerModifiers(InMemoryBattleStore store, string battleId)
    {
        var state = GetStoredBattle(store, battleId);
        var playerModifiersProperty = state.GetType().GetProperty("PlayerModifiers");
        Assert.NotNull(playerModifiersProperty);
        var playerModifiers = playerModifiersProperty.GetValue(state);
        Assert.NotNull(playerModifiers);

        return new PlayerModifierSnapshot(
            FlatDamageBonus: ReadIntProperty(playerModifiers, "FlatDamageBonus"),
            PercentDamageBonus: ReadIntProperty(playerModifiers, "PercentDamageBonus"),
            PercentAttackSpeedBonus: ReadIntProperty(playerModifiers, "PercentAttackSpeedBonus"),
            PercentMaxHpBonus: ReadIntProperty(playerModifiers, "PercentMaxHpBonus"),
            FlatHpOnHit: ReadIntProperty(playerModifiers, "FlatHpOnHit"),
            GlobalCooldownReductionPercent: ReadIntProperty(playerModifiers, "GlobalCooldownReductionPercent"));
    }

    private static CardEffectSnapshot ReadCardEffectsForStack(InMemoryBattleStore store, string cardId, int stackCount)
    {
        _ = store;
        var cardByIdField = typeof(InMemoryBattleStore).GetField("CardById", BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(cardByIdField);
        var cardById = cardByIdField.GetValue(null) as IDictionary;
        Assert.NotNull(cardById);
        var cardDefinition = cardById[cardId];
        Assert.NotNull(cardDefinition);

        var effectsProperty = cardDefinition.GetType().GetProperty("Effects");
        Assert.NotNull(effectsProperty);
        var effects = effectsProperty.GetValue(cardDefinition);
        Assert.NotNull(effects);

        var scalingParamsProperty = cardDefinition.GetType().GetProperty("ScalingParams");
        Assert.NotNull(scalingParamsProperty);
        var scalingParams = scalingParamsProperty.GetValue(cardDefinition);
        Assert.NotNull(scalingParams);

        var baseMultiplier = ReadIntProperty(scalingParams, "BaseStackMultiplierPercent");
        var additionalMultiplier = ReadIntProperty(scalingParams, "AdditionalStackMultiplierPercent");
        var scalePercent = stackCount <= 1 ? baseMultiplier : additionalMultiplier;

        return new CardEffectSnapshot(
            FlatDamageBonus: ScaleStat(ReadIntProperty(effects, "FlatDamageBonus"), scalePercent),
            PercentDamageBonus: ScaleStat(ReadIntProperty(effects, "PercentDamageBonus"), scalePercent),
            PercentAttackSpeedBonus: ScaleStat(ReadIntProperty(effects, "PercentAttackSpeedBonus"), scalePercent),
            PercentMaxHpBonus: ScaleStat(ReadIntProperty(effects, "PercentMaxHpBonus"), scalePercent),
            FlatHpOnHit: ScaleStat(ReadIntProperty(effects, "FlatHpOnHit"), scalePercent),
            GlobalCooldownReductionPercent: ScaleStat(ReadIntProperty(effects, "GlobalCooldownReductionPercent"), scalePercent));
    }

    private static int ResolvePlayerMaxHpForPercentBonus(int baseMaxHp, int percentBonus)
    {
        return (int)Math.Floor(baseMaxHp * (1d + (Math.Max(0, percentBonus) / 100d)));
    }

    private static int ReadIntProperty(object instance, string propertyName)
    {
        var property = instance.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        var value = property.GetValue(instance);
        Assert.NotNull(value);
        return Assert.IsType<int>(value);
    }

    private static int ScaleStat(int baseValue, int scalePercent)
    {
        if (baseValue <= 0 || scalePercent <= 0)
        {
            return 0;
        }

        return (int)Math.Floor(baseValue * (scalePercent / 100.0d));
    }

    private sealed record PlayerModifierSnapshot(
        int FlatDamageBonus,
        int PercentDamageBonus,
        int PercentAttackSpeedBonus,
        int PercentMaxHpBonus,
        int FlatHpOnHit,
        int GlobalCooldownReductionPercent);

    private sealed record CardEffectSnapshot(
        int FlatDamageBonus,
        int PercentDamageBonus,
        int PercentAttackSpeedBonus,
        int PercentMaxHpBonus,
        int FlatHpOnHit,
        int GlobalCooldownReductionPercent);

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

    private static void AssertScalingMatchesExpected(
        BattleSnapshot snapshot,
        long expectedRunTimeMs,
        int runLevel)
    {
        Assert.Equal(expectedRunTimeMs, snapshot.RunTimeMs);

        var t = Clamp01(expectedRunTimeMs / (double)RunDurationTargetMs);
        var expectedLvlFactor = IsRunLevelHpSeasoningEnabled
            ? 1.0d + (RunLevelHpSeasoningPerLevel * (Math.Max(RunInitialLevel, runLevel) - RunInitialLevel))
            : 1.0d;
        var expectedNormalHpMult = Lerp(MobHpMultStart, MobHpMultEnd, t) * expectedLvlFactor;
        var expectedNormalDmgMult = Lerp(MobDmgMultStart, MobDmgMultEnd, t);
        var expectedEliteHpMult = expectedNormalHpMult * EliteHpMultiplierFactor;
        var expectedEliteDmgMult = expectedNormalDmgMult * EliteDmgMultiplierFactor;

        Assert.InRange(snapshot.CurrentMobHpMult, expectedNormalHpMult, expectedNormalHpMult + ScalingTolerance);
        Assert.InRange(snapshot.CurrentMobDmgMult, expectedNormalDmgMult, expectedNormalDmgMult + ScalingTolerance);
        Assert.InRange(snapshot.Scaling.NormalHpMult, expectedNormalHpMult, expectedNormalHpMult + ScalingTolerance);
        Assert.InRange(snapshot.Scaling.NormalDmgMult, expectedNormalDmgMult, expectedNormalDmgMult + ScalingTolerance);
        Assert.InRange(snapshot.Scaling.EliteHpMult, expectedEliteHpMult, expectedEliteHpMult + ScalingTolerance);
        Assert.InRange(snapshot.Scaling.EliteDmgMult, expectedEliteDmgMult, expectedEliteDmgMult + ScalingTolerance);
        Assert.InRange(snapshot.Scaling.LvlFactor, expectedLvlFactor, expectedLvlFactor + ScalingTolerance);
        Assert.Equal(IsRunLevelHpSeasoningEnabled, snapshot.Scaling.IsLvlFactorEnabled);
    }

    private static double Clamp01(double value)
    {
        if (value <= 0d)
        {
            return 0d;
        }

        if (value >= 1d)
        {
            return 1d;
        }

        return value;
    }

    private static double Lerp(double start, double end, double t)
    {
        return start + ((end - start) * t);
    }

    private static void AssertSkillCooldownTotal(BattleSnapshot snapshot, string skillId, int expectedCooldownTotalMs)
    {
        var skill = Assert.Single(snapshot.Skills, value => string.Equals(value.SkillId, skillId, StringComparison.Ordinal));
        Assert.Equal(expectedCooldownTotalMs, skill.CooldownTotalMs);
    }

    private static int GetBaseSkillCooldownTotal(string skillId)
    {
        return skillId switch
        {
            "exori" => ExoriBaseCooldownMs,
            "exori_mas" => ExoriMasBaseCooldownMs,
            "exori_min" => ExoriMinBaseCooldownMs,
            "avalanche" => AvalancheBaseCooldownMs,
            "heal" => HealBaseCooldownMs,
            "guard" => GuardBaseCooldownMs,
            _ => throw new Xunit.Sdk.XunitException($"Unexpected skill id '{skillId}' in cooldown baseline resolver.")
        };
    }

    private static string BuildSkillProgressSignature(BattleSnapshot snapshot)
    {
        var skillSignature = snapshot.Skills
            .OrderBy(skill => skill.SkillId, StringComparer.Ordinal)
            .Select(skill => $"{skill.SkillId}:{skill.CooldownTotalMs}:{skill.CooldownRemainingMs}")
            .ToList();
        return string.Join(
            "|",
            snapshot.Tick,
            snapshot.RunLevel,
            snapshot.RunXp,
            snapshot.TotalKills,
            snapshot.EliteKills,
            snapshot.BattleStatus,
            snapshot.RunEndReason,
            $"skills={string.Join(",", skillSignature)}");
    }

    private static int ResolveExpectedSkillCooldownTotal(int baseCooldownMs, int skillLevel)
    {
        var bonusLevels = Math.Max(0, skillLevel - SkillInitialLevel);
        var reductionPercent = Math.Clamp(
            bonusLevels * SkillCooldownReductionPerLevelPercent,
            0,
            SkillCooldownReductionMaxPercent);
        return Math.Max(1, (int)Math.Floor(baseCooldownMs * ((100 - reductionPercent) / 100.0d)));
    }

    private static int ReadStoredSkillLevel(InMemoryBattleStore store, string battleId, string skillId)
    {
        var state = GetStoredBattle(store, battleId);
        var skillsProperty = state.GetType().GetProperty("Skills");
        Assert.NotNull(skillsProperty);
        var skills = skillsProperty.GetValue(state) as IDictionary;
        Assert.NotNull(skills);
        var skill = skills[skillId];
        Assert.NotNull(skill);

        var levelProperty = skill.GetType().GetProperty("Level");
        Assert.NotNull(levelProperty);
        var level = levelProperty.GetValue(skill);
        Assert.NotNull(level);
        return Assert.IsType<int>(level);
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
