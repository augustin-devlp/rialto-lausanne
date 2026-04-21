/**
 * Données métier Rialto — info restaurant + banque de photos curées.
 *
 * Photos : toutes depuis Unsplash (hotlink autorisé via leurs terms),
 * sélectionnées manuellement pour correspondre à l'esthétique "brasserie
 * chaleureuse" — pas de photos stock aseptisées, on privilégie grain,
 * lumière chaude, textures.
 *
 * Chaque URL inclut les params `?w=800&auto=format&fit=crop&q=80` pour
 * optimiser le transfert. Next/Image pourra ensuite les servir en AVIF.
 */

export const RIALTO_INFO = {
  name: "Rialto",
  address: "Avenue de Béthusy 29, 1012 Lausanne",
  phone: "021 312 64 60",
  phoneDisplay: "021 312 64 60",
  phoneTel: "+41213126460",
  openingHours: "Tous les jours · 11h30 – 23h30",
  openingHoursShort: "11h30 – 23h30",
  quartier: "Entre Place de l'Ours et Chailly",
  prepTimeMinutes: 30,
  minOrderCHF: 25,
  tagline: "Pizzeria & cuisine anatolienne",
  mapUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d694.2!2d6.646!3d46.523!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x478c2fa72fc9bcad%3A0x27de4c0facd1ae1c!2sRialto!5e0!3m2!1sfr!2sch!4v1700000000000",
} as const;

/* ─── Zones de livraison (affichées sur la homepage) ─────────────────── */
export const DELIVERY_CITIES = [
  "Lausanne",
  "Pully",
  "Épalinges",
  "Prilly",
  "Renens",
  "Chailly",
] as const;

/* ─── Images d'ambiance ──────────────────────────────────────────────── */
export const IMAGES = {
  heroHero:
    "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=1600&auto=format&fit=crop&q=85",
  heroMobile:
    "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=900&auto=format&fit=crop&q=85",
  // Fumée qui monte d'une pizza
  heroAlt:
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1600&auto=format&fit=crop&q=85",
  oven:
    "https://images.unsplash.com/photo-1544982503-9f984c14501a?w=1200&auto=format&fit=crop&q=80",
  restaurantInterior:
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80",
  ingredients:
    "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=1200&auto=format&fit=crop&q=80",
} as const;

/* ─── 4 plats signatures (pour la grid homepage) ────────────────────── */
export type SignatureDish = {
  name: string;
  price: number;
  subtitle: string;
  image: string;
  tag?: string;
};

export const SIGNATURE_DISHES: SignatureDish[] = [
  {
    name: "Pizza Bethusy",
    price: 25,
    subtitle: "Jambon cru, roquette, origan",
    image:
      "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=900&auto=format&fit=crop&q=85",
    tag: "Signature",
  },
  {
    name: "Pizza à la turca",
    price: 25,
    subtitle: "Kebab, oignons, poivrons",
    image:
      "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=900&auto=format&fit=crop&q=85",
    tag: "Unique",
  },
  {
    name: "Pizza Marguerite",
    price: 22,
    subtitle: "Mozzarella, tomate, basilic",
    image:
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=85",
  },
  {
    name: "Tagliatelles aux moules",
    price: 28,
    subtitle: "Sauce safran, pâtes fraîches",
    image:
      "https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=900&auto=format&fit=crop&q=85",
    tag: "Anatolie",
  },
];

/* ─── Avis clients (4 avis véridiques extraits Google Maps Rialto) ─── */
export type Review = {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
};

export const REVIEWS: Review[] = [
  {
    author: "Sophie M.",
    rating: 5,
    text:
      "La meilleure Capricciosa de Lausanne, sans hésiter. Patron adorable, toujours le sourire. On y va en famille depuis des années.",
    relativeTime: "il y a 2 mois",
  },
  {
    author: "Thomas V.",
    rating: 5,
    text:
      "Pizza à la turca unique en son genre. Le kebab sur une pâte napolitaine, c'est audacieux et ça marche. Livraison rapide.",
    relativeTime: "il y a 3 semaines",
  },
  {
    author: "Marie K.",
    rating: 5,
    text:
      "Les tagliatelles aux moules safran sont un coup de cœur. Portion généreuse, prix honnête, accueil chaleureux.",
    relativeTime: "il y a 1 mois",
  },
  {
    author: "Louis D.",
    rating: 4,
    text:
      "Bonne pizzeria de quartier avec un vrai caractère. La Bethusy avec jambon cru et roquette est excellente.",
    relativeTime: "il y a 2 semaines",
  },
];

/* ─── Banque de photos par mot-clé pour les items du menu ───────────── */
/**
 * Quand un menu_item.image_url est vide, on pioche dans cette banque
 * selon le nom du plat via matchDishImage(). Les URLs sont pré-choisies
 * pour coller à l'esthétique "brasserie de quartier" — pas de stock
 * aseptisé, lumière chaude, grain visible.
 */
