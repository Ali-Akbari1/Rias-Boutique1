import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { requestDiscountSignup } from "@/lib/site-api";
import {
  getWelcomeDiscountExpiryDateLabel,
  hasWelcomeDiscountExpiry,
  isWelcomeDiscountActive,
} from "@/lib/launch-discount";

const POPUP_STORAGE_KEY = "rb_welcome10_popup_v1";
const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 10000;

const getRandomDelay = () =>
  Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;

const readLocalStorageState = () => {
  try {
    return window.localStorage.getItem(POPUP_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

const writeLocalStorageState = (value: string) => {
  try {
    window.localStorage.setItem(POPUP_STORAGE_KEY, value);
  } catch {
    // ignore storage errors
  }
};

const shouldHidePopupOnPath = (pathname: string) =>
  pathname.startsWith("/checkout") || pathname.startsWith("/orders-admin");

const LaunchDiscountPopup = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const welcomeDiscountActive = isWelcomeDiscountActive();
  const welcomeDiscountEndsLabel = getWelcomeDiscountExpiryDateLabel();
  const welcomeDiscountHasExpiry = hasWelcomeDiscountExpiry();
  const shouldHidePopup = shouldHidePopupOnPath(pathname);

  useEffect(() => {
    if (!welcomeDiscountActive) {
      setOpen(false);
      writeLocalStorageState("");
      return;
    }

    if (shouldHidePopup) {
      setOpen(false);
      return;
    }

    const existingState = readLocalStorageState();
    if (existingState === "dismissed" || existingState === "subscribed") {
      return;
    }

    const timer = window.setTimeout(() => {
      setOpen(true);
    }, getRandomDelay());

    return () => {
      window.clearTimeout(timer);
    };
  }, [welcomeDiscountActive, shouldHidePopup]);

  const isEmailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);
  const canSubmit = useMemo(() => {
    if (!welcomeDiscountActive || isSubmitting || isSuccess) {
      return false;
    }
    return isEmailValid;
  }, [isEmailValid, isSubmitting, isSuccess, welcomeDiscountActive]);

  const submitButtonLabel = isSubmitting
    ? "Sending..."
    : isSuccess
      ? "Code sent to your email"
      : canSubmit
        ? "Send My 10% Code"
        : "Enter your email address";

  const closeWithoutOffer = () => {
    writeLocalStorageState("dismissed");
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSuccess) {
      writeLocalStorageState("dismissed");
    }
    setOpen(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await requestDiscountSignup({
        email: email.trim(),
        source: "welcome-popup",
        website: "",
      });

      writeLocalStorageState("subscribed");
      setIsSuccess(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit your email right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!welcomeDiscountActive || shouldHidePopup) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-[680px] border-border bg-background px-5 py-6 sm:px-8 sm:py-8"
      >
        <div className="mx-auto w-full max-w-[560px] text-center">
          <img
            src="/RAb.png"
            alt="Ria's Boutique"
            className="mx-auto h-11 w-auto object-contain"
            loading="lazy"
            decoding="async"
          />
          {!isSuccess ? (
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Welcome to Ria&apos;s Boutique
            </p>
          ) : null}
          <DialogTitle className="mt-4 text-center font-display font-bold text-foreground">
            {isSuccess ? (
              <span className="text-5xl leading-none sm:text-6xl">Thank You</span>
            ) : (
              <>
                <span className="text-7xl leading-none sm:text-7xl">10%</span>
                <span className="ml-2 text-4xl align-baseline sm:text-6xl">Off</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="mt-3 text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
            {isSuccess ? (
              <>Your welcome code is on the way. Check your inbox and use the same email at checkout for your first-order offer.</>
            ) : (
              <>
                Join the email list to receive 10% off your first order.
                {welcomeDiscountHasExpiry ? (
                  <>
                    {" "}
                    This welcome offer is available until
                    <br />
                    {welcomeDiscountEndsLabel}.
                  </>
                ) : null}{" "}
                Enter your email to receive your code.
              </>
            )}
          </DialogDescription>

          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
              <label htmlFor="welcome-discount-email" className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Email address
              </label>
              <Input
                id="welcome-discount-email"
                type="email"
                maxLength={160}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
              />
              {emailTouched && !isSuccess ? (
                isEmailValid ? (
                  <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Email looks good
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Enter a valid email address
                  </p>
                )
              ) : null}

              <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={!canSubmit}>
                {submitButtonLabel}
              </Button>
              <p className="text-xs text-muted-foreground">
                This code is reserved for email subscribers and applies to first orders only.
              </p>
            </form>
          ) : (
            <Button type="button" className="mt-6 h-11 w-full text-sm font-semibold" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}

          {errorMessage ? (
            <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
          ) : null}
          {!isSuccess ? (
            <button
              type="button"
              onClick={closeWithoutOffer}
              className="mt-5 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Continue shopping without the welcome code
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LaunchDiscountPopup;
