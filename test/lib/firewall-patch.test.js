import { describe, it, expect } from "vitest";
import https from "https";

// Matches UPSTREAM_BASE in claudeman CLI
// TODO: Switch back to anthropics/claude-code/main once PR #40322 is merged
const UPSTREAM_BASE =
  "https://raw.githubusercontent.com/scottrigby/claude-code/feature/hybrid-domain-firewall-fixed/.devcontainer";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

describe("upstream firewall (hybrid DNS)", () => {
  let firewall;

  it("fetches init-firewall.sh", async () => {
    firewall = await fetchUrl(`${UPSTREAM_BASE}/init-firewall.sh`);
    expect(firewall).toContain("set -euo pipefail");
  });

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
});
