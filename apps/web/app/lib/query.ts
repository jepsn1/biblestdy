import { QueryClient } from "@tanstack/react-query";

/** App-wide query client. Annotation data is per-user and only mutated from
 * this device, so a modest staleTime saves refetches when flipping between
 * chapters; mutations keep the cache correct via setQueryData. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Fetch JSON with session cookies; throws on non-2xx. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}
