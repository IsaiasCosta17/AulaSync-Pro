import { open, readFile, unlink, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(projectRoot);

async function loadEnvironment() {
  const source = await readFile(path.join(projectRoot, ".env"), "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function acquireProcessLock(lockPath: string, heartbeatPath: string) {
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(String(process.pid), "utf8");
    await handle.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  try {
    const pid = Number((await readFile(lockPath, "utf8")).trim());
    const heartbeat = Number((await readFile(heartbeatPath, "utf8")).trim());
    if (Number.isInteger(pid) && Date.now() - heartbeat < 30_000) {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        // O processo não existe mais; o bloqueio será recuperado.
      }
    }
  } catch {
    // Arquivos incompletos também são tratados como bloqueio antigo.
  }

  await unlink(lockPath).catch(() => undefined);
  await unlink(heartbeatPath).catch(() => undefined);
  const handle = await open(lockPath, "wx");
  await handle.writeFile(String(process.pid), "utf8");
  await handle.close();
  return true;
}

async function main() {
  await loadEnvironment();
  process.env.AULASYNC_WORKER_PROCESS = "1";

  const runtimeDirectory = path.join(projectRoot, ".runtime");
  const lockPath = path.join(runtimeDirectory, "background-worker.pid");
  const heartbeatPath = path.join(runtimeDirectory, "worker-heartbeat");
  await mkdir(runtimeDirectory, { recursive: true });

  const acquired = await acquireProcessLock(lockPath, heartbeatPath);
  if (!acquired) return;

  const [{ prisma }, { recoverPendingUploadJobs }, { cleanErrorMessage }] = await Promise.all([
    import("../lib/db"),
    import("../lib/upload-worker"),
    import("../lib/utils"),
  ]);

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log(new Date().toISOString(), "Motor de uploads em segundo plano iniciado.");

  try {
    while (!stopping) {
      await writeFile(heartbeatPath, String(Date.now()), "utf8");
      try {
        await recoverPendingUploadJobs();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha inesperada no worker.";
        console.error(new Date().toISOString(), cleanErrorMessage(message));
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await unlink(heartbeatPath).catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    console.log(new Date().toISOString(), "Motor de uploads em segundo plano encerrado.");
  }
}

void main().catch(async (error) => {
  const message = error instanceof Error ? error.message : "Não foi possível iniciar o worker.";
  console.error(new Date().toISOString(), message.replace(/\s+/g, " ").slice(0, 500));
  if (await fileExists(path.join(projectRoot, ".runtime", "background-worker.pid"))) {
    await unlink(path.join(projectRoot, ".runtime", "background-worker.pid")).catch(() => undefined);
  }
  process.exitCode = 1;
});
