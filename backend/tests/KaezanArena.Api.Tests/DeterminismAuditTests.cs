using System.Text.Json;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Tests;

public sealed class DeterminismAuditTests
{
    private const int DeterministicStepBudget = 200;

    [Fact]
    public void ReplaySummaryAndHash_AreStableAcrossJsonRoundTrip()
    {
        var replay = BuildReplayPayload();
        var baselineSummary = DeterminismAudit.CreateReplaySummary(replay);
        var baselineHash = DeterminismAudit.ComputeReplayHash(replay);

        var json = JsonSerializer.Serialize(replay);
        var roundTripped = JsonSerializer.Deserialize<BattleReplayDto>(json);

        Assert.NotNull(roundTripped);
        Assert.Equal(baselineSummary, DeterminismAudit.CreateReplaySummary(roundTripped!));
        Assert.Equal(baselineHash, DeterminismAudit.ComputeReplayHash(roundTripped!));
    }

    [Fact]
    public void ReplayHash_ChangesWhenCommandTimelineChanges()
    {
        var baseline = BuildReplayPayload();
        var changed = new BattleReplayDto(
            ArenaId: baseline.ArenaId,
            PlayerId: baseline.PlayerId,
            Seed: baseline.Seed,
            Actions:
            [
                baseline.Actions[0] with
                {
                    Commands =
                    [
                        new BattleCommandDto("move_player", Dir: "left"),
                        new BattleCommandDto(
                            "set_assist_config",
                            AssistConfig: new AssistConfigDto(
                                Enabled: true,
                                AutoHealEnabled: true,
                                HealAtHpPercent: 50,
                                AutoGuardEnabled: true,
                                GuardAtHpPercent: 25,
                                AutoOffenseEnabled: true,
                                OffenseMode: "nearest",
                                AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                                {
                                    ["heal"] = true,
                                    ["guard"] = true
                                },
                                MaxAutoCastsPerTick: 2))
                    ]
                },
                baseline.Actions[1]
            ]);

        Assert.NotEqual(DeterminismAudit.ComputeReplayHash(baseline), DeterminismAudit.ComputeReplayHash(changed));
    }

    [Fact]
    public void SnapshotSummaryAndHash_SameSeedAndCommands_StayAlignedAcrossSelectedTicks()
    {
        const int seed = 606060;
        var firstStore = new InMemoryBattleStore();
        var secondStore = new InMemoryBattleStore();
        var first = firstStore.StartBattle("arena-audit-selected-a", "player-audit-selected", seed);
        var second = secondStore.StartBattle("arena-audit-selected-b", "player-audit-selected", seed);
        var firstTick = first.Tick;
        var secondTick = second.Tick;
        var selectedTickHashes = new Dictionary<int, string>();

        Assert.Equal(DeterminismAudit.CreateSnapshotSummary(first), DeterminismAudit.CreateSnapshotSummary(second));
        Assert.Equal(DeterminismAudit.ComputeSnapshotHash(first), DeterminismAudit.ComputeSnapshotHash(second));

        for (var stepIndex = 0; stepIndex < DeterministicStepBudget; stepIndex += 1)
        {
            var commands = BuildDeterministicCommands(stepIndex);
            first = firstStore.StepBattle(first.BattleId, firstTick, commands);
            second = secondStore.StepBattle(second.BattleId, secondTick, commands);
            firstTick = first.Tick;
            secondTick = second.Tick;

            Assert.Equal(DeterminismAudit.CreateSnapshotSummary(first), DeterminismAudit.CreateSnapshotSummary(second));
            Assert.Equal(DeterminismAudit.ComputeSnapshotHash(first), DeterminismAudit.ComputeSnapshotHash(second));

            if (stepIndex % 25 == 0)
            {
                selectedTickHashes[first.Tick] = DeterminismAudit.ComputeSnapshotHash(first);
            }

            if (first.IsAwaitingCardChoice || second.IsAwaitingCardChoice)
            {
                Assert.True(first.IsAwaitingCardChoice);
                Assert.True(second.IsAwaitingCardChoice);
                var selectedCardId = first.OfferedCards[0].Id;
                first = firstStore.ChooseCard(first.BattleId, first.PendingChoiceId!, selectedCardId);
                second = secondStore.ChooseCard(second.BattleId, second.PendingChoiceId!, selectedCardId);
                firstTick = first.Tick;
                secondTick = second.Tick;
                Assert.Equal(DeterminismAudit.ComputeSnapshotHash(first), DeterminismAudit.ComputeSnapshotHash(second));
            }

            if (first.IsRunEnded)
            {
                break;
            }
        }

        Assert.True(selectedTickHashes.Count >= 4, "Expected to collect multiple selected-tick determinism hashes.");
    }

    [Fact]
    public void SnapshotSummaryAndHash_AreStableWhenActorSkillAndBestiaryListsAreReordered()
    {
        var store = new InMemoryBattleStore();
        var snapshot = store.StartBattle("arena-audit-reorder", "player-audit-reorder", 8080);
        var reordered = snapshot with
        {
            Actors = snapshot.Actors.Reverse().ToArray(),
            Skills = snapshot.Skills.Reverse().ToArray(),
            Bestiary = snapshot.Bestiary.Reverse().ToArray()
        };

        Assert.Equal(DeterminismAudit.CreateSnapshotSummary(snapshot), DeterminismAudit.CreateSnapshotSummary(reordered));
        Assert.Equal(DeterminismAudit.ComputeSnapshotHash(snapshot), DeterminismAudit.ComputeSnapshotHash(reordered));
    }

    private static BattleReplayDto BuildReplayPayload()
    {
        return new BattleReplayDto(
            ArenaId: "arena-audit-replay",
            PlayerId: "player-audit-replay",
            Seed: 5050,
            Actions:
            [
                new BattleReplayActionDto(
                    Type: "step",
                    ClientTick: 0,
                    Commands:
                    [
                        new BattleCommandDto("move_player", Dir: "right"),
                        new BattleCommandDto(
                            "set_assist_config",
                            AssistConfig: new AssistConfigDto(
                                Enabled: true,
                                AutoHealEnabled: true,
                                HealAtHpPercent: 50,
                                AutoGuardEnabled: true,
                                GuardAtHpPercent: 25,
                                AutoOffenseEnabled: true,
                                OffenseMode: "nearest",
                                AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                                {
                                    ["guard"] = true,
                                    ["heal"] = true
                                },
                                MaxAutoCastsPerTick: 2))
                    ]),
                new BattleReplayActionDto(
                    Type: "step",
                    ClientTick: 1,
                    Commands:
                    [
                        new BattleCommandDto("cast_skill", SkillId: "exori"),
                        new BattleCommandDto("set_facing", Dir: "up_left")
                    ])
            ]);
    }

    private static IReadOnlyList<BattleCommandDto> BuildDeterministicCommands(int stepIndex)
    {
        return (stepIndex % 6) switch
        {
            0 => [new BattleCommandDto("cast_skill", SkillId: "exori")],
            1 => [new BattleCommandDto("move_player", Dir: "right")],
            2 => [new BattleCommandDto("set_facing", Dir: "down_left")],
            3 => [new BattleCommandDto("cast_skill", SkillId: "exori_min")],
            4 => [new BattleCommandDto("move_player", Dir: "up")],
            _ => []
        };
    }
}
