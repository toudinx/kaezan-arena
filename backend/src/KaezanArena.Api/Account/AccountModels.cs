namespace KaezanArena.Api.Account;

public enum EquipmentSlot
{
    Weapon = 0,
    Armor = 1,
    Relic = 2
}

public sealed record AccountState(
    string AccountId,
    string ActiveCharacterId,
    int Version,
    long EchoFragmentsBalance,
    IReadOnlyDictionary<string, CharacterState> Characters);

public sealed record CharacterState(
    string CharacterId,
    string Name,
    int Level,
    long Xp,
    CharacterInventory Inventory,
    EquipmentState Equipment,
    IReadOnlyDictionary<string, int> BestiaryKillsBySpecies,
    IReadOnlyDictionary<string, int> PrimalCoreBySpecies);

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
    string? WeaponInstanceId,
    string? ArmorInstanceId,
    string? RelicInstanceId)
{
    public string? GetInstanceId(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => WeaponInstanceId,
            EquipmentSlot.Armor => ArmorInstanceId,
            EquipmentSlot.Relic => RelicInstanceId,
            _ => null
        };
    }

    public EquipmentState SetInstanceId(EquipmentSlot slot, string? instanceId)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => this with { WeaponInstanceId = instanceId },
            EquipmentSlot.Armor => this with { ArmorInstanceId = instanceId },
            EquipmentSlot.Relic => this with { RelicInstanceId = instanceId },
            _ => this
        };
    }

    public static IReadOnlyList<EquipmentSlot> OrderedSlots { get; } =
    [
        EquipmentSlot.Weapon,
        EquipmentSlot.Armor,
        EquipmentSlot.Relic
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

        if (string.Equals(normalized, "armor", StringComparison.OrdinalIgnoreCase))
        {
            result = EquipmentSlot.Armor;
            return true;
        }

        if (string.Equals(normalized, "relic", StringComparison.OrdinalIgnoreCase))
        {
            result = EquipmentSlot.Relic;
            return true;
        }

        return false;
    }

    public static string ToCatalogSlot(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => "weapon",
            EquipmentSlot.Armor => "armor",
            EquipmentSlot.Relic => "relic",
            _ => "weapon"
        };
    }
}
