import { headers } from "next/headers";

/** Best-effort site origin for building absolute links (invite emails/links). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL ?? h.get("origin") ?? "http://localhost:3000";
}
