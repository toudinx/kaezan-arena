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
public abstract record BattleEventDto;
