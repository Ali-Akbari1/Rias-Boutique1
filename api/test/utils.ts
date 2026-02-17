import type { ApiRequest, ApiResponse } from "../lib/http";

export interface MockResponse extends ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  jsonBody: unknown;
  textBody: string;
}

export const createMockRequest = ({
  method = "GET",
  headers = {},
  body,
  query,
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}): ApiRequest => ({
  method,
  headers,
  body,
  query,
});

export const createMockResponse = (): MockResponse => {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    textBody: "",
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.jsonBody = body;
    },
    send(body: string) {
      response.textBody = body;
    },
    setHeader(name: string, value: string) {
      response.headers[name] = value;
    },
  };

  return response;
};
