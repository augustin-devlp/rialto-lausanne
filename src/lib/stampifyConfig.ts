/**
 * IDs du compte Stampify de Rialto (côté site client).
 * Ces IDs sont référencés par les API Stampify (loyalty-cards) — on les
 * garde synchronisés avec src/lib/rialtoConstants.ts côté Stampify.
 */
export const RIALTO_BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff";
export const RIALTO_CARD_ID = "f4cb1a3f-fc5c-40eb-87db-8d2c2b0a8b5f";
export const RIALTO_SPIN_WHEEL_ID = "37933bc4-9adf-4aa2-91fc-b422ce026c41";
export const RIALTO_LOTTERY_ID = "aadf3919-e81c-4fef-8ea4-60d871e1121f";

/** Base URL de l'API Stampify. www direct évite le 307 qui casse CORS. */
export const STAMPIFY_BASE =
  process.env.NEXT_PUBLIC_STAMPIFY_URL ?? "https://www.stampify.ch";
