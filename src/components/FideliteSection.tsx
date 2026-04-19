"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { normalizePhone } from "@/lib/phone";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import SpinWheel from "./SpinWheel";
import LotteryEntry from "./LotteryEntry";

type Customer = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
};
type Card = {
  id: string;
  current_stamps: number;
  stamps_required: number;
  reward_description: string;
  card_name: string;
  qr_code_value: string;
  rewards_claimed: number;
};
type Wheel = {
  id: string;
  is_active: boolean;
  frequency: string;
  segments: { label: string; color?: string }[];
  can_spin: boolean;
  last_reward: string | null;
};
type Lottery = {
  id: string;
  title: string;
  reward_description: string;
  draw_date: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_permanent: boolean;
  already_entered: boolean;
};
type Order = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number | string;
  created_at: string;
};
type LookupPayload = {
  customer: Customer | null;
  card: Card | null;
  spin_wheel: Wheel | null;
  lottery: Lottery | null;
  orders: Order[];
};

const STORAGE_PHONE_KEY = "rialto:loyalty:phone";

export default function FideliteSection() {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<LookupPayload | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_PHONE_KEY);
    if (stored) {
      setPhone(stored);
      void lookup(stored, { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(raw: string, opts?: { silent?: boolean }) {
    const clean = normalizePhone(raw);
    if (!clean) return;
    if (!opts?.silent) setSearching(true);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/loyalty/lookup?phone=${encodeURIComponent(clean)}`,
      );
      if (res.ok) {
        const body = (await res.json()) as LookupPayload;
        if (body.customer && body.card) {
          setData(body);
          setNotFoundPhone(null);
          localStorage.setItem(STORAGE_PHONE_KEY, clean);
        } else {
          setData(null);
          setNotFoundPhone(clean);
        }
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <header className="text-center">
        <div className="mb-2 text-4xl">🎁</div>
        <h2 className="text-3xl font-bold tracking-tight">Carte Rialto Club</h2>
        <p className="mt-2 text-sm text-mute">
          10 commandes = 1 pizza offerte. Plus la roue et la loterie mensuelle.
        </p>
      </header>

      {!data && (
        <LookupForm
          phone={phone}
          onChange={setPhone}
          onSubmit={() => lookup(phone)}
          searching={searching}
        />
      )}

      {!data && notFoundPhone && (
        <SignupForm
          phone={notFoundPhone}
          onCreated={(payload) => {
            setData(payload);
            setNotFoundPhone(null);
            localStorage.setItem(STORAGE_PHONE_KEY, notFoundPhone);
            // Re-lookup pour avoir roue/loterie/orders
            void lookup(notFoundPhone, { silent: true });
          }}
        />
      )}

      {data && data.customer && data.card && (
        <CardView
          payload={data}
          onSwitchAccount={() => {
            localStorage.removeItem(STORAGE_PHONE_KEY);
            setData(null);
            setPhone("");
            setNotFoundPhone(null);
          }}
          onRefresh={async () => {
            if (data.customer) await lookup(data.customer.phone, { silent: true });
          }}
        />
      )}
    </section>
  );
}

function LookupForm({
  phone,
  onChange,
  onSubmit,
  searching,
}: {
  phone: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  searching: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-card"
    >
      <label className="mb-2 block text-sm font-semibold text-ink">
        Votre numéro de téléphone
      </label>
      <p className="mb-3 text-xs text-mute">
        Pour retrouver votre carte ou en créer une gratuitement.
      </p>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="+41 79 123 45 67"
        value={phone}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-rialto"
      />
      <button
        type="submit"
        disabled={searching || !phone.trim()}
        className="mt-4 w-full rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
      >
        {searching ? "Recherche…" : "Voir ma carte"}
      </button>
    </form>
  );
}

function SignupForm({
  phone: initialPhone,
  onCreated,
}: {
  phone: string;
  onCreated: (payload: LookupPayload) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!firstName.trim()) {
      setErr("Prénom obligatoire.");
      return;
    }
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      setErr("Numéro invalide. Format accepté : +41 79…, +33 6…, etc.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr((b as { error?: string }).error ?? `Erreur serveur (${res.status})`);
        return;
      }
      const body = (await res.json()) as {
        customer: Customer;
        card: Card;
      };
      onCreated({
        customer: body.customer,
        card: body.card,
        spin_wheel: null,
        lottery: null,
        orders: [],
      });
    } catch (e) {
      setErr(e instanceof Error ? `Erreur réseau : ${e.message}` : "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
    >
      <div className="mb-1 text-sm font-semibold text-emerald-900">
        Aucune carte trouvée pour {initialPhone}
      </div>
      <div className="mb-4 text-xs text-emerald-900/70">
        Créez votre carte Rialto Club gratuite en 10 secondes.
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Prénom *"
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Nom *"
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+41 79 123 45 67"
          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "Activation en cours…" : "Créer ma carte Rialto Club"}
      </button>
    </form>
  );
}

function CardView({
  payload,
  onSwitchAccount,
  onRefresh,
}: {
  payload: LookupPayload;
  onSwitchAccount: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { customer, card, spin_wheel, lottery, orders } = payload;
  if (!customer || !card) return null;

  const [spinOpen, setSpinOpen] = useState(false);
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const complete = card.current_stamps >= card.stamps_required;
  const qrValue = useMemo(
    () => `STAMPIFY:${card.qr_code_value}`,
    [card.qr_code_value],
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      qrValue,
      { width: 220, margin: 1, color: { dark: "#1a1a1a", light: "#fff" } },
      () => {},
    );
  }, [qrValue]);

  return (
    <div className="mt-8 space-y-4">
      {/* Carte principale */}
      <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              {card.card_name}
            </div>
            <h3 className="mt-1 text-2xl font-black tracking-tight">
              {customer.first_name}{" "}
              {customer.last_name && (
                <span className="text-gray-500">{customer.last_name}</span>
              )}
            </h3>
            <p className="mt-1 text-xs text-mute">{card.reward_description}</p>
          </div>
          <button
            type="button"
            onClick={onSwitchAccount}
            className="text-xs text-mute hover:text-ink"
          >
            Ce n'est pas moi
          </button>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold text-emerald-900">
              {card.current_stamps} / {card.stamps_required} tampons
            </span>
            {complete && (
              <span className="text-xs font-bold text-emerald-700">
                🏆 Récompense disponible
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: card.stamps_required }).map((_, i) => (
              <div
                key={i}
                className={`h-10 flex-1 rounded-md transition-colors ${
                  i < card.current_stamps
                    ? "bg-emerald-600"
                    : "bg-white border border-emerald-200"
                }`}
              />
            ))}
          </div>
          {card.rewards_claimed > 0 && (
            <p className="mt-2 text-xs text-emerald-700">
              🎉 {card.rewards_claimed} récompense{card.rewards_claimed > 1 ? "s" : ""} déjà gagnée{card.rewards_claimed > 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center rounded-xl bg-white p-5 shadow-sm">
          <canvas
            ref={canvasRef}
            width={220}
            height={220}
            className="rounded-lg"
          />
          <p className="mt-3 text-center text-xs text-mute">
            Montrez ce QR en caisse pour valider vos tampons.
          </p>
        </div>
      </article>

      {/* Actions : Roue + Loterie */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!spin_wheel?.is_active}
          onClick={() => setSpinOpen(true)}
          className="rounded-xl border border-rialto bg-white p-4 text-left transition hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-rialto">
            🎰 Roue
          </div>
          <div className="mt-1 text-sm font-bold">Tenter votre chance</div>
          <div className="mt-1 text-[11px] text-mute">
            {spin_wheel?.can_spin
              ? "Un tour disponible !"
              : spin_wheel?.last_reward
                ? `Gagné : ${spin_wheel.last_reward}`
                : "Pas disponible"}
          </div>
        </button>
        <button
          type="button"
          disabled={!lottery?.is_active}
          onClick={() => setLotteryOpen(true)}
          className="rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            🎁 Loterie
          </div>
          <div className="mt-1 text-sm font-bold">
            {lottery?.title ?? "Loterie mensuelle"}
          </div>
          <div className="mt-1 text-[11px] text-mute">
            {lottery?.already_entered
              ? "Vous participez ✓"
              : "Participer (gratuit)"}
          </div>
        </button>
      </div>

      {/* Historique */}
      {orders.length > 0 && (
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mute">
            Mes dernières commandes
          </h4>
          <ul className="space-y-2 text-sm">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span className="font-medium">{o.order_number}</span>
                <span className="text-xs text-mute">
                  {new Date(o.created_at).toLocaleDateString("fr-CH")}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                  {o.status}
                </span>
                <span className="font-semibold">
                  {Number(o.total_amount).toFixed(2)} CHF
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {spinOpen && spin_wheel && (
        <SpinWheel
          phone={customer.phone}
          firstName={customer.first_name}
          segments={spin_wheel.segments}
          canSpin={spin_wheel.can_spin}
          lastReward={spin_wheel.last_reward}
          onClose={() => {
            setSpinOpen(false);
            void onRefresh();
          }}
        />
      )}

      {lotteryOpen && lottery && (
        <LotteryEntry
          lottery={lottery}
          phone={customer.phone}
          firstName={customer.first_name}
          onClose={() => {
            setLotteryOpen(false);
            void onRefresh();
          }}
        />
      )}
    </div>
  );
}
