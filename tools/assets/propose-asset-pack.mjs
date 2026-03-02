#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DEFAULT_CATEGORIES = ["tiles", "sprites", "fx", "ui"];

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..", "..");

const defaults = {
  packDir: path.join(repoRoot, "frontend", "src", "assets", "packs", "arena_v1_0x72_bdragon"),
  outputFileName: "asset-pack.proposed.json",
  manifestFileName: "asset-pack.json",
  configFileName: "asset-mapper.config.json"
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const packDir = path.resolve(args.pack ?? defaults.packDir);
const manifestPath = path.resolve(args.manifest ?? path.join(packDir, defaults.manifestFileName));
const configPath = path.resolve(args.config ?? path.join(packDir, defaults.configFileName));
const outputPath = path.resolve(args.out ?? path.join(packDir, defaults.outputFileName));
const shouldForce = Boolean(args.force);
const includeMapped = Boolean(args.includeMapped);

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[asset-mapper] ${message}`);
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(packDir)) {
    throw new Error(`Pack directory not found: ${packDir}`);
  }

  if (!shouldForce && existsSync(outputPath)) {
    throw new Error(`Output already exists: ${outputPath}. Use --force to overwrite.`);
  }

  const manifest = await readJsonIfExists(manifestPath);
  const config = await readJsonIfExists(configPath);
  const existingAssets = manifest?.assets ?? {};
  const existingAssetIds = new Set(Object.keys(existingAssets));
  const existingPaths = new Set(
    Object.values(existingAssets)
      .map((entry) => normalizePath(typeof entry?.path === "string" ? entry.path : ""))
      .filter(Boolean)
  );

  const prefixByCategory = {
    tiles: "tile",
    sprites: "sprite",
    fx: "fx",
    ui: "ui",
    ...(config?.semanticPrefixes ?? {})
  };
  const categories = Array.isArray(config?.categories)
    ? config.categories.filter((value) => typeof value === "string")
    : DEFAULT_CATEGORIES;
  const ignorePatterns = normalizePatterns(config?.ignore ?? []);
  const spriteSheetRules = normalizeSpritesheetRules(config?.spritesheets ?? []);

  const candidates = [];
  const skippedAlreadyMapped = [];
  const skippedNonImage = [];
  const skippedIgnored = [];

  for (const category of categories) {
    const categoryDir = path.join(packDir, category);
    if (!existsSync(categoryDir)) {
      continue;
    }

    const files = await collectFiles(categoryDir);
    for (const absoluteFilePath of files) {
      const relativeFilePath = normalizePath(path.relative(packDir, absoluteFilePath));
      const extension = path.extname(relativeFilePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        skippedNonImage.push(relativeFilePath);
        continue;
      }

      if (matchesAnyPattern(relativeFilePath, ignorePatterns)) {
        skippedIgnored.push(relativeFilePath);
        continue;
      }

      if (!includeMapped && existingPaths.has(relativeFilePath)) {
        skippedAlreadyMapped.push(relativeFilePath);
        continue;
      }

      const ruleMatch = findSpritesheetRule(relativeFilePath, category, spriteSheetRules);
      const semanticBase = buildSemanticId(
        prefixByCategory[category] ?? toToken(category) ?? "asset",
        stripFileExtension(relativeFilePath),
        category
      );

      candidates.push({
        semanticBase,
        category,
        path: relativeFilePath,
        kind: ruleMatch ? "spritesheet" : "image",
        frame: ruleMatch ? { width: ruleMatch.frame.width, height: ruleMatch.frame.height } : undefined,
        rule: ruleMatch?.match
      });
    }
  }

  candidates.sort((left, right) => left.path.localeCompare(right.path));

  const proposedAssets = {};
  const usedIds = new Set(existingAssetIds);
  for (const candidate of candidates) {
    const semanticId = uniqueSemanticId(candidate.semanticBase, usedIds);
    usedIds.add(semanticId);
    proposedAssets[semanticId] = {
      path: candidate.path,
      kind: candidate.kind,
      ...(candidate.frame ? { frame: candidate.frame } : {}),
      ...(candidate.rule ? { matchedSpritesheetRule: candidate.rule } : {})
    };
  }

  const output = {
    packId: manifest?.packId ?? path.basename(packDir),
    version: manifest?.version ?? "0.0.0",
    generatedAtUtc: new Date().toISOString(),
    generator: "tools/assets/propose-asset-pack.mjs",
    source: {
      packDir: normalizePath(path.relative(repoRoot, packDir)) || ".",
      manifest: normalizePath(path.relative(repoRoot, manifestPath)),
      config: existsSync(configPath) ? normalizePath(path.relative(repoRoot, configPath)) : null
    },
    notes: [
      "Review semantic IDs before merge.",
      "This file does not modify asset-pack.json automatically.",
      "Spritesheet frames are included only when configured manually."
    ],
    summary: {
      totalCandidates: candidates.length,
      proposedAssets: Object.keys(proposedAssets).length,
      skippedAlreadyMapped: skippedAlreadyMapped.length,
      skippedIgnored: skippedIgnored.length,
      skippedNonImage: skippedNonImage.length
    },
    proposedAssets,
    skipped: {
      alreadyMapped: skippedAlreadyMapped.slice(0, 100),
      ignoredByPattern: skippedIgnored.slice(0, 100),
      nonImageFiles: skippedNonImage.slice(0, 100)
    }
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[asset-mapper] wrote ${outputPath}`);
  console.log(`[asset-mapper] proposed assets: ${Object.keys(proposedAssets).length}`);
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--pack":
        parsed.pack = rawArgs[index + 1];
        index += 1;
        break;
      case "--manifest":
        parsed.manifest = rawArgs[index + 1];
        index += 1;
        break;
      case "--config":
        parsed.config = rawArgs[index + 1];
        index += 1;
        break;
      case "--out":
        parsed.out = rawArgs[index + 1];
        index += 1;
        break;
      case "--force":
        parsed.force = true;
        break;
      case "--include-mapped":
        parsed.includeMapped = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(
    [
      "Usage: node tools/assets/propose-asset-pack.mjs [options]",
      "",
      "Options:",
      "  --pack <path>            Asset pack folder to scan",
      "  --manifest <path>        Existing asset-pack.json path",
      "  --config <path>          Manual spritesheet config path",
      "  --out <path>             Output proposed mapping file path",
      "  --force                  Overwrite output if it already exists",
      "  --include-mapped         Include paths that are already in asset-pack.json",
      "  --help, -h               Show this help"
    ].join("\n")
  );
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function collectFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}

