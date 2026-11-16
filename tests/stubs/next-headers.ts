// Test stand-in for next/headers, which needs a Next request context.
export const headers = async () => new Headers();
export const cookies = async () => new Map<string, string>();
