const Footer = () => {
  const googleReviewsUrl =
    (import.meta.env.VITE_GOOGLE_LEAVE_REVIEW_URL as string | undefined) ||
    "https://www.google.com/search?q=Ria's+Boutique+reviews";
  const email = "rias.afghanboutique@gmail.com";
  const phoneDisplay = "+1 (403) 465-0640";
  const phoneHref = "+14034650640";
  const address = "260300 Writing Creek Cres Floor 1, Unit H31, Balzac, AB T4A 0X8";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <footer id="contact" className="bg-primary py-14 text-white sm:py-16">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-12">
          <div>
            <h3 className="mb-4 font-display text-2xl font-bold">
              Ria&apos;s <span className="text-white">Boutique</span>
            </h3>
            <p className="font-body leading-relaxed text-white/80">
              Handcrafted Afghan clothing that bridges heritage and modern elegance.
            </p>
          </div>
          <div className="text-left md:justify-self-center md:text-center">
            <h4 className="mb-4 font-display text-lg font-semibold">Quick Links</h4>
            <ul className="space-y-2 font-body text-white/80">
              <li>
                <a href="#collection" className="transition-colors hover:text-white">
                  Collection
                </a>
              </li>
              <li>
                <a href="#reviews" className="transition-colors hover:text-white">
                  Reviews
                </a>
              </li>
              <li>
                <a href="#instagram" className="transition-colors hover:text-white">
                  Instagram
                </a>
              </li>
              <li>
                <a href="#about" className="transition-colors hover:text-white">
                  About Us
                </a>
              </li>
              <li>
                <a href="#contact" className="transition-colors hover:text-white">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-display text-lg font-semibold">Get in Touch</h4>
            <ul className="space-y-2 font-body text-white/80">
              <li>
                <a href={`mailto:${email}`} className="transition-colors hover:text-white">
                  {email}
                </a>
              </li>
              <li>
                <a href={`tel:${phoneHref}`} className="transition-colors hover:text-white">
                  {phoneDisplay}
                </a>
              </li>
              <li>
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
                  {address}
                </a>
              </li>
              <li>
                <a href={googleReviewsUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
                  Leave a Google Review
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-white/25 pt-6 text-center text-sm font-body text-white/70 sm:mt-12 sm:pt-8">
          Copyright 2026 Ria&apos;s Boutique. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