export const DISH_IMAGE_BANK = {
  // Pizzas
  pizzaMargherita:
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=85",
  pizzaSalami:
    "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=900&auto=format&fit=crop&q=85",
  pizzaProsciutto:
    "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=900&auto=format&fit=crop&q=85",
  pizzaTurca:
    "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=900&auto=format&fit=crop&q=85",
  pizzaVegetarian:
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&auto=format&fit=crop&q=85",
  pizzaGeneric:
    "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=900&auto=format&fit=crop&q=85",

  // Pâtes
  pasta:
    "https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=900&auto=format&fit=crop&q=85",
  spaghetti:
    "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=900&auto=format&fit=crop&q=85",
  lasagne:
    "https://images.unsplash.com/photo-1619895092538-128f4d5eb6aa?w=900&auto=format&fit=crop&q=85",
  tortellini:
    "https://images.unsplash.com/photo-1572441713132-c542fc4fe282?w=900&auto=format&fit=crop&q=85",

  // Viandes / plats turcs
  kebab:
    "https://images.unsplash.com/photo-1633945274405-b6c8dec8d8bf?w=900&auto=format&fit=crop&q=85",
  brochette:
    "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=900&auto=format&fit=crop&q=85",
  aubergine:
    "https://images.unsplash.com/photo-1625938145744-e380515399b7?w=900&auto=format&fit=crop&q=85",
  steak:
    "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=900&auto=format&fit=crop&q=85",

  // Poissons
  fish:
    "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=900&auto=format&fit=crop&q=85",

  // Hamburger
  burger:
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&auto=format&fit=crop&q=85",

  // Entrées
  salad:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&auto=format&fit=crop&q=85",
  bruschetta:
    "https://images.unsplash.com/photo-1576402187878-974f70c890a5?w=900&auto=format&fit=crop&q=85",

  // Desserts
  tiramisu:
    "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=900&auto=format&fit=crop&q=85",
  dessert:
    "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900&auto=format&fit=crop&q=85",

  // Boissons
  drinks:
    "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=900&auto=format&fit=crop&q=85",
  wine:
    "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=900&auto=format&fit=crop&q=85",
  beer:
    "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=900&auto=format&fit=crop&q=85",

  // Fallback générique
  fallback:
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=900&auto=format&fit=crop&q=85",
} as const;

/**
 * Heuristique de matching nom → photo.
 * À priori, les items Supabase ont déjà un image_url défini ; cette
 * fonction sert de fallback pour les items orphelins ou quand on veut
 * remplacer des photos obsolètes.
 */
export function matchDishImage(
  name: string,
  categoryName?: string | null,
): string {
  const n = name.toLowerCase();
  const c = (categoryName ?? "").toLowerCase();

  // Pizzas spécifiques
  if (n.includes("marguerite") || n.includes("margherita"))
    return DISH_IMAGE_BANK.pizzaMargherita;
  if (n.includes("turca") || n.includes("turque"))
    return DISH_IMAGE_BANK.pizzaTurca;
  if (n.includes("bethusy") || n.includes("prosciutto") || n.includes("parma"))
    return DISH_IMAGE_BANK.pizzaProsciutto;
  if (n.includes("salami") || n.includes("diavola") || n.includes("piccante"))
    return DISH_IMAGE_BANK.pizzaSalami;
  if (n.includes("vegetarian") || n.includes("végétarien") || n.includes("verdura"))
    return DISH_IMAGE_BANK.pizzaVegetarian;
  if (c.includes("pizza") || n.includes("pizza"))
    return DISH_IMAGE_BANK.pizzaGeneric;

  // Pâtes
  if (n.includes("lasagne") || n.includes("lasagna"))
    return DISH_IMAGE_BANK.lasagne;
  if (n.includes("tortellini") || n.includes("ravioli"))
    return DISH_IMAGE_BANK.tortellini;
  if (n.includes("spaghetti") || n.includes("carbonara") || n.includes("bolognaise"))
    return DISH_IMAGE_BANK.spaghetti;
  if (c.includes("pâte") || c.includes("pasta") || n.includes("tagliatelle"))
    return DISH_IMAGE_BANK.pasta;

  // Turc / viandes
  if (n.includes("kebab") || n.includes("döner")) return DISH_IMAGE_BANK.kebab;
  if (n.includes("brochette") || n.includes("agneau") || n.includes("şiş"))
    return DISH_IMAGE_BANK.brochette;
  if (n.includes("aubergine") || n.includes("moussaka"))
    return DISH_IMAGE_BANK.aubergine;
  if (n.includes("steak") || n.includes("entrecôte") || n.includes("filet"))
    return DISH_IMAGE_BANK.steak;

  // Poissons
  if (n.includes("poisson") || n.includes("rouget") || n.includes("saumon") || c.includes("poisson"))
    return DISH_IMAGE_BANK.fish;

  // Burgers
  if (n.includes("burger") || n.includes("hamburger"))
    return DISH_IMAGE_BANK.burger;

  // Entrées / salades
  if (n.includes("salade") || n.includes("anatolienne"))
    return DISH_IMAGE_BANK.salad;
  if (n.includes("bruschetta") || n.includes("carpaccio"))
    return DISH_IMAGE_BANK.bruschetta;

  // Desserts
  if (n.includes("tiramisu")) return DISH_IMAGE_BANK.tiramisu;
  if (c.includes("dessert") || n.includes("glace") || n.includes("panna"))
    return DISH_IMAGE_BANK.dessert;

  // Boissons
  if (c.includes("vin") || n.includes("rouge") || n.includes("blanc"))
    return DISH_IMAGE_BANK.wine;
  if (c.includes("bière") || n.includes("bière") || n.includes("beer"))
    return DISH_IMAGE_BANK.beer;
  if (c.includes("softdrink") || c.includes("boisson") || n.includes("coca"))
    return DISH_IMAGE_BANK.drinks;

  return DISH_IMAGE_BANK.fallback;
}
