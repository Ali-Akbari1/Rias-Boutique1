import { ArrowUpRight } from "lucide-react";
import heroBg from "@/assets/hero-bg.webp";
import { Link } from "react-router-dom";
import { prefetchCollectionPage } from "@/lib/prefetch";

const heroCtas = [
  { to: "/collection/women", label: "Shop Women's" },
  { to: "/collection/men", label: "Shop Men's" },
  { to: "/collection/jewelry", label: "Shop Jewelry" },
];

const HeroSection = () => {
  const heroCtaClass =
    "group inline-flex h-12 min-w-[9.75rem] items-center justify-center rounded-[1rem] border border-white bg-white px-4 text-sm font-body font-semibold tracking-[0.06em] text-foreground shadow-[0_16px_36px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:h-14 sm:min-w-[10.25rem]";

  return (
    <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden pt-16 sm:min-h-[80vh]">
      <img
        src={heroBg}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[70%_85%] sm:object-[60%_48%] lg:object-[60%_85%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/12 to-transparent" />

      <div className="relative z-10 container mx-auto flex flex-col items-start px-4 sm:px-6">
        <div className="max-w-3xl animate-fade-in text-white">
          <div className="max-w-xl">
            <p className="mb-4 pl-1.5 text-sm font-brand uppercase tracking-[0.28em] text-white sm:pl-2 sm:text-lg sm:tracking-[0.34em]">
              Traditional Afghan Fashion
            </p>
            <h2 className="mb-6 text-4xl font-display font-bold leading-tight text-white sm:text-5xl md:text-7xl">
              Elevated Afghan Fashion, redefined
            </h2>
            <p className="mb-4 max-w-md text-lg font-body leading-relaxed text-white sm:text-xl">
              Hand-finished embroidery, shipped worldwide, and designed to stand out.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/78">
              Shop by Collection
            </p>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {heroCtas.map((cta) => {
                return (
                  <Link
                    key={cta.to}
                    to={cta.to}
                    className={heroCtaClass}
                    onMouseEnter={() => void prefetchCollectionPage()}
                    onFocus={() => void prefetchCollectionPage()}
                  >
                    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
                      <span>{cta.label}</span>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
