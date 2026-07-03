// components/AlchemySigil.tsx — crisp inline-SVG alchemical sigils.
//
// The Unicode alchemical block (🜂 U+1F702 …) renders unevenly across
// platforms, so the element triangles and tria-prima marks are drawn as
// tiny SVGs instead: font-independent, stroke-styled to the theme, and
// sized like text via em units.
import React from "react";

const S = 100; // internal viewBox unit

interface SigilProps {
  size?: number | string; // css size; defaults to 1em so it flows with text
  color?: string;
  title?: string;
  className?: string;
}

const Svg: React.FC<SigilProps & { children: React.ReactNode }> = ({
  size = "1em", color = "currentColor", title, className, children,
}) => (
  <svg
    viewBox={`0 0 ${S} ${S}`}
    width={size}
    height={size}
    className={className}
    role="img"
    aria-label={title}
    style={{ verticalAlign: "-0.12em" }}
    stroke={color}
    strokeWidth={7}
    strokeLinejoin="round"
    strokeLinecap="round"
    fill="none"
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);

/** Fire △ · Water ▽ · Air △ barred · Earth ▽ barred */
export const ElementSigil: React.FC<SigilProps & { element: string }> = ({
  element, ...rest
}) => {
  const up = element === "Fire" || element === "Air";
  const barred = element === "Air" || element === "Earth";
  const tri = up ? "M50 12 L92 84 L8 84 Z" : "M50 88 L8 16 L92 16 Z";
  // Bar crosses the triangle at the classical height.
  const barY = up ? (barred ? 60 : 0) : 44;
  return (
    <Svg title={`${element} — alchemical sigil`} {...rest}>
      <path d={tri} />
      {barred && <line x1={up ? 21 : 24} y1={barY} x2={up ? 79 : 76} y2={barY} />}
    </Svg>
  );
};

/** Tria prima: Sulphur (triangle over cross) · Salt (barred circle) ·
 *  Mercury (crescent-crowned circle over cross). */
export const PrincipleSigil: React.FC<SigilProps & { principle: string }> = ({
  principle, ...rest
}) => {
  if (principle === "Salt") {
    return (
      <Svg title="Salt — alchemical sigil" {...rest}>
        <circle cx={50} cy={50} r={36} />
        <line x1={14} y1={50} x2={86} y2={50} />
      </Svg>
    );
  }
  if (principle === "Mercury") {
    return (
      <Svg title="Mercury — alchemical sigil" {...rest}>
        <path d="M26 14 A24 24 0 0 0 74 14" />
        <circle cx={50} cy={44} r={20} />
        <line x1={50} y1={64} x2={50} y2={92} />
        <line x1={36} y1={78} x2={64} y2={78} />
      </Svg>
    );
  }
  // Sulphur (default)
  return (
    <Svg title="Sulphur — alchemical sigil" {...rest}>
      <path d="M50 8 L74 48 L26 48 Z" />
      <line x1={50} y1={48} x2={50} y2={92} />
      <line x1={32} y1={70} x2={68} y2={70} />
    </Svg>
  );
};
