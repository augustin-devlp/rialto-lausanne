"use client";

/**
 * Hook useRialtoMember — auto-login léger côté client.
 *
 * Lit la session customer stockée en localStorage (cle
 * rialto_customer_id / short_code / phone / first_name) puis rafraîchit
 * les données contre le backend via GET /api/loyalty-cards/lookup pour
 * :
 *   - Valider que la carte existe toujours (sinon clear la session)
 *   - Récupérer le nombre de tampons à jour (source de vérité serveur)
 *
 * Expose { member, loading, refresh, logout } pour être consommé
 * depuis le HamburgerMenu, les pages Rialto Club, /confirmation, etc.
 */

import { useCallback, useEffect, useState } from "react";
import {
  clearCustomerSession,
  readCustomerSession,
  writeCustomerSession,
  type CustomerSession,
} from "./customerSession";
import { STAMPIFY_BASE } from "./stampifyConfig";

export type RialtoMember = CustomerSession & {
  current_stamps: number;
  stamps_required: number;
  reward_description: string;
  card_id: string;
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "member"; member: RialtoMember }
  | { status: "error"; message: string };

export function useRialtoMember() {
  const [state, setState] = useState<State>({ status: "idle" });

  const refresh = useCallback(async () => {
    const session = readCustomerSession();
    if (!session) {
      setState({ status: "anonymous" });
      return;
    }

    setState({ status: "loading" });

    try {
      const url = new URL(`${STAMPIFY_BASE}/api/loyalty-cards/lookup`);
      url.searchParams.set("short_code", session.short_code);
      const res = await fetch(url.toString(), { cache: "no-store" });

      if (res.status === 404) {
        // La carte n'existe plus côté serveur → clear la session
        clearCustomerSession();
        setState({ status: "anonymous" });
        return;
      }
      if (!res.ok) {
        setState({
          status: "error",
          message: `HTTP ${res.status}`,
        });
        return;
      }

      const body = (await res.json()) as {
        card?: {
          id: string;
          short_code: string;
          current_stamps: number;
          stamps_required: number;
          reward_description: string;
          first_name: string;
        };
      };
      if (!body.card) {
        clearCustomerSession();
        setState({ status: "anonymous" });
        return;
      }

      const member: RialtoMember = {
        customer_id: session.customer_id,
        phone: session.phone,
        first_name: body.card.first_name || session.first_name,
        short_code: body.card.short_code,
        card_id: body.card.id,
        current_stamps: body.card.current_stamps,
        stamps_required: body.card.stamps_required,
        reward_description: body.card.reward_description,
      };

      // Re-sync la session avec les données fraîches (first_name peut avoir
      // changé si Mehmet corrige en caisse)
      writeCustomerSession({
        customer_id: member.customer_id,
        short_code: member.short_code,
        phone: member.phone,
        first_name: member.first_name,
      });

      setState({ status: "member", member });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Erreur réseau",
      });
    }
  }, []);

  const logout = useCallback(() => {
    clearCustomerSession();
    setState({ status: "anonymous" });
  }, []);

  // Mount + écoute les events de session (ex: création depuis /confirmation)
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("rialto:session-updated", onChange);
    return () => window.removeEventListener("rialto:session-updated", onChange);
  }, [refresh]);

  return { state, refresh, logout };
}
