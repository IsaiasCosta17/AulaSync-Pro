import { chmod, readdir } from "node:fs/promises";
import path from "node:path";

const pnpmStore = path.join(process.cwd(), "node_modules", ".pnpm");
const prismaEnginePattern = /^(schema-engine|query-engine|migration-engine|introspection-engine|prisma-fmt)(-|$)/;

let updated = 0;

async function visit(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(target);
      continue;
    }

    if (!entry.isFile() || !prismaEnginePattern.test(entry.name)) continue;

    try {
      await chmod(target, 0o755);
      updated += 1;
    } catch (error) {
      if (process.platform !== "win32") throw error;
    }
  }
}

await visit(pnpmStore);
console.log(`Permissões dos mecanismos Prisma verificadas (${updated} arquivo(s)).`);
