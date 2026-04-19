"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { RESTAURANT_ID } from "@/lib/supabase";
import { sanitizePhoneCH } from "@/lib/format";

type RialtoCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  stamps_count: number;
};

const STAMPS_REQUIRED = 10;
const STAMPIFY_BASE =
  process.env.NEXT_PUBLIC_STAMPIFY_URL ?? "https://stampify.ch";
const STORAGE_PHONE_KEY = "rialto:loyalty:phone";

export default function FideliteSection() {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<RialtoCustomer | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState<string | null>(null);

  // Restore last used phone
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_PHONE_KEY);
    if (stored) {
      setPhone(stored);
      void lookup(stored, { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(raw: string, opts?: { silent?: boolean }) {
    const clean = sanitizePhoneCH(raw);
    if (!clean || clean.length < 10) return;
    if (!opts?.silent) setSearching(true);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/customers/signup?restaurant_id=${RESTAURANT_ID}&phone=${encodeURIComponent(
          clean,
        )}`,
      );
      if (res.ok) {
        const body = (await res.json()) as { customer: RialtoCustomer | null };
        if (body.customer) {
          setCustomer(body.customer);
          setNotFoundPhone(null);
          localStorage.setItem(STORAGE_PHONE_KEY, clean);
        } else {
          setCustomer(null);
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
        <h2 className="text-3xl font-bold tracking-tight">Carte de fidélité</h2>
        <p className="mt-2 text-sm text-mute">
          10 commandes = 1 plat offert. Simple, gratuit, sans compte à créer.
        </p>
      </header>

      {!customer && (
        <LookupForm
          phone={phone}
          onChange={setPhone}
          onSubmit={() => lookup(phone)}
          searching={searching}
        />
      )}

      {!customer && notFoundPhone && (
        <SignupForm
          phone={notFoundPhone}
          onCreated={(c) => {
            setCustomer(c);
            setNotFoundPhone(null);
            localStorage.setItem(STORAGE_PHONE_KEY, notFoundPhone);
          }}
        />
      )}

      {customer && (
        <CustomerCard
          customer={customer}
          onSwitchAccount={() => {
            localStorage.removeItem(STORAGE_PHONE_KEY);
            setCustomer(null);
            setPhone("");
            setNotFoundPhone(null);
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
  phone,
  onCreated,
}: {
  phone: string;
  onCreated: (c: RialtoCustomer) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/customers/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: RESTAURANT_ID,
          phone,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          email: email.trim() || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr((b as { error?: string }).error ?? "Erreur");
        return;
      }
      const body = (await res.json()) as { customer: RialtoCustomer };
      onCreated(body.customer);
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
        Aucune carte trouvée pour {phone}
      </div>
      <div className="mb-4 text-xs text-emerald-900/70">
        Créez votre carte fidélité gratuite en 10 secondes.
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
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Nom"
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <input
          value={phone}
          disabled
          className="w-full rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-sm text-gray-500"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optionnel)"
          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {err && (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "…" : "Créer ma carte fidélité"}
      </button>
    </form>
  );
}

function CustomerCard({
  customer,
  onSwitchAccount,
}: {
  customer: RialtoCustomer;
  onSwitchAccount: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrValue = useMemo(
    () =>
      `${STAMPIFY_BASE}/api/rialto/customers/${customer.id}/check-in`,
    [customer.id],
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

  const complete = customer.stamps_count >= STAMPS_REQUIRED;

  return (
    <div className="mt-8 space-y-4">
      {/* Carte principale */}
      <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              Carte fidélité Rialto
            </div>
            <h3 className="mt-1 text-2xl font-black tracking-tight">
              {customer.first_name}{" "}
              {customer.last_name && (
                <span className="text-gray-500">{customer.last_name}</span>
              )}
            </h3>
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
              {customer.stamps_count} / {STAMPS_REQUIRED} tampons
            </span>
            {complete && (
              <span className="text-xs font-bold text-emerald-700">
                🏆 Récompense disponible
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: STAMPS_REQUIRED }).map((_, i) => (
              <div
                key={i}
                className={`h-10 flex-1 rounded-md transition-colors ${
                  i < customer.stamps_count
                    ? "bg-emerald-600"
                    : "bg-white border border-emerald-200"
                }`}
              />
            ))}
          </div>
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

      {/* Actions secondaires */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled
          className="rounded-xl border border-gray-200 bg-white p-4 text-left opacity-60 cursor-not-allowed"
          title="Bientôt disponible"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-mute">
            Bientôt
          </div>
          <div className="mt-1 text-sm font-bold">🎰 Roue de la chance</div>
        </button>
        <button
          type="button"
          disabled
          className="rounded-xl border border-gray-200 bg-white p-4 text-left opacity-60 cursor-not-allowed"
          title="Bientôt disponible"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-mute">
            Bientôt
          </div>
          <div className="mt-1 text-sm font-bold">🎁 Mes récompenses</div>
        </button>
      </div>
    </div>
  );
}
