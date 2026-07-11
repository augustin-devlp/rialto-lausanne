import type { UpsellContext, TimeOfDay, Season } from './types';

export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'dinner';
  return 'late_night';
}

export function getSeason(date: Date): Season {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export async function buildContext(params: {
  now?: Date;
  customerId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
}): Promise<UpsellContext> {
  const now = params.now || new Date();
  // Phase 12 V3 — fuseau Europe/Zurich (Vercel tourne en UTC, le restaurant
  // est à Lausanne). Sans ça, samedi 10h CET serait classé 'late_night'.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = wkMap[parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'] ?? now.getUTCDay();
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? now.getUTCHours());
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || (dayOfWeek === 5 && hour >= 18);

  const ctx: UpsellContext = {
    timeOfDay: getTimeOfDay(hour),
    season: getSeason(now),
    dayOfWeek,
    isWeekend,
    hour,
    customerLastOrderedIds: [],
    customerTopCategoryIds: [],
    blacklistedCategories: []
  };

  if (!params.customerId || !params.supabase) return ctx;

  const { data: customer } = await params.supabase
    .from('customers')
    .select('id, first_name, date_of_birth, vip_tier')
    .eq('id', params.customerId)
    .maybeSingle();

  if (customer) {
    ctx.customerId = customer.id;
    ctx.customerName = customer.first_name || undefined;
    if (customer.date_of_birth) {
      const dob = new Date(customer.date_of_birth);
      ctx.customerAge = now.getFullYear() - dob.getFullYear();
      const thisYearBirthday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
      const diffDays = Math.abs(
        (thisYearBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      ctx.isBirthdayWeek = diffDays <= 7;
    }
    if (customer.vip_tier) ctx.vipTier = customer.vip_tier;
  }

  // Historique : 5 derniers plats commandés
  const { data: recentOrders } = await params.supabase
    .from('order_items')
    .select('menu_item_id, orders!inner(customer_id, created_at)')
    .eq('orders.customer_id', params.customerId)
    .order('orders.created_at', { ascending: false })
    .limit(15);

  if (recentOrders) {
    ctx.customerLastOrderedIds = recentOrders
      .map((r: { menu_item_id: string }) => r.menu_item_id)
      .slice(0, 10);
  }

  // Dismissal learning : catégories blacklistées (30j)
  const { data: dismissals } = await params.supabase
    .from('upsell_dismissals')
    .select('category, count')
    .eq('customer_id', params.customerId)
    .gte('updated_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString());

  if (dismissals) {
    ctx.blacklistedCategories = dismissals
      .filter((d: { count: number }) => d.count >= 3)
      .map((d: { category: string }) => d.category);
  }

  return ctx;
}
