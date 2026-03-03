namespace KaezanArena.Api.Account;

public static class AccountCatalog
{
    public static IReadOnlyList<ItemDefinition> ItemDefinitions { get; } =
    [
        new ItemDefinition("mat.scrap_iron", "Scrap Iron", "material", true, "common"),
        new ItemDefinition("mat.hardwood", "Hardwood", "material", true, "common"),
        new ItemDefinition("mat.ember_core", "Ember Core", "material", true, "uncommon"),
        new ItemDefinition("mat.dragon_scale", "Dragon Scale", "material", true, "uncommon"),
        new ItemDefinition("mat.arcane_dust", "Arcane Dust", "material", true, "common"),
        new ItemDefinition("wpn.iron_blade", "Iron Blade", "equipment", false, "common"),
        new ItemDefinition("wpn.hunter_bow", "Hunter Bow", "equipment", false, "rare"),
        new ItemDefinition("wpn.ember_staff", "Ember Staff", "equipment", false, "rare"),
        new ItemDefinition("wpn.drake_fang", "Drake Fang", "equipment", false, "epic"),
        new ItemDefinition("arm.guard_plate", "Guard Plate", "equipment", false, "common"),
        new ItemDefinition("arm.dragon_mail", "Dragon Mail", "equipment", false, "epic"),
        new ItemDefinition("rel.rune_orb", "Rune Orb", "equipment", false, "rare"),
        new ItemDefinition("rel.astral_codex", "Astral Codex", "equipment", false, "legendary")
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
            "arm.guard_plate",
            Slot: "armor",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["damage_profile"] = "sturdy",
                ["stat.defense"] = "10",
                ["stat.vitality"] = "5"
            }),
        new EquipmentDefinition(
            "arm.dragon_mail",
            Slot: "armor",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["damage_profile"] = "obsidian_guard",
                ["stat.defense"] = "16",
                ["stat.vitality"] = "9"
            }),
        new EquipmentDefinition(
            "rel.rune_orb",
            Slot: "relic",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["focus"] = "mana_echo",
                ["stat.attack"] = "4",
                ["stat.vitality"] = "4"
            }),
        new EquipmentDefinition(
            "rel.astral_codex",
            Slot: "relic",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["focus"] = "astral_overdrive",
                ["stat.attack"] = "7",
                ["stat.vitality"] = "8"
            })
    ];

    public static IReadOnlyDictionary<string, ItemDefinition> ItemsById { get; } =
        ItemDefinitions.ToDictionary(def => def.ItemId, StringComparer.Ordinal);

    public static IReadOnlyDictionary<string, EquipmentDefinition> EquipmentByItemId { get; } =
        EquipmentDefinitions.ToDictionary(def => def.ItemId, StringComparer.Ordinal);

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
                    new DropEntry("wpn.drake_fang", Weight: 3, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("arm.guard_plate", Weight: 20, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("arm.dragon_mail", Weight: 4, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("rel.rune_orb", Weight: 8, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("rel.astral_codex", Weight: 1, MinQuantity: 1, MaxQuantity: 1)
                ]),
            ["chest:default"] = new DropTable(
                "chest.default",
                Version: 1,
                Entries:
                [
                    new DropEntry("wpn.iron_blade", Weight: 24, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.hunter_bow", Weight: 24, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.ember_staff", Weight: 16, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("wpn.drake_fang", Weight: 8, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("arm.guard_plate", Weight: 16, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("arm.dragon_mail", Weight: 7, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("rel.rune_orb", Weight: 4, MinQuantity: 1, MaxQuantity: 1),
                    new DropEntry("rel.astral_codex", Weight: 1, MinQuantity: 1, MaxQuantity: 1)
                ])
        };

    public static bool TryGetItem(string itemId, out ItemDefinition definition)
    {
        return ItemsById.TryGetValue(itemId, out definition!);
    }

    public static bool TryGetEquipment(string itemId, out EquipmentDefinition definition)
    {
        return EquipmentByItemId.TryGetValue(itemId, out definition!);
    }

    public static string ResolveGuaranteedMaterial(string sourceType, string? species)
    {
        if (string.Equals(sourceType, "chest", StringComparison.OrdinalIgnoreCase))
        {
            return "mat.arcane_dust";
        }

        var normalizedSpecies = species?.Trim().ToLowerInvariant();
        return normalizedSpecies switch
        {
            "melee_brute" => "mat.scrap_iron",
            "ranged_archer" => "mat.hardwood",
            "melee_demon" => "mat.ember_core",
            "ranged_dragon" => "mat.dragon_scale",
            _ => "mat.scrap_iron"
        };
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
}
