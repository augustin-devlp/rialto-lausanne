import CommandeDetailClient from "./CommandeDetailClient";

export const dynamic = "force-dynamic";

export default function DashboardCommandeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <CommandeDetailClient orderId={params.id} />;
}
