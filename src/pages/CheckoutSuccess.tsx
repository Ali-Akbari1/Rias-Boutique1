import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCart } from "@/context/CartContext";

const CheckoutSuccess = () => {
  const { clearCart } = useCart();
  const [searchParams] = useSearchParams();
  const clearedRef = useRef(false);
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!clearedRef.current) {
      clearCart();
      clearedRef.current = true;
    }
  }, [clearCart]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <CardTitle className="font-display text-3xl">Payment Successful</CardTitle>
          <CardDescription className="font-body text-base">
            Thank you for your order. Stripe has confirmed your payment and your bag has been cleared.
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
