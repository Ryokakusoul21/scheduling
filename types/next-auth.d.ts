import type { DefaultSession } from "next-auth";
import type { Role, UserStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id?: string;
    role: Role;
    status: UserStatus;
    sessionVersion: number;
    remember: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      status: UserStatus;
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
    /** Unix seconds when the user signed in (for absolute session expiry). */
    loginAt?: number;
  }
}
