// Runs Vitest from the canonical on-disk path. On Windows a folder can be opened with different
// letter case (e.g. "projects" vs "Projects"); Vitest would then load two copies of itself and
// find no tests. Usage: node scripts/vitest.mjs [vitest args]
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

const cwd = realpathSync.native(process.cwd());
const bin = realpathSync.native(path.join(cwd, "node_modules", "vitest", "vitest.mjs"));
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
