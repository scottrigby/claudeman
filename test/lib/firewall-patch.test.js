import { describe, it, expect } from "vitest";
// import https from "https";
import fs from "fs";
import path from "path";

// TODO: Switch back to fetching from upstream once PR #40322 is merged:
// const UPSTREAM_BASE =
//   "https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer";
//
// function fetchUrl(url) {
//   return new Promise((resolve, reject) => {
//     https
//       .get(url, (res) => {
//         let data = "";
//         res.on("data", (chunk) => (data += chunk));
//         res.on("end", () => resolve(data));
//       })
//       .on("error", reject);
//   });
// }

// Temporarily using local patched files (fork DMCA'd).
const PATCHES_DIR = path.resolve(
  import.meta.dirname,
  "../../patches/.devcontainer",
);

describe("patched firewall (hybrid DNS)", () => {
  // TODO: Switch to fetching once PR merges:
  // let firewall;
  // it("fetches init-firewall.sh", async () => {
  //   firewall = await fetchUrl(`${UPSTREAM_BASE}/init-firewall.sh`);
  //   expect(firewall).toContain("set -euo pipefail");
  // });

  const firewall = fs.readFileSync(
    path.join(PATCHES_DIR, "init-firewall.sh"),
    "utf8",
  );

  it("has DYNAMIC_DOMAINS array", () => {
    expect(firewall).toContain("declare -a DYNAMIC_DOMAINS=(");
  });

  it("merges WHITELIST_DOMAINS env var", () => {
    expect(firewall).toContain("WHITELIST_DOMAINS");
    expect(firewall).toContain('DYNAMIC_DOMAINS+=("${USER_DOMAINS[@]}")');
  });

  it("has dual static/dynamic ipsets", () => {
    expect(firewall).toContain('IPSET_STATIC="allowed-static"');
    expect(firewall).toContain('IPSET_DYNAMIC="allowed-dynamic"');
  });

  it("has configurable DNS_TTL and DNS_REFRESH", () => {
    expect(firewall).toContain(': "${DNS_TTL:=');
    expect(firewall).toContain(': "${DNS_REFRESH:=');
  });

  it("has background DNS refresh loop", () => {
    expect(firewall).toContain("while true; do");
    expect(firewall).toContain("sleep");
    expect(firewall).toContain("refresh-dynamic-domains.sh");
  });

  it("has both ipsets in iptables rules", () => {
    expect(firewall).toContain('--match-set "$IPSET_STATIC" dst -j ACCEPT');
    expect(firewall).toContain('--match-set "$IPSET_DYNAMIC" dst -j ACCEPT');
  });

  it("has SETENV in sudoers for WHITELIST_DOMAINS passthrough", () => {
    const dockerfile = fs.readFileSync(
      path.join(PATCHES_DIR, "Dockerfile"),
      "utf8",
    );
    expect(dockerfile).toContain("NOPASSWD:SETENV:");
  });

  it("passes WHITELIST_DOMAINS through sudo in postStartCommand", () => {
    const config = fs.readFileSync(
      path.join(PATCHES_DIR, "devcontainer.json"),
      "utf8",
    );
    expect(config).toContain('WHITELIST_DOMAINS=\\"$WHITELIST_DOMAINS\\"');
  });
});
