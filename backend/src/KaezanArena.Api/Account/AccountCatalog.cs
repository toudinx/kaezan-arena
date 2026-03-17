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

    public static IReadOnlyList<ItemDefinition> ItemDefinitions { get; } =
    [
        new ItemDefinition("wpn.iron_blade", "Iron Blade", "equipment", false, "common"),
        new ItemDefinition("wpn.hunter_bow", "Hunter Bow", "equipment", false, "rare"),
        new ItemDefinition("wpn.ember_staff", "Ember Staff", "equipment", false, "rare"),
        new ItemDefinition("wpn.drake_fang", "Drake Fang", "equipment", false, "epic"),
        new ItemDefinition("wpn.primal_forged_blade", "Primal Forged Blade", "equipment", false, "common"),
        new ItemDefinition("wpn.ascendant_forged_blade", "Ascendant Forged Blade", "equipment", false, "ascendant"),
        new ItemDefinition("arm.guard_plate", "Guard Plate", "equipment", false, "common"),
        new ItemDefinition("arm.dragon_mail", "Dragon Mail", "equipment", false, "epic"),
        new ItemDefinition("arm.primal_forged_mail", "Primal Forged Mail", "equipment", false, "common"),
        new ItemDefinition("arm.ascendant_forged_mail", "Ascendant Forged Mail", "equipment", false, "ascendant"),
        new ItemDefinition("rel.rune_orb", "Rune Orb", "equipment", false, "rare"),
        new ItemDefinition("rel.astral_codex", "Astral Codex", "equipment", false, "legendary"),
        new ItemDefinition("rel.primal_forged_emblem", "Primal Forged Emblem", "equipment", false, "common"),
        new ItemDefinition("rel.ascendant_forged_emblem", "Ascendant Forged Emblem", "equipment", false, "ascendant")
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
            "arm.primal_forged_mail",
            Slot: "armor",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["damage_profile"] = "sturdy",
                ["stat.defense"] = "9",
                ["stat.vitality"] = "6"
            }),
        new EquipmentDefinition(
            "arm.ascendant_forged_mail",
            Slot: "armor",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["damage_profile"] = "obsidian_guard",
                ["stat.defense"] = "24",
                ["stat.vitality"] = "14"
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
            }),
        new EquipmentDefinition(
            "rel.primal_forged_emblem",
            Slot: "relic",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["focus"] = "mana_echo",
                ["stat.attack"] = "3",
                ["stat.vitality"] = "4"
            }),
        new EquipmentDefinition(
            "rel.ascendant_forged_emblem",
            Slot: "relic",
            WeaponClass: "",
            WeaponElement: null,
            GameplayModifiers: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["focus"] = "astral_overdrive",
                ["stat.attack"] = "12",
                ["stat.vitality"] = "12"
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
            EquipmentSlot.Armor => "arm.primal_forged_mail",
            EquipmentSlot.Relic => "rel.primal_forged_emblem",
            _ => "wpn.primal_forged_blade"
        };
    }

    public static string ResolveAscendantEquipmentItemId(EquipmentSlot slot)
    {
        return slot switch
        {
            EquipmentSlot.Weapon => "wpn.ascendant_forged_blade",
            EquipmentSlot.Armor => "arm.ascendant_forged_mail",
            EquipmentSlot.Relic => "rel.ascendant_forged_emblem",
            _ => "wpn.ascendant_forged_blade"
        };
    }
}
