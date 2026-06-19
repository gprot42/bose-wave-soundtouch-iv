/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { getWifiNetworkInfo, nativeHttpGet, nativeHttpPost } from '$lib/native/wifiInfo';

/*
 * Bose Wave SoundTouch IV (and the other older "Gabbo" / SM1 platform devices)
 * do NOT expose the SoundTouch 10 telnet CLI on port 17000. Instead, while in
 * setup mode they broadcast an open access point whose gateway runs a small
 * embedded web server. WiFi provisioning is performed with plain HTTP:
 *
 *   GET  http://<gateway>/setup/index.asp
 *        -> HTML containing a `networksRAW` string. Site-survey entries are
 *           joined by the literal delimiter "zirgtspghwq" and each entry is
 *           formatted as `SSID (SECURITY CIPHER)`.
 *
 *   POST http://<gateway>/goform/aformHandlerConfigureProfileSettings
 *        application/x-www-form-urlencoded body with fields:
 *           ConfigManual, SSID, Passphrase, Key0, Security, Cipher,
 *           DHCPClient, IP, Mask, DefGW, DNSSrv1, DNSSrv2,
 *           ProxyServer, ProxyServerPort
 *
 * The SM1 setup AP gateway is 192.168.1.1, SM2/dual devices use 192.0.2.1.
 * Individual units do not always match the platform map (a Wave SoundTouch IV
 * has been observed handing out 192.0.2.x), so we probe every candidate host —
 * the live network gateway first, then both well-known Gabbo subnets — and use
 * whichever one actually serves the setup page.
 * This matches the official Bose SoundTouch app's GabboSetupBCO flow.
 */
export const BOSE_SETUP_HOST = '192.168.1.1';
/** Well-known Gabbo setup-AP gateways: SM1 (192.168.1.1) and SM2 (192.0.2.1). */
export const BOSE_SETUP_HOSTS = ['192.168.1.1', '192.0.2.1'];
export const BOSE_SETUP_PORT = 80;

const NETWORK_LIST_PATH = '/setup/index.asp';
const CONFIGURE_PATH = '/goform/aformHandlerConfigureProfileSettings';
const NETWORK_DELIMITER = 'zirgtspghwq';
const NATIVE_ONLY =
  'WiFi setup is only available in the BosMan Android app while your phone is joined to the speaker’s setup WiFi.';

export type WifiSecurity = 'none' | 'wep' | 'wpa_or_wpa2';

export type ScannedNetwork = {
  ssid: string;
  security: WifiSecurity;
  signal?: number;
  /** Raw Gabbo security code from the survey, e.g. "wpa2psk" / "wep" / "none". */
  gabboSecurity?: string;
  /** Raw Gabbo cipher from the survey, e.g. "CCMP" / "TKIP" / "TKIP CCMP". */
  gabboCipher?: string;
};

export type SetupResult = {
  ok: boolean;
  message: string;
  raw?: string;
};

export type SetupProbeResult = {
  ok: boolean;
  detail: string;
  phoneIp?: string;
  ssid?: string;
  openPorts?: number[];
  isWaveSetupAp?: boolean;
};

/** Last host that successfully served the Gabbo setup page, tried first next time. */
let cachedSetupHost: string | null = null;

/**
 * Ordered, de-duplicated list of hosts to try for the setup server:
 * cached live host -> detected gateway -> caller-provided -> well-known Gabbo gateways.
 */
async function setupHostCandidates(host?: string): Promise<string[]> {
  const list: string[] = [];
  if (cachedSetupHost) list.push(cachedSetupHost);
  const info = await getWifiNetworkInfo();
  const gateway = info?.gateway?.trim();
  if (gateway && gateway !== '0.0.0.0') list.push(gateway);
  const provided = host?.trim();
  if (provided) list.push(provided);
  list.push(...BOSE_SETUP_HOSTS);
  return [...new Set(list)];
}

/** First candidate host that returns a recognisable Gabbo setup page. */
async function findSetupHost(host?: string): Promise<{ host: string; body: string } | null> {
  for (const candidate of await setupHostCandidates(host)) {
    const res = await nativeHttpGet(`http://${candidate}${NETWORK_LIST_PATH}`, 5000);
    if (res?.ok && res.body && looksLikeSetupPage(res.body)) {
      cachedSetupHost = candidate;
      return { host: candidate, body: res.body };
    }
  }
  return null;
}

