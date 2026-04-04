import heroBg from "@/assets/hero-bg.webp";
import { Link } from "react-router-dom";
import { prefetchCollectionPage } from "@/lib/prefetch";

const HeroSection = () => {
  const heroCtaClass =
    "inline-flex h-10 w-40 items-center justify-center rounded-sm border-2 border-foreground bg-background px-4 text-sm font-body font-semibold tracking-wide text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground sm:h-auto sm:w-auto sm:px-7 sm:py-3.5 sm:text-base";

  return (
    <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden pt-16 sm:min-h-[80vh]">
      <img
        src={heroBg}
        alt=""
        aria-hidden="true"
        loading="eager"
        className="absolute inset-0 h-full w-full object-cover object-[70%_85%] sm:object-[60%_48%] lg:object-[60%_85%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/12 to-transparent" />
      
      <div className="relative z-10 container mx-auto flex flex-col items-start px-4 sm:px-6">
        <div className="max-w-xl animate-fade-in text-white">
          <p className="mb-4 pl-1.5 text-sm font-brand uppercase tracking-[0.28em] text-white sm:pl-2 sm:text-lg sm:tracking-[0.34em]">
            R I A ' S B O U T I Q U E
          </p>
          <h2 className="mb-6 text-4xl font-display font-bold leading-tight text-white sm:text-5xl md:text-7xl">
            Elevated Afghan Fashion, redefined
          </h2>
          <p className="mb-8 max-w-md text-lg font-body leading-relaxed text-white sm:text-xl">
            Hand-finished embroidery, shipped worldwide, and designed to stand out.
          </p>
          <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <Link
              to="/collection/women"
              className={heroCtaClass}
              onMouseEnter={() => void prefetchCollectionPage()}
              onFocus={() => void prefetchCollectionPage()}
            >
              Shop Women's
            </Link>
            <Link
              to="/collection/men"
              className={heroCtaClass}
              onMouseEnter={() => void prefetchCollectionPage()}
              onFocus={() => void prefetchCollectionPage()}
            >
              Shop Men's
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
