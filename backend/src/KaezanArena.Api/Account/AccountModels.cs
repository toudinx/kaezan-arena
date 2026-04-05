using KaezanArena.Api.Battle;

namespace KaezanArena.Api.Account;

public enum EquipmentSlot
{
    Weapon = 0
}

public sealed record AccountState(
    string AccountId,
    string ActiveCharacterId,
    int Version,
    long EchoFragmentsBalance,
    IReadOnlyDictionary<string, CharacterState> Characters,
    long KaerosBalance = 0,
    int AccountLevel = 1,
    long AccountXp = 0,
    DailyContractsState? DailyContracts = null)
{
    public IReadOnlyDictionary<string, SigilInstance> SigilInventory { get; init; } =
        new Dictionary<string, SigilInstance>(StringComparer.Ordinal);
}

public sealed record ContractDefinition(
    string ContractId,
    string Type,
    string Description,
    int TargetValue,
    int KaerosReward,
    int AccountXpReward);

public sealed record DailyContractState(
    string ContractId,
    bool IsCompleted,
    int CurrentProgress,
    DateOnly AssignedDate);

public sealed record DailyContractsState(
    DateOnly AssignedDate,
    IReadOnlyList<DailyContractState> Contracts);

public sealed record RunSummary(
    int KillCount,
    int EliteKillCount,
    int ChestsOpened,
    int RunLevel,
    bool RunCompleted);

public static class DailyContractCatalog
{
    public static readonly IReadOnlyList<ContractDefinition> ContractPool =
    [
        new("contract_001", ArenaConfig.ContractConfig.TypeCompleteRun, "Complete any run", 1, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_002", ArenaConfig.ContractConfig.TypeReachRunLevel, "Complete a run above Level 6", 6, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_003", ArenaConfig.ContractConfig.TypeReachRunLevel, "Complete a run above Level 10", 10, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_004", ArenaConfig.ContractConfig.TypeKillCount, "Kill 20 enemies in a single run", 20, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_005", ArenaConfig.ContractConfig.TypeKillCount, "Kill 40 enemies in a single run", 40, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_006", ArenaConfig.ContractConfig.TypeOpenChests, "Open 2 chests in a single run", 2, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_007", ArenaConfig.ContractConfig.TypeOpenChests, "Open 3 chests in any run", 3, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_008", ArenaConfig.ContractConfig.TypeKillElites, "Kill 5 Elite enemies in a single run", 5, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_009", ArenaConfig.ContractConfig.TypeKillElites, "Kill 10 Elite enemies in any run", 10, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract),
        new("contract_010", ArenaConfig.ContractConfig.TypeCompleteRun, "Complete 2 runs in a day", 2, ArenaConfig.ContractConfig.KaerosRewardPerContract, ArenaConfig.ContractConfig.AccountXpRewardPerContract)
    ];

    public static readonly IReadOnlyDictionary<string, ContractDefinition> ContractById =
        ContractPool.ToDictionary(contract => contract.ContractId, StringComparer.Ordinal);
}

public sealed record CharacterState(
    string CharacterId,
    string Name,
    CharacterInventory Inventory,
    EquipmentState Equipment,
    IReadOnlyDictionary<string, int> BestiaryKillsBySpecies,
    IReadOnlyDictionary<string, int> PrimalCoreBySpecies,
    int MasteryLevel = 1,
    long MasteryXp = 0,
    int UnlockedSigilSlots = ArenaConfig.MasteryConfig.InitialUnlockedSigilSlots,
    bool HollowEssenceBarrierCleared = false)
{
    public CharacterSigilLoadout SigilLoadout { get; init; } = new(
        Slot1SigilInstanceId: null,
        Slot2SigilInstanceId: null,
        Slot3SigilInstanceId: null,
        Slot4SigilInstanceId: null,
        Slot5SigilInstanceId: null);

    /// <summary>
    /// Keyed by tier index (0-based). Value = true when Ascendant is unlocked for that tier.
    /// Default: empty (no Ascendant slots unlocked).
    /// </summary>
    public IReadOnlyDictionary<int, bool> AscendantSigilSlotsUnlocked { get; init; } =
        new Dictionary<int, bool>();
}

public sealed record SigilInstance(
    string InstanceId,       // unique ID e.g. "sigil_abc123"
    string SpeciesId,        // which mob species this came from
    int SigilLevel,          // 1-95
    int SlotIndex,           // 1-5, which slot tier this belongs to
    string DefinitionId = "", // stable sigil definition ID e.g. "sigil_def:melee_brute"
    bool IsLocked = false,   // backend-authoritative lock state
    bool RequiresAscendantUnlock = false); // if true, tier ascendant unlock is required to equip

