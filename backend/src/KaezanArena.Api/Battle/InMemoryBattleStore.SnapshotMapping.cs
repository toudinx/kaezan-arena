using KaezanArena.Api.Contracts.Battle;

namespace KaezanArena.Api.Battle;

public sealed partial class InMemoryBattleStore
{
    private static BattleSnapshot ToSnapshot(
        StoredBattle state,
        IReadOnlyList<BattleEventDto> events,
        IReadOnlyList<CommandResultDto> commandResults)
    {
        AssertBattleInvariants(state);

        var actors = state.Actors.Values
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => new ActorStateDto(
                ActorId: actor.ActorId,
                Kind: actor.Kind,
                MobType: actor.MobType,
                IsElite: actor.IsElite,
                IsBuffedByElite: actor.BuffSourceEliteId is not null,
                BuffSourceEliteId: actor.BuffSourceEliteId,
                TileX: actor.TileX,
                TileY: actor.TileY,
                Hp: actor.Hp,
                MaxHp: actor.MaxHp,
                Shield: actor.Shield,
                MaxShield: actor.MaxShield))
            .ToList();

        var skills = state.Skills.Values
            .OrderBy(skill => skill.SkillId, StringComparer.Ordinal)
            .Select(skill => new SkillStateDto(
                SkillId: skill.SkillId,
                DisplayName: ArenaConfig.GetSkillDisplayName(skill.SkillId),
                CooldownRemainingMs: skill.CooldownRemainingMs,
                CooldownTotalMs: ResolveSkillCooldownTotalMs(state, skill)))
            .ToList();

        var decals = state.Decals
            .OrderBy(decal => decal.CreatedTick)
            .ThenBy(decal => decal.EntityId, StringComparer.Ordinal)
            .ThenBy(decal => decal.TileY)
            .ThenBy(decal => decal.TileX)
            .Select(decal => new BattleDecalDto(
                EntityId: decal.EntityId,
                DecalKind: decal.DecalKind,
                EntityType: decal.EntityType,
                MobType: decal.MobType,
                TileX: decal.TileX,
                TileY: decal.TileY,
                SpriteKey: decal.SpriteKey,
                RemainingMs: decal.RemainingMs,
                TotalMs: decal.TotalMs,
                CreatedTick: decal.CreatedTick))
            .ToList();
        var groundTargetPos = state.GroundTargetTileX is int groundX && state.GroundTargetTileY is int groundY
            ? new BattleTilePosDto(groundX, groundY)
            : null;
        var effectiveTargetEntityId = ResolveEffectivePlayerAutoAttackTargetEntityId(state);
        var xpToNextLevel = GetXpToNextLevel(state.RunLevel);
        var nowMs = GetElapsedMsForTick(state.Tick);
        var isRunEnded = state.IsRunEnded;
        var isGameOver = isRunEnded;
        var endReason = ResolveLegacyEndReason(state.RunEndReason);
        var timeSurvivedMs = state.RunEndedAtMs ?? nowMs;
        var scaling = ResolveScalingDirectorV2(nowMs, state.RunLevel);
        var currentMobHpMult = scaling.NormalHpMult;
        var currentMobDmgMult = scaling.NormalDmgMult;
        var activeBuffs = state.ActiveBuffs.Values
            .Where(buff => buff.ExpiresAtMs > nowMs)
            .OrderBy(buff => buff.BuffId, StringComparer.Ordinal)
            .Select(buff => new BattleBuffDto(
                BuffId: buff.BuffId,
                RemainingMs: (int)Math.Max(0, buff.ExpiresAtMs - nowMs)))
            .ToList();
        var bestiary = state.Bestiary
            .OrderBy(entry => (int)entry.Key)
            .Select(entry => new BestiaryEntryDto(
                Species: GetSpeciesId(entry.Key),
                KillsTotal: entry.Value.KillsTotal,
                NextChestAtKills: entry.Value.NextChestAtKills,
                Rank: ResolveBestiaryRank(entry.Value.KillsTotal)))
            .ToList();
        var activePois = state.Pois.Values
            .Where(poi => poi.ExpiresAtMs > nowMs)
            .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
            .Select(poi => new BattlePoiDto(
                PoiId: poi.PoiId,
                Type: poi.Type,
                Pos: new BattleTilePosDto(poi.TileX, poi.TileY),
                RemainingMs: (int)Math.Max(0, poi.ExpiresAtMs - nowMs),
                Species: poi.Species,
                Metadata: poi.Metadata is null
                    ? null
                    : new Dictionary<string, string>(poi.Metadata, StringComparer.Ordinal)))
            .ToList();
        var offeredCards = state.PendingCardChoice is null
            ? []
            : state.PendingCardChoice.OfferedCardIds
                .Select(cardId => CardById.TryGetValue(cardId, out var definition) ? definition : null)
                .Where(definition => definition is not null)
                .Select(definition => ToCardOfferDto(state, definition!))
                .ToList();
        var selectedCards = state.SelectedCardIds
            .Select(cardId => CardById.TryGetValue(cardId, out var definition) ? definition : null)
            .Where(definition => definition is not null)
            .Select(definition => ToCardOfferDto(state, definition!))
            .ToList();
        var playerGlobalCooldownTotalMs = ResolvePlayerGlobalCooldownMs(state);

