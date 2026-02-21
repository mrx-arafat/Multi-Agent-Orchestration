/** Shared MCP response helpers and query-string builder. */

export function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

/** Build a query string from an object, skipping undefined values. */
export function buildQs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    (kv): kv is [string, string | number | boolean] => kv[1] !== undefined,
  );
  if (entries.length === 0) return '';
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return `?${qs}`;
}
