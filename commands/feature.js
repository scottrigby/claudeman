import fs from "fs";
import {
  FEATURE_INDEX_URL,
  loadProfile,
  getProfilePath,
  ensureProfileDir,
  promptScope,
} from "../helpers/settings.js";
import { fetchUrl } from "../helpers/devcontainer.js";

async function fetchFeatures() {
  const response = await fetchUrl(FEATURE_INDEX_URL);
  const data = JSON.parse(response);

  const features = [];
  for (const collection of data.collections || []) {
    const maintainer = collection.sourceInformation?.name || "Unknown";
    for (const feature of collection.features || []) {
      if (feature.deprecated) continue;

      features.push({
        id: feature.id,
        name: feature.name || feature.id.split("/").pop(),
        description: feature.description || "",
        version: feature.version,
        majorVersion: feature.majorVersion || "1",
        documentationURL: feature.documentationURL,
        maintainer: maintainer,
        options: feature.options || {},
      });
    }
  }
  return features;
}

async function featureSearch(query, limit = 30) {
  console.log("Fetching feature index...");
  const features = await fetchFeatures();
  const queryLower = query.toLowerCase();

  const matches = features.filter(
    (f) =>
      f.name.toLowerCase().includes(queryLower) ||
      f.id.toLowerCase().includes(queryLower) ||
      (f.description && f.description.toLowerCase().includes(queryLower)),
  );

  if (matches.length === 0) {
    console.log(`No features found matching "${query}"`);
    console.log("\nBrowse all: https://containers.dev/features");
    return;
  }

  console.log(`Found ${matches.length} feature(s) matching "${query}":\n`);

  const shown = matches.slice(0, limit);
  const descWidth = 50;
  const maxIdLen = Math.max(
    ...shown.map((f) => `${f.id}:${f.majorVersion}`.length),
  );

  console.log(`  ${"ID".padEnd(maxIdLen)}\tDESCRIPTION`);
  console.log(`  ${"-".repeat(maxIdLen)}\t${"-".repeat(descWidth)}`);

  for (const f of shown) {
    const fullId = `${f.id}:${f.majorVersion}`;
    const desc = f.description
      ? f.description.length > descWidth
        ? f.description.substring(0, descWidth - 1) + "\u2026"
        : f.description
      : "";
    console.log(`  ${fullId.padEnd(maxIdLen)}\t${desc}`);
  }

  if (matches.length > limit) {
    console.log(
      `\n  ... and ${matches.length - limit} more (use -n ${matches.length} to show all)`,
    );
  }

  console.log(`\nFor details: claudeman feature info <id>`);
}

async function featureInfo(query) {
  console.log("Fetching feature index...");
  const features = await fetchFeatures();
  const queryClean = query.replace(/:\d+$/, "");
  const queryLower = queryClean.toLowerCase();

  let matches = features.filter(
    (f) => f.id.split("/").pop().toLowerCase() === queryLower,
  );
  if (matches.length === 0) {
    matches = features.filter((f) => f.id.toLowerCase() === queryLower);
  }
  if (matches.length === 0) {
    matches = features.filter((f) => f.id.toLowerCase().includes(queryLower));
  }
  if (matches.length === 0) {
    matches = features.filter((f) => f.name.toLowerCase() === queryLower);
  }

  if (matches.length === 0) {
    console.log(`Feature not found: ${query}`);
    console.log(`\nTry: claudeman feature search ${query}`);
    return;
  }

  if (matches.length > 1) {
    console.log(`Multiple features match "${query}":\n`);
    for (const f of matches) {
      console.log(`  ${f.name}`);
      console.log(`    ${f.id}:${f.majorVersion}`);
      console.log(`    Maintainer: ${f.maintainer}\n`);
    }
    console.log("Be more specific, e.g.:");
    console.log(`  claudeman feature info devcontainers/features/${query}`);
    return;
  }

  const match = matches[0];
  console.log(`\n${match.name}`);
  console.log("=".repeat(match.name.length));
  console.log();

  if (match.description) {
    console.log(match.description);
    console.log();
  }

  console.log(`ID:         ${match.id}:${match.majorVersion}`);
  console.log(`Version:    ${match.version}`);
  console.log(`Maintainer: ${match.maintainer}`);

  if (match.documentationURL) {
    console.log(`Docs:       ${match.documentationURL}`);
  }

  const optionKeys = Object.keys(match.options || {});
  if (optionKeys.length > 0) {
    console.log(`\nOptions:`);
    for (const key of optionKeys) {
      const opt = match.options[key];
      const defaultVal =
        opt.default !== undefined ? ` (default: ${opt.default})` : "";
      console.log(`  ${key}: ${opt.type}${defaultVal}`);
      if (opt.description) {
        console.log(`    ${opt.description}`);
      }
    }
  }

  console.log(`\nUsage in profile:`);
  console.log(`  "${match.id}:${match.majorVersion}": {}`);
}