/** Best single host for non-survey requests (POST / status), without probing. */
async function resolveSetupHost(host?: string): Promise<string> {
  const candidates = await setupHostCandidates(host);
  return candidates[0] ?? BOSE_SETUP_HOST;
}

function looksLikeSetupPage(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes('networksraw') ||
    lower.includes('aformhandler') ||
    lower.includes('configureprofilesettings') ||
    (lower.includes('<form') && lower.includes('ssid'))
  );
}

export async function probeSetupCli(host = BOSE_SETUP_HOST): Promise<SetupProbeResult> {
  const info = await getWifiNetworkInfo();
  if (!info) {
    return { ok: false, detail: NATIVE_ONLY };
  }

  const target = await resolveSetupHost(host);
  const phoneIp = info.ip;
  const ssid = info.ssid;
  const lowerSsid = ssid?.toLowerCase() ?? '';
  const isWaveSetupAp =
    !!info.boseSetupAp || lowerSsid.includes('soundtouch') || lowerSsid.includes('bose');

  const found = await findSetupHost(host);
  if (found) {
    return {
      ok: true,
      detail: `Bose setup server reachable at ${found.host}`,
      phoneIp,
      ssid,
      isWaveSetupAp
    };
  }

  // Speaker may already be on home WiFi with the full SoundTouch API.
  const api = await nativeHttpGet(`http://${target}:8090/info`, 3000);
  if (api?.ok && api.body) {
    return {
      ok: true,
      detail: 'SoundTouch API already available on port 8090 — speaker may already be on home WiFi',
      phoneIp,
      ssid,
      isWaveSetupAp
    };
  }

  const tried = (await setupHostCandidates(host)).join(', ');
  const detail = `No Bose setup server found (tried ${tried}). Make sure this phone is joined to the speaker’s own setup WiFi and that no VPN/kill-switch is active. (phone ${phoneIp || '?'} on ${ssid || 'unknown WiFi'})`;

  return { ok: false, detail, phoneIp, ssid, isWaveSetupAp };
}

export async function scanWifiNetworks(host = BOSE_SETUP_HOST): Promise<ScannedNetwork[]> {
  const found = await findSetupHost(host);
  if (!found) return [];
  return parseWifiScan(found.body);
}

export function parseWifiScan(body: string): ScannedNetwork[] {
  const networks: ScannedNetwork[] = [];
  const seen = new Set<string>();

  const raw = extractNetworksRaw(body);
  if (!raw) return networks;

  for (const entry of raw.split(NETWORK_DELIMITER)) {
    const parsed = parseGabboNetworkEntry(entry);
    if (!parsed || seen.has(parsed.ssid)) continue;
    seen.add(parsed.ssid);
    networks.push(parsed);
  }

  return networks;
}

