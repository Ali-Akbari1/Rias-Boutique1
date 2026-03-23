/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import shippingRatesHandler from "../../api/shipping-rates";
import { createMockRequest, createMockResponse } from "./test-utils/utils";

describe("shipping rates endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SHIPPING_PROVIDER_MODE;
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.ALLOWED_CHECKOUT_ORIGINS = "https://www.riasboutique.com";
    process.env.ENABLE_SHIPPING_CHARGES = "true";
    process.env.EASYPOST_API_KEY = "ezak_test_123";
    process.env.EASYPOST_QUOTE_SECRET = "test_shipping_quote_secret";
    process.env.EASYPOST_FROM_STREET1 = "260300 Writing Creek Cres Floor 1 Unit H31";
    process.env.EASYPOST_FROM_CITY = "Balzac";
    process.env.EASYPOST_FROM_STATE = "AB";
    process.env.EASYPOST_FROM_ZIP = "T4A 0X8";
    process.env.EASYPOST_FROM_COUNTRY = "CA";
    process.env.EASYPOST_DEFAULT_HS_TARIFF_NUMBER = "620443";
    process.env.EASYPOST_CUSTOMS_EEL_PFC = "NOEEI 30.37(a)";
  });

  it("returns a flat CA$30 shipping quote by default without calling EasyPost", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = createMockResponse();
    await shippingRatesHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          customer: {
            deliveryMethod: "shipping",
            fullName: "Ali Mustanser Akbari",
            email: "alimustanserakbari@gmail.com",
            phone: "8254382985",
            address: "999 E Street Northwest",
            city: "Washington",
            state: "DC",
            postalCode: "20004",
            country: "United States",
          },
          items: [
            { productId: "mens-offwhite-with-white", quantity: 2, selection: { size: "One Size", color: "Default" } },
          ],
        }),
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toMatchObject({
      provider: "flat_rate",
      freeShippingApplied: false,
      options: [
        {
          carrier: "Ria's Boutique",
          service: "Standard Shipping",
          quotedRateMinor: 3000,
          customerRateMinor: 3000,
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a Canada-origin customs declaration with total line-item value and weight", async () => {
    process.env.SHIPPING_PROVIDER_MODE = "easypost";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/addresses/create_and_verify")) {
        return new Response(
          JSON.stringify({
            street1: "999 E Street Northwest",
            city: "Washington",
            state: "DC",
            zip: "20004",
            country: "US",
            residential: false,
            verifications: {
              delivery: {
                success: true,
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/shipments")) {
        const body = JSON.parse(String(init?.body || "{}")) as {
          shipment?: {
            customs_info?: {
              eel_pfc?: string;
              customs_items?: Array<{
                code?: string;
                hs_tariff_number?: string;
                quantity?: number;
                value?: number;
                weight?: number;
                origin_country?: string;
              }>;
            };
          };
        };

        expect(body.shipment?.customs_info?.eel_pfc).toBeUndefined();
        expect(body.shipment?.customs_info?.customs_items?.[0]?.code).toBe("620443");
        expect(body.shipment?.customs_info?.customs_items?.[0]?.hs_tariff_number).toBe("620443");
        expect(body.shipment?.customs_info?.customs_items?.[0]?.origin_country).toBe("CA");
        expect(body.shipment?.customs_info?.customs_items?.[0]?.quantity).toBe(2);
        expect(body.shipment?.customs_info?.customs_items?.[0]?.value).toBe(220);
        expect(body.shipment?.customs_info?.customs_items?.[0]?.weight).toBe(48);

        return new Response(
          JSON.stringify({
            id: "shp_test_123",
            rates: [
              {
                id: "rate_test_123",
                carrier: "Canada Post",
                service: "Tracked Packet USA",
                rate: "18.00",
                currency: "CAD",
                delivery_days: 5,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = createMockResponse();
    await shippingRatesHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          customer: {
            deliveryMethod: "shipping",
            fullName: "Ali Mustanser Akbari",
            email: "alimustanserakbari@gmail.com",
            phone: "8254382985",
            address: "999 E Street Northwest",
            city: "Washington",
            state: "DC",
            postalCode: "20004",
            country: "United States",
          },
          items: [
            { productId: "mens-offwhite-with-white", quantity: 2, selection: { size: "One Size", color: "Default" } },
          ],
        }),
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
