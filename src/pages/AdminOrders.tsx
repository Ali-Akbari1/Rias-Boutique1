import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import {
  requestAdminOrders,
  requestRefundShipmentLabel,
  requestRetryShipmentLabel,
  requestSendTrackingEmail,
  requestUpdateManualTracking,
  type AdminOrder,
  type PaymentStatus,
} from "@/lib/admin-api";
import { formatCad } from "@/lib/money";

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

const CARRIER_PRESETS = ["Canada Post", "USPS", "UPS", "FedEx", "DHL", "Purolator"];
const resolveCarrierPreset = (value: string) => (CARRIER_PRESETS.includes(value) ? value : "");

const AdminOrders = () => {
  const [adminToken, setAdminToken] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [retryingOrderId, setRetryingOrderId] = useState("");
  const [refundingOrderId, setRefundingOrderId] = useState("");
  const [sendingTrackingOrderId, setSendingTrackingOrderId] = useState("");
  const [savingTrackingOrderId, setSavingTrackingOrderId] = useState("");
  const [trackingInputs, setTrackingInputs] = useState<
    Record<string, { code: string; url: string; carrier: string; service: string }>
  >({});
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
      const payload = await requestAdminOrders(token);
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
      const payload = await requestRetryShipmentLabel(token, orderId);
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
      const payload = await requestRefundShipmentLabel(token, orderId);
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

  const sendTrackingEmail = async (orderId: string) => {
    const token = adminToken.trim();
    if (!token) {
      setErrorMessage("Enter your admin dashboard token.");
      return;
    }

    setSendingTrackingOrderId(orderId);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const payload = await requestSendTrackingEmail(token, orderId);
      if (payload.order) {
        setOrders((currentOrders) => currentOrders.map((order) => (order.id === payload.order?.id ? payload.order : order)));
      }
      setStatusMessage(payload.message || "Tracking email sent successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send the tracking email.");
    } finally {
      setSendingTrackingOrderId("");
    }
  };

  const updateTrackingInput = (
    order: AdminOrder,
    field: "code" | "url" | "carrier" | "service",
    value: string,
  ) => {
    setTrackingInputs((current) => {
      const existing = current[order.id] || {
        code: order.shipment?.trackingCode || "",
        url: order.shipment?.trackingUrl || "",
        carrier: order.shipment?.carrier || "",
        service: order.shipment?.service || "",
      };
      return {
        ...current,
        [order.id]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const saveManualTracking = async (order: AdminOrder) => {
    const token = adminToken.trim();
    if (!token) {
      setErrorMessage("Enter your admin dashboard token.");
      return;
    }

    const trackingValues = trackingInputs[order.id] || {
      code: order.shipment?.trackingCode || "",
      url: order.shipment?.trackingUrl || "",
      carrier: order.shipment?.carrier || "",
      service: order.shipment?.service || "",
    };

    if (!trackingValues.code.trim() && !trackingValues.url.trim()) {
      setErrorMessage("Enter a tracking number or tracking link before saving.");
      return;
    }

    setSavingTrackingOrderId(order.id);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const payload = await requestUpdateManualTracking(token, {
        orderId: order.id,
        trackingCode: trackingValues.code.trim(),
        trackingUrl: trackingValues.url.trim(),
        carrier: trackingValues.carrier.trim(),
        service: trackingValues.service.trim(),
      });
      if (payload.order) {
        setOrders((currentOrders) => currentOrders.map((entry) => (entry.id === payload.order?.id ? payload.order : entry)));
      }
      setStatusMessage(payload.message || "Tracking details saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save tracking details.");
    } finally {
      setSavingTrackingOrderId("");
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
            const hasTrackingInfo = Boolean(order.shipment?.trackingCode || order.shipment?.trackingUrl);
            const trackingValues = trackingInputs[order.id] || {
              code: order.shipment?.trackingCode || "",
              url: order.shipment?.trackingUrl || "",
              carrier: order.shipment?.carrier || "",
              service: order.shipment?.service || "",
            };
            const canEditTracking =
              order.customer.deliveryMethod === "shipping" &&
              order.paymentStatus === "paid" &&
              order.shipment?.provider !== "easypost";
            const canRefundLabel =
              order.shipment?.provider === "easypost" &&
              order.paymentStatus === "paid" &&
              !order.shipment?.status?.startsWith("refund_");

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
                        {pricing.shippingMinor > 0
                          ? formatMinorCad(pricing.shippingMinor)
                          : pricing.freeShippingApplied
                            ? "Free"
                            : "-"}
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
                       {order.shipment?.trackingCode ||
                         (order.shippingQuote?.provider === "flat_rate" ? "Manual fulfillment" : "Pending label purchase")}
                     </p>
                     {canEditTracking ? (
                       <div className="sm:col-span-2 space-y-2 rounded-md border border-border bg-muted/20 p-3">
                         <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                           Manual tracking details
                         </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              Carrier preset
                            </label>
                            <select
                              value={resolveCarrierPreset(trackingValues.carrier)}
                              onChange={(event) => updateTrackingInput(order, "carrier", event.target.value)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                              <option value="">Select a carrier (optional)</option>
                              {CARRIER_PRESETS.map((carrier) => (
                                <option key={carrier} value={carrier}>
                                  {carrier}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Input
                            value={trackingValues.code}
                            onChange={(event) => updateTrackingInput(order, "code", event.target.value)}
                            placeholder="Tracking number"
                          />
                           <Input
                             value={trackingValues.url}
                             onChange={(event) => updateTrackingInput(order, "url", event.target.value)}
                             placeholder="Tracking link (optional)"
                           />
                           <Input
                             value={trackingValues.carrier}
                             onChange={(event) => updateTrackingInput(order, "carrier", event.target.value)}
                             placeholder="Carrier (optional)"
                           />
                           <Input
                             value={trackingValues.service}
                             onChange={(event) => updateTrackingInput(order, "service", event.target.value)}
                             placeholder="Service (optional)"
                           />
                         </div>
                         <div className="flex flex-wrap gap-2">
                           <Button
                             type="button"
                             variant="outline"
                             size="sm"
                             onClick={() => void saveManualTracking(order)}
                             disabled={savingTrackingOrderId === order.id}
                           >
                             {savingTrackingOrderId === order.id ? (
                               <>
                                 <Loader2 className="h-4 w-4 animate-spin" />
                                 Saving tracking
                               </>
                             ) : (
                               "Save tracking"
                             )}
                           </Button>
                           {hasTrackingInfo ? (
                             <Button
                               type="button"
                               variant="outline"
                               size="sm"
                               onClick={() => void sendTrackingEmail(order.id)}
                               disabled={sendingTrackingOrderId === order.id}
                             >
                               {sendingTrackingOrderId === order.id ? (
                                 <>
                                   <Loader2 className="h-4 w-4 animate-spin" />
                                   Sending tracking email
                                 </>
                               ) : (
                                 "Email tracking to customer"
                               )}
                             </Button>
                           ) : null}
                         </div>
                       </div>
                     ) : null}
                     {!canEditTracking && hasTrackingInfo ? (
                       <div className="sm:col-span-2">
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => void sendTrackingEmail(order.id)}
                           disabled={sendingTrackingOrderId === order.id}
                         >
                           {sendingTrackingOrderId === order.id ? (
                             <>
                               <Loader2 className="h-4 w-4 animate-spin" />
                               Sending tracking email
                             </>
                           ) : (
                             "Email tracking to customer"
                           )}
                         </Button>
                       </div>
                     ) : null}
                     {order.shipment?.status ? (
                       <p>
                         <span className="font-semibold text-foreground">Shipment Status:</span>{" "}
                         {order.shipment.status.replace(/_/g, " ")}
                       </p>
                      ) : null}
                      {!order.shipment &&
                      order.shippingQuote?.provider === "easypost" &&
                      order.paymentStatus === "paid" ? (
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
                     {canRefundLabel ? (
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
                    <div
                      key={`${order.id}-${item.productId}-${item.name}-${item.selection?.size || ""}-${item.selection?.color || ""}`}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[item.productId, item.selection?.size ? `Size: ${item.selection.size}` : "", item.selection?.color ? `Color: ${item.selection.color}` : ""]
                            .filter(Boolean)
                            .join(" • ")}{" "}
                          | {item.quantity} x {formatMinorCad(item.unitAmountMinor)}
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
