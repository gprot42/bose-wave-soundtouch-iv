/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { getZone, addZoneSlave, removeZoneSlave, setZone } from '$lib/server/soundtouch';

export const GET: RequestHandler = async ({ params }) => {
  const ip = params.ip;
  if (!ip) {
    return new Response(JSON.stringify({ error: 'ip is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
  try {
    const zone = await getZone(ip);
    return new Response(JSON.stringify(zone), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    const message = e?.message ?? 'getZone failed';
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
};

async function resolveMasterIpFromDeviceIp(ip: string, expectedMasterMac: string): Promise<string> {
  try {
    const zone = await getZone(ip);
    const masterMacLow = (expectedMasterMac || '').toLowerCase();
    const match = zone?.members?.find((m) => (m.mac || '').toLowerCase() === masterMacLow);
    return match?.ip || ip;
  } catch {
    return ip;
  }
}

// Helper: consistent JSON response
function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function parsePayload(request: Request): Promise<any> {
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) return await request.json();
    if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(await request.text()));
  } catch {
    // fall through to empty payload
  }
  return {};
}

async function handleAdd(ip: string, payload: any): Promise<Response> {
  const masterMac: string | undefined = payload.masterMac;
  const slave = payload.slave as { ip: string; mac: string } | undefined;
  if (!masterMac || !slave?.ip || !slave?.mac) {
    return errorResponse('masterMac and slave {ip,mac} are required');
  }
  const targetIp = await resolveMasterIpFromDeviceIp(ip, masterMac);
  const currentZone = await getZone(targetIp).catch(() => null);
  const hasRealZone = !!(currentZone && currentZone.master && currentZone.members && currentZone.members.length > 1);
  if (hasRealZone) {
    await addZoneSlave(targetIp, masterMac, slave);
  } else {
    await setZone(
      targetIp,
      masterMac,
      [
        { ip: targetIp, mac: masterMac },
        { ip: slave.ip, mac: slave.mac }
      ],
      targetIp
    );
  }
  return new Response(null, { status: 204 });
}

async function handleRemove(ip: string, payload: any): Promise<Response> {
  const masterMac: string | undefined = payload.masterMac;
  const slave = payload.slave as { ip: string; mac: string } | undefined;
  if (!masterMac || !slave?.ip || !slave?.mac) {
    return errorResponse('masterMac and slave {ip,mac} are required');
  }
  const targetIp = await resolveMasterIpFromDeviceIp(ip, masterMac);
  await removeZoneSlave(targetIp, masterMac, slave);
  return new Response(null, { status: 204 });
}

async function handleSet(ip: string, payload: any): Promise<Response> {
  const masterMac: string | undefined = payload.masterMac;
  const members = payload.members as { ip: string; mac: string }[] | undefined;
  const senderIPAddress: string | undefined = payload.senderIPAddress;
  if (!masterMac || !Array.isArray(members)) {
    return errorResponse('masterMac and members [] are required');
  }
  const candidateFromMembers = members.find((m) => (m.mac || '').toLowerCase() === (masterMac || '').toLowerCase());
  const targetIp = candidateFromMembers?.ip || ip;
  await setZone(targetIp, masterMac, members, senderIPAddress);
  return new Response(null, { status: 204 });
}

const ACTION_HANDLERS = {
  add: handleAdd,
  remove: handleRemove,
  set: handleSet
} as const;

export const POST: RequestHandler = async ({ params, request, url }) => {
  const ip = params.ip;
  if (!ip) return errorResponse('ip is required');

  const action = (url.searchParams.get('action') || '').toLowerCase();
  const handler = (ACTION_HANDLERS as Record<string, (ip: string, payload: any) => Promise<Response>>)[action];
  const payload = await parsePayload(request);

  if (!handler) {
    return errorResponse('Unsupported action. Use ?action=add|remove|set');
  }

  try {
    return await handler(ip, payload);
  } catch (e: any) {
    const message = e?.message ?? 'zone action failed';
    return errorResponse(message, 502);
  }
};
