const AboutSection = () => {
  return (
    <section id="about" className="bg-cream-dark py-16 sm:py-20">
      <div className="container mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Our Story</p>
        <h2 className="mb-6 text-3xl font-display font-bold text-foreground sm:text-4xl">
          A Legacy of Craftsmanship
        </h2>
        <p className="mb-4 text-base font-body leading-relaxed text-muted-foreground sm:text-lg">
          Ria&apos;s Boutique celebrates the rich textile heritage of Afghanistan. Every garment in our collection is
          handcrafted by skilled artisans, preserving centuries-old embroidery techniques passed down through
          generations.
        </p>
        <p className="text-base font-body leading-relaxed text-muted-foreground sm:text-lg">
          From the intricate zarbaft gold threadwork to delicate mirror embellishments, each piece is a wearable work
          of art designed for the modern woman who honors tradition with grace.
        </p>
      </div>
    </section>
  );
};

export default AboutSection;
