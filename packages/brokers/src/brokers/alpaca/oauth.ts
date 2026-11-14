// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { BrokerRequestError } from "../../orders/errors.js";
import { httpError, type HttpClient } from "../http.js";

export function alpacaAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const url = new URL("https://app.alpaca.markets/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scope ?? "account:write trading");
  return url.toString();
}

/** Exchanges an OAuth code. The caller must store `accessToken` in the credential vault. */
export async function exchangeAlpacaCode(
  http: HttpClient,
  input: { code: string; clientId: string; clientSecret: string; redirectUri: string },
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const response = await http.request({
    method: "POST",
    url: "https://api.alpaca.markets/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  const secrets = [input.clientSecret, input.code];
  if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(response.body) as { access_token?: string };
  } catch {
    throw httpError(response.status, response.body, secrets);
  }
  if (!parsed.access_token) throw new BrokerRequestError("Alpaca token response had no access token.");
  return { accessToken: parsed.access_token };
}
