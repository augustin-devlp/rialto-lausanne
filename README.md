# Rialto Lausanne — Click & Collect

Site de commande en ligne pour la pizzeria/brasserie Rialto (Av. de Béthusy 29, 1012 Lausanne).

- 100% click & collect (aucune livraison)
- Paiement en magasin (cash ou TWINT)
- Les commandes arrivent en temps réel dans le dashboard Stampify.

## Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- Supabase (Postgres + Realtime) — projet partagé avec Stampify
- Brevo (SMS transactionnels)

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplir les variables
npm run dev
```

## Variables d'environnement

Voir `.env.example`. En production (Vercel) :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BREVO_API_KEY`
- `NEXT_PUBLIC_RESTAURANT_ID` (UUID Rialto)
- `NEXT_PUBLIC_SITE_URL`

## Architecture

| Route | Rôle |
|-------|------|
| `/` | Menu + panier + checkout |
| `/order/[id]` | Suivi de commande en temps réel |
| `POST /api/orders` | Créer une commande |
| `GET /api/orders/[id]` | Récupérer une commande |
