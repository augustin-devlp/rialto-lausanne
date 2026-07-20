-- ============================================================================
-- D2 — Table lottery_draws (historique + anti-double-tirage mensuel)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse.
--          AUCUNE exécution sans retour d'Augustin.
--
-- Le code dashboard (routes /api/dashboard/lottery/*) est déployé et TOLÈRE
-- l'absence de cette table : il répond « migration en attente » (erreur
-- visible, jamais silencieuse) tant qu'elle n'existe pas.
-- ============================================================================

CREATE TABLE public.lottery_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_id uuid NOT NULL REFERENCES public.lotteries(id) ON DELETE CASCADE,
  month date NOT NULL,
  winner_entry_id uuid NOT NULL REFERENCES public.lottery_entries(id),
  drawn_at timestamptz NOT NULL DEFAULT now(),
  drawn_by text,
  UNIQUE (lottery_id, month)
);

ALTER TABLE public.lottery_draws ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- EXPLICATION LIGNE PAR LIGNE (pour la review caisse) :
--
-- CREATE TABLE lottery_draws     → journal des tirages : 1 ligne = 1 tirage
--                                  mensuel effectué (il n'existait AUCUN
--                                  historique possible — l'état "tirée"
--                                  vivait uniquement dans lotteries.draw_date,
--                                  donc au plus 1 tirage visible).
-- lottery_id FK CASCADE          → même pattern que lottery_entries ; si une
--                                  loterie est supprimée, ses tirages suivent.
-- month date NOT NULL            → 1er jour du mois du tirage, calculé côté
--                                  serveur en Europe/Zurich (PAS UTC — évite
--                                  le décalage des soirées de fin de mois).
-- winner_entry_id FK             → pointe le ticket gagnant dans
--                                  lottery_entries (pas de CASCADE : un
--                                  tirage historique ne doit pas disparaître
--                                  si on purge des tickets ; la FK bloque la
--                                  suppression du ticket gagnant — voulu).
-- drawn_at / drawn_by            → horodatage + auteur ('dashboard'),
--                                  même convention texte libre que
--                                  order_status_history.changed_by.
-- UNIQUE (lottery_id, month)     → L'ANTI-DOUBLE-TIRAGE : garanti par la
--                                  base, pas par le code. Deux clics
--                                  simultanés → le 2e INSERT échoue en 23505.
-- ENABLE ROW LEVEL SECURITY      → RLS activée SANS aucune policy =
--                                  deny-all pour anon/authenticated.
--                                  Seul le service_role (routes dashboard
--                                  server-side) y accède. Aucun impact
--                                  caisse (elle ne touche pas cette table),
--                                  aucun impact site client (idem).
--                                  Pattern aligné sur le durcissement 002.
--
-- Realtime : PAS publiée (aucun besoin temps réel sur les tirages).
--
-- ROLLBACK : DROP TABLE public.lottery_draws;
--            (sans danger tant qu'on accepte de perdre l'historique des
--             tirages ; les lottery_entries gagnantes, claim_tokens et
--             claimed_at restent intacts — l'UI client ne lit pas draws.)
-- ============================================================================
