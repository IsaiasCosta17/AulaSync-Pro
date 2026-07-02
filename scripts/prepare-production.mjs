import { spawn } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

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
  await run("Gerar Prisma Client", pnpm, ["exec", "prisma", "generate"]);
  await run(
    "Sincronizar schema PostgreSQL",
    pnpm,
    ["exec", "prisma", "db", "push"],
    3,
  );
  await run(
    "Sincronizar administrador",
    pnpm,
    ["exec", "prisma", "db", "seed"],
    3,
  );
  await run("Compilar Next.js", pnpm, ["exec", "next", "build"]);
  console.log("\n[PREPARAÇÃO] AulaSync Pro preparado com sucesso.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(`\n[PREPARAÇÃO] Falha definitiva: ${message}`);
  process.exit(1);
}
