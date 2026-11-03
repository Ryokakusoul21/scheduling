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
  }
}
