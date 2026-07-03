import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { publicAppUrl } from "@/lib/public-url";

export async function POST() {
  const response = NextResponse.redirect(publicAppUrl("/login"), 303);
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
