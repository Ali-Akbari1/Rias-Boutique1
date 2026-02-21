import heroBg from "@/assets/hero-bg.png";
import { Link } from "react-router-dom";

const HeroSection = () => {
  return (
    <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden pt-16 sm:min-h-[80vh]">
      <img
        src={heroBg}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-[70%_85%] sm:object-[60%_48%] lg:object-[60%_85%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/12 to-transparent" />
      
      <div className="relative z-10 container mx-auto flex flex-col items-start px-4 sm:px-6">
        <div className="max-w-xl animate-fade-in text-white">
          <p className="mb-4 text-sm font-body uppercase tracking-[0.25em] text-white sm:text-lg sm:tracking-[0.3em]">
            Afghan Heritage Collection
          </p>
          <h2 className="mb-6 text-4xl font-display font-bold leading-tight text-white sm:text-5xl md:text-7xl">
            Timeless Elegance, <br />
            <span className="italic text-white">Crafted by Hand</span>
          </h2>
          <p className="mb-8 max-w-md text-lg font-body leading-relaxed text-white sm:text-xl">
            Exquisite Afghan clothing adorned with centuries-old embroidery traditions. Each piece tells a story.
          </p>
          <Link
            to="/collection"
            className="inline-flex items-center rounded-sm border-2 border-foreground bg-background px-7 py-3.5 text-base font-body font-semibold tracking-wide text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground sm:px-8 sm:py-4 sm:text-lg"
          >
            Explore Collection
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
