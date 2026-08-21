/**
 * LES 12 RAILS THÉMATIQUES DU MENU — composés À LA MAIN par Augustin
 * (21.08.2026), ordre fixé rail par rail, JAMAIS calculé.
 *
 * ⚠️ POURQUOI UN FICHIER ET PAS UNE TABLE : il n'existe aucun écran de
 * composition, et il n'en est pas prévu avant le go-live. Une table
 * `menu_collections` ne donnerait donc pas plus d'autonomie — elle
 * déplacerait l'édition de « un fichier + un déploiement » vers « des
 * lignes dans Supabase Studio ». Elle coûterait une navette DDL, un seed
 * de 145 lignes et des policies, pour zéro gain tant que l'écran manque.
 * Le jour où cet écran existe, la bascule est mécanique : la forme des
 * données ci-dessous (slug, titre, liste ordonnée d'ids) est exactement
 * celle d'un couple de tables.
 *
 * ⚠️ CES IDS SONT DES CLÉS ÉTRANGÈRES SANS CONTRAINTE. Un article
 * supprimé ou remplacé en base laisserait un id orphelin, et sa carte
 * disparaîtrait SILENCIEUSEMENT du rail. La garde vit dans
 * `resoudCollections()` : elle journalise les ids introuvables côté
 * serveur au lieu de les avaler.
 *
 * RÈGLES DE COMPOSITION (Augustin) :
 *   · 12 plats par rail — en dessous, les flèches ne servent à rien ;
 *   · un plat PEUT figurer dans plusieurs rails ;
 *   · JAMAIS PREMIER DEUX FOIS : s'il ouvre un rail, il ferme l'autre.
 *     Vérifié : les 12 têtes de rail sont 12 articles distincts.
 *   · un article ÉPUISÉ ne s'affiche pas (filtré à la résolution).
 */

import type { MenuItem } from "@/lib/types";

export type Collection = {
  slug: string;
  titre: string;
  itemIds: string[];
};

