export function formatCHF(amount: number): string {
  return `${amount.toFixed(2)} CHF`;
}

export function isOpenNow(
  openTime: string,
  closeTime: string,
  now: Date = new Date(),
): boolean {
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= oh * 60 + om && minutes <= ch * 60 + cm;
}

export function formatPickupTimeOption(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function buildPickupTimeSlots(
  openTime: string,
  closeTime: string,
  prepMinutes: number,
  now: Date = new Date(),
): string[] {
  const [ch, cm] = closeTime.split(":").map(Number);
  const closeDate = new Date(now);
  closeDate.setHours(ch, cm, 0, 0);

  const earliest = new Date(now.getTime() + prepMinutes * 60_000);
  earliest.setMinutes(Math.ceil(earliest.getMinutes() / 15) * 15, 0, 0);

  const [oh, om] = openTime.split(":").map(Number);
  const openDate = new Date(now);
  openDate.setHours(oh, om, 0, 0);
  if (earliest < openDate) earliest.setTime(openDate.getTime());

  const slots: string[] = [];
  for (
    let t = new Date(earliest);
    t <= closeDate;
    t.setMinutes(t.getMinutes() + 15)
  ) {
    slots.push(formatPickupTimeOption(t));
  }
  return slots;
}

export function cartItemKey(
  itemId: string,
  options: { group: string; name: string }[],
  notes: string,
): string {
  const opt = options
    .map((o) => `${o.group}:${o.name}`)
    .sort()
    .join("|");
  return `${itemId}::${opt}::${notes}`;
}

export function sanitizePhoneCH(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+41" + digits.slice(1);
  return digits;
}
