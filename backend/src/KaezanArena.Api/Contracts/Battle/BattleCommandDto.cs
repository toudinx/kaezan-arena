namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleCommandDto(
    string Type,
    string? SkillId = null,
    string? Dir = null,
    string? TargetEntityId = null,
    int? GroundTileX = null,
    int? GroundTileY = null,
    string? PoiId = null,
    AssistConfigDto? AssistConfig = null);
