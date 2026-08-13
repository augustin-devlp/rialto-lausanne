# Dossier bascule domaine — décision week-end 15-16.08, Mehmet lundi 17.08

> Préparé le 13.08 au soir (lot G). Objectif : chauffe pixel sur le
> domaine FINAL au moins une semaine avant le 01.09, gel le 25.08.

## ⚠️ LA DÉCOUVERTE QUI CHANGE LE DOSSIER

**`rialto-lausanne.ch` existe déjà — et il appartient à l'écosystème
Just Eat.** Constats techniques du 13.08 :

- Zone DNS administrée par `nsadmin.takeaway.com` (SOA, serial 2019 —
  configuré à l'époque du contrat Just Eat de Mehmet).
- Résout vers des IP AWS Just Eat (52.48.64.111 / 54.171.90.223).
- Sert une page « Rialto — Commander un repas en ligne à Lausanne »
  marquée just-eat/takeaway : **la plateforme capte le trafic direct
  « rialto lausanne » vers son entonnoir commissionné, sur le nom du
  restaurant.**

C'est exactement la pratique que le pitch Servato dénonce — et un
argument commercial en or pour lundi : « Just Eat possède même votre nom
de domaine. »

## Les trois options

| Option | Délai | Verdict |
|---|---|---|
| **A. Récupérer `rialto-lausanne.ch`** auprès de Just Eat | Semaines à mois (support, voire clause contractuelle / droit au nom art. 29 CC) | À LANCER lundi, mais incompatible avec le calendrier de chauffe |
| **B. Domaine alternatif immédiat** | 24-48 h tout compris | Compatible chauffe + gel |
| **C. Les deux** (B maintenant, A en parallèle, redirect plus tard) | — | **RECOMMANDÉE** |

Alternatives sondées le 13.08 (aucune zone DNS — à confirmer au
registrar avant achat) : `rialto-pizzeria.ch`, `pizzeria-rialto.ch`,
`rialtolausanne.ch`, `rialto-lausanne.com`. Achat ~10-15 CHF/an
(Infomaniak recommandé pour du .ch).

**Le CHOIX du nom se fait avec Mehmet lundi — c'est sa marque** (décision
Augustin 14.08). Vérification de disponibilité EN SÉANCE, achat dans la
foulée :
- `.ch` : https://www.nic.ch/whois/ (registre SWITCH, vérité officielle)
  puis achat immédiat sur https://www.infomaniak.com/fr/domaines
  (la recherche Infomaniak vérifie aussi la dispo en direct).
- `.com` : la même recherche Infomaniak fait foi.
- Prévoir 10 minutes en séance : recherche → panier → paiement — le
  domaine est actif en quelques minutes, les DNS se posent dans la
  même session.

**⚠️ TITULAIRE = MEHMET, pas Servato** (décision Augustin 14.08) :
cohérence totale avec « tout vous appartient », et un titulaire
restaurateur RENFORCE le dossier de rétrocession Just Eat (le nom
appartient à l'exploitant, pas à un prestataire — l'argument vaut dans
les deux sens). En pratique : compte registrar au nom de Mehmet (créé en
séance si besoin), Augustin en contact technique/facturation si Mehmet
le souhaite.

## Ce qu'il faut de Mehmet lundi

1. **Contrat Just Eat** : le domaine y figure-t-il ? Clause de
   restitution à la résiliation ? Le titulaire whois exact se vérifie sur
   https://www.nic.ch/whois/ (SWITCH) — si Mehmet est titulaire et
   Just Eat seulement contact technique, un transfert (code d'auth)
   suffit ; si Takeaway.com est titulaire → demande de rétrocession
   écrite (garder trace).
2. **Fiche Google Business Profile** : c'est LE levier immédiat — le
   lien « Commander » de la fiche appartient à Mehmet, pas à Just Eat.
   Au jour J il pointe le nouveau domaine : l'intent direct « rialto
   lausanne » atterrit chez nous même si Just Eat garde le .ch un temps.
3. **Validation du domaine alternatif** retenu.

## Runbook technique de la bascule (une fois le domaine en main)

1. **Registrar** : acheter le domaine, baisser le TTL, pointer selon
   Vercel (`A 76.76.21.21` apex + `CNAME cname.vercel-dns.com` www — les
   valeurs exactes sont affichées par Vercel à l'ajout).
2. **Vercel** : Project → Domains → ajouter le domaine, le définir
   PRIMARY, activer la redirection 308 du `.vercel.app` vers le domaine
   (les anciens liens SMS/emails avec vercel.app continuent de marcher).
3. **Env** : `NEXT_PUBLIC_SITE_URL=https://<domaine>` + redeploy —
   propage emails (trackUrl), liens de partage, fallback attribution.
4. **Meta** : Events Manager → vérifier le NOUVEAU domaine (TXT DNS ou
   meta-tag). ⚠️ La chauffe est portée par le PIXEL (4342956045928440),
   pas par le domaine : l'historique d'événements SURVIT à la bascule.
   Mais basculer AVANT d'intensifier la chauffe, pour que l'historique
   récent porte le hostname final (cadrage initial : « pixel chaud sur
   le domaine final »).
5. **GA4** : modifier l'URL du flux (cosmétique, `G-TNJS7GWYG0`
   inchangé).
6. **Effets d'origine** (pré-launch = zéro impact réel) : localStorage
   NON transféré (paniers/adresses/sessions/consentements de TEST
   perdus — re-consentement propre), PWA installées à réinstaller depuis
   le nouveau domaine (celle d'Augustin), service worker ré-enregistré
   automatiquement.
7. **Base/Supabase, Brevo, crons** : rien — indépendants du domaine.
8. **QA finale** (lot G) : rejouer la matrice complète SUR le domaine
   final (consentement, funnel, purchase, ETA, statuts) — c'est la vraie
   QA de gel.

## Calendrier recommandé

- **Lundi 17.08** : décision domaine avec Mehmet + achat + DNS + demande
  de rétrocession Just Eat lancée en parallèle.
- **Mardi 18.08** : bascule Vercel + env + vérif Meta + QA matrice sur
  domaine final.
- **18-25.08** : chauffe pixel sur le domaine final (~2 semaines avant
  le 01.09), gel le 25.08.
- **Jour J (01.09) — étape 9 du runbook, à part entière** : Mehmet (ou
  Augustin avec son accès) met à jour la fiche Google Business Profile —
  le lien « Commander » ET le champ site web pointent le nouveau
  domaine. C'est le geste qui détourne l'intent direct « rialto
  lausanne » du domaine squatté par Just Eat vers le site sans
  commission : à faire le jour J, pas avant (la fiche est l'artère du
  trafic réel, on ne la bascule que sur un site ouvert).