        return new BattleSnapshot(
            BattleId: state.BattleId,
            Tick: state.Tick,
            Actors: actors,
            Skills: skills,
            GlobalCooldownRemainingMs: state.PlayerGlobalCooldownRemainingMs,
            GlobalCooldownTotalMs: playerGlobalCooldownTotalMs,
            AltarCooldownRemainingMs: (int)Math.Max(0, state.NextAltarInteractAllowedAtMs - nowMs),
            Seed: state.Seed,
            FacingDirection: state.PlayerFacingDirection,
            BattleStatus: state.BattleStatus,
            IsGameOver: isGameOver,
            EndReason: endReason,
            IsRunEnded: isRunEnded,
            RunEndReason: state.RunEndReason,
            RunEndedAtMs: state.RunEndedAtMs,
            RunXp: state.RunXp,
            RunLevel: state.RunLevel,
            XpToNextLevel: xpToNextLevel,
            TotalKills: state.TotalKills,
            EliteKills: state.EliteKills,
            ChestsOpened: state.ChestsOpened,
            TimeSurvivedMs: timeSurvivedMs,
            RunTimeMs: nowMs,
            RunDurationMs: ArenaConfig.RunDurationMs,
            CurrentMobHpMult: currentMobHpMult,
            CurrentMobDmgMult: currentMobDmgMult,
            Scaling: new BattleScalingDto(
                NormalHpMult: scaling.NormalHpMult,
                NormalDmgMult: scaling.NormalDmgMult,
                EliteHpMult: scaling.EliteHpMult,
                EliteDmgMult: scaling.EliteDmgMult,
                LvlFactor: scaling.LvlFactor,
                IsLvlFactorEnabled: scaling.IsLvlFactorEnabled),
            EffectiveTargetEntityId: effectiveTargetEntityId,
            LockedTargetEntityId: state.LockedTargetEntityId,
            GroundTargetPos: groundTargetPos,
            AssistConfig: ToAssistConfigDto(state.AssistConfig),
            PlayerBaseElement: GetPlayerBaseElement(state),
            WeaponElement: state.EquippedWeaponElement,
            Decals: decals,
            ActiveBuffs: activeBuffs,
            Bestiary: bestiary,
            PendingSpeciesChest: state.PendingSpeciesChestArchetype is null
                ? null
                : GetSpeciesId(state.PendingSpeciesChestArchetype.Value),
            ActivePois: activePois,
            IsAwaitingCardChoice: state.PendingCardChoice is not null,
            PendingChoiceId: state.PendingCardChoice?.ChoiceId,
            OfferedCards: offeredCards,
            SelectedCards: selectedCards,
            Events: events,
            CommandResults: commandResults,
            FreeSlotWeaponId: state.FreeSlotWeaponId,
            FreeSlotWeaponName: state.FreeSlotWeaponId is string freeId
                && ArenaConfig.DisplayNames.TryGetValue(freeId, out var freeName)
                    ? freeName
                    : null);
    }

    private static string? ResolveLegacyEndReason(string? runEndReason)
    {
        return runEndReason switch
        {
            ArenaConfig.RunEndReasonDefeatDeath => ArenaConfig.EndReasonDeath,
            ArenaConfig.RunEndReasonVictoryTime => ArenaConfig.EndReasonTime,
            _ => null
        };
    }
}
