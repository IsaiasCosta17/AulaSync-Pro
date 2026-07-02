import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function execute(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Processo encerrado pelo sinal ${signal}.`
            : `Processo terminou com código ${code ?? "desconhecido"}.`,
        ),
      );
    });
  });
}

async function run(label, command, args, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`\n[PREPARAÇÃO] ${label} (tentativa ${attempt}/${attempts})`);
    try {
      await execute(command, args);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(20_000, 4_000 * 2 ** (attempt - 1));
      console.warn(
        `[PREPARAÇÃO] ${label} falhou temporariamente. Nova tentativa em ${delay / 1000}s.`,
      );
      await wait(delay);
    }
  }
}

const npmExec = (args) => [npm, ["exec", "--", ...args]];

try {
  await run(
    "Validar variáveis de produção",
    process.execPath,
    ["scripts/validate-production-env.mjs"],
  );
  await run(
    "Verificar permissões do Prisma",
    process.execPath,
    ["scripts/fix-prisma-permissions.mjs"],
  );

  const [prismaCommand, prismaGenerate] = npmExec(["prisma", "generate"]);
  await run("Gerar Prisma Client", prismaCommand, prismaGenerate);

  const [pushCommand, pushArgs] = npmExec(["prisma", "db", "push"]);
  await run("Sincronizar schema PostgreSQL", pushCommand, pushArgs, 3);

  const [seedCommand, seedArgs] = npmExec(["prisma", "db", "seed"]);
  await run("Sincronizar administrador", seedCommand, seedArgs, 3);

  const [nextCommand, nextArgs] = npmExec(["next", "build"]);
  await run("Compilar Next.js", nextCommand, nextArgs);

  console.log("\n[PREPARAÇÃO] AulaSync Pro preparado com sucesso.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(`\n[PREPARAÇÃO] Falha definitiva: ${message}`);
  process.exit(1);
}
