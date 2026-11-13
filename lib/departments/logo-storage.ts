import "server-only";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEPARTMENT_LOGO_MAX_BYTES } from "./branding";

const DIR = path.join(process.cwd(), "uploads", "department-logos");
const PREFIX = "/api/department-logos/";
const FILE_RE = /^[a-z0-9]+-[a-f0-9]{32}\.webp$/;

export class DepartmentLogoError extends Error {}

function supportedImage(input: Buffer) {
  return (input.length > 12 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff)
    || (input.length > 12 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (input.length > 12 && input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP");
}

/** Decode and re-encode uploaded logos, preserving the whole mark and any transparency. */
export async function saveDepartmentLogo(departmentId: string, input: Buffer) {
  if (!input.length || input.length > DEPARTMENT_LOGO_MAX_BYTES) throw new DepartmentLogoError("Use an image up to 2 MB.");
  if (!supportedImage(input)) throw new DepartmentLogoError("Use a PNG, JPG, or WebP image.");
  let image: Buffer;
  try {
    image = await sharp(input, { limitInputPixels: 20_000_000 }).rotate()
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 }).toBuffer();
  } catch { throw new DepartmentLogoError("That image could not be read. Choose another logo."); }
  const name = `${departmentId.toLowerCase().replace(/[^a-z0-9]/g, "")}-${randomBytes(16).toString("hex")}.webp`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), image);
  return `${PREFIX}${name}`;
}

export async function deleteDepartmentLogo(url: string | null) {
  const name = url?.startsWith(PREFIX) ? url.slice(PREFIX.length) : null;
  if (name && FILE_RE.test(name)) await rm(path.join(DIR, name), { force: true });
}

export async function readDepartmentLogo(name: string) {
  if (!FILE_RE.test(name)) return null;
  return readFile(path.join(DIR, name)).catch(() => null);
}
