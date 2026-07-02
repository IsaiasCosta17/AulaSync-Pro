const errors = [];
const warnings = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`${name} não foi configurada.`);
    return "";
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");
const adminName = required("ADMIN_NAME");
const adminEmail = required("ADMIN_EMAIL");
const adminPassword = required("ADMIN_PASSWORD");
const authSecret = required("AUTH_SECRET");
const encryptionKey = required("TOKEN_ENCRYPTION_KEY");
const googleClientId = required("GOOGLE_CLIENT_ID");
const googleClientSecret = required("GOOGLE_CLIENT_SECRET");
const driveRedirect = required("GOOGLE_REDIRECT_URI_DRIVE");
const youtubeRedirect = required("GOOGLE_REDIRECT_URI_YOUTUBE");
const publicAppUrl = required("NEXT_PUBLIC_APP_URL");

if (databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      errors.push("DATABASE_URL deve começar com postgresql:// ou postgres://.");
    }
    if (!url.hostname || !url.username || !url.pathname) {
      errors.push("DATABASE_URL está incompleta.");
    }
    if (/\[YOUR-PASSWORD\]|SUA_SENHA|usuario:senha/i.test(databaseUrl)) {
      errors.push("DATABASE_URL ainda contém uma senha de exemplo.");
    }
    if (url.hostname.endsWith(".supabase.co") && url.hostname.startsWith("db.")) {
      warnings.push("DATABASE_URL usa conexão direta do Supabase. Na Hostinger, prefira Session pooler IPv4.");
    }
    if (url.hostname.includes("pooler.supabase.com") && url.port && url.port !== "5432") {
      errors.push("Para Session pooler do Supabase use a porta 5432.");
    }
  } catch {
    errors.push("DATABASE_URL não é uma URI válida.");
  }
}

if (adminName && adminName.length < 2) errors.push("ADMIN_NAME deve ter pelo menos 2 caracteres.");
if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  errors.push("ADMIN_EMAIL não é um e-mail válido.");
}
if (adminPassword && adminPassword.length < 12) {
  errors.push("ADMIN_PASSWORD deve ter pelo menos 12 caracteres.");
}
if (authSecret && authSecret.length < 32) {
  errors.push("AUTH_SECRET deve ter pelo menos 32 caracteres.");
}
if (encryptionKey) {
  const decoded = Buffer.from(encryptionKey, "base64");
  if (decoded.length !== 32) {
    errors.push("TOKEN_ENCRYPTION_KEY deve ser Base64 de exatamente 32 bytes.");
  }
}

for (const [name, value] of [
  ["GOOGLE_REDIRECT_URI_DRIVE", driveRedirect],
  ["GOOGLE_REDIRECT_URI_YOUTUBE", youtubeRedirect],
  ["NEXT_PUBLIC_APP_URL", publicAppUrl],
]) {
  if (!value) continue;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      errors.push(`${name} deve usar HTTPS em produção.`);
    }
  } catch {
    errors.push(`${name} não é uma URL válida.`);
  }
}

if (driveRedirect && !driveRedirect.endsWith("/api/oauth/google/drive/callback")) {
  errors.push("GOOGLE_REDIRECT_URI_DRIVE deve terminar em /api/oauth/google/drive/callback.");
}
if (youtubeRedirect && !youtubeRedirect.endsWith("/api/oauth/google/youtube/callback")) {
  errors.push("GOOGLE_REDIRECT_URI_YOUTUBE deve terminar em /api/oauth/google/youtube/callback.");
}

void googleClientId;
void googleClientSecret;

for (const warning of warnings) console.warn(`[CONFIG AVISO] ${warning}`);

if (errors.length) {
  console.error("\nConfiguração de produção inválida:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("\nCorrija as variáveis na Hostinger e execute uma nova implantação.\n");
  process.exit(1);
}

console.log("Variáveis obrigatórias de produção verificadas com sucesso.");
