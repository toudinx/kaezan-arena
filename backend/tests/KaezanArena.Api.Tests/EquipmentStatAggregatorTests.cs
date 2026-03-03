using KaezanArena.Api.Account;

namespace KaezanArena.Api.Tests;

public sealed class EquipmentStatAggregatorTests
{
    [Fact]
    public void Aggregate_UsesWeaponArmorAndRelicSlots()
    {
        var equipment = new EquipmentState(
            WeaponInstanceId: "eq.weapon.1",
            ArmorInstanceId: "eq.armor.1",
            RelicInstanceId: "eq.relic.1");
        var instances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["eq.weapon.1"] = new OwnedEquipmentInstance("eq.weapon.1", "wpn.ember_staff", IsLocked: false),
            ["eq.armor.1"] = new OwnedEquipmentInstance("eq.armor.1", "arm.dragon_mail", IsLocked: false),
            ["eq.relic.1"] = new OwnedEquipmentInstance("eq.relic.1", "rel.rune_orb", IsLocked: false)
        };

        var totals = EquipmentStatAggregator.Aggregate(equipment, instances, AccountCatalog.EquipmentByItemId);

        Assert.Equal(new EquipmentStatTotals(Attack: 18, Defense: 16, Vitality: 13), totals);
    }

    [Fact]
    public void Aggregate_RemovingItemFromSlot_RemovesStats()
    {
        var withArmor = new EquipmentState(
            WeaponInstanceId: "eq.weapon.1",
            ArmorInstanceId: "eq.armor.1",
            RelicInstanceId: "eq.relic.1");
        var withoutArmor = withArmor with { ArmorInstanceId = null };
        var instances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["eq.weapon.1"] = new OwnedEquipmentInstance("eq.weapon.1", "wpn.iron_blade", IsLocked: false),
            ["eq.armor.1"] = new OwnedEquipmentInstance("eq.armor.1", "arm.guard_plate", IsLocked: false),
            ["eq.relic.1"] = new OwnedEquipmentInstance("eq.relic.1", "rel.rune_orb", IsLocked: false)
        };

        var totalsWithArmor = EquipmentStatAggregator.Aggregate(withArmor, instances, AccountCatalog.EquipmentByItemId);
        var totalsWithoutArmor = EquipmentStatAggregator.Aggregate(withoutArmor, instances, AccountCatalog.EquipmentByItemId);

        Assert.Equal(new EquipmentStatTotals(Attack: 12, Defense: 10, Vitality: 9), totalsWithArmor);
        Assert.Equal(new EquipmentStatTotals(Attack: 12, Defense: 0, Vitality: 4), totalsWithoutArmor);
    }

    [Fact]
    public void Aggregate_IsDeterministicForEquivalentInput()
    {
        var equipment = new EquipmentState(
            WeaponInstanceId: "w",
            ArmorInstanceId: "a",
            RelicInstanceId: "r");
        var firstInstances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["r"] = new OwnedEquipmentInstance("r", "rel.astral_codex", IsLocked: false),
            ["w"] = new OwnedEquipmentInstance("w", "wpn.hunter_bow", IsLocked: false),
            ["a"] = new OwnedEquipmentInstance("a", "arm.guard_plate", IsLocked: false)
        };
        var secondInstances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["a"] = new OwnedEquipmentInstance("a", "arm.guard_plate", IsLocked: false),
            ["w"] = new OwnedEquipmentInstance("w", "wpn.hunter_bow", IsLocked: false),
            ["r"] = new OwnedEquipmentInstance("r", "rel.astral_codex", IsLocked: false)
        };

        var first = EquipmentStatAggregator.Aggregate(equipment, firstInstances, AccountCatalog.EquipmentByItemId);
        var second = EquipmentStatAggregator.Aggregate(equipment, secondInstances, AccountCatalog.EquipmentByItemId);

        Assert.Equal(first, second);
    }
}
