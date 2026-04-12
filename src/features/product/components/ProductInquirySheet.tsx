import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarClock, Mail, Phone, Send, Sparkles } from "lucide-react";
import { type Product } from "@/features/catalog/data/products";
import { useToast } from "@/hooks/use-toast";
import { requestProductInquiry } from "@/lib/site-api";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

interface ProductInquirySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  selectedSize?: string;
  selectedColor?: string;
}

const getTodayDateString = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

const ProductInquirySheet = ({
  open,
  onOpenChange,
  product,
  selectedSize = "",
  selectedColor = "",
}: ProductInquirySheetProps) => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [occasion, setOccasion] = useState("");
  const [sizeNotes, setSizeNotes] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const minDate = useMemo(() => getTodayDateString(), []);
  const selectedVariant = useMemo(() => {
    const parts = [
      selectedSize ? `Size: ${selectedSize}` : "",
      selectedColor ? `Color: ${selectedColor}` : "",
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" | ") : "Not selected";
  }, [selectedColor, selectedSize]);

  useEffect(() => {
    if (open && !requiredByDate) {
      setRequiredByDate(minDate);
    }
  }, [minDate, open, requiredByDate]);

  useEffect(() => {
    if (open) {
      return;
    }

    setIsSubmitting(false);
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const productUrl = typeof window !== "undefined" ? window.location.href : product.slug;
      await requestProductInquiry({
        productId: product.id,
        productName: product.name,
        productSku: product.id,
        productUrl,
        selectedVariant,
        fullName,
        email,
        phone,
        location,
        requiredByDate,
        occasion,
        sizeNotes,
        message,
        website: "",
      });

      toast({
        title: "Inquiry sent",
        description: "We've received your request and will follow up with pricing details soon.",
      });
      setFullName("");
      setEmail("");
      setPhone("");
      setLocation("");
      setRequiredByDate(minDate);
      setOccasion("");
      setSizeNotes("");
      setMessage("");
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Unable to send inquiry",
        description: error instanceof Error ? error.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="left-auto right-0 top-0 flex h-[100dvh] max-w-xl translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l px-0 py-0 data-[state=closed]:slide-out-to-right data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-right data-[state=open]:slide-in-from-top-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-border bg-card/70 px-6 py-5 text-left">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">
              <Sparkles className="h-3.5 w-3.5" />
              Inquiry Only
            </div>
            <DialogTitle className="pt-3 font-display text-2xl text-foreground">Make an Inquiry</DialogTitle>
            <DialogDescription className="max-w-md text-sm leading-6 text-muted-foreground">
              Share your timeline, location, and any special notes. We&apos;ll reply with availability and a tailored quote.
            </DialogDescription>
          </DialogHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 rounded-2xl border border-border bg-card/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Product of Interest</p>
                <p className="mt-2 font-display text-xl text-foreground">{product.name}</p>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">SKU:</span> {product.id}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Selected variant:</span> {selectedVariant}
                  </p>
                </div>
              </div>

              <div className="space-y-4 pb-6">
                <div className="space-y-2">
                  <label htmlFor="inquiry-product-name" className="text-sm font-semibold text-foreground">
                    Product Name
                  </label>
                  <Input id="inquiry-product-name" value={product.name} readOnly className="bg-muted/30" />
                </div>

                <div className="space-y-2">
                  <label htmlFor="inquiry-full-name" className="text-sm font-semibold text-foreground">
                    Full Name
                  </label>
                  <Input
                    id="inquiry-full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="inquiry-email" className="text-sm font-semibold text-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="inquiry-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="inquiry-phone" className="text-sm font-semibold text-foreground">
                      Phone
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="inquiry-phone"
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="Optional"
                        autoComplete="tel"
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="inquiry-location" className="text-sm font-semibold text-foreground">
                    Location
                  </label>
                  <Input
                    id="inquiry-location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="City, Province / State"
                    autoComplete="address-level2"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="inquiry-required-date" className="text-sm font-semibold text-foreground">
                      Required By Date
                    </label>
                    <div className="relative">
                      <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="inquiry-required-date"
                        type="date"
                        value={requiredByDate}
                        min={minDate}
                        onChange={(event) => setRequiredByDate(event.target.value)}
                        required
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="inquiry-occasion" className="text-sm font-semibold text-foreground">
                      Occasion
                    </label>
                    <Input
                      id="inquiry-occasion"
                      value={occasion}
                      onChange={(event) => setOccasion(event.target.value)}
                      placeholder="Wedding, Nikkah, Birthday..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="inquiry-size-notes" className="text-sm font-semibold text-foreground">
                    Size or Measurements
                  </label>
                  <Input
                    id="inquiry-size-notes"
                    value={sizeNotes}
                    onChange={(event) => setSizeNotes(event.target.value)}
                    placeholder="Optional details to help with your quote"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="inquiry-message" className="text-sm font-semibold text-foreground">
                    Message
                  </label>
                  <textarea
                    id="inquiry-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Tell us about your event, preferred details, or any special requests."
                    required
                    rows={6}
                    className={cn(
                      "flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-background/95 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <p className="text-xs leading-5 text-muted-foreground">
                We&apos;ll use your selected product details and current page link automatically so you don&apos;t have to repeat yourself.
              </p>
              <div className="mt-3 flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
                  <Send className="h-4 w-4" />
                  {isSubmitting ? "Sending..." : "Send Inquiry"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductInquirySheet;