export const COLLECTIONS: Collection[] = [
  {
    slug: "incontournables",
    titre: "Les incontournables du Rialto",
    itemIds: [
      "67586e65-cd28-46a1-aa8b-1519ef531639", // Pizza Rialto
      "86470efb-5551-48dd-a068-394116d337a5", // Tajine Anatolienne
      "55112e92-bcf9-4e01-b1c7-ec4e2a1b67e0", // Grillade mixte
      "dc4450ec-2e64-4755-a050-f79728e3298e", // Pizza Bethusy
      "bf837fe4-e103-40b6-bbd7-2c7849554a89", // Pizza Capriccioza
      "a1f65e74-7658-49b0-930f-251a71da2e41", // Pizza Quatre fromages
      "04931fef-67d7-4ffb-a0e3-772b794bd0e0", // Pizza à la turca
      "9bc6e5c3-09ce-4492-9791-edd42bc3bb5b", // Lasagne bolognaise
      "5c28861d-dac0-458c-8fe7-3e17343ae8cd", // Pâtes carbonara
      "8506661c-93ad-46ff-9e0a-5047ccaf8614", // Cheeseburger
      "6d2dd901-99d2-4a76-bb03-a6c77c2d99af", // Tiramisu maison
      "77815c84-dc86-4088-89a1-b4b31b7d1557", // Pizza Marguerite
    ],
  },
  {
    slug: "anatoliennes",
    titre: "Les saveurs anatoliennes",
    itemIds: [
      "5ac20970-28eb-48cb-980a-65d580720c0d", // Brochette d'agneau haché grillé
      "fb4db9da-470b-4bf0-8b4f-6039a0e1c2a6", // Pizza Kavurma
      "044ccdf8-a642-4258-8658-9b4efc4c68eb", // Salade Anatolienne
      "37464a33-eada-4f3b-8060-768181c29f48", // Feuilles de vigne (11 p.)
      "7da2f3e2-eb1a-4a11-8553-a3cb2e09d083", // Falafels (11 p.)
      "72fe013f-6b63-40db-923e-65600c26d875", // Agneau
      "9a40203f-8005-4914-8f1e-47076ebdab50", // Baklava
      "8a4d4342-ab6a-4e3e-a4b2-728cac24e441", // Cankaya blanc
      "44413b62-e906-4d29-8498-34ee61059af6", // Yakut rouge
      "9d17ef6a-d132-4d8d-83c7-173cd15dcf53", // Efes draft
      "eb211daa-b84c-4656-b89f-cae7ed196a30", // Falafels (4 p.)
      "86470efb-5551-48dd-a068-394116d337a5", // Tajine Anatolienne
    ],
  },
  {
    slug: "classiques-italiens",
    titre: "Les classiques italiens",
    itemIds: [
      "e56fc2ff-0a8a-457b-b6bb-dfa3d1ff2bf6", // Pizza Napolitaine
      "9844e939-f163-4b20-9213-66db1129b13d", // Tortellonis épinards ricotta
      "d44f9f1c-7f33-4c6f-97fe-0569bb15019f", // Pizza Romana
      "31ec4da1-cc29-4139-9f64-bd104aee4505", // Pizza Bolognaise
      "632c9c89-e164-4f3b-9250-a34c9f1810d3", // Pizza Genovese
      "3b4aac47-9b1b-4e28-bebe-80c98f5a5801", // Pizza Marinara
      "4326f94c-f4a7-4a9d-9089-c6228631701c", // Pizza Funghi
      "6aaa6f5b-aad0-4bf3-96ce-305af1a105a0", // Pizza Salami
      "59363e24-ed41-43a9-bccd-8f2333df9b11", // Pâtes Pesto
      "a8590d73-1fdb-4f40-a8a0-7bf4aba19939", // Pâtes Napoli
      "c714276f-c8b0-450c-bf13-d0394e8cbbdc", // Tomate Mozzarella
      "bf837fe4-e103-40b6-bbd7-2c7849554a89", // Pizza Capriccioza
    ],
  },
  {
    slug: "fondant",
    titre: "Envie de fondant",
    itemIds: [
      "9bc6e5c3-09ce-4492-9791-edd42bc3bb5b", // Lasagne bolognaise
      "4203af3d-ddf5-44b7-874e-e34c246a4d82", // Tortellonis fromages
      "be811dc8-84e5-45c3-af65-a8f6e6a3aadb", // Pizza Alsacienne
      "9af78f4b-afba-4497-b01d-d485704fdd6a", // Pizza Memoli
      "b123f077-1064-48a9-aa37-94fcdf2f650e", // Purée de pomme de terre forestier
      "f3a1f749-4379-415f-808b-16c3f4fd7dc1", // Pâtes crème safranée
      "0fe15fa0-6b6a-4c28-90ae-da2840c1d8cb", // Chèvre chaud aux amandes et miel
      "d345cb67-6e1c-432a-bff8-20a5f363f313", // Pâtes forestier
      "bb54d405-9b00-4f96-b9b8-f4cac9564a70", // Pâtes 3P
      "2925b90e-93fb-46d0-b1c3-a5992b726e7d", // Pizza chocolat-banane
      "dfc9d2a0-1166-478e-af3a-56006a52f1f2", // Tortellonis viande de bœuf
      "a1f65e74-7658-49b0-930f-251a71da2e41", // Pizza Quatre fromages
    ],
  },
  {
    slug: "viandes-grillees",
    titre: "Les viandes grillées",
    itemIds: [
      "7d7a3166-9427-4d6f-9ba0-617c1113f689", // Filet de porc grillé
      "20b0a230-3a17-4bcf-835b-97479e511ad8", // Steak haché de bœuf grillé
      "05b0d9d9-22ab-41a2-9ab4-a82a0de85dfb", // Bœuf
      "3f5577e6-cd22-4468-9970-29edaf1da94e", // Steak de filet de poulet grillé
      "a6f49d5f-f81e-456f-b202-26b0219c4cec", // Porc
      "aaf8effc-5541-4a08-a16c-15c47088cdfb", // Poulet
      "a7576a79-c3aa-4759-9a24-d13644dc13fb", // Hamburger classique
      "44946304-b743-4b4f-8669-43a8fe1e00e1", // Pizza Royal
      "81ab7e01-d4c9-4e16-9c77-f4facc204ef4", // Pizza Parma
      "a77b9c65-d56a-4460-8053-6b3490c6a6db", // Pizza Proscuitto
      "9932ed5f-7bde-4e2b-9681-fdc0e31cb0fe", // Pâtes bolognese
      "8506661c-93ad-46ff-9e0a-5047ccaf8614", // Cheeseburger
    ],
  },
  {
    slug: "sans-viande",
    titre: "Sans viande",
    itemIds: [
      "4ff0367b-e482-424a-bf24-7ebed561fc15", // Pizza Végétarienne
      "9844e939-f163-4b20-9213-66db1129b13d", // Tortellonis épinards ricotta
      "92a79097-7d49-4dd2-ac02-7b7d1426eb48", // Lasagne végétarien
      "28991d2d-4837-4966-8abd-5834c3b24532", // Pizza Arzum
      "8bd11648-bc7c-4070-86b4-98d895f17443", // Pizza Arrabbiata
      "3e311046-cda7-4851-90ba-1ac5690e0361", // Salade mêlée
      "ad2c6aea-6387-4205-a633-466c00f5de75", // Pâtes végétarien
      "201c2cd7-d201-4c55-b1bc-f6d3e2942083", // Mini Rösti
      "eb211daa-b84c-4656-b89f-cae7ed196a30", // Falafels (4 p.)
      "59363e24-ed41-43a9-bccd-8f2333df9b11", // Pâtes Pesto
      "c714276f-c8b0-450c-bf13-d0394e8cbbdc", // Tomate Mozzarella
      "0fe15fa0-6b6a-4c28-90ae-da2840c1d8cb", // Chèvre chaud aux amandes et miel
    ],
  },
  {
    slug: "gout-de-la-mer",
    // ⚠️ 13 PLATS, pas 12 : le Pavé de saumon a été ajouté en 2e position
    // (consigne Augustin) SANS qu'un autre soit retiré. À trancher par
    // lui — Marinara et Tajine sont les deux plus discutables sur le thème.
    titre: "Le goût de la mer",
    itemIds: [
      "d75759f4-13c6-4839-a533-51fccd4c11c5", // Sautés de Crevettes Provençale
      "cb184479-5143-45a6-b374-7e015714f331", // Pavé de saumon meunière (2e)
      "69482332-da59-48ae-835b-c7bab33f050f", // Filet de Truite meunière
      "4f2d487f-5bba-493a-a844-443806bd646a", // Sautés crevettes aux herbes
      "76cf80e3-8096-4ae6-a5c7-eaa8fd6e26ac", // Pizza Nemo
      "e50ca759-b2e5-4d7a-a225-3e23e1dd48bc", // Pizza Norvège
      "aadafa73-a87f-4fdb-b395-c80dda3d4fb8", // Pizza Quatre saisons
      "b5a428b0-e3b9-4331-8449-f89ff72997fd", // Pizza Espagnol
      "44ad8193-8991-4558-ba30-ee4ebadc996c", // Pâtes moules safranée
      "df18a882-c0f9-44cc-85de-cd15fc76f2af", // Calamars (11 p.)
      "a37d5e71-ae83-48ff-ad27-fcb0cbe8a75e", // Calamars (5 p.)
      "86470efb-5551-48dd-a068-394116d337a5", // Tajine Anatolienne
      "3b4aac47-9b1b-4e28-bebe-80c98f5a5801", // Pizza Marinara
    ],
  },
  {
    slug: "combos",
    titre: "Les combos, tout compris",
    itemIds: [
      "302c8268-8afc-4e13-8632-ab5d497373b8", // Combo Lasagne Bolognaise
      "8db890ed-10c5-406f-a22b-2faacf7517ff", // Combo Pizza révolution chorizo
      "103dd78d-28fd-4b2a-8340-937da0679d68", // Combo Pizza alsacienne
      "cec6e968-a3e2-4649-be3e-ab53133209b2", // Combo Pizza bolognaise
      "e3616d51-b7df-4d3c-9abb-2829a1718239", // Combo Pâtes carbonara
      "ec320712-42db-4a70-bdc9-598bd830cb64", // Combo Pizza capriccioza
      "00e76d48-668e-45f2-a80e-ded8cf8daedf", // Combo Pizza végétarienne
      "70b16d92-7e04-40a9-9984-429313029fc3", // Frites Classique
      "f198ecfe-b29b-4be3-9910-b3bb991471bc", // Potatoes maison
      "a254fea6-e24e-46b3-871f-2c0121f49ba7", // Glacé vanille-chocolat-noix
      "3598fbf8-f1f9-4431-bf79-24dca6f56e0f", // Glacé vanille-chocolat-cookie
      "67586e65-cd28-46a1-aa8b-1519ef531639", // Pizza Rialto
    ],
  },
  {
    slug: "pizzas-genereuses",
    titre: "Les pizzas généreuses",
    itemIds: [
      "bf837fe4-e103-40b6-bbd7-2c7849554a89", // Pizza Capriccioza
      "44946304-b743-4b4f-8669-43a8fe1e00e1", // Pizza Royal
      "be811dc8-84e5-45c3-af65-a8f6e6a3aadb", // Pizza Alsacienne
      "ad3619a9-a823-4871-a2dd-b18fca862e21", // Pizza Révolution
      "aadafa73-a87f-4fdb-b395-c80dda3d4fb8", // Pizza Quatre saisons
      "b5a428b0-e3b9-4331-8449-f89ff72997fd", // Pizza Espagnol
      "fb4db9da-470b-4bf0-8b4f-6039a0e1c2a6", // Pizza Kavurma
      "04931fef-67d7-4ffb-a0e3-772b794bd0e0", // Pizza à la turca
      "9af78f4b-afba-4497-b01d-d485704fdd6a", // Pizza Memoli
      "4ff0367b-e482-424a-bf24-7ebed561fc15", // Pizza Végétarienne
      "5f881700-a5b0-46bc-a892-4fa25b8076b7", // Pizza Tunisienne
      "67586e65-cd28-46a1-aa8b-1519ef531639", // Pizza Rialto
    ],
  },
  {
    slug: "pates-plats-chauds",
    titre: "Pâtes et plats chauds",
    itemIds: [
      "dfc9d2a0-1166-478e-af3a-56006a52f1f2", // Tortellonis viande de bœuf
      "92a79097-7d49-4dd2-ac02-7b7d1426eb48", // Lasagne végétarien
      "4203af3d-ddf5-44b7-874e-e34c246a4d82", // Tortellonis fromages
      "b123f077-1064-48a9-aa37-94fcdf2f650e", // Purée de pomme de terre forestier
      "5c28861d-dac0-458c-8fe7-3e17343ae8cd", // Pâtes carbonara
      "d345cb67-6e1c-432a-bff8-20a5f363f313", // Pâtes forestier
      "a8590d73-1fdb-4f40-a8a0-7bf4aba19939", // Pâtes Napoli
      "f3a1f749-4379-415f-808b-16c3f4fd7dc1", // Pâtes crème safranée
      "44ad8193-8991-4558-ba30-ee4ebadc996c", // Pâtes moules safranée
      "bb54d405-9b00-4f96-b9b8-f4cac9564a70", // Pâtes 3P
      "9932ed5f-7bde-4e2b-9681-fdc0e31cb0fe", // Pâtes bolognese
      "9bc6e5c3-09ce-4492-9791-edd42bc3bb5b", // Lasagne bolognaise
    ],
  },
  {
    slug: "a-partager",
    titre: "À partager à plusieurs",
    itemIds: [
      "7da2f3e2-eb1a-4a11-8553-a3cb2e09d083", // Falafels (11 p.)
      "df18a882-c0f9-44cc-85de-cd15fc76f2af", // Calamars (11 p.)
      "37464a33-eada-4f3b-8060-768181c29f48", // Feuilles de vigne (11 p.)
      "55112e92-bcf9-4e01-b1c7-ec4e2a1b67e0", // Grillade mixte
      "a254fea6-e24e-46b3-871f-2c0121f49ba7", // Glacé vanille-chocolat-noix
      "3598fbf8-f1f9-4431-bf79-24dca6f56e0f", // Glacé vanille-chocolat-cookie
      "1fad6b68-90c8-48ae-9aac-b648db8829f2", // Coca-Cola 1.5l
      "041cb9f2-2c22-4629-80d8-96324b570fec", // Fanta Orange 1.5l
      "a9bbdd07-71c5-476e-8b93-d7af62adcc2d", // Fusetea Pêche 1.5l
      "d61db016-9030-470e-b8d8-70c9e48d676b", // Limonade de Citron 1.5l
      "f198ecfe-b29b-4be3-9910-b3bb991471bc", // Potatoes maison
      "70b16d92-7e04-40a9-9984-429313029fc3", // Frites Classique
    ],
  },
  {
    slug: "leger-et-frais",
    titre: "Léger et frais",
    itemIds: [
      "00ce2ad4-38c7-40f6-940d-450836c4a766", // Salade Cesare
      "044ccdf8-a642-4258-8658-9b4efc4c68eb", // Salade Anatolienne
      "3e311046-cda7-4851-90ba-1ac5690e0361", // Salade mêlée
      "c714276f-c8b0-450c-bf13-d0394e8cbbdc", // Tomate Mozzarella
      "69482332-da59-48ae-835b-c7bab33f050f", // Filet de Truite meunière
      "4f2d487f-5bba-493a-a844-443806bd646a", // Sautés crevettes aux herbes
      "d75759f4-13c6-4839-a533-51fccd4c11c5", // Sautés de Crevettes Provençale
      "3f5577e6-cd22-4468-9970-29edaf1da94e", // Steak de filet de poulet grillé
      "632c9c89-e164-4f3b-9250-a34c9f1810d3", // Pizza Genovese
      "28991d2d-4837-4966-8abd-5834c3b24532", // Pizza Arzum
      "eb211daa-b84c-4656-b89f-cae7ed196a30", // Falafels (4 p.)
      "0fe15fa0-6b6a-4c28-90ae-da2840c1d8cb", // Chèvre chaud aux amandes et miel
    ],
  },
];

