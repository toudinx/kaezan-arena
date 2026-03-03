namespace KaezanArena.Api.Account;

public static class EquipmentStatAggregator
{
    public static EquipmentStatTotals Aggregate(
        EquipmentState equipment,
        IReadOnlyDictionary<string, OwnedEquipmentInstance> equipmentInstances,
        IReadOnlyDictionary<string, EquipmentDefinition> equipmentDefinitionsByItemId)
    {
        var totals = EquipmentStatTotals.Zero;
        foreach (var slot in EquipmentState.OrderedSlots)
        {
            var instanceId = equipment.GetInstanceId(slot);
            if (string.IsNullOrWhiteSpace(instanceId))
            {
                continue;
            }

            if (!equipmentInstances.TryGetValue(instanceId, out var instance))
            {
                continue;
            }

            if (!equipmentDefinitionsByItemId.TryGetValue(instance.DefinitionId, out var definition))
            {
                continue;
            }

            if (!EquipmentSlotMapper.TryFromCatalogSlot(definition.Slot, out var definitionSlot) || definitionSlot != slot)
            {
                continue;
            }

            totals = totals.Add(ReadStats(definition.GameplayModifiers));
        }

        return totals;
    }

    private static EquipmentStatTotals ReadStats(IReadOnlyDictionary<string, string> modifiers)
    {
        return new EquipmentStatTotals(
            Attack: ReadModifier(modifiers, "stat.attack"),
            Defense: ReadModifier(modifiers, "stat.defense"),
            Vitality: ReadModifier(modifiers, "stat.vitality"));
    }

    private static int ReadModifier(IReadOnlyDictionary<string, string> modifiers, string key)
    {
        if (!modifiers.TryGetValue(key, out var value))
        {
            return 0;
        }

        return int.TryParse(value, out var parsed) ? parsed : 0;
    }
}
