export type SkillVisualFamily = "exori" | "ranged" | "rune" | "support" | "unknown";
export type SkillVisualTier = "min" | "base" | "mas" | "heavy" | "utility" | "default";
export type SkillKitBadge = "melee" | "ranged" | "unknown";

type SkillMeta = Readonly<{
  canonicalId: string;
  label: string;
  iconGlyph: string;
  accentColor: string;
  family: SkillVisualFamily;
  tier: SkillVisualTier;
  description?: string;
  aliases?: ReadonlyArray<string>;
}>;

export type SkillPresentation = Readonly<{
  canonicalId: string | null;
  label: string;
  iconGlyph: string;
  accentColor: string;
  family: SkillVisualFamily;
  tier: SkillVisualTier;
  description: string;
}>;

const SKILL_META: readonly SkillMeta[] = [
  {
    canonicalId: "exori_min",
    label: "Exori Min",
    iconGlyph: "I",
    accentColor: "#ef4444",
    family: "exori",
    tier: "min",
    description: "Fast frontal strike - short reach, low cooldown.",
    aliases: ["weapon:exori_min", "exori min"]
  },
  {
    canonicalId: "exori",
    label: "Exori",
    iconGlyph: "II",
    accentColor: "#f97316",
    family: "exori",
    tier: "base",
    description: "Square pulse - balanced area and cadence.",
    aliases: ["weapon:exori"]
  },
  {
    canonicalId: "exori_mas",
    label: "Exori Mas",
    iconGlyph: "III",
    accentColor: "#a855f7",
    family: "exori",
    tier: "mas",
    description: "Large pulse - strongest Exori cast with longer cooldown.",
    aliases: ["weapon:exori_mas", "exori mas"]
  },
  {
    canonicalId: "sigil_bolt",
    label: "Sigil Bolt",
    iconGlyph: "SB",
    accentColor: "#38bdf8",
    family: "ranged",
    tier: "base",
    description: "Fast single-target ranged shot.",
    aliases: ["weapon:sigil_bolt", "sigil bolt"]
  },
  {
    canonicalId: "shotgun",
    label: "Shotgun",
    iconGlyph: "SG",
    accentColor: "#fb7185",
    family: "ranged",
    tier: "heavy",
    description: "Cone burst that damages multiple targets and pushes back.",
    aliases: ["weapon:shotgun"]
  },
  {
    canonicalId: "void_ricochet",
    label: "Void Ricochet",
    iconGlyph: "VR",
    accentColor: "#22d3ee",
    family: "ranged",
    tier: "heavy",
    description: "Ricocheting projectile that pierces across segments.",
    aliases: ["weapon:void_ricochet", "void ricochet"]
  },
  {
    canonicalId: "avalanche",
    label: "Avalanche",
    iconGlyph: "AV",
    accentColor: "#60a5fa",
    family: "rune",
    tier: "heavy",
    description: "Ground-targeted rune attack from the free slot.",
    aliases: ["weapon:avalanche"]
  },
  {
    canonicalId: "sylwen_thornfall",
    label: "Thornfall",
    iconGlyph: "TF",
    accentColor: "#22d3ee",
    family: "ranged",
    tier: "heavy",
    description: "Ultimate cross-zone centered on target: Level 1 uses r=1, Level 2 uses r=2, and Level 3 adds a stun on mobs entering the area during the effect.",
    aliases: ["skill:sylwen_thornfall", "thornfall"]
  },
  {
    canonicalId: "heal",
    label: "Heal",
    iconGlyph: "HL",
    accentColor: "#22c55e",
    family: "support",
    tier: "utility",
    aliases: ["weapon:heal"]
  },
  {
    canonicalId: "guard",
    label: "Guard",
    iconGlyph: "GD",
    accentColor: "#f59e0b",
    family: "support",
    tier: "utility",
    aliases: ["weapon:guard"]
  }
];

const DEFAULT_PRESENTATION: SkillPresentation = {
  canonicalId: null,
  label: "Unknown Skill",
  iconGlyph: "?",
  accentColor: "#64748b",
  family: "unknown",
  tier: "default",
  description: ""
};

