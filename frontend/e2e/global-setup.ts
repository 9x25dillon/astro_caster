import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

// Mint real supporter/oracle tokens with the repo's own tool so the URL-unlock
// spec exercises the genuine server-side validation path. If the backend venv
// isn't there (fresh checkout, CI job without it), the token file stays empty
// and the dependent tests skip themselves.
export default function globalSetup(): void {
  const backend = path.resolve("../backend");
  const py = path.join(backend, ".venv/bin/python");
  let tokens: { supporter?: string; oracle?: string } = {};
  try {
    const text = execFileSync(py, ["tools/mint_test_tokens.py"], {
      cwd: backend,
      encoding: "utf8",
      timeout: 30_000,
    });
    const grab = (label: string) =>
      text.match(new RegExp(`── ${label} token ─+\\n(\\S+)`))?.[1];
    tokens = { supporter: grab("SUPPORTER"), oracle: grab("ORACLE") };
  } catch {
    // venv absent or script failed — token-dependent tests will skip.
  }
  writeFileSync(path.resolve("e2e/.tokens.json"), JSON.stringify(tokens));
}
