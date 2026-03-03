namespace KaezanArena.Api.Contracts.Account;

public sealed record ItemDefinitionDto(
    string ItemId,
    string DisplayName,
    string Kind,
    bool Stackable,
    string Rarity);

public sealed record EquipmentDefinitionDto(
    string ItemId,
    string Slot,
    string WeaponClass,
    string? WeaponElement,
    IReadOnlyDictionary<string, string> GameplayModifiers);