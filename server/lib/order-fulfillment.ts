import { buyShippingLabel } from "./easypost.js";
import { saveOrderShipment, type StoredOrder } from "./order-store.js";

export const ensureShipmentForOrder = async (order: StoredOrder) => {
  if (order.customer.deliveryMethod === "pickup") {
    return order;
  }

  if (order.shipment) {
    return order;
  }

  if (!order.shippingQuote) {
    throw new Error(`Order ${order.id} is missing a stored shipping quote.`);
  }

  const shipment = await buyShippingLabel(order.shippingQuote);
  return saveOrderShipment({
    orderId: order.id,
    shipment,
  });
};
