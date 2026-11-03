/** Client-safe avatar helpers; the stored value is the 256px URL and the 64px copy sits beside it. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** URL of the 64px copy, used where the avatar is shown at 40px or smaller. */
export function smallAvatarUrl(image: string | null | undefined) {
  return image ? image.replace(/\.webp$/, "-64.webp") : null;
}
