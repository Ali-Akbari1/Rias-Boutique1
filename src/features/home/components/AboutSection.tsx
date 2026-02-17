const AboutSection = () => {
  return (
    <section id="about" className="bg-cream-dark py-16 sm:py-20">
      <div className="container mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Our Story</p>
        <h2 className="mb-6 text-3xl font-display font-bold text-foreground sm:text-4xl">
          A Legacy of Craftsmanship
        </h2>
        <p className="mb-4 text-base font-body leading-relaxed text-muted-foreground sm:text-lg">
        Founded in Canada, our women-owned business was created to honor Afghan craftsmanship while empowering the talented men and women behind every stitch. 
        We are proud to bring authentic Afghan designs to a modern global audience while staying true to their traditional roots.
        </p>
        <p className="text-base font-body leading-relaxed text-muted-foreground sm:text-lg">
        Each garment is more than clothing, it is a wearable work of art designed for the modern woman who carries tradition with confidence, grace, and pride.
        </p>
      </div>
    </section> 
  );
};

export default AboutSection;
