/**
 * Pictos — pictogrammes AU TRAIT du checkout (refonte 20.08, décision
 * Augustin) : remplacent émojis et images. TOUS au même style — trait
 * 1.8, coins ronds, 24×24, monochromes via currentColor (posés en
 * text-rialto par les appelants).
 *
 * ⚠️ DESSINÉS MAISON : le STYLE s'inspire du niveau de simplicité
 * d'Uber Eats (référence assumée du lot), mais chaque tracé est
 * original — leurs icônes sont protégées et font partie de leur
 * identité de marque. On ne copie aucun path.
 */

type PictoProps = {
  size?: number;
  className?: string;
};

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
}

/** Maison : toit + murs + porte. */
export function PictoMaison({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

/** Immeuble : bloc + fenêtres + porte. */
export function PictoImmeuble({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="6" y="4" width="12" height="16" />
      <path d="M9.5 8h.01M14.5 8h.01M9.5 12h.01M14.5 12h.01" />
      <path d="M10.5 20v-3.5h3V20" />
    </svg>
  );
}

/** Carte bancaire : rectangle + bande magnétique. */
export function PictoCarte({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M6.5 14.5h4" />
    </svg>
  );
}

/** Billet (espèces) : rectangle + cercle central. */
export function PictoBillet({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10.5v3M18 10.5v3" />
    </svg>
  );
}

/** Téléphone (TWINT) : smartphone + écran. */
export function PictoTelephone({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="8" y="3.5" width="8" height="17" rx="2" />
      <path d="M11 17.5h2" />
    </svg>
  );
}

/** Personnage simple (livreur) : tête ronde + buste. */
export function PictoLivreur({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
    </svg>
  );
}

/** Standard (dès que possible) : horloge. */
export function PictoHorloge({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Planifié : calendrier. */
export function PictoCalendrier({ size = 24, className = "" }: PictoProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16" />
      <path d="M8.5 3.5v3M15.5 3.5v3" />
      <path d="M8.5 14h.01M12 14h.01M15.5 14h.01" />
    </svg>
  );
}
