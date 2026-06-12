import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = dirname(scriptDir);
const skillName = basename(skillDir);
const skillPath = join(skillDir, "SKILL.md");
const text = readFileSync(skillPath, "utf8");
const errors = [];

function fail(message) {
  errors.push(message);
}

const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
if (!match) {
  fail("SKILL.md must start with YAML frontmatter.");
} else {
  const frontmatter = match[1];
  const fields = {};
  let currentMap = null;

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const mapItem = /^  ([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (mapItem && currentMap) {
      fields[currentMap][mapItem[1]] = mapItem[2].replace(/^["']|["']$/g, "");
      continue;
    }

    currentMap = null;
    const field = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(rawLine);
    if (!field) {
      fail(`Unsupported frontmatter line: ${rawLine}`);
      continue;
    }
    const [, key, value = ""] = field;
    if (value === "") {
      fields[key] = {};
      currentMap = key;
    } else {
      fields[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  if (fields.name !== skillName) {
    fail(`name must match parent directory: expected ${skillName}, got ${fields.name ?? "<missing>"}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name ?? "")) {
    fail("name must use lowercase letters, numbers, and single hyphens only.");
  }
  if ((fields.name ?? "").length > 64) {
    fail("name must be <= 64 characters.");
  }
  if (typeof fields.description !== "string" || fields.description.trim().length === 0) {
    fail("description is required.");
  } else if (fields.description.length > 1024) {
    fail("description must be <= 1024 characters.");
  }
  if (typeof fields.compatibility === "string" && fields.compatibility.length > 500) {
    fail("compatibility must be <= 500 characters.");
  }
  if (fields.metadata && typeof fields.metadata !== "object") {
    fail("metadata must be a key-value mapping.");
  }
}

if (text.length > 40_000) {
  fail("SKILL.md is large; move details into references/ for progressive disclosure.");
}

for (const dir of ["scripts", "references", "server"]) {
  try {
    statSync(join(skillDir, dir));
  } catch {
    fail(`expected bundled directory missing: ${dir}/`);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, skill: skillName }, null, 2));
