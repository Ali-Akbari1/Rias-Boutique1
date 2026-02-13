const Footer = () => {
  return (
    <footer id="contact" className="bg-primary py-14 text-primary-foreground sm:py-16">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-12">
          <div>
            <h3 className="mb-4 font-display text-2xl font-bold">
              Ria&apos;s <span className="text-gold-light">Boutique</span>
            </h3>
            <p className="font-body leading-relaxed text-primary-foreground/70">
              Handcrafted Afghan clothing that bridges heritage and modern elegance.
            </p>
          </div>
          <div>
            <h4 className="mb-4 font-display text-lg font-semibold">Quick Links</h4>
            <ul className="space-y-2 font-body text-primary-foreground/70">
              <li>
                <a href="#collection" className="transition-colors hover:text-gold-light">
                  Collection
                </a>
              </li>
              <li>
                <a href="#about" className="transition-colors hover:text-gold-light">
                  About Us
                </a>
              </li>
              <li>
                <a href="#contact" className="transition-colors hover:text-gold-light">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-display text-lg font-semibold">Get in Touch</h4>
            <ul className="space-y-2 font-body text-primary-foreground/70">
              <li>riasafghanboutique@gmail.com</li>
              <li>+1 (403) 465-0640</li>
              <li>260300 Writing Creek Cres Floor 1, Unit H31, Balzac, AB T4A 0X8</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-primary-foreground/20 pt-6 text-center text-sm font-body text-primary-foreground/50 sm:mt-12 sm:pt-8">
          Copyright 2026 Ria&apos;s Boutique. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
