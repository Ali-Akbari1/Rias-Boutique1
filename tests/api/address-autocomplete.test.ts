/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import addressAutocompleteHandler from "../../api/address-autocomplete";
import addressAutocompleteRetrieveHandler from "../../api/address-autocomplete-retrieve";
import { createMockRequest, createMockResponse } from "./test-utils/utils";

describe("address autocomplete endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CLOVER_CHECKOUT_BASE_URL = "https://www.riasboutique.com";
    process.env.ALLOWED_CHECKOUT_ORIGINS = "https://www.riasboutique.com";
    process.env.MAPBOX_ACCESS_TOKEN = "pk.test_mapbox_token";
    process.env.MAPBOX_AUTOCOMPLETE_COUNTRIES = "CA,US";
  });

  it("returns street-aware suggestions for partial street input", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          suggestions: [
            {
              mapbox_id: "mbx-address-1",
              name: "8 Ave SW",
              address: "232",
              full_address: "232 8 Ave SW, Calgary, Alberta T2P 1B5, Canada",
              place_formatted: "Calgary, Alberta T2P 1B5, Canada",
              context: {
                place: { name: "Calgary" },
                region: { name: "Alberta", region_code: "CA-AB" },
                postcode: { name: "T2P 1B5" },
                country: { name: "Canada", country_code: "CA" },
              },
            },
            {
              mapbox_id: "mbx-street-1",
              name: "Covecreek Cir NE",
              full_address: "Covecreek Cir NE, Calgary, Alberta, Canada",
              place_formatted: "Calgary, Alberta, Canada",
              context: {
                place: { name: "Calgary" },
                region: { name: "Alberta", region_code: "CA-AB" },
                country: { name: "Canada", country_code: "CA" },
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = createMockResponse();
    await addressAutocompleteHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
        },
        body: JSON.stringify({
          query: "232 8 Ave",
          country: "Canada",
          sessionToken: "session_test_123",
        }),
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toEqual({
      configured: true,
      sessionToken: "session_test_123",
      suggestions: [
        {
          id: "mbx-address-1",
          label: "232 8 Ave SW, Calgary, Alberta T2P 1B5, Canada",
          address: "232 8 Ave SW",
          city: "Calgary",
          state: "AB",
          postalCode: "T2P 1B5",
          country: "Canada",
          countryCode: "CA",
        },
        {
          id: "mbx-street-1",
          label: "Covecreek Cir NE, Calgary, Alberta, Canada",
          address: "Covecreek Cir NE",
          city: "Calgary",
          state: "AB",
          postalCode: "",
          country: "Canada",
          countryCode: "CA",
        },
      ],
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(requestedUrl).toContain("/suggest");
    expect(requestedUrl).toContain("types=address%2Cstreet");
    expect(requestedUrl).toContain("session_token=session_test_123");
  });

  it("resolves a selected suggestion into address fields", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                mapbox_id: "mbx-address-1",
                address: "232",
                name: "8 Ave SW",
                full_address: "232 8 Ave SW, Calgary, Alberta T2P 1B5, Canada",
                context: {
                  place: { name: "Calgary" },
                  region: { name: "Alberta", region_code: "CA-AB" },
                  postcode: { name: "T2P 1B5" },
                  country: { name: "Canada", country_code: "CA" },
                },
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = createMockResponse();
    await addressAutocompleteRetrieveHandler(
      createMockRequest({
        method: "POST",
        headers: {
          origin: "https://www.riasboutique.com",
        },
        body: JSON.stringify({
          mapboxId: "mbx-address-1",
          country: "Canada",
          sessionToken: "session_test_123",
        }),
      }),
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toEqual({
      configured: true,
      address: {
        address: "232 8 Ave SW",
        city: "Calgary",
        state: "AB",
        postalCode: "T2P 1B5",
        country: "Canada",
        countryCode: "CA",
      },
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(requestedUrl).toContain("/retrieve/mbx-address-1");
    expect(requestedUrl).toContain("session_token=session_test_123");
  });
});
