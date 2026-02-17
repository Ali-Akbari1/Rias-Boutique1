import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useCart } from "@/features/cart/context/CartContext";

interface OrderStatusResponse {
  orderId?: string;
  paymentStatus?: string;
  confirmed?: boolean;
  pending?: boolean;
  error?: string | { message?: string };
}

const CheckoutSuccess = () => {
  const { clearCart } = useCart();
  const [searchParams] = useSearchParams();
  const clearedRef = useRef(false);
  const sessionId = searchParams.get("session_id");
  const orderId = searchParams.get("orderId");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Verifying your payment confirmation.");

  useEffect(() => {
    if (isConfirmed && !clearedRef.current) {
      clearCart();
      clearedRef.current = true;
    }
  }, [clearCart, isConfirmed]);

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
        const query = new URLSearchParams();
        if (orderId) {
          query.set("orderId", orderId);
        }
        if (sessionId) {
          query.set("checkoutId", sessionId);
        }

        const response = await fetch(`/api/order-status?${query.toString()}`);
        const payload = (await response.json().catch(() => ({}))) as OrderStatusResponse;
        if (stopped) {
          return;
        }

        if (response.ok && payload.confirmed) {
          setIsConfirmed(true);
          setIsLoading(false);
          setStatusMessage("Payment confirmed.");
          return;
        }

        if (response.ok && payload.pending && attempts < maxAttempts) {
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