function extractNetworksRaw(body: string): string | null {
  const match = body.match(/networksRAW\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return null;
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseGabboNetworkEntry(entry: string): ScannedNetwork | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  // SSIDs can contain "(", so split on the LAST "(" like the official app does.
  const open = trimmed.lastIndexOf('(');
  if (open <= 0) return null;

  const ssid = trimmed.slice(0, open).trim();
  if (!ssid || ssid.startsWith('Bose ')) return null;

  const close = trimmed.indexOf(')', open);
  const inside = (close > open ? trimmed.slice(open + 1, close) : trimmed.slice(open + 1)).trim();
  const tokens = inside.split(/\s+/).filter(Boolean);

  const secToken = (tokens[0] ?? '').toUpperCase();
  const cipher = (tokens[1] ?? '').replace('+', ' ');

  let gabboSecurity = secToken.toLowerCase();
  if (secToken.includes('WPA')) {
    gabboSecurity += 'psk';
  }

  return {
    ssid,
    security: normalizeSecurity(secToken),
    gabboSecurity: gabboSecurity || undefined,
    gabboCipher: cipher || undefined
  };
}

function normalizeSecurity(value: string): WifiSecurity {
  const lower = value.toLowerCase();
  if (lower.includes('wep')) return 'wep';
  if (lower.includes('wpa')) return 'wpa_or_wpa2';
  if (lower.includes('none') || lower.includes('open')) return 'none';
  return 'wpa_or_wpa2';
}

function buildProfileForm(
  ssid: string,
  security: WifiSecurity,
  password: string,
  scanned?: ScannedNetwork
): Record<string, string> {
  const fields: Record<string, string> = {
    ConfigManual: '0',
    SSID: ssid,
    Passphrase: '',
    Key0: '',
    Security: '',
    Cipher: '',
    DHCPClient: '1',
    IP: '',
    Mask: '',
    DefGW: '',
    DNSSrv1: '',
    DNSSrv2: '',
    ProxyServer: '',
    ProxyServerPort: ''
  };

  let secCode: string;
  let cipher: string;

  if (scanned?.gabboSecurity) {
    // Provisioning a network returned by the device's own site survey.
    fields.ConfigManual = '0';
    secCode = scanned.gabboSecurity;
    cipher = scanned.gabboCipher ?? '';
  } else {
    // Manually entered SSID — map BosMan's simplified security to Gabbo codes.
    fields.ConfigManual = '1';
    if (security === 'none') {
      secCode = 'none';
      cipher = '';
    } else if (security === 'wep') {
      secCode = 'wep';
      cipher = '';
    } else {
      // Universal WPA/WPA2 mixed mode, matching the app's "wpawpa2psk" option.
      secCode = 'wpawpa2psk';
      cipher = 'TKIP CCMP';
    }
  }

  let Security = secCode.toUpperCase();
  if (Security === 'NONE') {
    cipher = '';
  } else if (Security === 'WEP') {
    fields.Key0 = password;
  } else {
    fields.Passphrase = password;
  }

  // Reconcile security/cipher exactly like the official GabboSetupBCO flow.
  if (
    (Security === 'WPAPSK' && (cipher === 'CCMP' || cipher === 'AES')) ||
    (Security === 'WPA2PSK' && cipher === 'TKIP') ||
    cipher === 'TKIP CCMP'
  ) {
    Security = 'WPAWPA2PSK';
  }

  fields.Security = Security;
  fields.Cipher = cipher;
  return fields;
}

function encodeForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export async function addWifiProfile(
  ssid: string,
  security: WifiSecurity,
  password?: string,
  host = BOSE_SETUP_HOST,
  scanned?: ScannedNetwork
): Promise<SetupResult> {
  const trimmedSsid = ssid.trim();
  if (!trimmedSsid) {
    return { ok: false, message: 'SSID is required' };
  }
  if (security !== 'none' && !password?.trim()) {
    return { ok: false, message: 'WiFi password is required' };
  }

  const target = await resolveSetupHost(host);
  const fields = buildProfileForm(trimmedSsid, security, password?.trim() ?? '', scanned);
  const body = encodeForm(fields);

  const res = await nativeHttpPost(`http://${target}${CONFIGURE_PATH}`, body, undefined, 12000);
  if (!res) {
    return { ok: false, message: NATIVE_ONLY };
  }
  if (res.error) {
    return { ok: false, message: res.error, raw: res.body };
  }

  const status = res.status ?? 0;
  if (res.ok || (status >= 200 && status < 400)) {
    return {
      ok: true,
      message:
        'WiFi profile sent. The speaker will leave setup mode and join your network shortly.',
      raw: res.body
    };
  }

  return {
    ok: false,
    message: `Speaker rejected the WiFi profile (HTTP ${status || '?'}). Double-check the password and try again.`,
    raw: res.body
  };
}

export async function getWifiStatus(host = BOSE_SETUP_HOST): Promise<SetupResult> {
  const target = await resolveSetupHost(host);
  const res = await nativeHttpGet(`http://${target}:8090/info`, 3000);
  if (res?.ok && res.body) {
    return { ok: true, message: 'Speaker responded on port 8090.', raw: res.body };
  }
  return {
    ok: true,
    message:
      'Once the speaker’s WiFi light turns solid, reconnect this phone to your home WiFi and tap Search again.'
  };
}
