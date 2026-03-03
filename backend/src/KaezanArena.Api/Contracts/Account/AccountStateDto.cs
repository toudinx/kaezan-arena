namespace KaezanArena.Api.Contracts.Account;

public sealed record AccountStateDto(
    string AccountId,
    string ActiveCharacterId,
    int Version,
    long EchoFragmentsBalance,
    IReadOnlyDictionary<string, CharacterStateDto> Characters);

public sealed record CharacterStateDto(
    string CharacterId,
    string Name,
    int Level,
    long Xp,
    CharacterInventoryDto Inventory,
    CharacterEquipmentDto Equipment,
    IReadOnlyDictionary<string, int> BestiaryKillsBySpecies,
    IReadOnlyDictionary<string, int> PrimalCoreBySpecies);

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
    string? WeaponInstanceId,
    string? ArmorInstanceId,
    string? RelicInstanceId);
