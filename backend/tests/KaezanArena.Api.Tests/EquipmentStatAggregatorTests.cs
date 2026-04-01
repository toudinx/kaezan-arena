using KaezanArena.Api.Account;

namespace KaezanArena.Api.Tests;

public sealed class EquipmentStatAggregatorTests
{
    [Fact]
    public void Aggregate_UsesWeaponSlot()
    {
        var equipment = new EquipmentState(
            WeaponInstanceId: "eq.weapon.1");
        var instances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["eq.weapon.1"] = new OwnedEquipmentInstance("eq.weapon.1", "wpn.ember_staff", IsLocked: false)
        };

        var totals = EquipmentStatAggregator.Aggregate(equipment, instances, AccountCatalog.EquipmentByItemId);

        Assert.Equal(new EquipmentStatTotals(Attack: 14, Defense: 0, Vitality: 0), totals);
    }

    [Fact]
    public void Aggregate_RemovingItemFromSlot_RemovesStats()
    {
        var withWeapon = new EquipmentState(
            WeaponInstanceId: "eq.weapon.1");
        var withoutWeapon = withWeapon with { WeaponInstanceId = null };
        var instances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["eq.weapon.1"] = new OwnedEquipmentInstance("eq.weapon.1", "wpn.iron_blade", IsLocked: false)
        };

        var totalsWithWeapon = EquipmentStatAggregator.Aggregate(withWeapon, instances, AccountCatalog.EquipmentByItemId);
        var totalsWithoutWeapon = EquipmentStatAggregator.Aggregate(withoutWeapon, instances, AccountCatalog.EquipmentByItemId);

        Assert.Equal(new EquipmentStatTotals(Attack: 8, Defense: 0, Vitality: 0), totalsWithWeapon);
        Assert.Equal(EquipmentStatTotals.Zero, totalsWithoutWeapon);
    }

    [Fact]
    public void Aggregate_IsDeterministicForEquivalentInput()
    {
        var equipment = new EquipmentState(
            WeaponInstanceId: "w");
        var firstInstances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["w"] = new OwnedEquipmentInstance("w", "wpn.hunter_bow", IsLocked: false)
        };
        var secondInstances = new Dictionary<string, OwnedEquipmentInstance>(StringComparer.Ordinal)
        {
            ["w"] = new OwnedEquipmentInstance("w", "wpn.hunter_bow", IsLocked: false)
        };

        var first = EquipmentStatAggregator.Aggregate(equipment, firstInstances, AccountCatalog.EquipmentByItemId);
        var second = EquipmentStatAggregator.Aggregate(equipment, secondInstances, AccountCatalog.EquipmentByItemId);

        Assert.Equal(first, second);
    }
}
