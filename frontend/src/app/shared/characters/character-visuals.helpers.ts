import {
  resolveCharacterDisplayName as resolveCharacterDisplayNameFromCatalog,
  resolveCharacterVisualSpec,
  type CharacterPortraitContext,
  type CharacterPortraitTone
} from "./character-visuals.catalog";

export type { CharacterPortraitContext, CharacterPortraitTone };

export type CharacterPortraitVisual = Readonly<{
  tone: CharacterPortraitTone;
  imageUrl: string | null;
  homepageImageUrl: string | null;
  prerunImageUrl: string | null;
  kaelisImageUrl: string | null;
  rosterImageUrl: string | null;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  sigil: string;
  monogram: string;
  skinId: string | null;
}>;

const DEFAULT_PORTRAIT: Readonly<CharacterPortraitVisual> = {
  tone: "slate",
  imageUrl: null,
  homepageImageUrl: null,
  prerunImageUrl: null,
  kaelisImageUrl: null,
  rosterImageUrl: null,
  runImageUrl: null,
  hitImageUrl: null,
  sigil: "?",
  monogram: "?",
  skinId: null
};

export function resolveCharacterPortraitVisual(input: Readonly<{
  characterId?: string | null;
  displayName?: string | null;
  context?: CharacterPortraitContext;
  skinId?: string | number | null;
}>): CharacterPortraitVisual {
  const context = input.context ?? "kaelis";
  const mapped = resolveCharacterVisualSpec({
    characterId: input.characterId,
    skinId: input.skinId
  });

  if (!mapped) {
    return {
      ...DEFAULT_PORTRAIT,
      monogram: buildMonogram(input.displayName)
    };
  }

  const homepageImageUrl = mapped.portraits.homepage;
  const prerunImageUrl = mapped.portraits.prerun;
  const kaelisImageUrl = mapped.portraits.kaelis;
  const rosterImageUrl = mapped.portraits.roster;
  const imageUrlByContext: Readonly<Record<CharacterPortraitContext, string | null>> = {
    homepage: homepageImageUrl,
    prerun: prerunImageUrl,
    kaelis: kaelisImageUrl,
    roster: rosterImageUrl
  };

  return {
    tone: mapped.tone,
    imageUrl: imageUrlByContext[context] ?? kaelisImageUrl,
    homepageImageUrl,
    prerunImageUrl,
    kaelisImageUrl,
    rosterImageUrl,
    runImageUrl: mapped.runImageUrl,
    hitImageUrl: mapped.hitImageUrl,
    sigil: mapped.sigil,
    monogram: buildMonogram(input.displayName),
    skinId: mapped.resolvedSkinId
  };
}

export function resolveCharacterDisplayName(input: Readonly<{
  characterId?: string | null;
  preferredName?: string | null;
}>): string {
  return resolveCharacterDisplayNameFromCatalog(input);
}

function buildMonogram(displayName: string | null | undefined): string {
  if (typeof displayName !== "string") {
    return "?";
  }

  const trimmed = displayName.trim();
  if (!trimmed) {
    return "?";
  }

  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  const first = parts[0];
  if (!first) {
    return "?";
  }

  return first.slice(0, 1).toUpperCase();
}
