using System.Text.Json.Serialization;

namespace KaezanArena.Api.Contracts.Battle;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(FxSpawnEventDto), "fx_spawn")]
[JsonDerivedType(typeof(DamageNumberEventDto), "damage_number")]
[JsonDerivedType(typeof(AttackFxEventDto), "attack_fx")]
[JsonDerivedType(typeof(DeathEventDto), "death")]
[JsonDerivedType(typeof(HealNumberEventDto), "heal_number")]
[JsonDerivedType(typeof(ReflectEventDto), "reflect")]
[JsonDerivedType(typeof(AssistCastEventDto), "assist_cast")]
[JsonDerivedType(typeof(PoiInteractedEventDto), "poi_interacted")]
[JsonDerivedType(typeof(InteractFailedEventDto), "interact_failed")]
[JsonDerivedType(typeof(BuffAppliedEventDto), "buff_applied")]
[JsonDerivedType(typeof(AltarActivatedEventDto), "altar_activated")]
[JsonDerivedType(typeof(SpeciesChestSpawnedEventDto), "species_chest_spawned")]
[JsonDerivedType(typeof(SpeciesChestOpenedEventDto), "species_chest_opened")]
[JsonDerivedType(typeof(CritTextEventDto), "crit_text")]
[JsonDerivedType(typeof(LevelUpEventDto), "level_up")]
[JsonDerivedType(typeof(XpGainedEventDto), "xp_gained")]
[JsonDerivedType(typeof(CardChoiceOfferedEventDto), "card_choice_offered")]
[JsonDerivedType(typeof(CardChosenEventDto), "card_chosen")]
[JsonDerivedType(typeof(EliteSpawnedEventDto), "elite_spawned")]
[JsonDerivedType(typeof(EliteBuffAppliedEventDto), "elite_buff_applied")]
[JsonDerivedType(typeof(EliteBuffRemovedEventDto), "elite_buff_removed")]
[JsonDerivedType(typeof(EliteDiedEventDto), "elite_died")]
[JsonDerivedType(typeof(RunEndedEventDto), "run_ended")]
public abstract record BattleEventDto;
