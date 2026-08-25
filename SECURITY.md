# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub's private vulnerability
reporting: **[Security → Report a vulnerability](https://github.com/9x25dillon/astro_caster/security/advisories/new)**.

Do not open a public issue for anything exploitable — the deployment at
`astra-arcana.com` runs this code for real users, so a public report is a
0-day against them.

This is a solo-maintained project. Reports are read and acknowledged as fast
as one person can, typically within a few days. There is no bug bounty.

## Scope

- The FastAPI backend (`backend/`), the PWA frontend (`frontend/`), and the
  payment/entitlement flow are in scope.
- The deployed services at `astra-arcana.com` / `app.astra-arcana.com` are in
  scope for **responsible, non-destructive** testing only: no denial of
  service, no bulk scanning, no testing against other users' data.
- The Resonarium instruments (`resonarium/`) are local-only, client-side
  tools; findings there are welcome but lower severity by construction.

## Supported versions

The deployed production commit and the tip of `main` are supported. Older
tags exist for archaeology, not for patching.

## What we already run

Secret scanning with push protection, Dependabot (pip / npm / Actions),
CodeQL, and gitleaks in CI. A finding those tools already flag in an open
alert is known — new *impact* (an actual exploit path) is still worth a
report.
