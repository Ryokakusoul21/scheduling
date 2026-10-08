import { CredentialsSignin } from "next-auth";

/**
 * Error codes surfaced to the login form via `signIn(...).code`.
 * Codes are deliberately coarse: a wrong email and a wrong password both map
 * to "invalid" so the form can't be used to enumerate accounts.
 */
export type LoginErrorCode =
  | "invalid"
  | "locked"
  | "rate_limited"
  | "unverified"
  | "pending"
  | "inactive"
  | "two_factor_required"
  | "two_factor_invalid"
  | "captcha";

export class LoginError extends CredentialsSignin {
  constructor(code: LoginErrorCode) {
    super();
    this.code = code;
  }
}
