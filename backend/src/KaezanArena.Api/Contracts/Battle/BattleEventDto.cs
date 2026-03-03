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
public abstract record BattleEventDto;
