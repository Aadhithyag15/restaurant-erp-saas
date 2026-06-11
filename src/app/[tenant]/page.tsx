import { redirect } from "next/navigation";

export default async function TenantIndexPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/${tenant}/dashboard`);
}
