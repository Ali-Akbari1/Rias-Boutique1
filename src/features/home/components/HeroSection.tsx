import { ArrowUpRight, Gem, Shirt, Sparkles, type LucideIcon } from "lucide-react";
import heroBg from "@/assets/hero-bg.webp";
import { Link } from "react-router-dom";
import { prefetchCollectionPage } from "@/lib/prefetch";

const heroCtas: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/collection/women", label: "Shop Women's", icon: Sparkles },
  { to: "/collection/men", label: "Shop Men's", icon: Shirt },
  { to: "/collection/jewelry", label: "Shop Jewelry", icon: Gem },
];

const HeroSection = () => {
  const heroCtaClass =
    "group inline-flex h-14 min-w-[10.75rem] items-center gap-3 rounded-[1.15rem] border border-white/24 bg-background/92 px-4 pr-4 text-sm font-body font-semibold tracking-[0.06em] text-foreground shadow-[0_16px_36px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:h-[3.75rem] sm:min-w-[11.25rem] sm:px-4";

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
                const Icon = cta.icon;

                return (
                  <Link
                    key={cta.to}
                    to={cta.to}
                    className={heroCtaClass}
                    onMouseEnter={() => void prefetchCollectionPage()}
                    onFocus={() => void prefetchCollectionPage()}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background sm:h-9 sm:w-9">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="whitespace-nowrap">{cta.label}</span>
                    </span>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
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
