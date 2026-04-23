/**
 * Multi-langues Rialto — Phase 11 C10.
 *
 * 4 langues supportées : fr (défaut), en, de, it.
 * Clés organisées en namespaces pour éviter les collisions.
 *
 * Note : le contenu des plats (menu_items.name, description) reste
 * en FR côté DB — il faudra un job de traduction à part pour DE/IT/EN.
 * Ici on couvre juste les chrome UI.
 */

export type Locale = "fr" | "en" | "de" | "it";

export const LOCALES: Locale[] = ["fr", "en", "de", "it"];

export const LOCALE_META: Record<Locale, { label: string; flag: string }> = {
  fr: { label: "Français", flag: "🇫🇷" },
  en: { label: "English", flag: "🇬🇧" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  it: { label: "Italiano", flag: "🇮🇹" },
};

type Dict = {
  common: {
    back: string;
    close: string;
    confirm: string;
    cancel: string;
    save: string;
    loading: string;
    error: string;
    from: string;
    to: string;
    delivery: string;
    pickup: string;
  };
  hero: {
    tagline: string;
    cta_order: string;
    cta_menu: string;
    subtitle: string;
  };
  nav: {
    menu: string;
    my_orders: string;
    rialto_club: string;
    referral: string;
    contact: string;
    login: string;
    logout: string;
  };
  menu: {
    title_categories: string;
    title_dishes: string;
    filter: string;
    search_placeholder: string;
    unavailable: string;
    out_of_stock: string;
    add_to_cart: string;
  };
  cart: {
    title: string;
    empty: string;
    subtotal: string;
    min_order_left: string;
    go_to_checkout: string;
    remove: string;
  };
  checkout: {
    title: string;
    pay_on_pickup: string;
    pay_on_delivery: string;
    place_order: string;
    promo_code: string;
    apply: string;
  };
  referral: {
    title: string;
    tagline: string;
    your_code: string;
    copy_link: string;
    share: string;
    copied: string;
    stats_pending: string;
    stats_rewarded: string;
    stats_total: string;
    have_code_title: string;
    have_code_description: string;
    use_button: string;
  };
};

const FR: Dict = {
  common: {
    back: "Retour",
    close: "Fermer",
    confirm: "Confirmer",
    cancel: "Annuler",
    save: "Enregistrer",
    loading: "Chargement…",
    error: "Erreur",
    from: "Dès",
    to: "à",
    delivery: "Livraison",
    pickup: "Retrait",
  },
  hero: {
    tagline: "Pizzeria italo-anatolienne · Lausanne",
    cta_order: "Commander",
    cta_menu: "Voir le menu",
    subtitle: "Pizzas Ø33 cm, pâtes faites maison, spécialités anatoliennes.",
  },
  nav: {
    menu: "Menu",
    my_orders: "Mes commandes",
    rialto_club: "Rialto Club",
    referral: "Parrainage",
    contact: "Contact",
    login: "Se connecter",
    logout: "Se déconnecter",
  },
  menu: {
    title_categories: "Catégories",
    title_dishes: "plats",
    filter: "Filtrer",
    search_placeholder: "Rechercher un plat…",
    unavailable: "Indisponible",
    out_of_stock: "Épuisé",
    add_to_cart: "Ajouter",
  },
  cart: {
    title: "Mon panier",
    empty: "Ton panier est vide. Ajoute des plats pour commencer.",
    subtotal: "Sous-total",
    min_order_left: "Encore {amount} pour atteindre le minimum",
    go_to_checkout: "Passer la commande",
    remove: "Supprimer",
  },
  checkout: {
    title: "Finaliser la commande",
    pay_on_pickup: "Paiement au retrait (espèces ou TWINT)",
    pay_on_delivery: "Paiement au livreur (espèces ou TWINT)",
    place_order: "Valider la commande",
    promo_code: "Code promo",
    apply: "Appliquer",
  },
  referral: {
    title: "Parrainage",
    tagline:
      "Offre une Pizza Marguerite à tes amis chez Rialto. Quand ils passent leur 1re commande, ils en reçoivent une et toi aussi.",
    your_code: "Ton code de parrainage",
    copy_link: "Copier le lien",
    share: "Partager",
    copied: "Copié !",
    stats_pending: "En cours",
    stats_rewarded: "Réussis",
    stats_total: "Total filleuls",
    have_code_title: "Tu as un code de parrainage ?",
    have_code_description:
      "Saisis-le et ta 1re pizza Marguerite est offerte (après ta 1re commande Rialto).",
    use_button: "Utiliser",
  },
};

const EN: Dict = {
  common: {
    back: "Back",
    close: "Close",
    confirm: "Confirm",
    cancel: "Cancel",
    save: "Save",
    loading: "Loading…",
    error: "Error",
    from: "From",
    to: "to",
    delivery: "Delivery",
    pickup: "Pickup",
  },
  hero: {
    tagline: "Italian-Anatolian pizzeria · Lausanne",
    cta_order: "Order now",
    cta_menu: "View menu",
    subtitle: "33 cm pizzas, homemade pasta, Anatolian specialties.",
  },
  nav: {
    menu: "Menu",
    my_orders: "My orders",
    rialto_club: "Rialto Club",
    referral: "Refer a friend",
    contact: "Contact",
    login: "Log in",
    logout: "Log out",
  },
  menu: {
    title_categories: "Categories",
    title_dishes: "dishes",
    filter: "Filter",
    search_placeholder: "Search a dish…",
    unavailable: "Unavailable",
    out_of_stock: "Sold out",
    add_to_cart: "Add",
  },
  cart: {
    title: "My cart",
    empty: "Your cart is empty. Add dishes to get started.",
    subtotal: "Subtotal",
    min_order_left: "{amount} more to reach the minimum",
    go_to_checkout: "Checkout",
    remove: "Remove",
  },
  checkout: {
    title: "Finalize order",
    pay_on_pickup: "Pay at pickup (cash or TWINT)",
    pay_on_delivery: "Pay the courier (cash or TWINT)",
    place_order: "Place order",
    promo_code: "Promo code",
    apply: "Apply",
  },
  referral: {
    title: "Refer a friend",
    tagline:
      "Give a free Margherita pizza to your friends at Rialto. When they place their first order, they receive one and so do you.",
    your_code: "Your referral code",
    copy_link: "Copy link",
    share: "Share",
    copied: "Copied!",
    stats_pending: "Pending",
    stats_rewarded: "Rewarded",
    stats_total: "Total friends",
    have_code_title: "Got a referral code?",
    have_code_description:
      "Enter it and your first Margherita is free (after your first Rialto order).",
    use_button: "Use",
  },
};

const DE: Dict = {
  common: {
    back: "Zurück",
    close: "Schließen",
    confirm: "Bestätigen",
    cancel: "Abbrechen",
    save: "Speichern",
    loading: "Lädt…",
    error: "Fehler",
    from: "Ab",
    to: "bis",
    delivery: "Lieferung",
    pickup: "Abholung",
  },
  hero: {
    tagline: "Italienisch-anatolische Pizzeria · Lausanne",
    cta_order: "Jetzt bestellen",
    cta_menu: "Menü ansehen",
    subtitle: "33 cm Pizzen, hausgemachte Pasta, anatolische Spezialitäten.",
  },
  nav: {
    menu: "Menü",
    my_orders: "Meine Bestellungen",
    rialto_club: "Rialto Club",
    referral: "Freunde werben",
    contact: "Kontakt",
    login: "Anmelden",
    logout: "Abmelden",
  },
  menu: {
    title_categories: "Kategorien",
    title_dishes: "Gerichte",
    filter: "Filtern",
    search_placeholder: "Gericht suchen…",
    unavailable: "Nicht verfügbar",
    out_of_stock: "Ausverkauft",
    add_to_cart: "Hinzufügen",
  },
  cart: {
    title: "Mein Warenkorb",
    empty: "Dein Warenkorb ist leer. Füge Gerichte hinzu, um zu beginnen.",
    subtotal: "Zwischensumme",
    min_order_left: "Noch {amount} für den Mindestbestellwert",
    go_to_checkout: "Zur Kasse",
    remove: "Entfernen",
  },
  checkout: {
    title: "Bestellung abschließen",
    pay_on_pickup: "Zahlung bei Abholung (Bargeld oder TWINT)",
    pay_on_delivery: "Zahlung beim Lieferfahrer (Bargeld oder TWINT)",
    place_order: "Bestellung aufgeben",
    promo_code: "Aktionscode",
    apply: "Anwenden",
  },
  referral: {
    title: "Freunde werben",
    tagline:
      "Schenke deinen Freunden eine Margherita bei Rialto. Nach ihrer ersten Bestellung bekommt ihr beide eine.",
    your_code: "Dein Empfehlungscode",
    copy_link: "Link kopieren",
    share: "Teilen",
    copied: "Kopiert!",
    stats_pending: "Offen",
    stats_rewarded: "Belohnt",
    stats_total: "Freunde insgesamt",
    have_code_title: "Hast du einen Empfehlungscode?",
    have_code_description:
      "Gib ihn ein, und deine erste Margherita ist gratis (nach deiner ersten Rialto-Bestellung).",
    use_button: "Einlösen",
  },
};

const IT: Dict = {
  common: {
    back: "Indietro",
    close: "Chiudi",
    confirm: "Conferma",
    cancel: "Annulla",
    save: "Salva",
    loading: "Caricamento…",
    error: "Errore",
    from: "Da",
    to: "a",
    delivery: "Consegna",
    pickup: "Ritiro",
  },
  hero: {
    tagline: "Pizzeria italo-anatolica · Losanna",
    cta_order: "Ordina",
    cta_menu: "Vedi il menù",
    subtitle: "Pizze Ø33 cm, pasta fatta in casa, specialità anatoliche.",
  },
  nav: {
    menu: "Menù",
    my_orders: "I miei ordini",
    rialto_club: "Rialto Club",
    referral: "Invita un amico",
    contact: "Contatto",
    login: "Accedi",
    logout: "Esci",
  },
  menu: {
    title_categories: "Categorie",
    title_dishes: "piatti",
    filter: "Filtra",
    search_placeholder: "Cerca un piatto…",
    unavailable: "Non disponibile",
    out_of_stock: "Esaurito",
    add_to_cart: "Aggiungi",
  },
  cart: {
    title: "Il mio carrello",
    empty: "Il tuo carrello è vuoto. Aggiungi dei piatti per iniziare.",
    subtotal: "Subtotale",
    min_order_left: "Mancano {amount} per raggiungere il minimo",
    go_to_checkout: "Vai alla cassa",
    remove: "Rimuovi",
  },
  checkout: {
    title: "Finalizza l'ordine",
    pay_on_pickup: "Paga al ritiro (contanti o TWINT)",
    pay_on_delivery: "Paga il corriere (contanti o TWINT)",
    place_order: "Conferma l'ordine",
    promo_code: "Codice promo",
    apply: "Applica",
  },
  referral: {
    title: "Invita un amico",
    tagline:
      "Offri una Margherita ai tuoi amici da Rialto. Al loro primo ordine, ne ricevono una e anche tu.",
    your_code: "Il tuo codice di invito",
    copy_link: "Copia link",
    share: "Condividi",
    copied: "Copiato!",
    stats_pending: "In corso",
    stats_rewarded: "Ricompensati",
    stats_total: "Totale amici",
    have_code_title: "Hai un codice di invito?",
    have_code_description:
      "Inseriscilo e la tua prima Margherita è gratis (dopo il primo ordine Rialto).",
    use_button: "Usa",
  },
};

export const DICTIONARIES: Record<Locale, Dict> = {
  fr: FR,
  en: EN,
  de: DE,
  it: IT,
};

/**
 * Type helper pour accéder aux clés en dot-notation.
 */
export type DictKeyPath =
  | `common.${keyof Dict["common"]}`
  | `hero.${keyof Dict["hero"]}`
  | `nav.${keyof Dict["nav"]}`
  | `menu.${keyof Dict["menu"]}`
  | `cart.${keyof Dict["cart"]}`
  | `checkout.${keyof Dict["checkout"]}`
  | `referral.${keyof Dict["referral"]}`;

export function resolveKey(locale: Locale, key: DictKeyPath): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.fr;
  const [ns, k] = key.split(".") as [keyof Dict, string];
  const bucket = dict[ns] as unknown as Record<string, string>;
  return bucket?.[k] ?? DICTIONARIES.fr[ns][k as keyof (typeof DICTIONARIES.fr)[typeof ns]] ?? key;
}
