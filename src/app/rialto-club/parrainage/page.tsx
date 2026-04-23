import { Suspense } from "react";
import ParrainageClient from "./ParrainageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parrainage · Rialto Club",
  description:
    "Parraine tes amis chez Rialto. Une pizza Marguerite offerte pour toi et pour lui après sa première commande.",
};

export default function ParrainagePage() {
  return (
    <Suspense fallback={null}>
      <ParrainageClient />
    </Suspense>
  );
}
