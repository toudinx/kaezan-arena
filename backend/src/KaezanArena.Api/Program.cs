using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Battle;
using KaezanArena.Api.Middleware;
using KaezanArena.Application.Effects;

var builder = WebApplication.CreateBuilder(args);
var configuredStepDeltaMs = builder.Configuration.GetValue<int?>("Battle:StepDeltaMs");
var resolvedStepDeltaMs = ArenaConfig.NormalizeStepDeltaMs(configuredStepDeltaMs);

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
                typeof(CritTextEventDto),
                typeof(LevelUpEventDto),
                typeof(XpGainedEventDto),
                typeof(CardChoiceOfferedEventDto),
                typeof(CardChosenEventDto),
                typeof(EliteSpawnedEventDto),
                typeof(EliteBuffAppliedEventDto),
                typeof(EliteBuffRemovedEventDto),
                typeof(EliteDiedEventDto),
                typeof(RangedProjectileFiredEventDto),
                typeof(MobKnockedBackEventDto),
                typeof(RunEndedEventDto)
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

        if (subType == typeof(LevelUpEventDto))
        {
            return "level_up";
        }

        if (subType == typeof(XpGainedEventDto))
        {
            return "xp_gained";
        }

        if (subType == typeof(CardChoiceOfferedEventDto))
        {
            return "card_choice_offered";
        }

        if (subType == typeof(CardChosenEventDto))
        {
            return "card_chosen";
        }

        if (subType == typeof(EliteSpawnedEventDto))
        {
            return "elite_spawned";
        }

        if (subType == typeof(EliteBuffAppliedEventDto))
        {
            return "elite_buff_applied";
        }

        if (subType == typeof(EliteBuffRemovedEventDto))
        {
            return "elite_buff_removed";
        }

        if (subType == typeof(EliteDiedEventDto))
        {
            return "elite_died";
        }

        if (subType == typeof(RangedProjectileFiredEventDto))
        {
            return "ranged_projectile_fired";
        }

        if (subType == typeof(MobKnockedBackEventDto))
        {
            return "mob_knocked_back";
        }

        if (subType == typeof(RunEndedEventDto))
        {
            return "run_ended";
        }

        return null;
    });
});
builder.Services.AddSingleton<IBattleStore>(_ => new InMemoryBattleStore(resolvedStepDeltaMs));
builder.Services.AddSingleton<IAccountStatePersistence>(
    serviceProvider =>
    {
        var configuration = serviceProvider.GetRequiredService<IConfiguration>();
        var environment = serviceProvider.GetRequiredService<IHostEnvironment>();
        var configuredStoragePath = configuration.GetValue<string>("AccountState:StorageDirectory");
        var resolvedStoragePath = string.IsNullOrWhiteSpace(configuredStoragePath)
            ? Path.Combine(environment.ContentRootPath, ".data", "accounts")
            : Path.IsPathRooted(configuredStoragePath)
                ? Path.GetFullPath(configuredStoragePath.Trim())
                : Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuredStoragePath.Trim()));
        return new JsonFileAccountStatePersistence(resolvedStoragePath);
    });
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
