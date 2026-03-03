namespace KaezanArena.Api.Contracts.Account;

public sealed record AccountStateDto(
    string AccountId,
    string ActiveCharacterId,
    int Version,
    IReadOnlyDictionary<string, CharacterStateDto> Characters);

public sealed record CharacterStateDto(
    string CharacterId,
    string Name,
    int Level,
    long Xp,
    CharacterInventoryDto Inventory,
    CharacterEquipmentDto Equipment);

public sealed record CharacterInventoryDto(
    IReadOnlyDictionary<string, long> MaterialStacks,
    IReadOnlyDictionary<string, OwnedEquipmentInstanceDto> EquipmentInstances);

public sealed record OwnedEquipmentInstanceDto(
    string InstanceId,
    string DefinitionId,
    bool IsLocked);

public sealed record CharacterEquipmentDto(
    string? WeaponInstanceId,
    string? ArmorInstanceId,
    string? RelicInstanceId);
