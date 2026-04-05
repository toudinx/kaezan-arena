using KaezanArena.Api.Battle;

namespace KaezanArena.Api.Account;

public static class AccountCatalog
{
    public static IReadOnlyList<SpeciesDefinition> SpeciesDefinitions { get; } =
    [
        new SpeciesDefinition(ArenaConfig.SpeciesIds.MeleeBrute,   ArenaConfig.DisplayNames[ArenaConfig.SpeciesIds.MeleeBrute]),
        new SpeciesDefinition(ArenaConfig.SpeciesIds.RangedArcher, ArenaConfig.DisplayNames[ArenaConfig.SpeciesIds.RangedArcher]),
        new SpeciesDefinition(ArenaConfig.SpeciesIds.MeleeDemon,   ArenaConfig.DisplayNames[ArenaConfig.SpeciesIds.MeleeDemon]),
        new SpeciesDefinition(ArenaConfig.SpeciesIds.RangedDragon, ArenaConfig.DisplayNames[ArenaConfig.SpeciesIds.RangedDragon]),
    ];

    public static IReadOnlyList<SigilDefinition> SigilDefinitions { get; } =
    [
        new SigilDefinition(
            DefinitionId: ArenaConfig.SigilConfig.DefinitionIds.MeleeBrute,
            SpeciesId: ArenaConfig.SpeciesIds.MeleeBrute,
            SupportedTierIds: ArenaConfig.SigilConfig.SlotTierIds.ToArray()),
        new SigilDefinition(
            DefinitionId: ArenaConfig.SigilConfig.DefinitionIds.RangedArcher,
            SpeciesId: ArenaConfig.SpeciesIds.RangedArcher,
            SupportedTierIds: ArenaConfig.SigilConfig.SlotTierIds.ToArray()),
        new SigilDefinition(
            DefinitionId: ArenaConfig.SigilConfig.DefinitionIds.MeleeDemon,
            SpeciesId: ArenaConfig.SpeciesIds.MeleeDemon,
            SupportedTierIds: ArenaConfig.SigilConfig.SlotTierIds.ToArray()),
        new SigilDefinition(
            DefinitionId: ArenaConfig.SigilConfig.DefinitionIds.RangedDragon,
            SpeciesId: ArenaConfig.SpeciesIds.RangedDragon,
            SupportedTierIds: ArenaConfig.SigilConfig.SlotTierIds.ToArray())
    ];

    public static IReadOnlyList<CharacterCatalogDefinition> CharacterDefinitions { get; } =
    [
        BuildCharacterDefinition(
            ArenaConfig.CharacterIds.Kina,
            ArenaConfig.CharacterSubtitleKina,
            isProvisional: false),
        BuildCharacterDefinition(
            ArenaConfig.CharacterIds.RangedPrototype,
            ArenaConfig.CharacterSubtitleRangedPrototype,
            isProvisional: true),
        BuildCharacterDefinition(
            ArenaConfig.CharacterIds.KaelisDawn,
            ArenaConfig.CharacterSubtitleKina,
            isProvisional: false),
        BuildCharacterDefinition(
            ArenaConfig.CharacterIds.KaelisEmber,
            ArenaConfig.CharacterSubtitleRangedPrototype,
            isProvisional: true)
    ];

    public static IReadOnlyList<ItemDefinition> ItemDefinitions { get; } =
    [
        new ItemDefinition("wpn.iron_blade", "Iron Blade", "equipment", false, "common"),
        new ItemDefinition("wpn.hunter_bow", "Hunter Bow", "equipment", false, "rare"),
        new ItemDefinition("wpn.ember_staff", "Ember Staff", "equipment", false, "rare"),
        new ItemDefinition("wpn.drake_fang", "Drake Fang", "equipment", false, "epic"),
        new ItemDefinition("wpn.primal_forged_blade", "Primal Forged Blade", "equipment", false, "common"),
        new ItemDefinition("wpn.ascendant_forged_blade", "Ascendant Forged Blade", "equipment", false, "ascendant")
    ];