function featureAdd(featureId, profileName, scope) {
  if (scope === "app") {
    console.error("Cannot modify profiles in app scope (read-only)");
    process.exit(1);
  }

  const profilePath = getProfilePath(profileName, scope);

  let profile;
  if (fs.existsSync(profilePath)) {
    profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  } else {
    const existing = loadProfile(profileName);
    if (existing) {
      profile = JSON.parse(JSON.stringify(existing));
      console.log(`Copying profile from higher scope to ${scope}...`);
    } else {
      profile = {
        name: profileName,
        description: "",
        features: {},
      };
      console.log(`Creating new profile in ${scope} scope...`);
    }
    ensureProfileDir(scope);
  }

  if (profile.features[featureId]) {
    console.log(`Feature already in profile: ${featureId}`);
    return;
  }

  profile.features[featureId] = {};
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`Added ${featureId} to ${profileName} (${scope})`);
}

function featureRemove(featureId, profileName, scope) {
  if (scope === "app") {
    console.error("Cannot modify profiles in app scope (read-only)");
    process.exit(1);
  }

  const profilePath = getProfilePath(profileName, scope);

  if (!fs.existsSync(profilePath)) {
    console.error(`Profile not found at ${scope} scope: ${profileName}`);
    console.error(`\nTo modify, first copy to ${scope} scope:`);
    console.error(
      `  claudeman feature add <any-feature> ${profileName} --scope ${scope}`,
    );
    process.exit(1);
  }

  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));

  if (!profile.features[featureId]) {
    console.log(`Feature not in profile: ${featureId}`);
    return;
  }

  delete profile.features[featureId];
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`Removed ${featureId} from ${profileName} (${scope})`);
}

function featureHelp() {
  console.log(`claudeman feature - Search, inspect, and manage features

Usage: claudeman feature <subcommand> [options]

Subcommands:
  search <query> [-n N]              Search features by name/description
  info <id>                          Show feature details and options
  add <id> <profile> [--scope S]     Add feature to a profile
  remove <id> <profile> [--scope S]  Remove feature from a profile

Scope: user or project (app is read-only). Prompts if not specified.

Examples:
  claudeman feature search go
  claudeman feature info ghcr.io/devcontainers/features/go:1
  claudeman feature add ghcr.io/devcontainers/features/rust:1 myprofile
  claudeman feature add ghcr.io/devcontainers/features/go:1 dev --scope project
`);
}

export async function featureCommand(args) {
  const subCmd = args[1];
  if (!subCmd || subCmd === "-h" || subCmd === "--help") {
    featureHelp();
  } else if (subCmd === "search" && args[2]) {
    let limit = 30;
    let queryParts = [];
    for (let i = 2; i < args.length; i++) {
      if (args[i] === "-n" && args[i + 1]) {
        limit = parseInt(args[i + 1], 10) || 30;
        i++;
      } else if (!args[i].startsWith("-")) {
        queryParts.push(args[i]);
      }
    }
    await featureSearch(queryParts.join(" "), limit);
  } else if (subCmd === "info" && args[2]) {
    await featureInfo(args.slice(2).join(" "));
  } else if (subCmd === "add" && args[2] && args[3]) {
    const featureId = args[2];
    const profileName = args[3];
    const scopeIdx = args.indexOf("--scope");
    const scope =
      scopeIdx !== -1 && args[scopeIdx + 1]
        ? args[scopeIdx + 1]
        : await promptScope();
    featureAdd(featureId, profileName, scope);
  } else if (subCmd === "remove" && args[2] && args[3]) {
    const featureId = args[2];
    const profileName = args[3];
    const scopeIdx = args.indexOf("--scope");
    const scope =
      scopeIdx !== -1 && args[scopeIdx + 1]
        ? args[scopeIdx + 1]
        : await promptScope();
    featureRemove(featureId, profileName, scope);
  } else {
    featureHelp();
  }
}
