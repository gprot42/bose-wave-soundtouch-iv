<!--
Copyright (c) 2026 Kambrium Software GmbH
Licensed under the MIT License.
-->
<script lang="ts">

  import {
    apiBrowse,
    apiBrowseDlna,
    apiDiscoverDlnaServers,
    apiListMediaServers,
    apiSelectMusic,
    apiSetMusicServiceAccount
  } from '$lib/api';
  import { onMount } from 'svelte';
  import { Button, Card, Spinner, Alert, Listgroup, ListgroupItem } from 'flowbite-svelte';
  import { AngleRightOutline, PlayOutline } from 'flowbite-svelte-icons';

  let { targetDeviceIp }: { targetDeviceIp: string } = $props();

  type MediaServer = { id: string; friendlyName: string; location?: string; kind?: 'server' | 'renderer' | 'other'; address?: string };
  type BrowseItem = { type: 'container' | 'item'; title: string; location?: string; containerLocation?: string; objectId?: string; childCount?: number };

  let msLoading = $state(false);
  let dlnaDiscoveryLoading = $state(false);
  let msError = $state<string | null>(null);
  let mediaServers = $state<MediaServer[]>([]);
  let dlnaServers = $state<MediaServer[]>([]);
  let otherDevices = $state<MediaServer[]>([]);
  let selectedServer = $state<MediaServer | null>(null);
  let browsingMode = $state<'bose' | 'dlna'>('bose');
  let items = $state<BrowseItem[]>([]);
  let breadcrumbs = $state<{ title: string; containerLocation?: string; objectId?: string }[]>([]);

  let currentDlnaBaseUrl = $state('');
  let currentDlnaControlUrl = $state('');

  function isPlayableContainer(item: BrowseItem): boolean {
    // In DLNA mode, containers with childCount=0 or childCount=1 are often streams
    if (browsingMode === 'dlna' && item.type === 'container') {
      return item.childCount !== undefined && item.childCount <= 1;
    }
    return false;
  }

  async function loadMediaServers() {
    msLoading = true;
    msError = null;
    try {
      console.log('Discovering media servers...');
      console.log('Loading media servers...');
      mediaServers = await apiListMediaServers(targetDeviceIp);
      console.log('Media Servers discovery finished');
      
      // Parallel: Discover direct DLNA servers to match IPs
      discoverDirectDlna();
    } catch (e: any) {
      msError = e?.message ?? 'Unknown error';
    } finally {
      console.log('Media Servers loaded', mediaServers);
      msLoading = false;
    }
  }

  async function discoverDirectDlna() {
    dlnaDiscoveryLoading = true;
    try {
      console.log('Discovering UPnP/DLNA devices via SSDP...');
      const all = (await apiDiscoverDlnaServers()) as MediaServer[];
      dlnaServers = all.filter((d) => d.kind === 'server');
      // Collapse devices that publish several UPnP sub-device descriptions
      // (e.g. a TV) into a single entry per name + address.
      const seen = new Set<string>();
      otherDevices = all
        .filter((d) => d.kind !== 'server')
        .filter((d) => {
          const key = `${d.friendlyName}__${d.address ?? ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      console.log('DLNA discovery finished', { servers: dlnaServers.length, other: otherDevices.length });
    } catch (e) {
      console.error('Direct DLNA discovery failed', e);
    } finally {
      dlnaDiscoveryLoading = false;
    }
  }

  function getDlnaLocation(serverId: string) {
    const s = dlnaServers.find(srv => srv.id === serverId);
    return s?.location;
  }

  async function ensureAccountOnDevice() {
    if (!selectedServer || !targetDeviceIp) return;
    try {
      await apiSetMusicServiceAccount(targetDeviceIp, selectedServer.friendlyName, selectedServer.id);
    } catch (e) {
      console.error(e);
    }
  }

  function sourceAccountFor(server: MediaServer) {
    return `${server.id}/0`;
  }

  async function browseRoot(mode: 'bose' | 'dlna' = 'bose') {
    if (!selectedServer || !targetDeviceIp) return;
    browsingMode = mode;
    items = [];
    breadcrumbs = [{ title: 'Media Server' }, { title: selectedServer.friendlyName }];

    if (mode === 'bose') {
      await ensureAccountOnDevice();
      await browse(undefined);
    } else {
      const loc = getDlnaLocation(selectedServer.id);
      if (!loc) {
        msError = 'Media server location not found. Was it discovered on the network?';
        return;
      }
      await browseDlna(loc, '0');
    }
  }

  async function browse(containerLocation?: string) {
    if (!selectedServer || !targetDeviceIp) return;
    items = [];
    try {
      items = await apiBrowse(targetDeviceIp, sourceAccountFor(selectedServer), containerLocation) as BrowseItem[];
    } catch (e: any) {
      msError = e?.message ?? 'Browse failed';
    }
  }

  async function browseDlna(location: string | undefined, objectId: string, baseUrl?: string, controlUrl?: string) {
    try {
      const data = await apiBrowseDlna({
        location,
        baseUrl,
        controlUrl,
        objectId
      });
      items = (data.items || []) as BrowseItem[];
      currentDlnaBaseUrl = data.baseUrl;
      currentDlnaControlUrl = data.controlUrl;
    } catch (e: any) {
      msError = e?.message ?? 'DLNA Browse failed';
    }
  }

  async function enter(item: BrowseItem) {
    if (item.type !== 'container') return;

    if (browsingMode === 'bose') {
      if (!item.containerLocation) return;
      breadcrumbs = [...breadcrumbs, { title: item.title, containerLocation: item.containerLocation }];
      await browse(item.containerLocation);
    } else {
      if (!item.objectId) return;
      breadcrumbs = [...breadcrumbs, { title: item.title, objectId: item.objectId }];
      await browseDlna(undefined, item.objectId, currentDlnaBaseUrl, currentDlnaControlUrl);
    }
  }

  async function playContainer(item: BrowseItem) {
    if (item.type !== 'container' || !selectedServer || !targetDeviceIp || !item.objectId) return;

    try {
      await apiSelectMusic({
        deviceIp: targetDeviceIp,
        sourceAccount: sourceAccountFor(selectedServer),
        location: item.objectId,
        itemName: item.title
      });
    } catch (e: any) {
      msError = e?.message ?? 'Play failed';
    }
  }

  async function goToBreadcrumb(index: number) {
    if (index === 0) {
      // Return to media server list
      selectedServer = null;
      items = [];
      breadcrumbs = [];
      return;
    }

    const target = breadcrumbs[index];
    breadcrumbs = breadcrumbs.slice(0, index + 1);

    if (browsingMode === 'bose') {
      await browse(target.containerLocation);
    } else {
      await browseDlna(undefined, target.objectId || '0', currentDlnaBaseUrl, currentDlnaControlUrl);
    }
  }

  async function playItem(item: BrowseItem) {
    if (item.type !== 'item' || !selectedServer || !targetDeviceIp) return;

    // For DLNA mode, use objectId; for Bose mode, use location
    const location = browsingMode === 'dlna' ? (item.objectId || item.location) : item.location;
    if (!location) return;

    try {
      await apiSelectMusic({
        deviceIp: targetDeviceIp,
        sourceAccount: sourceAccountFor(selectedServer),
        location,
        itemName: item.title
      });
    } catch (e: any) {
      msError = e?.message ?? 'Play failed';
    }
  }

  onMount(() => {
    if (dlnaServers.length === 0) {
      loadMediaServers();
    }
  });
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold">DLNA/UPnP Media Server</h3>
    <Button color="blue" outline onclick={loadMediaServers} disabled={msLoading}>
      {#if msLoading}
        <Spinner size="6" class="mr-2" /> Scanning...
      {:else}
        Discover Media Servers
      {/if}
    </Button>
  </div>

{#if !selectedServer}
  <Card>
    <div class="mb-2 flex items-center gap-2">
      <h4 class="text-base font-semibold">Media Servers</h4>
      {#if dlnaDiscoveryLoading}
        <Spinner size="4" />
      {/if}
    </div>

    {#if dlnaDiscoveryLoading && dlnaServers.length === 0}
      <div class="text-gray-500">Searching the network…</div>
    {:else if dlnaServers.length > 0}
      <Listgroup active class="cursor-pointer">
        {#each dlnaServers as s}
          <button type="button" class="w-full text-left" onclick={() => { selectedServer = s; browseRoot('dlna'); }}>
            <ListgroupItem>
              <div class="flex items-center justify-between w-full">
                <div class="flex flex-col">
                  <span>{s.friendlyName}</span>
                  {#if mediaServers.find(ms => ms.id === s.id)}
                    <span class="text-xs text-blue-500">Registered on SoundTouch</span>
                  {:else if s.address}
                    <span class="text-xs text-gray-400">{s.address}</span>
                  {:else}
                    <span class="text-xs text-gray-400">Not registered</span>
                  {/if}
                </div>
                <AngleRightOutline class="w-5 h-5 text-gray-600" />
              </div>
            </ListgroupItem>
          </button>
        {/each}
      </Listgroup>
    {:else}
      <div class="text-sm text-gray-500">
        No DLNA media servers (music libraries) were found on your network. The Bose
        SoundTouch is a <span class="font-medium">player/renderer</span>, not a server — to
        stream from here you need a separate DLNA/UPnP media server such as Plex, Jellyfin
        or a NAS.
      </div>
    {/if}

    {#if otherDevices.length > 0}
      <div class="mt-4">
        <h5 class="mb-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
          Other UPnP devices on your network ({otherDevices.length})
        </h5>
        <Listgroup>
          {#each otherDevices as d}
            <ListgroupItem>
              <div class="flex w-full items-center justify-between">
                <div class="flex flex-col">
                  <span class="text-sm">{d.friendlyName}</span>
                  <span class="text-xs text-gray-400">
                    {d.address ?? ''}{d.kind === 'renderer' ? ' · player/renderer' : ''}
                  </span>
                </div>
              </div>
            </ListgroupItem>
          {/each}
        </Listgroup>
      </div>
    {/if}
  </Card>
{/if}

  {#if msError}
    <div>
      <Alert color="red">{msError}</Alert>
    </div>
  {/if}

  {#if selectedServer}
    <Card>
      <div class="flex items-center justify-between">
        <div class="flex flex-wrap gap-2 text-sm">
          {#each breadcrumbs as bc, i}
            <button class="text-blue-600 hover:underline" onclick={() => goToBreadcrumb(i)}>{bc.title}</button>
            {#if i < breadcrumbs.length - 1}
              <span class="text-gray-400">/</span>
            {/if}
          {/each}
        </div>
        <div>
          {#if targetDeviceIp}
            <span class="text-xs text-gray-500">Target: {targetDeviceIp}</span>
          {/if}
        </div>
      </div>
      <div class="mt-3">
        {#if items.length === 0}
          <div class="text-gray-500">No entries.</div>
        {:else}
          <Listgroup active class="cursor-pointer">
            {#each items as it}
              <button type="button" class="w-full text-left" onclick={() => {
                    if (it.type === 'container') {
                      if (isPlayableContainer(it)) {
                        playContainer(it);
                      } else {
                        enter(it);
                      }
                    } else {
                      playItem(it);
                    }
                  }}>
                <ListgroupItem>
                  <div class="flex items-center justify-between w-full">
                    <div class="flex items-center gap-2">
                      {#if it.type === 'container'}
                        <span class="inline-block h-2 w-2 rounded-full bg-gray-400"></span>
                      {:else}
                        <span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                      {/if}
                      <span>{it.title}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      {#if it.type === 'container'}
                        {#if isPlayableContainer(it)}
                          <PlayOutline class="w-5 h-5 text-green-600" />
                        {:else}
                          <AngleRightOutline class="w-5 h-5 text-gray-600" />
                        {/if}
                      {:else}
                        <PlayOutline class="w-5 h-5 text-green-600" />
                      {/if}
                    </div>
                  </div>
                </ListgroupItem>
              </button>
            {/each}
          </Listgroup>
        {/if}
      </div>
    </Card>
  {/if}
</div>

<style>
  /* No additional styles — Tailwind/Flowbite are used */
  
</style>
