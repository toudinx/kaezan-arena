namespace KaezanArena.Api.Contracts.Account;

public sealed record AccountStateDto(
    string AccountId,
    string ActiveCharacterId,
    int Version,
    long EchoFragmentsBalance,
    long KaerosBalance,
    IReadOnlyList<SigilInstanceDto> SigilInventory,
    IReadOnlyDictionary<string, CharacterStateDto> Characters);

public sealed record CharacterStateDto(
    string CharacterId,
    string Name,
    int MasteryLevel,
    long MasteryXp,
    int MasteryXpForCurrentLevel,
    int MasteryXpRequiredForNextLevel,
    int UnlockedSigilSlots,
    CharacterSigilLoadoutDto SigilLoadout,
    CharacterInventoryDto Inventory,
    CharacterEquipmentDto Equipment,
    IReadOnlyDictionary<string, int> BestiaryKillsBySpecies,
    IReadOnlyDictionary<string, int> PrimalCoreBySpecies);

public sealed record SigilInstanceDto(
    string InstanceId,
    string SpeciesId,
    string SpeciesDisplayName,
    int SigilLevel,
    int SlotIndex,
    string TierName,
    int HpBonus);

public sealed record CharacterSigilLoadoutDto(
    SigilInstanceDto? Slot1,
    SigilInstanceDto? Slot2,
    SigilInstanceDto? Slot3,
    SigilInstanceDto? Slot4,
    SigilInstanceDto? Slot5);

public sealed record CharacterInventoryDto(
    IReadOnlyDictionary<string, long> MaterialStacks,
    IReadOnlyDictionary<string, OwnedEquipmentInstanceDto> EquipmentInstances);

public sealed record OwnedEquipmentInstanceDto(
    string InstanceId,
    string DefinitionId,
    bool IsLocked,
    string? OriginSpeciesId = null,
    string? Slot = null,
    string? Rarity = null);

public sealed record CharacterEquipmentDto(
    string? WeaponInstanceId);
