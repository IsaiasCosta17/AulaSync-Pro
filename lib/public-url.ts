export function publicAppUrl(pathname = "/") {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const base = configured.endsWith("/") ? configured : configured + "/";
  return new URL(pathname.replace(/^\//, ""), base);
}
