#!/usr/bin/env python3
"""Compare the DNS answers of Bunny DNS and Infomaniak for the 4 domains.

Before delegating a domain to Bunny (README.md, "DNS"), every record that must
not change (mail, site, verification codes) has to be answered identically by
both providers' name servers. The redirections (apex of every domain, www of
the alternative ones) intentionally differ: Infomaniak's web redirection vs
Bunny's redirect pull zone; for them, Bunny must answer an address.

Queries the authoritative name servers directly (dig, from bind/dnsutils), so
it works whichever provider the domain is delegated to.
Writes a Markdown report to $GITHUB_STEP_SUMMARY when set, exits 1 on a
difference.

Usage:
  python3 scripts/dns_compare.py                 # every domain
  python3 scripts/dns_compare.py lecolroule.com  # one domain
"""

from __future__ import annotations

import os
import subprocess
import sys

INFOMANIAK_NS = "ns11.infomaniak.ch"
BUNNY_NS = "kiki.bunny.net"

DOMAINS = ["lecolroule.fr", "lecolroule.com", "xn--lecolroul-j4a.com", "xn--lecolroul-j4a.fr"]

# Records that must be identical at both providers: (name, type).
SAME = {
    "lecolroule.fr": [
        ("www", "CNAME"),
        ("test", "CNAME"),
        ("", "MX"),
        ("", "TXT"),
        ("_dmarc", "TXT"),
        ("default._bimi", "TXT"),
        ("protonmail._domainkey", "CNAME"),
        ("protonmail2._domainkey", "CNAME"),
        ("protonmail3._domainkey", "CNAME"),
        ("brevo1._domainkey", "CNAME"),
        ("brevo2._domainkey", "CNAME"),
    ],
}
# TXT records of Infomaniak's web redirection, gone at Bunny.
INFOMANIAK_REDIRECT_TXT = {"p|https"}

# Redirected hostnames: Bunny must answer an IPv4 address.
REDIRECTS = {d: ["", "www"] if d != "lecolroule.fr" else [""] for d in DOMAINS}


def dig(server: str, fqdn: str, rtype: str) -> list[str]:
    out = subprocess.run(["dig", "+short", "+norecurse", f"@{server}", fqdn, rtype],
                         capture_output=True, text=True, timeout=30, check=True).stdout
    values = []
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith(";"):
            continue
        if rtype == "TXT":
            # "part1" "part2" -> part1part2
            line = "".join(p for p in line.split('"') if p.strip())
        values.append(line.lower().rstrip("."))
    return sorted(values)


def fqdn(name: str, domain: str) -> str:
    return f"{name}.{domain}" if name else domain


def main() -> int:
    domains = sys.argv[1:] or DOMAINS
    rows, failed = [], 0

    for domain in domains:
        for name, rtype in SAME.get(domain, []):
            host = fqdn(name, domain)
            inf = dig(INFOMANIAK_NS, host, rtype)
            bun = dig(BUNNY_NS, host, rtype)
            if rtype == "TXT":
                inf = [v for v in inf if v not in INFOMANIAK_REDIRECT_TXT and not v.startswith("1|")]
            ok = inf == bun and bool(inf)
            failed += not ok
            rows.append((ok, f"{host} {rtype}", "; ".join(bun) if ok else f"Infomaniak {inf} / Bunny {bun}"))

        for name in REDIRECTS.get(domain, []):
            host = fqdn(name, domain)
            addresses = dig(BUNNY_NS, host, "A")
            ok = bool(addresses)
            failed += not ok
            rows.append((ok, f"{host} A (redirect)", ", ".join(addresses) or "no answer from Bunny"))

    for ok, check, detail in rows:
        print(f"{'SAME' if ok else 'DIFF'}  {check}  ({detail})")
    print(f"\n{len(rows) - failed}/{len(rows)} records as expected.")

    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        lines = ["## DNS: Bunny vs Infomaniak", "", f"**{len(rows) - failed}/{len(rows)} as expected**", "",
                 "| | Record | Bunny answer |", "|---|---|---|"]
        lines += [f"| {'✅' if ok else '❌'} | {c} | {d.replace('|', '/')} |" for ok, c, d in rows]
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
