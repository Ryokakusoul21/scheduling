import type { NextAuthConfig } from "next-auth";
import type { Role, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { AUTH } from "@/lib/auth/config";
import { canAccessPath, isStudentArea } from "@/lib/permissions/routes";
import type { AppRole } from "@/lib/permissions/roles";

/** Routes reachable without a session. */
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/terms",
  "/privacy",
  "/403",
  "/student/login",
  "/student/register",
  "/student/forgot-password",
  "/student/reset-password",
];

export function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/branding") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

/**
 * Edge-safe auth config (no Prisma/bcrypt here) used by the proxy.
 * The Credentials provider and DB-backed session checks live in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    // Upper bound; shorter "not remembered" sessions are enforced in the jwt callback.
    maxAge: AUTH.rememberMeMaxAgeSeconds,
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname)) return true;
      // Signed-out visitors to the student portal go to the student login, not the staff one.
      if (!auth?.user && isStudentArea(pathname)) {
        return NextResponse.redirect(new URL(`/student/login?callbackUrl=${encodeURIComponent(pathname)}`, request.nextUrl));
      }
      if (!auth?.user) return false;
      // The endpoint checks the real account itself, so it stays reachable while viewing as a student.
      if (pathname.startsWith("/api/view-as")) return true;
      // Viewing as another account is read-only. Server actions also read data, so they pass with a marker the
      // database client uses to refuse writes; other non-GET requests (uploads, API writes) are refused here.
      if (auth.user.realId && request.method !== "GET" && request.method !== "HEAD") {
        if (!request.headers.has("next-action")) return NextResponse.json({ error: "Viewing as another account is read-only. Return to your own account to make changes." }, { status: 403 });
        if (!canAccessPath(pathname, auth.user.role as AppRole)) return NextResponse.rewrite(new URL("/403", request.nextUrl), { status: 403 });
        const headers = new Headers(request.headers);
        headers.set("x-viewing-as", "1");
        return NextResponse.next({ request: { headers } });
      }
      // RBAC route guard: answer with a real 403 before the page streams.
      if (!canAccessPath(pathname, auth.user.role as AppRole)) {
        return NextResponse.rewrite(new URL("/403", request.nextUrl), { status: 403 });
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.status = user.status;
        token.sessionVersion = user.sessionVersion;
        token.remember = user.remember;
        token.sid = user.sessionId;
        token.loginAt = Math.floor(Date.now() / 1000);
        return token;
      }

      // Session expiry: non-remembered sessions end after a short absolute lifetime.
      const maxAge = token.remember ? AUTH.rememberMeMaxAgeSeconds : AUTH.shortSessionMaxAgeSeconds;
      if (!token.loginAt || Date.now() / 1000 - token.loginAt > maxAge) return null;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role as Role;
        session.user.status = token.status as UserStatus;
        session.user.sessionId = token.sid;
        if (token.viewAsId) {
          session.user.realId = token.id;
          session.user.realName = token.name ?? undefined;
          session.user.id = token.viewAsId;
          session.user.name = token.viewAsName ?? null;
          session.user.email = token.viewAsEmail ?? "";
        }
      }
      return session;
    },
  },
  providers: [], // populated in auth.ts
} satisfies NextAuthConfig;
