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
    long KaerosBalance = 0);

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
    bool HollowEssenceBarrierCleared = false);

public sealed record CharacterInventory(
    IReadOnlyDictionary<string, long> MaterialStacks,
    IReadOnlyDictionary<string, OwnedEquipmentInstance> EquipmentInstances);

public sealed record OwnedEquipmentInstance(
    string InstanceId,
    string DefinitionId,
    bool IsLocked,
    string? OriginSpeciesId = null,
    string? Slot = null,
    string? Rarity = null);

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
    DateTimeOffset AwardedAtUtc);

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

public sealed record ItemSalvageResult(
    AccountState Account,
    CharacterState Character,
    string SalvagedItemInstanceId,
    string SpeciesId,
    int PrimalCoreAwarded);

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
