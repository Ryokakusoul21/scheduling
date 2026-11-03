import { describe, expect, it } from "vitest";
import { describeDevice, describeLocation } from "@/lib/auth/device";
import { formatWhen, timeAgo } from "@/lib/format/when";
import { smallAvatarUrl } from "@/lib/avatar/url";

describe("describeDevice", () => {
  it("names browser and system, treating Edge as Edge rather than Chrome", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Safari/604")).toBe("Safari on iOS");
    expect(describeDevice(null)).toBe("Unknown device");
  });
  it("only names local addresses", () => {
    expect(describeLocation("192.168.1.5")).toBe("Local network");
    expect(describeLocation("203.0.113.9")).toBe("203.0.113.9");
  });
});

describe("time formatting", () => {
  const now = new Date("2026-11-03T04:20:00Z");
  it("uses Today and Yesterday in school time", () => {
    expect(formatWhen(new Date("2026-11-03T04:20:00Z"), now)).toBe("Today at 12:20 PM");
    expect(formatWhen(new Date("2026-11-02T04:20:00Z"), now)).toBe("Yesterday at 12:20 PM");
  });
  it("gives relative times", () => {
    expect(timeAgo(new Date("2026-11-03T04:19:40Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-11-03T02:20:00Z"), now)).toBe("2 hours ago");
  });
});

describe("smallAvatarUrl", () => {
  it("points at the 64px copy", () => {
    expect(smallAvatarUrl("/api/avatars/abc-0123456789abcdef.webp")).toBe("/api/avatars/abc-0123456789abcdef-64.webp");
    expect(smallAvatarUrl(null)).toBeNull();
  });
});
