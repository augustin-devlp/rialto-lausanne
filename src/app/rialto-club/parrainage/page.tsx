import { Suspense } from "react";
import ParrainageClient from "./ParrainageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parrainage · Rialto Club",
  description:
    "Parrainez vos amis chez Rialto. Une pizza Marguerite offerte pour vous et pour lui après sa première commande.",
};

export default function ParrainagePage() {
  return (
    <Suspense fallback={null}>
      <ParrainageClient />
    </Suspense>
  );
}
