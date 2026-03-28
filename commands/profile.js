import fs from "fs";
import {
  APP_PROFILES_DIR,
  USER_PROFILES_DIR,
  PROJECT_PROFILES_DIR,
  getAllProfiles,
  getProfilePath,
  ensureProfileDir,
  promptScope,
} from "../helpers/settings.js";

function profileList() {
  const profiles = getAllProfiles();

  if (profiles.size === 0) {
    console.log("No profiles found.");
    return;
  }

  console.log("Available profiles:\n");

  const nameWidth = 15;
  const scopeWidth = 25;

  console.log(
    `  ${"NAME".padEnd(nameWidth)}\t${"SCOPE".padEnd(scopeWidth)}\tDESCRIPTION`,
  );
  console.log(
    `  ${"-".repeat(nameWidth)}\t${"-".repeat(scopeWidth)}\t${"-".repeat(40)}`,
  );

  for (const [name, { scopes, activeScope, profile }] of profiles) {
    const scopeDisplay = scopes
      .map((s) => (s === activeScope ? `${s} (active)` : s))
      .join(", ");
    const desc = profile.description || "";
    console.log(
      `  ${name.padEnd(nameWidth)}\t${scopeDisplay.padEnd(scopeWidth)}\t${desc}`,
    );
  }

  console.log(`\nFor details: claudeman profile info <name>`);
}

function profileInfo(name) {
  const profiles = getAllProfiles();
  const data = profiles.get(name);

  if (!data) {
    console.log(`Profile not found: ${name}`);
    console.log(`\nAvailable: ${[...profiles.keys()].join(", ")}`);
    return;
  }

  const { scopes, activeScope, profile } = data;

  console.log(`\n${profile.name || name}`);
  console.log("=".repeat((profile.name || name).length));
  console.log();

  if (profile.description) {
    console.log(profile.description);
    console.log();
  }

  console.log(`Scopes:      ${scopes.join(", ")}`);
  console.log(`Active:      ${activeScope}`);

  const featureIds = Object.keys(profile.features || {});
  if (featureIds.length > 0) {
    console.log(`\nFeatures (${featureIds.length}):`);
    for (const id of featureIds) {
      console.log(`  ${id}`);
    }
  } else {
    console.log(`\nFeatures: none`);
  }

  const domains = profile.extraDomains || [];
  if (domains.length > 0) {
    console.log(`\nExtra domains (${domains.length}):`);
    for (const d of domains) {
      console.log(`  ${d}`);
    }
  }

  const cacheEnv = profile.cacheEnv || {};
  const cacheEntries = Object.entries(cacheEnv);
  if (cacheEntries.length > 0) {
    console.log(`\nPersistent caches (${cacheEntries.length}):`);
    for (const [envVar, subdir] of cacheEntries) {
      console.log(`  ${envVar} → .claude/claudeman/cache/${subdir}`);
    }
  }
}

function profileCreate(name, scope, description = "") {
  if (scope === "app") {
    console.error("Cannot create profiles in app scope (read-only)");
    process.exit(1);
  }

  const profilePath = getProfilePath(name, scope);
  if (fs.existsSync(profilePath)) {
    console.error(`Profile already exists: ${profilePath}`);
    process.exit(1);
  }

  ensureProfileDir(scope);

  const profile = {
    name: name,
    description: description,
    features: {},
  };

  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`Created profile: ${profilePath}`);
}

function profileHelp() {
  console.log(`claudeman profile - Manage profiles (feature collections)

Usage: claudeman profile <subcommand> [options]

Subcommands:
  list                           List all profiles with scopes
  info <name>                    Show profile details and features
  create <name> [--scope S]      Create a new empty profile
  delete <name> --scope S        Delete a profile (requires explicit scope)

Scope: user or project (app is read-only). Prompts if not specified.

Profile Scopes (more specific wins):
  app      Built-in profiles (${APP_PROFILES_DIR})
  user     User profiles (${USER_PROFILES_DIR})
  project  Project profiles (${PROJECT_PROFILES_DIR})

Examples:
  claudeman profile list
  claudeman profile info go
  claudeman profile create myprofile --scope project
`);
}

export async function profileCommand(args) {
  const subCmd = args[1];
  if (!subCmd || subCmd === "-h" || subCmd === "--help") {
    profileHelp();
  } else if (subCmd === "list") {
    profileList();
  } else if (subCmd === "info" && args[2]) {
    profileInfo(args[2]);
  } else if (subCmd === "create" && args[2]) {
    const name = args[2];
    const scopeIdx = args.indexOf("--scope");
    const scope =
      scopeIdx !== -1 && args[scopeIdx + 1]
        ? args[scopeIdx + 1]
        : await promptScope();
    const descIdx = args.indexOf("--description");
    const description =
      descIdx !== -1 && args[descIdx + 1] ? args[descIdx + 1] : "";
    profileCreate(name, scope, description);
  } else if (subCmd === "delete" && args[2]) {
    const name = args[2];
    const scopeIdx = args.indexOf("--scope");
    if (scopeIdx === -1 || !args[scopeIdx + 1]) {
      console.error("--scope is required for delete (to prevent accidents)");
      process.exit(1);
    }
    const scope = args[scopeIdx + 1];
    if (scope === "app") {
      console.error("Cannot delete profiles in app scope (read-only)");
      process.exit(1);
    }
    const profilePath = getProfilePath(name, scope);
    if (!fs.existsSync(profilePath)) {
      console.error(`Profile not found: ${profilePath}`);
      process.exit(1);
    }
    fs.unlinkSync(profilePath);
    console.log(`Deleted: ${profilePath}`);
  } else {
    profileHelp();
  }
}