function normalizePath(rawPath) {
  return rawPath.replace(/\\/g, "/");
}

function stripFileExtension(relativeFilePath) {
  const ext = path.extname(relativeFilePath);
  return ext ? relativeFilePath.slice(0, -ext.length) : relativeFilePath;
}

function toToken(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

function buildSemanticId(prefix, relativeWithoutExt, category) {
  const relative = normalizePath(relativeWithoutExt);
  const categoryPrefix = `${category}/`;
  const insideCategory = relative.startsWith(categoryPrefix) ? relative.slice(categoryPrefix.length) : relative;
  const slug = insideCategory
    .split("/")
    .map((segment) => toToken(segment))
    .filter(Boolean)
    .join(".");

  if (!slug) {
    return prefix;
  }

  return `${prefix}.${slug}`;
}

function uniqueSemanticId(baseId, usedIds) {
  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let version = 2;
  while (usedIds.has(`${baseId}.v${version}`)) {
    version += 1;
  }
  return `${baseId}.v${version}`;
}

function normalizePatterns(rawPatterns) {
  if (!Array.isArray(rawPatterns)) {
    return [];
  }
  return rawPatterns.filter((pattern) => typeof pattern === "string");
}

function normalizeSpritesheetRules(rawRules) {
  if (!Array.isArray(rawRules)) {
    return [];
  }

  return rawRules
    .map((rule) => {
      if (!rule || typeof rule !== "object") {
        return null;
      }

      const match = typeof rule.match === "string" ? rule.match : null;
      if (!match) {
        return null;
      }

      const frameWidth =
        typeof rule.frame?.width === "number" ? rule.frame.width : typeof rule.frameWidth === "number" ? rule.frameWidth : null;
      const frameHeight =
        typeof rule.frame?.height === "number"
          ? rule.frame.height
          : typeof rule.frameHeight === "number"
            ? rule.frameHeight
            : null;

      if (!frameWidth || !frameHeight) {
        return null;
      }

      return {
        match,
        category: typeof rule.category === "string" ? rule.category : null,
        frame: {
          width: Math.max(1, Math.floor(frameWidth)),
          height: Math.max(1, Math.floor(frameHeight))
        }
      };
    })
    .filter(Boolean);
}

function findSpritesheetRule(relativeFilePath, category, rules) {
  for (const rule of rules) {
    if (rule.category && rule.category !== category) {
      continue;
    }

    if (wildcardMatch(relativeFilePath, rule.match)) {
      return rule;
    }
  }
  return null;
}

function matchesAnyPattern(relativeFilePath, patterns) {
  return patterns.some((pattern) => wildcardMatch(relativeFilePath, pattern));
}

function wildcardMatch(input, pattern) {
  const regex = wildcardToRegex(normalizePath(pattern));
  return regex.test(normalizePath(input));
}

function wildcardToRegex(pattern) {
  let regex = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const current = pattern[index];
    const next = pattern[index + 1];

    if (current === "*") {
      if (next === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if (current === "?") {
      regex += "[^/]";
      continue;
    }

    if (current === "/") {
      regex += "/";
      continue;
    }

    regex += escapeRegexCharacter(current);
  }

  regex += "$";
  return new RegExp(regex, "i");
}

function escapeRegexCharacter(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
