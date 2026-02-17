import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CheckoutCancel = () => {
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error_code");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircle className="h-8 w-8" />
          </div>
          <CardTitle className="font-display text-3xl">Checkout Canceled</CardTitle>
          <CardDescription className="font-body text-base">
            Your payment was canceled before completion. Your items are still in your bag.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorCode && (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Clover code: {errorCode}
            </p>
          )}
          <Button asChild className="h-11 w-full text-base font-semibold">
            <Link to="/checkout">Return to checkout</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full text-base font-semibold">
            <Link to="/">Back to shop</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckoutCancel;
