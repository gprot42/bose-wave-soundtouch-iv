<!--
Copyright (c) 2026 Kambrium Software GmbH
Licensed under the MIT License.
-->
<script lang="ts">

  import { apiGetZone, apiZoneAdd, apiZoneRemove, apiZoneSet } from '$lib/api';
  import { Button, Spinner, Alert } from 'flowbite-svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { Device as DiscoveredDevice, ZoneInfo } from '$lib/utils/boseShared';

  export type Device = DiscoveredDevice;

  let { master, devices = [] }: { master: Device; devices: Device[] } = $props();

  // Local state for this Zone view
  let zoneLoading = $state(false);
  let zoneError = $state<string | null>(null);
  let zone = $state<ZoneInfo>(null);
  let zoneActing = $state(false);
  let addActing = $state<Record<string, boolean>>({});

  // Global zones knowledge to compute availability
  let allZonesByIp = $state<Record<string, ZoneInfo>>({});
  let allZonesLoading = $state(false);

  function nameForDevice(dev?: Device | null) {
    if (!dev) return 'Unknown';
    return `${dev.name || 'Device'} — ${dev.ip}`;
  }
  function findDeviceByIp(ip: string): Device | undefined {
    return devices.find((d) => d.ip === ip);
  }
  function findDeviceByMac(mac: string): Device | undefined {
    return devices.find((d) => d.mac && d.mac.toLowerCase() === mac.toLowerCase());
  }
  function macOf(dev?: Device | null): string | undefined {
    return dev?.mac?.toLowerCase();
  }

  async function refreshAllZones() {
    allZonesLoading = true;
    const results: Record<string, ZoneInfo> = {};
    try {
      await Promise.all(
        devices.map(async (dev) => {
          try {
            const z = await apiGetZone(dev.ip);
            if (z) results[dev.ip] = z;
          } catch (e) {
            // ignore per device errors
          }
        })
      );
      allZonesByIp = results;
    } finally {
      allZonesLoading = false;
    }
  }

  function isInCurrentZone(dev: Device): boolean {
    if (!zone) return false;
    const m = macOf(dev);
    if (!m) return false;
    return !!zone.members.find((mem) => mem.mac.toLowerCase() === m);
  }

  function engagedElsewhere(dev: Device): boolean {
    const devMac = macOf(dev);
    if (!devMac) return false;
    
    // Wenn es bereits in unserer aktuellen Zone ist, ist es nicht "woanders" beschäftigt
    if (isInCurrentZone(dev)) return false;

    const currentMasterMac = macOf(master);
    if (!currentMasterMac) return false;

    // Wir prüfen die Zonen-Informationen, die wir von allen Geräten gesammelt haben
    for (const [ip, z] of Object.entries(allZonesByIp)) {
      if (!z || !z.master) continue;
      
      // Eine Zone ist für uns nur relevant, wenn sie mehr als ein Mitglied hat
      // (Bose gibt oft Einzel-Geräte als Master ihrer eigenen "Zone" zurück)
      if (z.members.length <= 1) continue;

      const isMemberOfThatZone = z.members.some((m) => m.mac.toLowerCase() === devMac);
      if (!isMemberOfThatZone) continue;

      // Wenn das Gerät Mitglied in einer Zone ist, deren Master NICHT unser aktueller Master ist
      if (z.master.toLowerCase() !== currentMasterMac) {
        return true;
      }
    }
    return false;
  }

  export async function loadZone() {
    zoneError = null;
    zoneLoading = true;
    try {
      zone = await apiGetZone(master.ip);
      await refreshAllZones();
    } catch (e: any) {
      zoneError = e?.message ?? 'Failed to load zone';
    } finally {
      zoneLoading = false;
    }
  }

  async function removeMember(member: { ip: string; mac: string }) {
    if (!master.mac) {
      zoneError = 'Master MAC unknown; cannot remove member.';
      return;
    }
    zoneActing = true;
    try {
      await apiZoneRemove(master.ip, { masterMac: master.mac, slave: member });
      await loadZone();
    } catch (e: any) {
      zoneError = e?.message ?? 'Remove failed';
    } finally {
      zoneActing = false;
    }
  }

  async function addMemberFor(slave: Device) {
    if (!zone) return;
    if (!master.mac) {
      zoneError = 'Master MAC unknown; cannot add member.';
      return;
    }
    if (!slave || !slave.mac) {
      zoneError = 'Selected device MAC unknown; cannot add member.';
      return;
    }
    const key = `${master.ip}|${slave.ip}`;
    addActing[key] = true;
    zoneActing = true;
    try {
      await apiZoneAdd(master.ip, { masterMac: master.mac, slave: { ip: slave.ip, mac: slave.mac } });
      await loadZone();
    } catch (e: any) {
      zoneError = e?.message ?? 'Add failed';
    } finally {
      delete addActing[key];
      zoneActing = false;
    }
  }

  async function addAll() {
    if (!master.mac) {
      zoneError = 'Master MAC unknown; cannot set zone.';
      return;
    }
    const members = devices.filter((d) => d.mac).map((d) => ({ ip: d.ip, mac: d.mac! }));
    if (!members.find((m) => m.mac.toLowerCase() === master.mac!.toLowerCase())) {
      members.unshift({ ip: master.ip, mac: master.mac! });
    }
    zoneActing = true;
    try {
      await apiZoneSet(master.ip, { masterMac: master.mac, members });
      await loadZone();
    } catch (e: any) {
      zoneError = e?.message ?? 'Set zone failed';
    } finally {
      zoneActing = false;
    }
  }

  // Auto-load zone when this component becomes visible (e.g., when its tab is opened)
  let container: HTMLDivElement;
  let io: IntersectionObserver | null = null;
  let autoLoaded = false;

  function tryAutoLoad() {
    if (!autoLoaded && !zone && !zoneLoading) {
      autoLoaded = true;
      // Fire and forget; internal states handle spinners/errors
      loadZone();
    }
  }

  onMount(() => {
    // Use IntersectionObserver to detect when the component becomes visible in the viewport.
    // This works for tab visibility toggles that switch display/hidden.
    if (typeof IntersectionObserver !== 'undefined' && container) {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          tryAutoLoad();
        }
      }, { threshold: 0.01 });
      io.observe(container);
    } else {
      // Fallback: attempt once on mount
      tryAutoLoad();
    }
  });

  onDestroy(() => {
    if (io) {
      io.disconnect();
      io = null;
    }
  });
