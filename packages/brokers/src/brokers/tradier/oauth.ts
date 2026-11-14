// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { BrokerRequestError } from "../../orders/errors.js";
import { httpError, type HttpClient } from "../http.js";

export function tradierAuthorizeUrl(input: { clientId: string; state: string; scope?: string }): string {
  const url = new URL("https://api.tradier.com/v1/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", input.scope ?? "trade market");
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** Partner OAuth exchange. Sandbox paper tokens are bearer tokens stored in the same vault. */
export async function exchangeTradierCode(
  http: HttpClient,
  input: { code: string; clientId: string; clientSecret: string },
): Promise<{ accessToken: string }> {
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64");
  const response = await http.request({
    method: "POST",
    url: "https://api.tradier.com/v1/oauth/accesstoken",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code }).toString(),
  });
  const secrets = [input.clientSecret, input.clientId, input.code, basic];
  if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(response.body) as { access_token?: string };
  } catch {
    throw httpError(response.status, response.body, secrets);
  }
  if (!parsed.access_token) throw new BrokerRequestError("Tradier token response had no access token.");
  return { accessToken: parsed.access_token };
}
