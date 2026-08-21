# « Jamais de publicité » — où la promesse doit vivre

**22.08.2026** · Décision d'Augustin : la phrase revient dans le libellé du
checkout. Ce document répond à sa question — *si cette promesse est
juridiquement load-bearing, où doit-elle AUSSI être écrite ?*

*Rédigé, non appliqué aux pages juridiques : tu as dit « je le fais
mettre ». Les textes ci-dessous sont prêts à coller.*

---

## Ce qui est vrai aujourd'hui, et c'est vérifié

La promesse n'est pas un vœu : elle est tenue par l'architecture.

- `sendEmail` (`src/lib/brevo.ts`) est la **seule** fonction d'envoi
  d'e-mail du dépôt.
- Elle a **exactement un appelant** : le reçu de commande, dans
  `src/app/api/orders/route.ts`.
- Aucune fonction de campagne, de newsletter ou d'envoi groupé n'existe.
- Le marketing passe par le **SMS** (`src/lib/smsTemplates.ts`), canaux
  séparés depuis le 21.07.2026.

🔴 **Corollaire à graver** : le jour où un envoi marketing par e-mail est
branché, la phrase du checkout **et** le texte de la politique de
confidentialité tombent dans le MÊME commit. Une promesse tenue par une
absence de code se perd le jour où le code arrive.

---

## 🔴 Le trou qui compte, et ce n'est pas celui qu'on croit

**`src/app/privacy/page.tsx`, section « Données collectées », n'énumère
PAS l'adresse e-mail.** La liste dit : nom et prénom, téléphone, adresse
de livraison, instructions livreur, contenu et montant.

C'était déjà incomplet quand l'e-mail était facultatif. Depuis le 21.08 il
est **obligatoire à chaque commande** — donc collecté systématiquement, et
toujours absent de la liste.

On ne peut pas promettre quelque chose sur une donnée dont on ne déclare
pas la collecte. **C'est ce trou-là qu'il faut fermer en premier**, avant
même d'ajouter la promesse.

---

## Les trois textes, prêts à coller

### 1. `privacy` → « Données collectées » — AJOUTER une puce

> - Adresse email

À placer juste après « Numéro de téléphone ».

### 2. `privacy` → « Utilisation des données » — REMPLACER une puce

Le texte actuel dit :

> Vous envoyer le reçu de votre commande par email **(si vous avez indiqué
> une adresse)** et des SMS liés à votre fidélité (carte créée, récompense,
> gains)

⚠️ **« si vous avez indiqué une adresse » est devenu FAUX** le 21.08 :
l'adresse est exigée pour commander. Remplacer par :

> - Vous envoyer le reçu de votre commande par email. **Votre adresse email
>   ne sert qu'à ça : nous ne vous envoyons aucune publicité par email.**
> - Vous envoyer par SMS les messages liés à votre fidélité (carte créée,
>   récompense, gains) et, ponctuellement, des offres que vous pouvez
>   refuser à tout moment.

Ce découpage dit la chose importante : **la publicité passe par le SMS, et
seulement par le SMS.** C'est ce qui rend « jamais de publicité » vrai sur
l'e-mail sans mentir sur le reste.

### 3. `cgv` → une phrase dans les conditions de commande

Les CGV ne mentionnent **pas du tout** l'e-mail aujourd'hui. Or il est
devenu une condition pour commander — c'est contractuel, pas cosmétique :

> Une adresse email valide est nécessaire pour passer commande : elle sert
> à vous envoyer le reçu et le suivi de votre commande.

---

## Ce que je n'ai pas fait, et pourquoi

Je n'ai modifié **aucune** page juridique. Tu as dit « je le fais mettre »,
et un texte juridique est une décision, pas une refactorisation.

⚠️ **Mais la phrase « si vous avez indiqué une adresse » est fausse EN
PRODUCTION en ce moment**, et c'est ma modification du 21.08 qui l'a rendue
fausse. Si tu veux que je la corrige tout de suite, c'est une ligne.