    public static IReadOnlyList<EquipmentDefinition> EquipmentDefinitions { get; } =
    [
        new EquipmentDefinition(
            "wpn.iron_blade",
            Slot: "weapon",
            WeaponClass: "blade",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["basic_combo"] = "cleave_short",
                ["stat.attack"] = "8"
            }),
        new EquipmentDefinition(
            "wpn.hunter_bow",
            Slot: "weapon",
            WeaponClass: "bow",
            WeaponElement: "earth",
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["shot_pattern"] = "pierce_line",
                ["stat.attack"] = "12"
            }),
        new EquipmentDefinition(
            "wpn.ember_staff",
            Slot: "weapon",
            WeaponClass: "staff",
            WeaponElement: "fire",
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["on_hit"] = "ignite",
                ["stat.attack"] = "14"
            }),
        new EquipmentDefinition(
            "wpn.drake_fang",
            Slot: "weapon",
            WeaponClass: "spear",
            WeaponElement: "chaos",
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["finisher"] = "fang_surge",
                ["stat.attack"] = "18"
            }),
        new EquipmentDefinition(
            "wpn.primal_forged_blade",
            Slot: "weapon",
            WeaponClass: "blade",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["basic_combo"] = "cleave_short",
                ["stat.attack"] = "10"
            }),
        new EquipmentDefinition(
            "wpn.ascendant_forged_blade",
            Slot: "weapon",
            WeaponClass: "blade",
            WeaponElement: "chaos",
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["basic_combo"] = "cleave_short",
                ["stat.attack"] = "28"
            }),
    ];

    public static IReadOnlyDictionary<string, ItemDefinition> ItemsById { get; } =
        ItemDefinitions.ToDictionary(def => def.ItemId, StringComparer.Ordinal);

    public static IReadOnlyDictionary<string, EquipmentDefinition> EquipmentByItemId { get; } =
        EquipmentDefinitions.ToDictionary(def => def.ItemId, StringComparer.Ordinal);

    public static IReadOnlyDictionary<string, SigilDefinition> SigilDefinitionsById { get; } =
        SigilDefinitions.ToDictionary(definition => definition.DefinitionId, StringComparer.Ordinal);

    public static IReadOnlyDictionary<string, DropTable> EquipmentDropTables { get; } =
        new Dictionary<string, DropTable>(StringComparer.Ordinal)
        {
            ["mob:default"] = new DropTable(
                "mob.default",
                Version: 1,
                Entries:
                [
                    new DropEntry("wpn.iron_blade", Weight: 35, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.hunter_bow", Weight: 18, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.ember_staff", Weight: 11, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.drake_fang", Weight: 3, MinQuantity: 1, MaxQuantity: 1)
                ]),
            ["chest:default"] = new DropTable(
                "chest.default",
                Version: 1,
                Entries:
                [
                    new DropEntry("wpn.iron_blade", Weight: 24, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.hunter_bow", Weight: 24, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.ember_staff", Weight: 16, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.drake_fang", Weight: 8, MinQuantity: 1, MaxQuantity: 1)
                ])
        };

    private static CharacterCatalogDefinition BuildCharacterDefinition(
        string characterId,
        string subtitle,
        bool isProvisional)
    {
        var fixedWeaponIds = ArenaConfig.GetFixedWeaponKitForCharacterId(characterId)
            .ToArray();
        var fixedWeaponNames = fixedWeaponIds
            .Select(weaponId => ArenaConfig.DisplayNames.TryGetValue(weaponId, out var weaponName)
                ? weaponName
                : weaponId)
            .ToArray();
        var displayName = ArenaConfig.DisplayNames.TryGetValue(characterId, out var name)
            ? name
            : characterId;

        return new CharacterCatalogDefinition(
            CharacterId: characterId,
            DisplayName: displayName,
            Subtitle: subtitle,
            IsProvisional: isProvisional,
            FixedWeaponIds: fixedWeaponIds,
            FixedWeaponNames: fixedWeaponNames);
    }

    public static bool TryGetItem(string itemId, out ItemDefinition definition)
    {
        return ItemsById.TryGetValue(itemId, out definition!);
    }

    public static bool TryGetEquipment(string itemId, out EquipmentDefinition definition)
    {
        return EquipmentByItemId.TryGetValue(itemId, out definition!);
    }

    public static bool TryGetSigilDefinition(string definitionId, out SigilDefinition definition)
    {
        return SigilDefinitionsById.TryGetValue(definitionId, out definition!);
    }

    public static int ResolveEquipmentDropChancePercent(string sourceType)
    {
        return string.Equals(sourceType, "chest", StringComparison.OrdinalIgnoreCase) ? 18 : 5;
    }

    public static DropTable ResolveEquipmentDropTable(string sourceType)
    {
        var key = string.Equals(sourceType, "chest", StringComparison.OrdinalIgnoreCase)
            ? "chest:default"
            : "mob:default";
        return EquipmentDropTables[key];
    }

    public static string ResolveCraftedCommonEquipmentItemId(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => "wpn.primal_forged_blade",
            _ => "wpn.primal_forged_blade"
        };
    }

    public static string ResolveAscendantEquipmentItemId(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => "wpn.ascendant_forged_blade",
            _ => "wpn.ascendant_forged_blade"
        };
    }
}
