/** Central knobs for the authentication module. */
export const AUTH = {
  /** bcrypt cost factor for new password hashes. */
  bcryptRounds: 12,

  /** Per-account lockout after repeated failed logins. */
  maxFailedAttempts: 5,
  lockoutMinutes: 15,

  /** Per-IP rate limit on failed logins. */
  ipWindowMinutes: 15,
  ipMaxFailures: 20,

  /** Session lifetime: "Remember me" vs. a normal sign-in. */
  rememberMeMaxAgeSeconds: 30 * 24 * 60 * 60,
  shortSessionMaxAgeSeconds: 8 * 60 * 60,

  /** Ask an inactive user to continue, then sign out after a one-minute grace period. */
  idleWarningAfterMs: 5 * 60_000,
  idleSignOutGraceMs: 60_000,

  emailVerificationTtlMinutes: 24 * 60,
  passwordResetTtlMinutes: 30,
  /** Minimum gap between verification/reset emails for one account. */
  emailResendCooldownSeconds: 60,
} as const;

export const SETTING_REQUIRE_APPROVAL = "auth.requireAdminApproval";
