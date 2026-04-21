"use client";

/**
 * Banderole rouge terracotta avec 3 arguments forts.
 * Largeur full-bleed, padding généreux, typo Fraunces.
 */

export default function WhyOrderDirect() {
  return (
    <section className="relative overflow-hidden bg-rialto py-16 text-white md:py-24">
      {/* Subtle texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 80%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px, 60px 60px",
        }}
        aria-hidden
      />

      <div className="container-hero relative">
        <div className="mb-10 max-w-2xl text-center md:mb-14 md:mx-auto">
          <span className="eyebrow !text-saffron">Pourquoi commander ici ?</span>
          <h2 className="mt-3 font-display text-h1 font-bold">
            Direct. Sans intermédiaire. <br className="hidden md:inline" />
            Comme au restaurant.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
          <Arg
            number="01"
            title="Pâtes faites maison"
            text="On pétrit, on étale, on cuit minute. Pas de surgelé, pas de raccourci."
          />
          <Arg
            number="02"
            title="Livré en 30 min"
            text="Notre équipe prend la route dès que ça sort du four. Pas de plateforme qui ralentit tout."
          />
          <Arg
            number="03"
            title="0 commission"
            text="Paiement au livreur. Ton argent va au restaurant, pas à Silicon Valley."
          />
        </div>
      </div>
    </section>
  );
}

function Arg({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article className="flex flex-col gap-3">
      <span className="font-display tabular text-5xl font-semibold text-saffron md:text-6xl">
        {number}
      </span>
      <h3 className="font-display text-xl font-bold md:text-2xl">{title}</h3>
      <p className="text-base leading-relaxed text-white/85">{text}</p>
    </article>
  );
}