export type CollectionResolue = { slug: string; titre: string; items: MenuItem[] };

/**
 * Résout les 12 listes contre les articles DÉJÀ CHARGÉS par la page menu
 * — zéro requête réseau supplémentaire.
 *
 * `disponibles` doit être la liste déjà filtrée par l'appelant (régimes,
 * allergènes, saison, épuisés) : un rail ne doit jamais proposer ce que
 * la grille refuse. Un rail vidé par les filtres disparaît.
 */
export function resoudCollections(
  disponibles: MenuItem[],
): CollectionResolue[] {
  const parId = new Map(disponibles.map((it) => [it.id, it]));
  // Ids du catalogue COMPLET, pour distinguer « filtré » de « inexistant ».
  const sortie: CollectionResolue[] = [];
  for (const c of COLLECTIONS) {
    const items: MenuItem[] = [];
    for (const id of c.itemIds) {
      const it = parId.get(id);
      if (it) items.push(it);
    }
    if (items.length > 0) {
      sortie.push({ slug: c.slug, titre: c.titre, items });
    }
  }
  return sortie;
}

/**
 * Garde d'intégrité : les ids des collections qui n'existent PAS dans le
 * catalogue complet. À appeler côté serveur avec la liste brute — un id
 * orphelin doit être journalisé, jamais avalé (sinon une carte disparaît
 * d'un rail sans que personne ne le sache).
 */
export function idsOrphelins(catalogueComplet: MenuItem[]): string[] {
  const connus = new Set(catalogueComplet.map((it) => it.id));
  const orphelins = new Set<string>();
  for (const c of COLLECTIONS) {
    for (const id of c.itemIds) if (!connus.has(id)) orphelins.add(id);
  }
  return [...orphelins];
}