const META_BY_CANONICAL_ID = new Map<string, SkillMeta>(SKILL_META.map((meta) => [meta.canonicalId, meta]));
const META_BY_ALIAS = buildAliasMap(SKILL_META);

export function normalizeSkillToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.includes(":")
    ? trimmed.slice(trimmed.lastIndexOf(":") + 1)
    : trimmed;

  return withoutPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveSkillPresentation(input: Readonly<{
  skillId?: string | null;
  displayName?: string | null;
  fallbackLabel?: string | null;
}>): SkillPresentation {
  const candidates: Array<string | null> = [
    normalizeSkillToken(input.skillId),
    normalizeSkillToken(input.displayName),
    normalizeSkillToken(input.fallbackLabel)
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const meta = META_BY_CANONICAL_ID.get(candidate) ?? META_BY_ALIAS.get(candidate);
    if (!meta) {
      continue;
    }

    const preferredLabel = resolvePreferredLabel(meta, input.displayName);
    return {
      canonicalId: meta.canonicalId,
      label: preferredLabel,
      iconGlyph: meta.iconGlyph,
      accentColor: meta.accentColor,
      family: meta.family,
      tier: meta.tier,
      description: meta.description ?? ""
    };
  }

  const fallbackLabel = normalizeLabel(input.displayName)
    ?? normalizeLabel(input.fallbackLabel)
    ?? normalizeLabel(input.skillId)
    ?? DEFAULT_PRESENTATION.label;

  return {
    ...DEFAULT_PRESENTATION,
    label: fallbackLabel,
    iconGlyph: buildFallbackGlyph(fallbackLabel)
  };
}

export function resolveKitBadgeForSkills(
  skills: ReadonlyArray<Readonly<{ skillId?: string | null; displayName?: string | null }>>
): SkillKitBadge {
  let hasExori = false;
  let hasRanged = false;
  for (const skill of skills) {
    const presentation = resolveSkillPresentation(skill);
    if (presentation.family === "exori") {
      hasExori = true;
    }
    if (presentation.family === "ranged") {
      hasRanged = true;
    }
  }

  if (hasExori) {
    return "melee";
  }
  if (hasRanged) {
    return "ranged";
  }
  return "unknown";
}

function buildAliasMap(metaEntries: readonly SkillMeta[]): Map<string, SkillMeta> {
  const map = new Map<string, SkillMeta>();
  for (const meta of metaEntries) {
    map.set(meta.canonicalId, meta);
    for (const alias of meta.aliases ?? []) {
      const normalizedAlias = normalizeSkillToken(alias);
      if (normalizedAlias) {
        map.set(normalizedAlias, meta);
      }
    }
  }
  return map;
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const fromSnakeCase = trimmed
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return fromSnakeCase
    .split(" ")
    .map((part) => {
      if (!part) {
        return part;
      }
      return part[0].toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function resolvePreferredLabel(meta: SkillMeta, displayName: string | null | undefined): string {
  const normalizedDisplayName = normalizeLabel(displayName);
  if (!normalizedDisplayName) {
    return meta.label;
  }

  if (meta.family !== "exori") {
    return normalizedDisplayName;
  }

  const withoutPrefix = stripLegacyExoriPrefix(displayName);
  const normalizedWithoutPrefix = normalizeLabel(withoutPrefix);
  if (!normalizedWithoutPrefix) {
    return meta.label;
  }

  return normalizedWithoutPrefix.toLowerCase().startsWith("exori")
    ? normalizedWithoutPrefix
    : meta.label;
}

function stripLegacyExoriPrefix(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^(?:e[-+]|ex)(?:[\s:_-]+)+/i, "");
}

function buildFallbackGlyph(label: string): string {
  const chunks = label
    .split(/[^A-Za-z0-9]+/)
    .filter((chunk) => chunk.length > 0);

  if (chunks.length === 0) {
    return "?";
  }

  if (chunks.length === 1) {
    return chunks[0].slice(0, 2).toUpperCase();
  }

  return `${chunks[0][0] ?? ""}${chunks[1][0] ?? ""}`.toUpperCase();
}
