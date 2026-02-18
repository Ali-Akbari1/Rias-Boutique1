import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Checkout from "@/pages/Checkout";
import { CartProvider } from "@/features/cart/context/CartContext";
import { products } from "@/features/catalog/data/products";
import * as checkoutRequest from "@/lib/checkout-request";

const CART_STORAGE_KEY = "rias_boutique_cart_v1";

describe("checkout flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("submits only productId and quantity for checkout payload", async () => {
    const product = products[0];
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        {
          id: `${product.id}-One Size-Default`,
          product,
          selection: { size: "One Size", color: "Default" },
          quantity: 2,
        },
      ]),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/cart-token")) {
        return new Response(JSON.stringify({ error: { code: "TOKEN_DISABLED", message: "disabled" } }), { status: 404 });
      }

      return new Response(JSON.stringify({ checkoutUrl: "https://checkout.clover.com/pay/abc", orderId: "order_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const redirectSpy = vi.spyOn(checkoutRequest, "redirectToCheckout").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <CartProvider>
          <Checkout />
        </CartProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Test Buyer" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: "+1 (403) 555-0101" } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText(/^city$/i), { target: { value: "Calgary" } });
    fireEvent.change(screen.getByLabelText(/state \/ province/i), { target: { value: "Alberta" } });
    fireEvent.change(screen.getByLabelText(/zip \/ postal code/i), { target: { value: "T2X 1A1" } });
    fireEvent.change(screen.getByLabelText(/^country$/i), { target: { value: "Canada" } });

    fireEvent.click(screen.getByRole("button", { name: /pay with clover/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(redirectSpy).toHaveBeenCalledWith("https://checkout.clover.com/pay/abc");
    });

    const checkoutRequestCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/clover-checkout"));
    expect(checkoutRequestCall).toBeTruthy();

    const requestPayload = JSON.parse(String(checkoutRequestCall?.[1]?.body || "{}")) as {
      items: Array<Record<string, unknown>>;
    };
    expect(requestPayload.items).toEqual([
      {
        productId: product.id,
        quantity: 2,
      },
    ]);
  });
});