public sealed record CharacterSigilLoadout(
    string? Slot1SigilInstanceId,
    string? Slot2SigilInstanceId,
    string? Slot3SigilInstanceId,
    string? Slot4SigilInstanceId,
    string? Slot5SigilInstanceId)
{
    public string? GetSlotInstanceId(int slotIndex)
    {
        return slotIndex switch
        {
            1 => Slot1SigilInstanceId,
            2 => Slot2SigilInstanceId,
            3 => Slot3SigilInstanceId,
            4 => Slot4SigilInstanceId,
            5 => Slot5SigilInstanceId,
            _ => null
        };
    }

    public CharacterSigilLoadout SetSlotInstanceId(int slotIndex, string? sigilInstanceId)
    {
        return slotIndex switch
        {
            1 => this with { Slot1SigilInstanceId = sigilInstanceId },
            2 => this with { Slot2SigilInstanceId = sigilInstanceId },
            3 => this with { Slot3SigilInstanceId = sigilInstanceId },
            4 => this with { Slot4SigilInstanceId = sigilInstanceId },
            5 => this with { Slot5SigilInstanceId = sigilInstanceId },
            _ => this
        };
    }
}

public static class SigilSlotResolver
{
    public static int ResolveSlotIndexForLevel(int sigilLevel)
    {
        for (var index = 0; index < ArenaConfig.SigilConfig.SlotLevelRanges.Length; index += 1)
        {
            var (min, max) = ArenaConfig.SigilConfig.SlotLevelRanges[index];
            if (sigilLevel >= min && sigilLevel <= max)
            {
                return index + 1; // 1-based
            }
        }

        throw new InvalidOperationException(
            $"Sigil level '{sigilLevel}' is outside configured slot ranges.");
    }
}

public sealed record CharacterInventory(
    IReadOnlyDictionary<string, long> MaterialStacks,
    IReadOnlyDictionary<string, OwnedEquipmentInstance> EquipmentInstances);

public sealed record OwnedEquipmentInstance(
    string InstanceId,
    string DefinitionId,
    bool IsLocked,
    string? OriginSpeciesId = null,
    string? Slot = null,
    string? Rarity = null,
    string? CraftedByCharacterId = null,
    string? CraftedByCharacterName = null);

public sealed record EquipmentState(
    string? WeaponInstanceId)
{
    public string? GetInstanceId(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => WeaponInstanceId,
            _ => null
        };
    }

    public EquipmentState SetInstanceId(EquipmentSlot slot, string? instanceId)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => this with { WeaponInstanceId = instanceId },
            _ => this
        };
    }

    public static IReadOnlyList<EquipmentSlot> OrderedSlots { get; } =
    [
        EquipmentSlot.Weapon
    ];
}

public sealed record ItemDefinition(
    string ItemId,
    string DisplayName,
    string Kind,
    bool Stackable,
    string Rarity);

public sealed record SpeciesDefinition(
    string SpeciesId,
    string DisplayName);

public sealed record SigilDefinition(
    string DefinitionId,
    string SpeciesId,
    IReadOnlyList<string> SupportedTierIds);

public sealed record CharacterCatalogDefinition(
    string CharacterId,
    string DisplayName,
    string Subtitle,
    bool IsProvisional,
    IReadOnlyList<string> FixedWeaponIds,
    IReadOnlyList<string> FixedWeaponNames);

public sealed record EquipmentDefinition(
    string ItemId,
    string Slot,
    string WeaponClass,
    string? WeaponElement,
    IReadOnlyDictionary<string, string> GameplayModifiers);

public sealed record DropEvent(
    string DropEventId,
    string AccountId,
    string CharacterId,
    string BattleId,
    int Tick,
    string SourceType,
    string SourceId,
    string ItemId,
    int Quantity,
    string? EquipmentInstanceId,
    string RewardKind,
    string? Species,
    DateTimeOffset AwardedAtUtc,
    int? SigilLevel = null,
    int? SlotIndex = null);

public sealed record DropEntry(
    string ItemId,
    int Weight,
    int MinQuantity,
    int MaxQuantity);

public sealed record DropTable(
    string DropTableId,
    int Version,
    IReadOnlyList<DropEntry> Entries);

public sealed record DropSource(
    int Tick,
    string SourceType,
    string SourceId,
    string? Species);

public sealed record AwardDropsResult(
    IReadOnlyList<DropEvent> Awarded,
    CharacterState Character);

public sealed record BestiaryCraftResult(
    AccountState Account,
    CharacterState Character,
    OwnedEquipmentInstance CraftedItem);

public sealed record ItemRefineResult(
    AccountState Account,
    CharacterState Character,
    OwnedEquipmentInstance RefinedItem);

public sealed record SpendHollowEssenceBarrierResult(
    bool Success,
    string? FailureReason,
    AccountState Account);

public sealed record EquipmentStatTotals(
    int Attack,
    int Defense,
    int Vitality)
{
    public static EquipmentStatTotals Zero { get; } = new(0, 0, 0);

    public EquipmentStatTotals Add(EquipmentStatTotals other)
    {
        return new EquipmentStatTotals(
            Attack: Attack + other.Attack,
            Defense: Defense + other.Defense,
            Vitality: Vitality + other.Vitality);
    }
}

public static class EquipmentSlotMapper
{
    public static bool TryFromCatalogSlot(string? slot, out EquipmentSlot result)
    {
        result = EquipmentSlot.Weapon;
        if (string.IsNullOrWhiteSpace(slot))
        {
            return false;
        }

        var normalized = slot.Trim();
        if (string.Equals(normalized, "weapon", StringComparison.OrdinalIgnoreCase))
        {
            result = EquipmentSlot.Weapon;
            return true;
        }

        return false;
    }

    public static string ToCatalogSlot(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => "weapon",
            _ => "weapon"
        };
    }
}