</script>

<div bind:this={container} class="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
  <div class="mb-2 flex items-center justify-between">
    <h3 class="font-semibold text-gray-900 dark:text-white">Zone</h3>
    <div class="flex gap-2">
      <Button size="xs" color="light" onclick={loadZone} disabled={zoneLoading}>
        {#if zoneLoading}
          <Spinner size="4" class="mr-1" />
        {/if}
        {zone ? 'Refresh' : 'Load'} Zone
      </Button>
      <Button size="xs" color="blue" outline onclick={addAll} disabled={zoneActing || !master.mac || devices.length <= 1}>
        Add all to this device
      </Button>
    </div>
  </div>

  {#if zoneError}
    <Alert color="red" class="mb-2">{zoneError}</Alert>
  {/if}

  {#if zone}
    <div class="mb-3">
      <div class="mb-1 text-sm text-gray-600 dark:text-gray-400">Current members:</div>
      {#if zone.members.length > 0}
        <ul class="space-y-1">
          {#each zone.members as m}
            <li class="flex items-center justify-between rounded border border-gray-100 px-2 py-1 dark:border-gray-600">
              <div class="flex min-w-0 items-center gap-2">
                <div class="truncate">
                  {#if findDeviceByMac(m.mac)}
                    {nameForDevice(findDeviceByMac(m.mac))}
                  {:else}
                    {m.ip} — {m.mac}
                  {/if}
                </div>
                {#if zone?.master && zone?.master.toLowerCase() === m.mac.toLowerCase()}
                  <span class="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">master</span>
                {/if}
              </div>
              <Button size="xs" color="red" outline disabled={zoneActing || (zone?.master && zone?.master.toLowerCase() === m.mac.toLowerCase())} onclick={() => removeMember(m)}>
                Remove
              </Button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="text-sm text-gray-500 dark:text-gray-400">No members listed.</div>
      {/if}
    </div>
  {:else}
    <div class="text-sm text-gray-500 dark:text-gray-400">Zone data not loaded.</div>
  {/if}

  <div class="mt-3">
    <div class="mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
      <span>Devices</span>
      {#if zone}
        <Button size="xs" color="light" outline onclick={refreshAllZones} disabled={allZonesLoading}>
          {#if allZonesLoading}
            <Spinner size="4" class="mr-1" />
          {/if}
          Refresh availability
        </Button>
      {/if}
    </div>
    {#if devices.filter((opt) => opt.ip !== master.ip).length > 0}
      <ul class="space-y-1">
        {#each devices.filter((opt) => opt.ip !== master.ip) as opt (opt.ip)}
          {#key opt.ip}
            <li class="flex items-center justify-between rounded border border-gray-100 px-2 py-1 dark:border-gray-600" class:opacity-50={zone && engagedElsewhere(opt)}>
              <div class="flex min-w-0 items-center gap-2">
                <div class="truncate">{nameForDevice(opt)}</div>
                {#if zone && isInCurrentZone(opt)}
                  <span class="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">member</span>
                {/if}
                {#if zone && engagedElsewhere(opt) && !isInCurrentZone(opt)}
                  <span class="ml-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">in another zone</span>
                {/if}
              </div>
              {#if zone && !isInCurrentZone(opt) && !engagedElsewhere(opt)}
                <Button
                  size="xs"
                  color="green"
                  outline
                  title={!opt.mac ? 'MAC unknown; cannot add' : 'Add this device to zone'}
                  onclick={() => addMemberFor(opt)}
                  disabled={zoneActing || !master.mac || !opt.mac || addActing[`${master.ip}|${opt.ip}`]}
                >
                  {#if addActing[`${master.ip}|${opt.ip}`]}
                    <Spinner size="4" class="mr-1" />
                  {/if}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </Button>
              {/if}
            </li>
          {/key}
        {/each}
      </ul>
    {:else}
      <div class="text-sm text-gray-500 dark:text-gray-400">No other devices.</div>
    {/if}

    {#if !zone}
      <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">Load zone to see availability and add buttons.</div>
    {/if}
  </div>
</div>

<style>
  /* Component-scoped overrides if needed */
</style>
