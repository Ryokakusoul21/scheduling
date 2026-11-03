/** "Chrome on Windows" from a User-Agent string; order matters because Edge and Opera also say Chrome. */
export function describeDevice(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser = ([
    [/Edg\//, "Edge"],
    [/OPR\/|Opera/, "Opera"],
    [/Firefox\//, "Firefox"],
    [/Chrome\/|CriOS\//, "Chrome"],
    [/Safari\//, "Safari"],
  ] as [RegExp, string][]).find(([re]) => re.test(ua))?.[1];
  const os = ([
    [/Windows/, "Windows"],
    [/iPhone|iPad|iOS/, "iOS"],
    [/Android/, "Android"],
    [/Mac OS X|Macintosh/, "macOS"],
    [/CrOS/, "ChromeOS"],
    [/Linux/, "Linux"],
  ] as [RegExp, string][]).find(([re]) => re.test(ua))?.[1];
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/** Approximate location without a geolocation service: only private and local addresses can be named. */
export function describeLocation(ip: string | null) {
  if (!ip || ip === "unknown") return "Unknown location";
  if (/^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/i.test(ip)) return "Local network";
  return ip;
}
