export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  order_min_amount: number;
  order_open_time: string;
  order_close_time: string;
  prep_time_minutes: number;
  accepting_orders: boolean;
  // Delivery settings
  offers_pickup?: boolean;
  offers_delivery?: boolean;
  pickup_prep_time_minutes?: number;
  delivery_prep_time_minutes?: number;
  announcement_message?: string | null;
  announcement_active?: boolean;
};

export type FulfillmentType = "pickup" | "delivery";

export type DeliveryZone = {
  id: string;
  postal_code: string;
  city: string | null;
  delivery_fee: number;
  min_order_amount: number;
  estimated_delivery_minutes: number;
  is_active: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  display_order: number;
  icon: string | null;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_vegetarian: boolean;
  is_spicy: boolean;
  has_options: boolean;
  display_order: number;
};

export type MenuItemOption = {
  id: string;
  item_id: string;
  option_group: string;
  option_name: string;
  extra_price: number;
  is_required: boolean;
  max_selections: number;
  display_order: number;
};

export type CartOptionSelection = {
  group: string;
  name: string;
  extra_price: number;
};

export type CartItem = {
  key: string;
  menu_item_id: string;
  name: string;
  base_price: number;
  quantity: number;
  options: CartOptionSelection[];
  notes: string;
  unit_price: number;
  subtotal: number;
};

export type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type Order = {
  id: string;
  restaurant_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  requested_pickup_time: string | null;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  item_price_snapshot: number;
  quantity: number;
  selected_options: CartOptionSelection[];
  subtotal: number;
  notes: string | null;
};
