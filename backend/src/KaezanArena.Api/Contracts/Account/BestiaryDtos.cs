namespace KaezanArena.Api.Contracts.Account;

public sealed record BestiarySpeciesDto(
    string SpeciesId,
    string DisplayName);

public sealed record CharacterBestiaryStateDto(
    string CharacterId,
    string Name,
    IReadOnlyDictionary<string, int> BestiaryKillsBySpecies,
    IReadOnlyDictionary<string, int> PrimalCoreBySpecies);

public sealed record BestiaryOverviewResponseDto(
    IReadOnlyList<BestiarySpeciesDto> SpeciesCatalog,
    CharacterBestiaryStateDto Character);
