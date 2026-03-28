import { Command } from "commander";
import fs from "fs";
import {
  BUILTIN_FIREWALL_DOMAINS,
  getAllProfiles,
  loadProfile,
  getProfilePath,
  ensureProfileDir,
  promptScope,
} from "../helpers/settings.js";

function domainAdd(domain, profileName, scope) {
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
      profile = { name: profileName, description: "", features: {} };
      console.log(`Creating new profile in ${scope} scope...`);
    }
    ensureProfileDir(scope);
  }

  if (!profile.extraDomains) profile.extraDomains = [];
  if (profile.extraDomains.includes(domain)) {
    console.log(`Domain already in profile: ${domain}`);
    return;
  }

  profile.extraDomains.push(domain);
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`Added ${domain} to ${profileName} (${scope})`);
}

function domainRemove(domain, profileName, scope) {
  if (scope === "app") {
    console.error("Cannot modify profiles in app scope (read-only)");
    process.exit(1);
  }

  const profilePath = getProfilePath(profileName, scope);

  if (!fs.existsSync(profilePath)) {
    console.error(`Profile not found at ${scope} scope: ${profileName}`);
    process.exit(1);
  }

  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));

  if (!profile.extraDomains || !profile.extraDomains.includes(domain)) {
    console.log(`Domain not in profile: ${domain}`);
    return;
  }

  profile.extraDomains = profile.extraDomains.filter((d) => d !== domain);
  if (profile.extraDomains.length === 0) delete profile.extraDomains;
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`Removed ${domain} from ${profileName} (${scope})`);
}

function domainList(profileName) {
  console.log("Built-in (upstream firewall):");
  for (const d of BUILTIN_FIREWALL_DOMAINS) console.log(`  ${d}`);
  console.log();
  console.log("Added by claudeman:");
  console.log("  host.containers.internal");
  console.log();

  if (profileName) {
    const profile = loadProfile(profileName);
    if (!profile) {
      console.error(`Profile not found: ${profileName}`);
      process.exit(1);
    }
    const domains = profile.extraDomains || [];
    if (domains.length === 0) {
      console.log(`No additional domains in profile: ${profileName}`);
    } else {
      console.log(`Profile "${profileName}":`);
      for (const d of domains) console.log(`  ${d}`);
    }
  } else {
    const profiles = getAllProfiles();
    let found = false;
    for (const [name, { profile }] of profiles) {
      const domains = profile.extraDomains || [];
      if (domains.length > 0) {
        found = true;
        console.log(`Profile "${name}":`);
        for (const d of domains) console.log(`  ${d}`);
        console.log();
      }
    }
    if (!found) console.log("No profiles have additional domains configured.");
  }
}

export const domainCmd = new Command("domain").description(
  "Manage allowed firewall domains in profiles",
);

domainCmd
  .command("add <domain> <profile>")
  .description("Allow a domain through the container firewall")
  .option("--scope <scope>", "Scope (user or project)")
  .action(async (domain, profile, opts) => {
    const scope = opts.scope || (await promptScope());
    domainAdd(domain, profile, scope);
  });

domainCmd
  .command("remove <domain> <profile>")
  .description("Remove an allowed domain from a profile")
  .option("--scope <scope>", "Scope (user or project)")
  .action(async (domain, profile, opts) => {
    const scope = opts.scope || (await promptScope());
    domainRemove(domain, profile, scope);
  });

domainCmd
  .command("list [profile]")
  .description("List allowed domains (all profiles or one)")
  .action((profile) => {
    domainList(profile);
  });
