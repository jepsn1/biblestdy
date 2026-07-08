import type { HealthStatus } from "@biblestdy/shared";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "biblestdy" },
    { name: "description", content: "Bible study that compounds" },
  ];
}

export async function clientLoader(): Promise<HealthStatus> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`API unreachable (${res.status})`);
  return res.json();
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">biblestdy</h1>
        <p className="mt-2 text-sm text-gray-500">
          api: {loaderData.service} — {loaderData.status}
        </p>
      </div>
    </main>
  );
}
