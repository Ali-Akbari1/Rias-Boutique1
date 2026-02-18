import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { formatCad } from "@/lib/money";

type PaymentStatus = "pending" | "paid" | "failed" | "canceled";

interface AdminOrder {
  id: string;
  paymentStatus: PaymentStatus;
  cloverCheckoutId: string;
  paymentReference: string;
  subtotalMinor: number;
  totalMinor: number;
  customer: {
    fullName: string;
    email: string;
    phone?: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  lineItems: Array<{
    productId: string;
    name: string;
    unitAmountMinor: number;
    quantity: number;
    lineTotalMinor: number;
  }>;
  createdAt: string;
  paidAt: string;
}

interface AdminOrdersResponse {
  orders?: AdminOrder[];
  count?: number;
  error?: {
    message?: string;
  };
}

const formatDate = (value: string) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const formatMinorCad = (value: number) => formatCad((Number(value) || 0) / 100);

const statusBadgeVariant = (status: PaymentStatus): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "paid") {
    return "default";
  }
  if (status === "pending") {
    return "secondary";
  }
  if (status === "failed" || status === "canceled") {
    return "destructive";
  }
  return "outline";
};

const AdminOrders = () => {
  const [adminToken, setAdminToken] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const paidOrders = useMemo(() => orders.filter((order) => order.paymentStatus === "paid"), [orders]);
  const paidRevenueMinor = useMemo(
    () => paidOrders.reduce((sum, order) => sum + (Number(order.totalMinor) || 0), 0),
    [paidOrders],
  );

  const loadOrders = async (event?: FormEvent) => {
    event?.preventDefault();
    const token = adminToken.trim();

    if (!token) {
      setErrorMessage("Enter your admin dashboard token.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin-orders", {
        method: "GET",
        headers: {
          "x-admin-token": token,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as AdminOrdersResponse;
      if (!response.ok) {
        const message =
          payload?.error?.message || "Unable to load orders. Check your admin token and try again.";
        throw new Error(message);
      }

      const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
      setOrders(nextOrders);
      setHasLoadedOnce(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load orders.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to store
          </Link>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-2xl">Admin Orders</CardTitle>
            <CardDescription className="font-body text-base">
              View customer shipping details, line items, and payment status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={loadOrders} className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="Enter admin dashboard token"
                className="sm:max-w-md"
                autoComplete="off"
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading
                    </>
                  ) : (
                    "Load Orders"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => void loadOrders()} disabled={isLoading || !adminToken.trim()}>
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </form>
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Orders</CardDescription>
              <CardTitle className="font-display text-2xl">{orders.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid Orders</CardDescription>
              <CardTitle className="font-display text-2xl">{paidOrders.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid Revenue</CardDescription>
              <CardTitle className="font-display text-2xl">{formatMinorCad(paidRevenueMinor)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {hasLoadedOnce && orders.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">No orders found.</CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="gap-3 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="font-display text-lg">Order {order.id}</CardTitle>
                  <Badge variant={statusBadgeVariant(order.paymentStatus)}>{order.paymentStatus.toUpperCase()}</Badge>
                </div>
                <CardDescription className="font-body text-sm">
                  Created: {formatDate(order.createdAt)} | Paid: {formatDate(order.paidAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3">
                  <p>
                    <span className="font-semibold text-foreground">Customer:</span> {order.customer.fullName}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Email:</span> {order.customer.email}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Phone:</span> {order.customer.phone || "-"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Shipping:</span> {order.customer.address},{" "}
                    {order.customer.city}, {order.customer.state} {order.customer.postalCode}, {order.customer.country}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="font-semibold text-foreground">Line Items</p>
                  {order.lineItems.map((item) => (
                    <div key={`${order.id}-${item.productId}-${item.name}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.productId} | {item.quantity} x {formatMinorCad(item.unitAmountMinor)}
                        </p>
                      </div>
                      <p className="font-semibold text-foreground">{formatMinorCad(item.lineTotalMinor)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>Checkout ID: {order.cloverCheckoutId || "-"}</p>
                  <p>Payment Reference: {order.paymentReference || "-"}</p>
                  <p className="font-semibold text-foreground sm:col-span-2">Order Total: {formatMinorCad(order.totalMinor)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default AdminOrders;
