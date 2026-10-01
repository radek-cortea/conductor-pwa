import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "conductor-openapi-"));
const generated = join(directory, "schema.ts");

try {
  execFileSync("pnpm", ["exec", "openapi-typescript", "openapi/conductor.json", "-o", generated], {
    stdio: "inherit",
  });
  const pinned = readFileSync("src/api/generated/schema.ts", "utf8");
  const fresh = readFileSync(generated, "utf8");
  if (pinned !== fresh) {
    console.error(
      "src/api/generated/schema.ts does not match openapi/conductor.json. Run pnpm openapi:gen and review the diff.",
    );
    process.exit(1);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
