using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;
using KaezanArena.Api.Middleware;
using KaezanArena.Application.Effects;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.UseOneOfForPolymorphism();
    options.UseAllOfForInheritance();
    options.SelectSubTypesUsing(baseType =>
    {
        if (baseType == typeof(BattleEventDto))
        {
            return
            [
                typeof(FxSpawnEventDto),
                typeof(DamageNumberEventDto),
                typeof(AttackFxEventDto),
                typeof(DeathEventDto),
                typeof(HealNumberEventDto),
                typeof(ReflectEventDto),
                typeof(AssistCastEventDto),
                typeof(PoiInteractedEventDto),
                typeof(InteractFailedEventDto),
                typeof(BuffAppliedEventDto),
                typeof(AltarActivatedEventDto),
                typeof(SpeciesChestSpawnedEventDto),
                typeof(SpeciesChestOpenedEventDto),
                typeof(CritTextEventDto)
            ];
        }

        return [];
    });
    options.SelectDiscriminatorNameUsing(baseType =>
        baseType == typeof(BattleEventDto) ? "type" : null);
    options.SelectDiscriminatorValueUsing(subType =>
    {
        if (subType == typeof(FxSpawnEventDto))
        {
            return "fx_spawn";
        }

        if (subType == typeof(DamageNumberEventDto))
        {
            return "damage_number";
        }

        if (subType == typeof(AttackFxEventDto))
        {
            return "attack_fx";
        }

        if (subType == typeof(DeathEventDto))
        {
            return "death";
        }

        if (subType == typeof(HealNumberEventDto))
        {
            return "heal_number";
        }

        if (subType == typeof(ReflectEventDto))
        {
            return "reflect";
        }

        if (subType == typeof(AssistCastEventDto))
        {
            return "assist_cast";
        }

        if (subType == typeof(PoiInteractedEventDto))
        {
            return "poi_interacted";
        }

        if (subType == typeof(InteractFailedEventDto))
        {
            return "interact_failed";
        }

        if (subType == typeof(BuffAppliedEventDto))
        {
            return "buff_applied";
        }

        if (subType == typeof(AltarActivatedEventDto))
        {
            return "altar_activated";
        }

        if (subType == typeof(SpeciesChestSpawnedEventDto))
        {
            return "species_chest_spawned";
        }

        if (subType == typeof(SpeciesChestOpenedEventDto))
        {
            return "species_chest_opened";
        }

        if (subType == typeof(CritTextEventDto))
        {
            return "crit_text";
        }

        return null;
    });
});
builder.Services.AddSingleton<IBattleStore, InMemoryBattleStore>();
builder.Services.AddSingleton<IAccountStateStore, InMemoryAccountStateStore>();
builder.Services.AddScoped<ITileAoeFxPlanner, TileAoeFxPlanner>();

var app = builder.Build();

app.UseGlobalExceptionHandling();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

public partial class Program;
