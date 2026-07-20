-- ============================================================================
-- D5b — Table push_logs (journal des cascades push du dashboard)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse.
--
-- Le code dashboard TOLÈRE l'absence de cette table : l'envoi push
-- fonctionne quand même, le journal tombe en console.log avec un
-- avertissement visible à l'écran (« journal indisponible »).
-- ============================================================================

CREATE TABLE public.push_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  recipients_total integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  deactivated_count integer NOT NULL DEFAULT 0,
  sent_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_logs FROM anon, authenticated;

-- ============================================================================
-- EXPLICATION (pour la review) :
--
-- CREATE TABLE push_logs      → journal append-only des envois de
--                               notifications depuis le dashboard :
--                               1 ligne = 1 cascade (calqué sur sms_logs,
--                               en agrégé plutôt que par destinataire —
--                               les destinataires individuels n'apportent
--                               rien et multiplieraient les PII).
-- restaurant_id FK CASCADE    → même pattern que le reste du schéma.
-- title / body / url          → le contenu exact envoyé (traçabilité de
--                               ce que les clients ont reçu).
-- recipients_total/sent/      → compteurs du résultat : destinataires
--   failed/deactivated_count    visés, envois OK, échecs, abonnements
--                               morts désactivés (404/410 web-push).
-- sent_by                     → 'dashboard' (convention texte libre
--                               comme order_status_history.changed_by).
-- RLS + REVOKE                → deny-all pur, service_role uniquement —
--                               pattern D2 amendé (RLS sans policy +
--                               REVOKE défense en profondeur).
--
-- Realtime : PAS publiée. Impact caisse : zéro. Impact site client : zéro.
--
-- ROLLBACK : DROP TABLE public.push_logs;
-- ============================================================================
