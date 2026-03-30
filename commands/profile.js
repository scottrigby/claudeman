import { Command } from "commander";
import fs from "fs";
import {
  APP_PROFILES_DIR,
  GLOBAL_PROFILES_DIR,
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

export const profileCmd = new Command("profile").description(
  "Manage profiles (feature collections)",
);

profileCmd
  .command("list")
  .description("List all profiles with scopes")
  .action(() => {
    profileList();
  });

profileCmd
  .command("info <name>")
  .description("Show profile details and features")
  .action((name) => {
    profileInfo(name);
  });

profileCmd
  .command("create <name>")
  .description("Create a new empty profile")
  .option("--scope <scope>", "Scope (global or project)")
  .option("--description <desc>", "Profile description", "")
  .action(async (name, opts) => {
    const scope = opts.scope || (await promptScope());
    profileCreate(name, scope, opts.description);
  });

profileCmd
  .command("delete <name>")
  .description("Delete a profile (requires explicit scope)")
  .option("--scope <scope>", "Scope (global or project)")
  .action((name, opts) => {
    if (!opts.scope) {
      console.error("--scope is required for delete (to prevent accidents)");
      process.exit(1);
    }
    const scope = opts.scope;
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
  });
