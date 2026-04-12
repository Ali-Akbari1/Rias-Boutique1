import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useCartActions } from "@/features/cart/context/CartContext";
import { requestOrderStatus } from "@/lib/site-api";
import { track } from "@vercel/analytics/react";

const CheckoutSuccess = () => {
  const { clearCart } = useCartActions();
  const [searchParams] = useSearchParams();
  const clearedRef = useRef(false);
  const sessionId = searchParams.get("session_id");
  const orderId = searchParams.get("orderId");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Verifying your payment confirmation.");
  const [gcrPayload, setGcrPayload] = useState<{
    orderId: string;
    email: string;
    deliveryCountry: string;
    estimatedDeliveryDate: string;
  } | null>(null);
  const trackedRef = useRef(false);
  const gcrRenderedRef = useRef(false);

  useEffect(() => {
    if (isConfirmed && !clearedRef.current) {
      clearCart();
      clearedRef.current = true;
    }
  }, [clearCart, isConfirmed]);

  useEffect(() => {
    if (isConfirmed && !trackedRef.current) {
      track("Purchase Success", {
        provider: "clover",
        hasOrderId: Boolean(orderId),
        hasSessionId: Boolean(sessionId),
      });
      trackedRef.current = true;
    }
  }, [isConfirmed, orderId, sessionId]);

  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    const maxAttempts = 10;

    const verifyStatus = async () => {
      if (!orderId && !sessionId) {
        setIsLoading(false);
        setStatusMessage("Missing order reference. Please contact support if payment was completed.");
        return;
      }

      attempts += 1;
      try {
        const payload = await requestOrderStatus({
          orderId: orderId || undefined,
          checkoutId: sessionId || undefined,
        });
        if (stopped) {
          return;
        }

        if (payload.orderId && payload.customerEmail && payload.deliveryCountry && payload.estimatedDeliveryDate) {
          setGcrPayload({
            orderId: payload.orderId,
            email: payload.customerEmail,
            deliveryCountry: payload.deliveryCountry,
            estimatedDeliveryDate: payload.estimatedDeliveryDate,
          });
        }

        if (payload.confirmed) {
          setIsConfirmed(true);
          setIsLoading(false);
          setStatusMessage("Payment confirmed.");
          return;
        }

        if (payload.pending && attempts < maxAttempts) {
          setIsLoading(true);
          setStatusMessage("Payment received and pending confirmation. This can take a few seconds.");
          return;
        }

        setIsLoading(false);
        setStatusMessage("We could not verify payment confirmation yet. Please check back shortly.");
      } catch {
        if (!stopped) {
          setIsLoading(false);
          setStatusMessage("Unable to verify payment confirmation right now. Please refresh in a moment.");
        }
      }
    };

    verifyStatus();
    const interval = window.setInterval(() => {
      if (!isConfirmed && attempts < maxAttempts) {
        verifyStatus();
      }
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [isConfirmed, orderId, sessionId]);

  useEffect(() => {
    if (!isConfirmed || !gcrPayload || gcrRenderedRef.current) {
      return;
    }

    const merchantId = (import.meta.env.VITE_GCR_MERCHANT_ID || "5741454598").trim();
    if (!merchantId) {
      return;
    }

    gcrRenderedRef.current = true;
    window.renderOptIn = () => {
      window.gapi?.load("surveyoptin", () => {
        window.gapi?.surveyoptin?.render({
          merchant_id: Number(merchantId),
          order_id: gcrPayload.orderId,
          email: gcrPayload.email,
          delivery_country: gcrPayload.deliveryCountry,
          estimated_delivery_date: gcrPayload.estimatedDeliveryDate,
        });
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-gcr-optin="true"]');
    if (existingScript) {
      if (window.gapi?.surveyoptin) {
        window.renderOptIn?.();
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/platform.js?onload=renderOptIn";
    script.async = true;
    script.defer = true;
    script.setAttribute("data-gcr-optin", "true");
    document.body.appendChild(script);
  }, [gcrPayload, isConfirmed]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
            {isLoading ? <Loader2 className="h-8 w-8 animate-spin" /> : <CheckCircle2 className="h-8 w-8" />}
          </div>
          <CardTitle className="font-display text-3xl">
            {isConfirmed ? "Payment Successful" : "Payment Confirmation Pending"}
          </CardTitle>
          <CardDescription className="font-body text-base">
            {isConfirmed
              ? "Thank you for your order. Clover has confirmed your payment and your bag has been cleared."
              : statusMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {sessionId && (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Session ID: {sessionId}
            </p>
          )}

          <Button asChild className="h-11 w-full text-base font-semibold">
            <Link to="/">Back to collection</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckoutSuccess;


