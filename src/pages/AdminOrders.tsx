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
  pricing?: {
    discountCode?: string;
    discountMinor?: number;
    shippingMinor?: number;
    quotedShippingMinor?: number;
    taxMinor?: number;
    freeShippingApplied?: boolean;
  };
  customer: {
    deliveryMethod?: "shipping" | "pickup";
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
  shippingQuote?: {
    carrier?: string;
    service?: string;
    deliveryDays?: number | null;
    expiresAt?: string;
  } | null;
  shipment?: {
    shipmentId?: string;
    carrier?: string;
    service?: string;
    trackingCode?: string;
    trackingUrl?: string;
    labelUrl?: string;
    labelPdfUrl?: string;
    trackingQrCodeDataUrl?: string;
    labelQrCodeDataUrl?: string;
    status?: string;
    purchasedAt?: string;
  } | null;
  createdAt: string;
  paidAt: string;
}

interface AdminOrdersResponse {
  orders?: AdminOrder[];
  count?: number;
  order?: AdminOrder;
  message?: string;
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
const getOrderPricing = (order: AdminOrder) => ({
  discountCode: order.pricing?.discountCode?.trim().toUpperCase() || "",
  discountMinor: Number(order.pricing?.discountMinor) || 0,
  shippingMinor: Number(order.pricing?.shippingMinor) || 0,
  quotedShippingMinor: Number(order.pricing?.quotedShippingMinor) || 0,
  taxMinor: Number(order.pricing?.taxMinor) || 0,
  freeShippingApplied: Boolean(order.pricing?.freeShippingApplied),
});

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
  const [retryingOrderId, setRetryingOrderId] = useState("");
  const [refundingOrderId, setRefundingOrderId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
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
    setStatusMessage("");

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

  const retryLabelPurchase = async (orderId: string) => {
    const token = adminToken.trim();
    if (!token) {
      setErrorMessage("Enter your admin dashboard token.");
      return;
    }

    setRetryingOrderId(orderId);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/admin-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          action: "retry_label_purchase",
          orderId,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as AdminOrdersResponse;
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Unable to purchase a shipping label right now.");
      }

      if (payload.order) {
        setOrders((currentOrders) => currentOrders.map((order) => (order.id === payload.order?.id ? payload.order : order)));
      }
      setStatusMessage(payload.message || "Shipping label purchased successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to purchase a shipping label.");
    } finally {
      setRetryingOrderId("");
    }
  };

  const refundLabel = async (orderId: string) => {
    const token = adminToken.trim();
    if (!token) {
      setErrorMessage("Enter your admin dashboard token.");
      return;
    }

    setRefundingOrderId(orderId);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/admin-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          action: "refund_label",
          orderId,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as AdminOrdersResponse;
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Unable to request a shipping label refund right now.");
      }

      if (payload.order) {
        setOrders((currentOrders) => currentOrders.map((order) => (order.id === payload.order?.id ? payload.order : order)));
      }
      setStatusMessage(payload.message || "Label refund requested successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to request a shipping label refund.");
    } finally {
      setRefundingOrderId("");
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
            {statusMessage ? <p className="text-sm text-foreground">{statusMessage}</p> : null}
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
          {orders.map((order) => {
            const pricing = getOrderPricing(order);

            return (
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
                    <span className="font-semibold text-foreground">Fulfillment:</span>{" "}
                    {order.customer.deliveryMethod === "pickup" ? "Pick up in store" : "Shipping"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Customer:</span> {order.customer.fullName}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Email:</span> {order.customer.email}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Phone:</span> {order.customer.phone || "-"}
                  </p>
                  {order.customer.deliveryMethod === "pickup" ? (
                    <p>
                      <span className="font-semibold text-foreground">Shipping:</span> Pickup in store selected.
                    </p>
                  ) : (
                    <p>
                      <span className="font-semibold text-foreground">Shipping:</span> {order.customer.address},{" "}
                      {order.customer.city}, {order.customer.state} {order.customer.postalCode}, {order.customer.country}
                    </p>
                  )}
                </div>

                {order.customer.deliveryMethod === "shipping" ? (
                  <div className="grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-foreground">Quoted Rate:</span>{" "}
                      {pricing.quotedShippingMinor > 0 ? formatMinorCad(pricing.quotedShippingMinor) : "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Customer Charged:</span>{" "}
                      {pricing.shippingMinor > 0 ? formatMinorCad(pricing.shippingMinor) : pricing.freeShippingApplied ? "Free" : "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Selected Service:</span>{" "}
                      {order.shipment
                        ? [order.shipment.carrier, order.shipment.service].filter(Boolean).join(" ") || "-"
                        : order.shippingQuote
                        ? [order.shippingQuote.carrier, order.shippingQuote.service].filter(Boolean).join(" ") || "-"
                        : "-"}
                    </p>
                     <p>
                       <span className="font-semibold text-foreground">Tracking:</span>{" "}
                       {order.shipment?.trackingCode || "Pending label purchase"}
                     </p>
                     {order.shipment?.status ? (
                       <p>
                         <span className="font-semibold text-foreground">Shipment Status:</span>{" "}
                         {order.shipment.status.replace(/_/g, " ")}
                       </p>
                     ) : null}
                     {!order.shipment && order.shippingQuote && order.paymentStatus === "paid" ? (
                       <div className="sm:col-span-2">
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => void retryLabelPurchase(order.id)}
                           disabled={retryingOrderId === order.id}
                         >
                           {retryingOrderId === order.id ? (
                             <>
                               <Loader2 className="h-4 w-4 animate-spin" />
                               Retrying label purchase
                             </>
                           ) : (
                             "Retry label purchase"
                           )}
                         </Button>
                       </div>
                     ) : null}
                     {order.shipment?.trackingUrl ? (
                       <p className="sm:col-span-2">
                        <span className="font-semibold text-foreground">Tracking Link:</span>{" "}
                        <a
                          href={order.shipment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          Open tracking
                        </a>
                      </p>
                    ) : null}
                     {order.shipment?.labelPdfUrl || order.shipment?.labelUrl ? (
                       <p className="sm:col-span-2">
                         <span className="font-semibold text-foreground">Label:</span>{" "}
                        <a
                          href={order.shipment.labelPdfUrl || order.shipment.labelUrl || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                         >
                           Download label
                         </a>
                       </p>
                     ) : null}
                     {order.shipment && order.paymentStatus === "paid" && !order.shipment.status?.startsWith("refund_") ? (
                       <div className="sm:col-span-2">
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => void refundLabel(order.id)}
                           disabled={refundingOrderId === order.id}
                         >
                           {refundingOrderId === order.id ? (
                             <>
                               <Loader2 className="h-4 w-4 animate-spin" />
                               Requesting refund
                             </>
                           ) : (
                             "Refund label"
                           )}
                         </Button>
                       </div>
                     ) : null}
                     {order.shipment?.trackingQrCodeDataUrl || order.shipment?.labelQrCodeDataUrl ? (
                       <div className="grid gap-3 pt-2 sm:col-span-2 sm:grid-cols-2">
                        {order.shipment?.trackingQrCodeDataUrl ? (
                          <div className="rounded-md border border-border bg-muted/20 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tracking QR</p>
                            <img
                              src={order.shipment.trackingQrCodeDataUrl}
                              alt={`Tracking QR for order ${order.id}`}
                              className="h-32 w-32 rounded-sm border border-border bg-background p-2"
                            />
                          </div>
                        ) : null}
                        {order.shipment?.labelQrCodeDataUrl ? (
                          <div className="rounded-md border border-border bg-muted/20 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Label QR</p>
                            <img
                              src={order.shipment.labelQrCodeDataUrl}
                              alt={`Label QR for order ${order.id}`}
                              className="h-32 w-32 rounded-sm border border-border bg-background p-2"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

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
                  {pricing.discountMinor > 0 ? (
                    <p>Discount{pricing.discountCode ? ` (${pricing.discountCode})` : ""}: -{formatMinorCad(pricing.discountMinor)}</p>
                  ) : null}
                  <p>Tax: {formatMinorCad(pricing.taxMinor)}</p>
                  <p className="font-semibold text-foreground sm:col-span-2">Order Total: {formatMinorCad(order.totalMinor)}</p>
                </div>
              </CardContent>
            </Card>
          )})}
        </div>
      </main>
    </div>
  );
};

export default AdminOrders;
