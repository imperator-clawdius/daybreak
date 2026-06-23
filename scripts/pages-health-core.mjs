import { setTimeout as delay } from "node:timers/promises";

import { PRODUCTION_HOST, WWW_HOST } from "./readiness-core.mjs";

export const GITHUB_OWNER = "imperator-clawdius";
export const GITHUB_REPO = "daybreak";
export const GITHUB_API_BASE = "https://api.github.com";

function apiUrl(path) {
  return `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`;
}

function headers(token = "") {
  const base = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  return token ? { ...base, authorization: `Bearer ${token}` } : base;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchPagesConfig({ fetchImpl = fetch, token = "" } = {}) {
  const response = await fetchImpl(apiUrl("/pages"), { headers: headers(token) });
  return {
    ok: response.ok,
    status: response.status,
    body: await readJson(response),
  };
}

export async function fetchPagesHealth({
  fetchImpl = fetch,
  waitImpl = delay,
  delayMs = 10_000,
  maxAttempts = 6,
  token = "",
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(apiUrl("/pages/health"), {
      headers: headers(token),
    });
    const body = await readJson(response);

    if (response.status !== 202) {
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    }

    if (attempt < maxAttempts) {
      await waitImpl(delayMs);
    }
  }

  return {
    ok: false,
    status: 202,
    body: null,
    error: "GitHub Pages health check did not finish before timeout",
  };
}

function certificateState(config) {
  return config?.https_certificate?.state ?? "missing";
}

function hostPass(host, { redirectsToHttps = false } = {}) {
  return Boolean(
    host?.host &&
      host.dns_resolves === true &&
      host.is_valid === true &&
      host.is_served_by_pages === true &&
      host.is_https_eligible === true &&
      host.responds_to_https === true &&
      (host.enforces_https === true || redirectsToHttps === true) &&
      !host.caa_error,
  );
}

function hostStatus(host, edge = {}) {
  if (!host || typeof host !== "object") {
    return {
      pass: false,
      text: "host=missing dns_resolves=false valid=false served_by_pages=false https_eligible=false responds_to_https=false enforces_https=false",
    };
  }

  return {
    pass: hostPass(host, edge),
    text: [
      `host=${host.host ?? "missing"}`,
      `dns_resolves=${host.dns_resolves === true}`,
      `valid=${host.is_valid === true}`,
      `served_by_pages=${host.is_served_by_pages === true}`,
      `https_eligible=${host.is_https_eligible === true}`,
      `responds_to_https=${host.responds_to_https === true}`,
      `enforces_https=${host.enforces_https === true}`,
      `https_error=${host.https_error ?? "none"}`,
      `caa_error=${host.caa_error ?? "none"}`,
    ].join(" "),
  };
}

function redirectLocation(response) {
  return response?.headers?.get?.("location") ?? "";
}

function redirectsToHttpsHost(location, expectedHosts) {
  try {
    const url = new URL(location);
    return url.protocol === "https:" && expectedHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function redirectsToApex(location) {
  try {
    const url = new URL(location);
    return url.protocol === "https:" && url.hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

async function fetchManualRedirect(fetchImpl, url) {
  const response = await fetchImpl(url, {
    method: "HEAD",
    redirect: "manual",
  });
  return {
    status: response.status,
    location: redirectLocation(response),
  };
}

export async function fetchPagesEdgeRedirects({ fetchImpl = fetch } = {}) {
  const [apexHttp, wwwHttp, wwwHttps] = await Promise.all([
    fetchManualRedirect(fetchImpl, `http://${PRODUCTION_HOST}/`),
    fetchManualRedirect(fetchImpl, `http://${WWW_HOST}/`),
    fetchManualRedirect(fetchImpl, `https://${WWW_HOST}/`),
  ]);

  return {
    apexHttpRedirectsToHttps:
      isRedirectStatus(apexHttp.status) &&
      redirectsToHttpsHost(apexHttp.location, [PRODUCTION_HOST]),
    wwwHttpRedirectsToHttps:
      isRedirectStatus(wwwHttp.status) &&
      redirectsToHttpsHost(wwwHttp.location, [PRODUCTION_HOST, WWW_HOST]),
    wwwHttpsCanonicalizesToApex:
      isRedirectStatus(wwwHttps.status) && redirectsToApex(wwwHttps.location),
    details: {
      apexHttp,
      wwwHttp,
      wwwHttps,
    },
  };
}

function edgeStatus(edge) {
  return {
    apexHttpRedirectsToHttps: edge?.apexHttpRedirectsToHttps === true,
    wwwHttpRedirectsToHttps: edge?.wwwHttpRedirectsToHttps === true,
    wwwHttpsCanonicalizesToApex: edge?.wwwHttpsCanonicalizesToApex === true,
  };
}

export function evaluatePagesHealth({ config, health, edge }) {
  const redirects = edgeStatus(edge);
  const domain = hostStatus(health?.domain, {
    redirectsToHttps: redirects.apexHttpRedirectsToHttps,
  });
  const altDomain = hostStatus(health?.alt_domain, {
    redirectsToHttps:
      redirects.wwwHttpRedirectsToHttps &&
      redirects.wwwHttpsCanonicalizesToApex,
  });
  const certState = certificateState(config);
  const certPass = certState === "approved";
  const configPass =
    config?.cname === PRODUCTION_HOST && config?.https_enforced === true;

  return {
    pass: certPass && configPass && domain.pass && altDomain.pass,
    config,
    health,
    edge: redirects,
    certificateState: certState,
    configPass,
    domain,
    altDomain,
  };
}

export function renderPagesHealthReport(evaluation) {
  const config = evaluation.config ?? {};
  return [
    `PAGES_CONFIG cname=${config.cname ?? "missing"} https_enforced=${config.https_enforced === true}`,
    `PAGES_CERTIFICATE=${evaluation.certificateState}`,
    `PAGES_DOMAIN ${evaluation.domain.text}`,
    `PAGES_ALT_DOMAIN ${evaluation.altDomain.text}`,
    [
      "PAGES_EDGE_REDIRECTS",
      `apex_http_to_https=${evaluation.edge.apexHttpRedirectsToHttps}`,
      `www_http_to_https=${evaluation.edge.wwwHttpRedirectsToHttps}`,
      `www_https_to_apex=${evaluation.edge.wwwHttpsCanonicalizesToApex}`,
    ].join(" "),
    `PAGES_REQUIRED apex=${PRODUCTION_HOST} alt=${WWW_HOST}`,
    `PAGES_HEALTH=${evaluation.pass ? "ready" : "pending"}`,
  ].join("\n");
}
