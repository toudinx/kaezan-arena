using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public static class DeterminismAudit
{
    public static string CreateReplaySummary(BattleReplayDto replay)
    {
        ArgumentNullException.ThrowIfNull(replay);
        var builder = new StringBuilder(capacity: 1024);
        builder.Append("arena=").Append(NormalizeText(replay.ArenaId))
            .Append("|player=").Append(NormalizeText(replay.PlayerId))
            .Append("|seed=").Append(replay.Seed.ToString(CultureInfo.InvariantCulture));
        for (var actionIndex = 0; actionIndex < replay.Actions.Count; actionIndex += 1)
        {
            var action = replay.Actions[actionIndex];
            builder.Append("|a[").Append(actionIndex.ToString(CultureInfo.InvariantCulture)).Append("]=");
            builder.Append(NormalizeText(action.Type))
                .Append(':').Append(action.ClientTick?.ToString(CultureInfo.InvariantCulture) ?? string.Empty)
                .Append(':').Append(NormalizeText(action.ChoiceId))
                .Append(':').Append(NormalizeText(action.SelectedCardId));
            AppendReplayCommands(builder, action.Commands);
        }

        return builder.ToString();
    }

    public static string ComputeReplayHash(BattleReplayDto replay)
    {
        return ComputeSha256Hex(CreateReplaySummary(replay));
    }

    public static string CreateSnapshotSummary(BattleSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        var builder = new StringBuilder(capacity: 4096);
        AppendSharedBattleState(
            builder,
            tick: snapshot.Tick,
            seed: snapshot.Seed,
            battleStatus: snapshot.BattleStatus,
            isRunEnded: snapshot.IsRunEnded,
            runEndReason: snapshot.RunEndReason,
            runLevel: snapshot.RunLevel,
            runXp: snapshot.RunXp,
            xpToNextLevel: snapshot.XpToNextLevel,
            totalKills: snapshot.TotalKills,
            eliteKills: snapshot.EliteKills,
            chestsOpened: snapshot.ChestsOpened,
            actors: snapshot.Actors,
            skills: snapshot.Skills,
            bestiary: snapshot.Bestiary,
            selectedCards: snapshot.SelectedCards);
        return builder.ToString();
    }

    public static string ComputeSnapshotHash(BattleSnapshot snapshot)
    {
        return ComputeSha256Hex(CreateSnapshotSummary(snapshot));
    }

    public static string CreateStepSummary(BattleStepResponseDto step)
    {
        ArgumentNullException.ThrowIfNull(step);
        var builder = new StringBuilder(capacity: 4096);
        AppendSharedBattleState(
            builder,
            tick: step.Tick,
            seed: step.Seed,
            battleStatus: step.BattleStatus,
            isRunEnded: step.IsRunEnded,
            runEndReason: step.RunEndReason,
            runLevel: step.RunLevel,
            runXp: step.RunXp,
            xpToNextLevel: step.XpToNextLevel,
            totalKills: step.TotalKills,
            eliteKills: step.EliteKills,
            chestsOpened: step.ChestsOpened,
            actors: step.Actors,
            skills: step.Skills,
            bestiary: step.Bestiary,
            selectedCards: step.SelectedCards);
        return builder.ToString();
    }

    public static string ComputeStepHash(BattleStepResponseDto step)
    {
        return ComputeSha256Hex(CreateStepSummary(step));
    }

    private static void AppendSharedBattleState(
        StringBuilder builder,
        int tick,
        int seed,
        string battleStatus,
        bool isRunEnded,
        string? runEndReason,
        int runLevel,
        int runXp,
        int xpToNextLevel,
        int totalKills,
        int eliteKills,
        int chestsOpened,
        IReadOnlyList<ActorStateDto> actors,
        IReadOnlyList<SkillStateDto> skills,
        IReadOnlyList<BestiaryEntryDto> bestiary,
        IReadOnlyList<BattleCardOfferDto> selectedCards)
    {
        builder.Append("tick=").Append(tick.ToString(CultureInfo.InvariantCulture))
            .Append("|seed=").Append(seed.ToString(CultureInfo.InvariantCulture))
            .Append("|status=").Append(NormalizeText(battleStatus))
            .Append("|runEnded=").Append(isRunEnded ? "1" : "0")
            .Append("|runEndReason=").Append(NormalizeText(runEndReason))
            .Append("|runLevel=").Append(runLevel.ToString(CultureInfo.InvariantCulture))
            .Append("|runXp=").Append(runXp.ToString(CultureInfo.InvariantCulture))
            .Append("|xpNext=").Append(xpToNextLevel.ToString(CultureInfo.InvariantCulture))
            .Append("|kills=").Append(totalKills.ToString(CultureInfo.InvariantCulture))
            .Append("|eliteKills=").Append(eliteKills.ToString(CultureInfo.InvariantCulture))
            .Append("|chests=").Append(chestsOpened.ToString(CultureInfo.InvariantCulture));

        foreach (var actor in actors.OrderBy(value => value.ActorId, StringComparer.Ordinal))
        {
            builder.Append("|actor:")
                .Append(NormalizeText(actor.ActorId)).Append(':')
                .Append(NormalizeText(actor.Kind)).Append(':')
                .Append(((int?)actor.MobType)?.ToString(CultureInfo.InvariantCulture) ?? string.Empty).Append(':')
                .Append(actor.MobTierIndex?.ToString(CultureInfo.InvariantCulture) ?? string.Empty).Append(':')
                .Append(actor.IsElite ? "1" : "0").Append(':')
                .Append(actor.IsBuffedByElite ? "1" : "0").Append(':')
                .Append(NormalizeText(actor.BuffSourceEliteId)).Append(':')
                .Append(actor.TileX.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(actor.TileY.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(actor.Hp.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(actor.MaxHp.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(actor.Shield.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(actor.MaxShield.ToString(CultureInfo.InvariantCulture));
        }

        foreach (var skill in skills.OrderBy(value => value.SkillId, StringComparer.Ordinal))
        {
            builder.Append("|skill:")
                .Append(NormalizeText(skill.SkillId)).Append(':')
                .Append(skill.CooldownRemainingMs.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(skill.CooldownTotalMs.ToString(CultureInfo.InvariantCulture));
        }

        foreach (var bestiaryEntry in bestiary.OrderBy(value => value.Species, StringComparer.Ordinal))
        {
            builder.Append("|bestiary:")
                .Append(NormalizeText(bestiaryEntry.Species)).Append(':')
                .Append(bestiaryEntry.KillsTotal.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(bestiaryEntry.NextChestAtKills.ToString(CultureInfo.InvariantCulture)).Append(':')
                .Append(bestiaryEntry.Rank.ToString(CultureInfo.InvariantCulture));
        }

        foreach (var selectedCard in selectedCards)
        {
            builder.Append("|selected:")
                .Append(NormalizeText(selectedCard.Id)).Append(':')
                .Append(selectedCard.CurrentStacks.ToString(CultureInfo.InvariantCulture));
        }
    }

    private static void AppendReplayCommands(StringBuilder builder, IReadOnlyList<BattleCommandDto>? commands)
    {
        if (commands is null)
        {
            builder.Append("|commands:null");
            return;
        }

        builder.Append("|commands:").Append(commands.Count.ToString(CultureInfo.InvariantCulture));
        for (var commandIndex = 0; commandIndex < commands.Count; commandIndex += 1)
        {
            var command = commands[commandIndex];
            builder.Append("|c[").Append(commandIndex.ToString(CultureInfo.InvariantCulture)).Append("]=");
            builder.Append(NormalizeText(command.Type)).Append(':')
                .Append(NormalizeText(command.SkillId)).Append(':')
                .Append(NormalizeText(command.Dir)).Append(':')
                .Append(NormalizeText(command.TargetEntityId)).Append(':')
                .Append(NullableBooleanToToken(command.Paused)).Append(':')
                .Append(NullableIntToToken(command.GroundTileX)).Append(':')
                .Append(NullableIntToToken(command.GroundTileY)).Append(':')
                .Append(NormalizeText(command.PoiId));
            AppendAssistConfig(builder, command.AssistConfig);
        }
    }

    private static void AppendAssistConfig(StringBuilder builder, AssistConfigDto? config)
    {
        if (config is null)
        {
            builder.Append("|assist:null");
            return;
        }

        builder.Append("|assist:")
            .Append(NullableBooleanToToken(config.Enabled)).Append(':')
            .Append(NullableBooleanToToken(config.AutoHealEnabled)).Append(':')
            .Append(NullableIntToToken(config.HealAtHpPercent)).Append(':')
            .Append(NullableBooleanToToken(config.AutoGuardEnabled)).Append(':')
            .Append(NullableIntToToken(config.GuardAtHpPercent)).Append(':')
            .Append(NullableBooleanToToken(config.AutoOffenseEnabled)).Append(':')
            .Append(NormalizeText(config.OffenseMode)).Append(':')
            .Append(NullableIntToToken(config.MaxAutoCastsPerTick));

        if (config.AutoSkills is null)
        {
            builder.Append(":autoskills:null");
            return;
        }

        builder.Append(":autoskills:");
        foreach (var (skillId, enabled) in config.AutoSkills.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            builder.Append(NormalizeText(skillId)).Append('=').Append(enabled ? "1" : "0").Append(';');
        }
    }

    private static string NormalizeText(string? value)
    {
        return value ?? string.Empty;
    }

    private static string NullableBooleanToToken(bool? value)
    {
        return value switch
        {
            true => "1",
            false => "0",
            _ => string.Empty
        };
    }

    private static string NullableIntToToken(int? value)
    {
        return value?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string ComputeSha256Hex(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
