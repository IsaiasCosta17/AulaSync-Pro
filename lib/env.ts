import { z } from "zod";

const serverSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI_DRIVE: z.string().url(),
  GOOGLE_REDIRECT_URI_YOUTUBE: z.string().url(),
});

export function googleEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Configuração Google incompleta. Revise AUTH_SECRET, TOKEN_ENCRYPTION_KEY e as variáveis GOOGLE_* no .env.",
    );
  }
  return parsed.data;
}

export function requireSecret(name: "AUTH_SECRET" | "TOKEN_ENCRYPTION_KEY") {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} deve ter pelo menos 32 caracteres.`);
  }
  return value;
}
