import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { publicAppUrl } from "@/lib/public-url";

export async function GET() {
  const response = NextResponse.redirect(publicAppUrl("/login"));
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
