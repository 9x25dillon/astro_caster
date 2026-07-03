# Documentation map

Everything that isn't code lives here, organized by lifecycle. Root keeps only
the conventional files: `README.md`, `CHANGELOG.md`, `LICENSE`, `TESTING.md`,
`run.sh`.

| Folder | What lives here | Lifecycle |
|---|---|---|
| [`progress/`](progress/) | The living work record: [`PROJECT_WORK_HISTORY_MAP.md`](progress/PROJECT_WORK_HISTORY_MAP.md) (timeline by wave/phase/branch), [`COMPREHENSIVE_TASK_SCHEDULE.md`](progress/COMPREHENSIVE_TASK_SCHEDULE.md) (prioritized tasks + acceptance criteria), [`Hand_off.md`](progress/Hand_off.md) (latest session handoff) | **Living** — update on every phase or branch close |
| [`audits/`](audits/) | The audit bracket: [`AUDIT_BASELINE.md`](audits/AUDIT_BASELINE.md) (the "before"), [`AUDIT_REGRESSION.md`](audits/AUDIT_REGRESSION.md) (the "after"), [`CODEBASE_REVIEW_REPORT.md`](audits/CODEBASE_REVIEW_REPORT.md) | Point-in-time records — append new audits, don't rewrite old ones |
| [`prompts/`](prompts/) | Canonical AI prompt specs: personal report, workflow, productivity | Living — versioned with the features they drive |
| [`design/`](design/) | Visual contracts: [`ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md`](design/ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md) and the printable mock ([`Astro_Arcana_Report_Design_Mock.html`](design/Astro_Arcana_Report_Design_Mock.html)) the print renderer's tokens are lifted from | Living — the mock is the ground truth for `frontend/src/lib/printReport.ts` |
| [`screenshots/`](screenshots/) | UI walkthrough captures (see root `TESTING.md`) | Regenerable |
| [`archive/`](archive/) | Superseded plans and closed-out handoffs, each with a banner naming its successor | **Frozen** — historical reference only |

## Conventions

- The canonical progress record is: `CHANGELOG.md` (root) + `progress/` +
  `audits/` + git history. Update `progress/` docs on every major phase, PR,
  or significant change.
- When a plan or handoff is superseded, move it to `archive/` with a banner
  pointing at its successor — don't delete it and don't keep two "current"
  versions.
- Reference docs from code and other docs by repo-relative path
  (e.g. `docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md`) so links survive
  future moves findably.
- The Resonarium ↔ Biosentinel module documents itself in
  [`../resonarium/README.md`](../resonarium/README.md).
