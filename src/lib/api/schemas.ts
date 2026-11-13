export * from "../contracts/requests";

export function rpcArgs(input: Record<string, unknown>): Record<string, unknown> {
  const snake = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(snake);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, ch => "_" + ch.toLowerCase()), snake(item)]),
    );
    return value;
  };
  return Object.fromEntries(Object.entries(snake(input) as Record<string, unknown>).map(([key, value]) => ["p_" + key, value]));
}
