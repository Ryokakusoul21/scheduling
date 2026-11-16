import "server-only";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { AVATAR_MAX_BYTES } from "./url";

const DIR = path.join(process.cwd(), "uploads", "avatars");
/** File names are generated here only; anything else is rejected before touching the disk. */
export const AVATAR_FILE_RE = /^[a-z0-9]+-[a-f0-9]{16}(-64)?\.webp$/;
const URL_PREFIX = "/api/avatars/";

export class AvatarError extends Error {}

/** Identifies the format from magic bytes so a renamed file cannot slip through on its extension. */
function detectFormat(b: Buffer) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "webp";
  return null;
}

function fileOf(image: string | null | undefined) {
  const name = image?.startsWith(URL_PREFIX) ? image.slice(URL_PREFIX.length) : null;
  return name && AVATAR_FILE_RE.test(name) ? name : null;
}

/** Deletes the stored avatar and any legacy local copies; missing files are fine. */
export async function deleteAvatarFiles(image: string | null | undefined) {
  const name = fileOf(image);
  if (!name) return;
  const original = name.replace(/-64\.webp$/, ".webp");
  await prisma.avatarFile.deleteMany({ where: { name: original } });
  // Previous versions wrote to disk. Vercel's application directory is read-only.
  if (!process.env.VERCEL) {
    await Promise.all([original, original.replace(/\.webp$/, "-64.webp")].map((f) => rm(path.join(DIR, f), { force: true })));
  }
}

/** Validates, re-encodes (sharp drops EXIF by default) and stores 256px and 64px WebP copies; returns the URL. */
export async function saveAvatar(userId: string, input: Buffer) {
  if (input.length > AVATAR_MAX_BYTES) throw new AvatarError("The photo must be 5 MB or smaller.");
  if (!detectFormat(input)) throw new AvatarError("Use a JPG, PNG, or WebP image.");

  const image = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  let large: Buffer, small: Buffer;
  try {
    [large, small] = await Promise.all(
      [256, 64].map((size) => image.clone().resize(size, size, { fit: "cover" }).webp({ quality: 82 }).toBuffer()),
    );
  } catch {
    throw new AvatarError("That image could not be read. Try a different photo.");
  }

  const name = `${userId.toLowerCase().replace(/[^a-z0-9]/g, "")}-${randomBytes(8).toString("hex")}.webp`;
  // Keep both small, re-encoded images in persistent storage, shared by all function instances.
  await prisma.avatarFile.create({ data: { name, image: new Uint8Array(large), thumbnail: new Uint8Array(small) } });
  return `${URL_PREFIX}${name}`;
}

export async function readAvatarFile(name: string) {
  if (!AVATAR_FILE_RE.test(name)) return null;
  const thumbnail = name.endsWith("-64.webp");
  const stored = await prisma.avatarFile.findUnique({
    where: { name: name.replace(/-64\.webp$/, ".webp") },
    select: { image: !thumbnail, thumbnail },
  });
  if (stored) return thumbnail ? stored.thumbnail : stored.image;
  // Preserve photos uploaded by earlier versions on a persistent local filesystem.
  return readFile(path.join(DIR, name)).catch(() => null);
}
