import type { DefaultSession } from "next-auth";
import type { Role, UserStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id?: string;
    role: Role;
    status: UserStatus;
    sessionVersion: number;
    remember: boolean;
    sessionId?: string;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      status: UserStatus;
      /** Row in UserSession for this browser; absent on sign-ins that predate session tracking. */
      sessionId?: string;
      /** Set while a Super Administrator views the system as another account: the real signed-in user. */
      realId?: string;
      realName?: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    status: UserStatus;
    sessionVersion: number;
    remember?: boolean;
    /** UserSession id. */
    sid?: string;
    /** Unix seconds when the user signed in (for absolute session expiry). */
    loginAt?: number;
    /** Account a Super Administrator is viewing as, verified on every request. */
    viewAsId?: string;
    viewAsName?: string | null;
    viewAsEmail?: string | null;
  }
}
