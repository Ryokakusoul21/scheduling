// Test stand-in for next/cache, which needs a Next request context.
export const revalidatePath = () => {};
export const revalidateTag = () => {};
export const unstable_cache = <T extends (...args: never[]) => unknown>(fn: T) => fn;
