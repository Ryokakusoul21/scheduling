import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ mkdir: vi.fn(), write: vi.fn(), read: vi.fn(), rm: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir, writeFile: mocks.write, readFile: mocks.read, rm: mocks.rm }));
import { deleteDepartmentLogo, readDepartmentLogo, saveDepartmentLogo } from "@/lib/departments/logo-storage";
import { DEPARTMENT_LOGO_MAX_BYTES } from "@/lib/departments/branding";

describe("department logo processing", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.read.mockResolvedValue(Buffer.from("image")); });

  it("preserves a wide logo in a transparent square without cropping", async () => {
    const input = await sharp({ create: { width: 120, height: 40, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const url = await saveDepartmentLogo("department", input);
    expect(url).toMatch(/^\/api\/department-logos\/department-[a-f0-9]{32}\.webp$/);
    const stored: Buffer = mocks.write.mock.calls[0][1];
    const metadata = await sharp(stored).metadata();
    expect(metadata).toMatchObject({ width: 512, height: 512, format: "webp", hasAlpha: true });
    const { data, info } = await sharp(stored).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    expect(data[(256 * info.width + 256) * info.channels + 3]).toBe(255);
  });

  it("rejects oversized, unsupported and corrupt image files before writing", async () => {
    await expect(saveDepartmentLogo("d", Buffer.alloc(DEPARTMENT_LOGO_MAX_BYTES + 1))).rejects.toThrow("2 MB");
    await expect(saveDepartmentLogo("d", Buffer.from("<svg><script>anything</script></svg>"))).rejects.toThrow("PNG, JPG, or WebP");
    await expect(saveDepartmentLogo("d", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(20)]))).rejects.toThrow("could not be read");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("refuses traversal paths and arbitrary URLs when reading or removing files", async () => {
    expect(await readDepartmentLogo("../../secret")).toBeNull();
    await deleteDepartmentLogo("/api/department-logos/../../secret");
    await deleteDepartmentLogo("https://example.com/image.webp");
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.rm).not.toHaveBeenCalled();
  });
});
