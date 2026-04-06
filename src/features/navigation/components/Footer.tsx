import { getStorePickupDetails } from "@/features/store/data/store-content";
import { Link } from "react-router-dom";

const Footer = () => {
  const googleReviewsUrl =
    (import.meta.env.VITE_GOOGLE_LEAVE_REVIEW_URL as string | undefined) ||
    "https://www.google.com/search?q=Ria's+Boutique+reviews";
  const email = "rias.afghanboutique@gmail.com";
  const pickupDetails = getStorePickupDetails();
  const phoneDisplay = pickupDetails.phoneDisplay;
  const phoneHref = pickupDetails.phoneHref;
  const address = pickupDetails.address;
  const mapsUrl = pickupDetails.mapsUrl;
  const paymentLogos = [
    {
      label: "Visa",
      src: "/payment-logos/visa.svg",
    },
    {
      label: "Mastercard",
      src: "/payment-logos/mastercard.svg",
    },
    {
      label: "American Express",
      src: "/payment-logos/amex.png",
    },
    {
      label: "Discover",
      src: "/payment-logos/discover.png",
    },
    {
      label: "UnionPay",
      src: "/payment-logos/unionpay.png",
    },
    {
      label: "JCB",
      src: "/payment-logos/jcb.gif",
    },
    {
      label: "Google Pay",
      src: "/payment-logos/google-pay.svg",
    },
    {
      label: "Samsung Pay",
      src: "/payment-logos/samsung-pay.png",
    },
  ];

  return (
    <footer id="contact" className="bg-primary py-14 text-white sm:py-16">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-12">
          <div>
            <h3 className="mb-4 font-brand text-lg uppercase tracking-[0.2em] sm:text-xl">
              <span className="inline-block">R I A ' S</span>
              <span className="inline-block ml-4">B O U T I Q U E</span>
            </h3>
            <p className="font-body leading-relaxed text-white/80">
              Handcrafted Afghan clothing that bridges heritage and modern elegance, curated in Calgary.
            </p>
          </div>
          <div className="text-left md:justify-self-center md:text-center">
            <h4 className="mb-4 font-display text-lg font-semibold">Quick Links</h4>
            <ul className="space-y-2 font-body text-white/80">
              <li>
                <Link to="/collection" className="transition-colors hover:text-white">
                  Collection
                </Link>
              </li>
              <li>
                <Link to="/#reviews" className="transition-colors hover:text-white">
                  Reviews
                </Link>
              </li>
              <li>
                <Link to="/#instagram" className="transition-colors hover:text-white">
                  Instagram
                </Link>
              </li>
              <li>
                <Link to="/about" className="transition-colors hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link to="/faq" className="transition-colors hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/#contact" className="transition-colors hover:text-white">
                  Contact
                </Link>
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
        <div className="mt-10 border-t border-white/25 pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Accepted Payments
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
            {paymentLogos.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/95 px-3 py-2 shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
                aria-label={item.label}
              >
                <img src={item.src} alt={item.label} className="h-5 w-auto sm:h-7" loading="lazy" />
              </span>
            ))}
          </div>
        </div>
        <div className="mt-10 border-t border-white/25 pt-6 text-center text-sm font-body text-white/70 sm:mt-12 sm:pt-8">
          Copyright 2026 Ria&apos;s Boutique. All rights reserved. Website designed &amp; developed by{" "}
          <a
            href="https://www.linkedin.com/in/ali-akbari-a2468227b/"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            Ali Akbari
          </a>
          .
        </div>
      </div>
    </footer>
  );
};

export default Footer;
