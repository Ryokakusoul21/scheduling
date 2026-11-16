import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ create: vi.fn(), find: vi.fn(), remove: vi.fn(), read: vi.fn(), rm: vi.fn() }));
vi.mock("server-only", () => ({}));
// No mkdir/writeFile exports: uploads must work with an unwritable application directory.
vi.mock("node:fs/promises", () => ({ readFile: mocks.read, rm: mocks.rm }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { avatarFile: { create: mocks.create, findUnique: mocks.find, deleteMany: mocks.remove } } }));

import { AvatarError, deleteAvatarFiles, readAvatarFile, saveAvatar } from "@/lib/avatar/storage";
import { AVATAR_MAX_BYTES, smallAvatarUrl } from "@/lib/avatar/url";

const name = "user-0123456789abcdef.webp";
const url = `/api/avatars/${name}`;

describe("persistent avatar storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    mocks.read.mockRejectedValue(Object.assign(new Error("Not found"), { code: "ENOENT" }));
  });

  it("stores and retrieves both WebP sizes on Vercel without writing to disk", async () => {
    vi.stubEnv("VERCEL", "1");
    const input = await sharp({ create: { width: 120, height: 80, channels: 3, background: "red" } }).jpeg().toBuffer();
    const savedUrl = await saveAvatar("User", input);
    expect(savedUrl).toMatch(/^\/api\/avatars\/user-[a-f0-9]{16}\.webp$/);
    const { data } = mocks.create.mock.calls[0][0];
    expect(await sharp(data.image).metadata()).toMatchObject({ width: 256, height: 256, format: "webp" });
    expect(await sharp(data.thumbnail).metadata()).toMatchObject({ width: 64, height: 64, format: "webp" });
    mocks.find.mockResolvedValue(data);
    expect(await readAvatarFile(savedUrl.split("/").pop()!)).toEqual(data.image);
    expect(await readAvatarFile(smallAvatarUrl(savedUrl)!.split("/").pop()!)).toEqual(data.thumbnail);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.find).toHaveBeenLastCalledWith({ where: { name: data.name }, select: { image: false, thumbnail: true } });
  });

  it("rejects oversized, unsupported, and corrupt photos before storing them", async () => {
    await expect(saveAvatar("user", Buffer.alloc(AVATAR_MAX_BYTES + 1))).rejects.toThrow("5 MB");
    await expect(saveAvatar("user", Buffer.from("<svg>not an allowed photo</svg>"))).rejects.toBeInstanceOf(AvatarError);
    await expect(saveAvatar("user", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(20)]))).rejects.toThrow("could not be read");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reads legacy local photos and returns null for missing photos", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.read.mockResolvedValueOnce(Buffer.from("legacy photo"));
    expect(await readAvatarFile(name)).toEqual(Buffer.from("legacy photo"));
    expect(await readAvatarFile(name)).toBeNull();
  });

  it("deletes both persisted sizes on Vercel without attempting disk cleanup", async () => {
    vi.stubEnv("VERCEL", "1");
    await deleteAvatarFiles(url);
    await deleteAvatarFiles(smallAvatarUrl(url));
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenLastCalledWith({ where: { name } });
    expect(mocks.rm).not.toHaveBeenCalled();
  });

  it("also cleans up legacy local copies outside Vercel", async () => {
    vi.stubEnv("VERCEL", "");
    await deleteAvatarFiles(url);
    expect(mocks.remove).toHaveBeenCalledWith({ where: { name } });
    expect(mocks.rm).toHaveBeenCalledTimes(2);
  });

  it("rejects traversal paths and unrelated URLs before database or file access", async () => {
    for (const file of ["../../secret", "user-0123456789abcdef.webp/../secret", "unknown.png"]) {
      expect(await readAvatarFile(file)).toBeNull();
      await deleteAvatarFiles(`/api/avatars/${file}`);
    }
    await deleteAvatarFiles("https://example.com/avatar.webp");
    await deleteAvatarFiles(null);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });
});
