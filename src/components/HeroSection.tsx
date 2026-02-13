import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative flex min-h-[78vh] items-center justify-center overflow-hidden pt-16 sm:min-h-[85vh]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-foreground/80 via-foreground/60 to-transparent sm:bg-gradient-to-r" />
      
      <div className="relative z-10 container mx-auto flex flex-col items-start px-4 sm:px-6">
        <div className="max-w-xl animate-fade-in">
          <p className="mb-4 text-sm font-body uppercase tracking-[0.25em] text-gold-light sm:text-lg sm:tracking-[0.3em]">
            Afghan Heritage Collection
          </p>
          <h2 className="mb-6 text-4xl font-display font-bold leading-tight text-cream sm:text-5xl md:text-7xl">
            Timeless Elegance, <br />
            <span className="italic text-gold-light">Crafted by Hand</span>
          </h2>
          <p className="mb-8 max-w-md text-lg font-body leading-relaxed text-cream-dark sm:text-xl">
            Exquisite Afghan clothing adorned with centuries-old embroidery traditions. Each piece tells a story.
          </p>
          <a
            href="#collection"
            className="inline-block rounded-sm gradient-gold px-7 py-3.5 text-base font-body font-semibold tracking-wide text-foreground transition-opacity hover:opacity-90 sm:px-8 sm:py-4 sm:text-lg"
          >
            Explore Collection
          </a>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
