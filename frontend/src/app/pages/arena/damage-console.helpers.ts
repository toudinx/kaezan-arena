import type { DamageNumberInstance } from "../../arena/engine/arena-engine.types";

export type DamageConsoleKind = "incoming" | "outgoing" | "heal" | "shield" | "reflect";
export type DamageConsoleFilterId = "all" | "incoming" | "outgoing" | "heal";

export type DamageConsoleEntry = Readonly<{
  entryId: string;
  tick: number;
  kind: DamageConsoleKind;
  amount: number | null;
  sourceLabel: string | null;
  targetLabel: string | null;
  message: string;
}>;

export type DamageConsoleTickGroup = Readonly<{
  groupKey: string;
  tick: number;
  entries: ReadonlyArray<DamageConsoleEntry>;
}>;

export function mapDamageNumbersToConsoleEntries(
  damageEvents: ReadonlyArray<DamageNumberInstance>,
  tick: number
): DamageConsoleEntry[] {
  if (damageEvents.length === 0) {
    return [];
  }

  const ordered = [...damageEvents].sort(compareDamageEvents);
  return ordered.map((event, index) => mapDamageEventToEntry(event, tick, index));
}

export function mergeDamageConsoleEntries(
  existing: ReadonlyArray<DamageConsoleEntry>,
  incoming: ReadonlyArray<DamageConsoleEntry>,
  maxEntries = 500
): DamageConsoleEntry[] {
  if (incoming.length === 0) {
    return [...existing];
  }

  const merged: DamageConsoleEntry[] = [...existing];
  const existingIds = new Set(existing.map((entry) => entry.entryId));

  for (const entry of incoming) {
    if (existingIds.has(entry.entryId)) {
      continue;
    }

    merged.push(entry);
    existingIds.add(entry.entryId);
  }

  const safeMaxEntries = Math.max(1, Math.round(maxEntries));
  if (merged.length <= safeMaxEntries) {
    return merged;
  }

  return merged.slice(merged.length - safeMaxEntries);
}

export function matchesDamageConsoleFilter(entry: DamageConsoleEntry, filter: DamageConsoleFilterId): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "heal") {
    return entry.kind === "heal" || entry.kind === "shield";
  }

  return entry.kind === filter;
}

export function groupDamageConsoleEntriesByTick(entries: ReadonlyArray<DamageConsoleEntry>): DamageConsoleTickGroup[] {
  if (entries.length === 0) {
    return [];
  }

  const groups: Array<{ tick: number; entries: DamageConsoleEntry[] }> = [];
  for (const entry of entries) {
    const latest = groups[groups.length - 1];
    if (!latest || latest.tick !== entry.tick) {
      groups.push({
        tick: entry.tick,
        entries: [entry]
      });
      continue;
    }

    latest.entries.push(entry);
  }

  return groups.map((group, index) => ({
    groupKey: `${group.tick}:${index}:${group.entries[0]?.entryId ?? "empty"}`,
    tick: group.tick,
    entries: group.entries
  }));
}

export function formatDamageTickLabel(tick: number): string {
  return `[t=${tick}]`;
}

export function resolveDamageConsoleLineClass(kind: DamageConsoleKind): string {
  return `damage-console__line--${kind}`;
}

export function shouldAutoScrollDamageConsole(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  thresholdPx = 24
): boolean {
  if (scrollHeight <= 0 || clientHeight <= 0) {
    return true;
  }

  const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
  return distanceFromBottom <= thresholdPx;
}

function mapDamageEventToEntry(event: DamageNumberInstance, tick: number, sortedIndex: number): DamageConsoleEntry {
  const amount = Math.max(0, Math.round(event.amount));
  const sourceLabel = normalizeEntityLabel(event.sourceEntityId);
  const targetLabel = normalizeEntityLabel(event.targetEntityId ?? event.actorId);
  const kind = resolveKind(event);

  let message = "";
  if (kind === "incoming") {
    message = `-${amount} from ${sourceLabel ?? "Unknown"}`;
  } else if (kind === "outgoing") {
    message = `+${amount} to ${targetLabel ?? "Unknown"}`;
  } else if (kind === "heal") {
    message = `+${amount} HP`;
  } else if (kind === "shield") {
    const sign = event.shieldChangeDirection === "gain" ? "+" : "-";
    message = `${sign}${amount} SH`;
  } else {
    message = `Reflect ${amount}`;
  }

  return {
    entryId: `${tick}:${event.spawnOrder}:${sortedIndex}:${kind}:${sourceLabel ?? "none"}:${targetLabel ?? "none"}:${amount}`,
    tick,
    kind,
    amount,
    sourceLabel,
    targetLabel,
    message
  };
}

function resolveKind(event: DamageNumberInstance): DamageConsoleKind {
  if (event.kind === "reflect") {
    return "reflect";
  }

  if (event.isHeal) {
    return "heal";
  }

  if (event.isShieldChange) {
    return "shield";
  }

  return event.isDamageReceived ? "incoming" : "outgoing";
}

function normalizeEntityLabel(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim();
  const tokens = normalized
    .split(/[._-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.some((token) => token.toLowerCase() === "player")) {
    return "You";
  }

  const meaningful = tokens.filter((token) => {
    const lowered = token.toLowerCase();
    if (lowered === "mob" || lowered === "entity" || lowered === "target") {
      return false;
    }

    return !/^\d+$/.test(lowered);
  });

  const source = meaningful[0] ?? normalized;
  return source[0].toUpperCase() + source.slice(1);
}

function compareDamageEvents(left: DamageNumberInstance, right: DamageNumberInstance): number {
  if (left.spawnOrder !== right.spawnOrder) {
    return left.spawnOrder - right.spawnOrder;
  }

  if (left.stackIndex !== right.stackIndex) {
    return left.stackIndex - right.stackIndex;
  }

  if (left.actorId !== right.actorId) {
    return left.actorId.localeCompare(right.actorId);
  }

  const leftTarget = left.targetEntityId ?? left.actorId;
  const rightTarget = right.targetEntityId ?? right.actorId;
  const byTarget = leftTarget.localeCompare(rightTarget);
  if (byTarget !== 0) {
    return byTarget;
  }

  const leftSource = left.sourceEntityId ?? "";
  const rightSource = right.sourceEntityId ?? "";
  return leftSource.localeCompare(rightSource);
}
