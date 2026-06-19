<!--
  - Copyright (c) 2026 Kambrium Software GmbH
  - Licensed under the MIT License.
  -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Accordion, AccordionItem, Alert, Badge, Button, Card, Carousel, Spinner, Thumbnails } from 'flowbite-svelte';
  import ZoneManager from '$lib/components/ZoneManager.svelte';
  import DeviceMediaServerTab from '$lib/components/DeviceMediaServerTab.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Fader from '$lib/components/Fader.svelte';
  import PresetButtonGroup from '$lib/components/PresetButtonGroup.svelte';
  import WiFiSetupPanel from '$lib/components/WiFiSetupPanel.svelte';
  import { BoseWebSocketClient } from '$lib/utils/boseWebSocket';
  import { Capacitor } from '@capacitor/core';
  import type { WifiNetworkInfo } from '$lib/native/wifiInfo';
  import { getWifiNetworkInfo, releaseNetworkBinding, subnetPrefixFromIp } from '$lib/native/wifiInfo';
  import {
    apiDiscoverDeviceByIp,
    apiDiscoverDevices,
    apiGetNowPlaying,
    apiGetPresets,
    apiGetVolume,
    apiSendCommand,
    apiSetVolume,
    apiStorePreset
  } from '$lib/api';
  import type { DiscoveredDevice } from '$lib/utils/boseShared';

  type Device = DiscoveredDevice;

  let devices = $state<Device[]>([]);
  let selectedDeviceIndex = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let manualIp = $state('192.168.0.119');
  let wifiStatus = $state<WifiNetworkInfo | null>(null);
  let onBoseSetupAp = $state(false);
  let isNative = Capacitor.isNativePlatform();
  let powering = $state<Record<string, boolean>>({});
  let wsClients = new Map<string, BoseWebSocketClient>();
  let pollingIntervals = new Map<string, any>();
  let activeTab = $state('devices');
  let selectedDevice = $derived(devices[selectedDeviceIndex]);
  let zoneManagerInstances = $state<Record<string, any>>({});
  let mediaServerTabs = $state<Record<string, any>>({});

  let carouselImages = $derived(
    devices.map((d) => ({
      alt: d.name,
      src: d.nowPlaying?.art || getDeviceImage(d) || '/favicon.png', // Fallback image
      title: d.name,
      name: d.name // Extra property for potential custom rendering if needed
    }))
  );

  function handleTabChange(tab: string) {
    activeTab = tab;
    if (!selectedDevice) return;
    
    const d = selectedDevice;
    if (tab === 'zones') {
       zoneManagerInstances[d.ip]?.loadZone?.();
    }
    if (tab === 'media' || tab === 'devices') {
       if (tab === 'media') mediaServerTabs[d.ip]?.loadMediaServers?.();
       if (!d.presets || d.presets.length === 0) updatePresets(d);
    }
  }

  // Zone functionality moved into ZoneManager component

  // Eagerly import all device assets as URLs (handled by Vite)
  const assetUrls = import.meta.glob('../assets/*.{png,jpg,jpeg,svg}', { eager: true, as: 'url' }) as Record<string, string>;

  // Build a lookup of best (svg>png>jpg>jpeg) by base name without extension
  const extPriority: Record<string, number> = { svg: 4, png: 3, jpg: 2, jpeg: 1 };
  const assetsByBase = new Map<string, string>();
  for (const [path, url] of Object.entries(assetUrls)) {
    const fname = path.split('/').pop()!; // e.g., "SoundTouch 20.svg"
    const lastDot = fname.lastIndexOf('.');
    const base = lastDot >= 0 ? fname.slice(0, lastDot) : fname;
    const ext = lastDot >= 0 ? fname.slice(lastDot + 1).toLowerCase() : '';
    const current = assetsByBase.get(base);
    const currentExt = current ? current.split('.').pop()?.toLowerCase() ?? '' : '';
    const curPriority = currentExt ? extPriority[currentExt] ?? 0 : 0;
    const newPriority = extPriority[ext] ?? 0;
    if (!current || newPriority > curPriority) {
      assetsByBase.set(base, url);
    }
  }

  function getDeviceImage(d: Device): string | undefined {
    const display = (d.type || d.name || '').toLowerCase();

    // Try to detect specific models first
    const candidates: string[] = [];
    if (display.includes('wave')) candidates.push('Bose Wave SoundTouch');
    if (display.includes('30')) candidates.push('SoundTouch 30');
    if (display.includes('20')) candidates.push('SoundTouch 20');
    if (display.includes('10')) candidates.push('SoundTouch 10');

    // If no explicit model detected, try generic SoundTouch
    if (candidates.length === 0) {
      // Prefer 20 as a neutral default if available
      candidates.push('SoundTouch 20', 'SoundTouch 30', 'SoundTouch 10', 'Bose Wave SoundTouch');
    }

    for (const base of candidates) {
      const url = assetsByBase.get(base);
      if (url) return url;
    }

    // Fallback: any asset that starts with SoundTouch
    for (const [base, url] of assetsByBase) {
      if (base.toLowerCase().startsWith('soundtouch')) return url;
    }

    // Final fallback: return undefined; UI will handle absence
    return undefined;
  }

  function resetDeviceConnections() {
    wsClients.forEach(client => client.disconnect());
    wsClients.clear();
    pollingIntervals.forEach(interval => clearInterval(interval));
    pollingIntervals.clear();
  }

  async function initializeDevices(discovered: Device[]) {
    devices = discovered
      .map((d) => ({ ...d, nowPlaying: null, volume: null, presets: [] }))
      .sort((a, b) => (a.name || a.ip).localeCompare(b.name || b.ip));

    devices.forEach(d => {
      const client = new BoseWebSocketClient(d.ip, (update) => {
        const index = devices.findIndex(dev => dev.ip === d.ip);
        if (index !== -1) {
          if (update.nowPlaying) devices[index].nowPlaying = update.nowPlaying;
          if (update.volume) devices[index].volume = update.volume;
          if (update.presetsChanged) updatePresets(devices[index]);
        }
      }, (connected) => {
        if (connected) {
          stopPolling(d.ip);
        } else {
          startPolling(d);
        }
      });
      client.connect();
      wsClients.set(d.ip, client);
    });

    for (const d of devices) {
      await updateNowPlaying(d);
      await updateVolume(d);
      await updatePresets(d);
    }
  }

  async function prepareWifi(): Promise<void> {
    if (!isNative) return;
    await releaseNetworkBinding();
    wifiStatus = await getWifiNetworkInfo();
    onBoseSetupAp = !!(
      wifiStatus?.boseSetupAp ||
      wifiStatus?.ssid?.toLowerCase().includes('bose') ||
      wifiStatus?.ip?.startsWith('192.0.2.')
    );
    if (onBoseSetupAp) {
      manualIp = '192.168.1.1';
    } else if (wifiStatus?.ip && (manualIp === '192.168.1.1' || manualIp.endsWith('.1'))) {
      const prefix = subnetPrefixFromIp(wifiStatus.ip);
      if (prefix) manualIp = `${prefix}.119`;
    }
  }

  async function discover() {
    loading = true;
    error = null;
    selectedDeviceIndex = 0;
    resetDeviceConnections();
    devices = [];
    try {
      await prepareWifi();
      const discovered = await apiDiscoverDevices();
      if (discovered.length === 0 && onBoseSetupAp) {
        error = null;
      }
      await initializeDevices(discovered);
    } catch (e: any) {
      error = e?.message ?? 'Unknown error';
    } finally {
      loading = false;
    }
  }

  async function connectByIp() {
    const ip = manualIp.trim();
    if (!ip) return;
    loading = true;
    error = null;
    selectedDeviceIndex = 0;
    resetDeviceConnections();
    devices = [];
    try {
      await prepareWifi();
      const device = await apiDiscoverDeviceByIp(ip);
      if (!device) {
        if (onBoseSetupAp) {
          throw new Error(
            `No SoundTouch API at ${ip} on Bose setup WiFi. Use the WiFi setup panel below to join your home network, then reconnect on home WiFi.`
          );
        }
        throw new Error(`No SoundTouch device at ${ip}`);
      }
      await initializeDevices([device]);
    } catch (e: any) {
      error = e?.message ?? 'Connection failed';
    } finally {
      loading = false;
    }
  }

  async function updateNowPlaying(d: Device) {
    try {
      const nowPlaying = await apiGetNowPlaying(d.ip);
      const index = devices.findIndex(dev => dev.ip === d.ip);
      if (index !== -1) devices[index].nowPlaying = nowPlaying;
    } catch (e) {
      console.error(`Failed to update nowPlaying for ${d.ip}`, e);
    }
  }

  async function updateVolume(d: Device) {
    try {
      const volume = await apiGetVolume(d.ip);
      const index = devices.findIndex(dev => dev.ip === d.ip);
      if (index !== -1) devices[index].volume = volume;
    } catch (e) {
      console.error(`Failed to update volume for ${d.ip}`, e);
    }
  }

  async function updatePresets(d: Device) {
    try {
      const presets = await apiGetPresets(d.ip);
      const index = devices.findIndex(dev => dev.ip === d.ip);
      if (index !== -1) devices[index].presets = presets;
    } catch (e) {
      console.error(`Failed to update presets for ${d.ip}`, e);
    }
  }

  function startPolling(d: Device) {
    if (pollingIntervals.has(d.ip)) return;
    console.log(`Starting fallback polling for ${d.ip}`);
    // Poll every 60 seconds as a fallback
    const interval = setInterval(() => {
      updateNowPlaying(d);
      updateVolume(d);
    }, 60000);
    pollingIntervals.set(d.ip, interval);
  }

  function stopPolling(ip: string) {
    if (pollingIntervals.has(ip)) {
      console.log(`Stopping fallback polling for ${ip}`);
      clearInterval(pollingIntervals.get(ip));
      pollingIntervals.delete(ip);
    }
  }

  async function setDeviceVolume(d: Device, volume: number) {
    try {
      await apiSetVolume(d.ip, volume);
      const index = devices.findIndex(dev => dev.ip === d.ip);
      if (index !== -1 && devices[index].volume) {
        devices[index].volume!.target = volume;
        devices[index].volume!.actual = volume;
      }
    } catch (e) {
      console.error(`Failed to set volume for ${d.ip}`, e);
    }
  }

  async function power(d: Device) {
    try {
      powering[d.ip] = true;
      await apiSendCommand('power', d.ip);
      // Update state after a short delay
      setTimeout(() => {
        updateNowPlaying(d);
        updateVolume(d);
        updatePresets(d);
      }, 1000);
    } catch (e) {
      console.error('Power command failed', e);
    } finally {
      powering[d.ip] = false;
    }
  }

  async function selectPreset(d: Device, presetId: number) {
    try {
      await apiSendCommand(`PRESET_${presetId}`, d.ip);
      setTimeout(() => updateNowPlaying(d), 1000);
    } catch (e) {
      console.error(`Failed to select preset ${presetId} for ${d.ip}`, e);
    }
  }

  async function storeCurrentAsPreset(d: Device, presetId: number) {
    if (!d.nowPlaying) return;
    try {
      await apiStorePreset(d.ip, presetId, d.nowPlaying);
      await updatePresets(d);
    } catch (e: any) {
      console.error(`Failed to store preset ${presetId} for ${d.ip}`, e);
    }
  }

  async function play(d: Device) {
    try {
      await apiSendCommand('play', d.ip);
      await updateNowPlaying(d);
    } catch (e) {
      console.error('Play command failed', e);
    }
  }

  async function pause(d: Device) {
    try {
      await apiSendCommand('pause', d.ip);
      await updateNowPlaying(d);
    } catch (e) {
      console.error('Pause command failed', e);
    }
  }

  async function stop(d: Device) {
    try {
      await apiSendCommand('stop', d.ip);
      await updateNowPlaying(d);
    } catch (e) {
      console.error('Stop command failed', e);
    }
  }

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

  onMount(() => {
    discover();
    return () => {
      wsClients.forEach(client => client.disconnect());
      pollingIntervals.forEach(interval => clearInterval(interval));
    };
  });

  onDestroy(() => {
    wsClients.forEach(client => client.disconnect());
    pollingIntervals.forEach(interval => clearInterval(interval));
  });

  function handleScroll(e: Event) {
    // This is no longer needed with the Carousel component
  }

  // Media server UI lives in DeviceMediaServerTab
</script>

<div class="min-h-screen bg-gray-50 text-gray-900 pb-20 dark:bg-gray-900 dark:text-gray-100" style="padding-top: env(safe-area-inset-top)">
  <div class="mx-auto max-w-5xl p-4">
    <header class="mb-4 mt-2 flex items-center justify-between">
      <h1 class="text-2xl font-bold">BosMan</h1>
      {#if activeTab === 'info'}
        <Button size="xs" color="blue" onclick={discover} outline disabled={loading}>
          {#if loading}
            <Spinner size="3" class="mr-1" />
          {:else}
            Scan
          {/if}
        </Button>
      {/if}
    </header>

    {#if error}
      <div class="mb-4">
        <Alert color="red" dismissable>{error}</Alert>
      </div>
    {/if}

    <main>
      {#if activeTab === 'devices'}
        <section id="devices">
          {#if loading && devices.length === 0}
            <div class="flex flex-col items-center justify-center p-10 text-center">
              <Spinner size="10" />
              <p class="mt-4 text-gray-500">Searching for devices...</p>
            </div>
          {:else if devices.length === 0}
            <div class="mt-10 text-center text-gray-600 dark:text-gray-400 space-y-4">
              <p>No devices found on this network.</p>
              {#if isNative && wifiStatus?.ssid}
                <p class="text-xs font-mono text-gray-500">
                  WiFi: {wifiStatus.ssid} · phone {wifiStatus.ip || '?'} · speaker likely {manualIp}
                </p>
              {/if}
              <Button size="sm" onclick={discover}>Search again</Button>
              {#if isNative && onBoseSetupAp}
                <WiFiSetupPanel speakerHost="192.168.1.1" />
                <div class="mx-auto max-w-sm rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-left text-sm text-amber-900 dark:text-amber-200">
                  <p class="font-semibold mb-1">GrapheneOS / Bose WiFi tip</p>
                  <p class="mb-2">Bose WiFi has no internet. Android may disconnect after a few seconds unless you:</p>
                  <ul class="list-disc pl-5 space-y-1 text-xs">
                    <li>Tap <strong>Stay connected</strong> when Android warns about no internet</li>
                    <li>Set Bose network MAC to <strong>Use device MAC</strong> (WiFi network details)</li>
                    <li>Turn off mobile data while using Bose WiFi</li>
                    <li>Optional: Settings → Network → Internet menu → disable connectivity checks</li>
                  </ul>
                </div>
              {/if}
              {#if isNative}
                <div class="mx-auto max-w-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-left">
                  <p class="text-sm mb-2">Connect directly to your SoundTouch home-network IP:</p>
                  <input
                    class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono"
                    bind:value={manualIp}
                    placeholder="192.168.0.119"
                  />
                  <Button size="sm" color="blue" class="mt-3 w-full" onclick={connectByIp} disabled={loading}>
                    Connect
                  </Button>
                </div>
              {/if}
            </div>
          {:else}
            <div class="space-y-4">
              <!-- Preset Selection -->
              {#if selectedDevice}
                <PresetButtonGroup 
                  device={selectedDevice} 
                  onPresetSelected={(id) => setTimeout(() => updateNowPlaying(selectedDevice), 1000)} 
                />
              {/if}

              <div class="rounded-xl shadow-lg bg-white dark:bg-gray-800 border dark:border-gray-700">
                <Carousel 
                  images={carouselImages} 
                  bind:index={selectedDeviceIndex} 
                  showIndicators={false}
                  showControls={devices.length > 1}
                  class="h-[450px] sm:h-96"
                >
                  {#snippet slide({ index })}
                    {@const d = devices[index]}
                    <div class="flex flex-col h-full w-full p-4 items-center justify-center relative">
                        {#if d.nowPlaying && d.nowPlaying.source !== 'STANDBY'}
                          <div class="w-full flex flex-col h-full space-y-4">
                            <!-- Top Row: Power & Volume and Device Info -->
                            <div class="flex flex-row items-start justify-between w-full">
                                <div class="flex flex-row items-center space-x-6">
                                    <Button 
                                        color="green" 
                                        size="xs" 
                                        pill 
                                        onclick={() => power(d)} 
                                        disabled={powering[d.ip]}
                                        class="shrink-0 h-10 w-10"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">
                                            <path d="M12 3v9" />
                                            <path d="M18.364 5.636a9 9 0 11-12.728 0" />
                                        </svg>
                                    </Button>

                                    {#if d.volume}
                                        <div class="flex flex-col items-center space-y-1">
                                            <div class="flex flex-row items-center space-x-2">
                                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-tight">Vol:</span>
                                                <span class="text-xs font-bold text-blue-600 leading-tight">{d.volume.actual}%</span>
                                            </div>
                                            <div class="relative w-40 h-12 flex items-center justify-center">
                                                <Fader
                                                    horizontal
                                                    bind:value={d.volume.target}
                                                    oninput={(val) => {
                                                        if (d.volume) d.volume.target = val;
                                                    }}
                                                    onchange={(val) => {
                                                        setDeviceVolume(d, val);
                                                    }}
                                                    class="scale-90 origin-center"
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                </div>

                                <div class="flex flex-col items-end min-w-0 flex-1 ml-4">
                                    <div class="flex flex-col items-end">
                                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate max-w-full text-right">{d.name}</span>
                                        <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider shrink-0">• {d.nowPlaying.source}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Middle Row: Track Info & Artwork -->
                            <div class="flex-1 flex flex-col items-center justify-center space-y-4 min-h-0">
                              <div class="relative group shrink-0">
                                <img 
                                    src={d.nowPlaying?.art || getDeviceImage(d) || '/favicon.png'} 
                                    alt={d.name} 
                                    class="h-32 w-32 sm:h-40 sm:w-40 object-cover rounded-lg shadow-md transition-transform duration-300 group-hover:scale-105" 
                                />
                                
                                <div class="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none">
                                     <div class="flex gap-4 pointer-events-auto">
                                        <button class="bg-white/80 dark:bg-gray-800/80 p-2 rounded-full shadow-lg" onclick={() => play(d)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
                                                <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                                            </svg>
                                        </button>
                                        <button class="bg-white/80 dark:bg-gray-800/80 p-2 rounded-full shadow-lg" onclick={() => pause(d)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
                                                <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75zM17.25 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75z" clip-rule="evenodd" />
                                            </svg>
                                        </button>
                                     </div>
                                </div>
                              </div>

                              <div class="w-full text-center min-w-0 flex flex-col justify-center">
                                  <h3 class="text-xl font-bold dark:text-white line-clamp-2">{d.nowPlaying.track || d.nowPlaying.itemName || 'No title'}</h3>
                                  <p class="text-sm text-gray-500 truncate">{d.nowPlaying.artist || d.nowPlaying.stationName || ''}</p>
                              </div>
                            </div>

                            <!-- Bottom Row: Controls -->
                            <div class="w-full flex justify-center gap-8 py-2">
                               <button class="text-gray-400 hover:text-blue-600 transition-colors" onclick={() => play(d)}>
                                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8">
                                       <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                                   </svg>
                               </button>
                               <button class="text-gray-400 hover:text-blue-600 transition-colors" onclick={() => pause(d)}>
                                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8">
                                       <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75zM17.25 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75z" clip-rule="evenodd" />
                                   </svg>
                               </button>
                               <button class="text-gray-400 hover:text-blue-600 transition-colors" onclick={() => stop(d)}>
                                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8">
                                       <rect width="12" height="12" x="6" y="6" rx="1" />
                                   </svg>
                               </button>
                            </div>
                          </div>
                        {:else}
                          <div class="w-full flex flex-col h-full space-y-4">
                            <!-- Top Row: Power & Volume and Device Info -->
                            <div class="flex flex-row items-start justify-between w-full">
                                <div class="flex flex-row items-center space-x-6">
                                    <Button 
                                        color="red" 
                                        size="xs" 
                                        pill 
                                        onclick={() => power(d)} 
                                        disabled={powering[d.ip]}
                                        class="shrink-0 h-10 w-10"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">
                                            <path d="M12 3v9" />
                                            <path d="M18.364 5.636a9 9 0 11-12.728 0" />
                                        </svg>
                                    </Button>

                                    {#if d.volume}
                                        <div class="flex flex-col items-center space-y-1">
                                            <div class="flex flex-row items-center space-x-2">
                                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-tight">Vol:</span>
                                                <span class="text-xs font-bold text-blue-600 leading-tight">{d.volume.actual}%</span>
                                            </div>
                                            <div class="relative w-40 h-12 flex items-center justify-center">
                                                <Fader
                                                    horizontal
                                                    bind:value={d.volume.target}
                                                    oninput={(val) => {
                                                        if (d.volume) d.volume.target = val;
                                                    }}
                                                    onchange={(val) => {
                                                        setDeviceVolume(d, val);
                                                    }}
                                                    class="scale-90 origin-center"
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                </div>

                                <div class="flex flex-col items-end min-w-0 flex-1 ml-4">
                                    <div class="flex flex-col items-end">
                                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate max-w-full text-right">{d.name}</span>
                                        <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">• STANDBY</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Middle Area: Device Image (grayscale) -->
                            <div class="flex-1 flex items-center justify-center w-full min-h-0">
                                <img 
                                    src={getDeviceImage(d) || '/favicon.png'} 
                                    alt={d.name} 
                                    class="h-40 sm:h-56 object-contain p-4 grayscale opacity-50 transition-all duration-700" 
                                />
                            </div>
                          </div>
                        {/if}
                    </div>
                  {/snippet}
                </Carousel>
              </div>

              {#if devices.length > 1}
                <div class="flex justify-center">
                  <Thumbnails 
                    images={carouselImages} 
                    bind:index={selectedDeviceIndex} 
                    activeThumbnailClass="border-blue-600 ring-2 ring-blue-600/20"
                    class="gap-3 px-2 overflow-x-auto hide-scrollbar bg-transparent"
                    imgClass="h-14 w-14 object-contain p-1 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 cursor-pointer transition-all shadow-sm"
                  />
                </div>
              {/if}
            </div>
          {/if}
        </section>

      {:else if activeTab === 'media'}
        <section id="media" class="space-y-6">
          {#if selectedDevice}
            {@const d = selectedDevice}
            <div class="space-y-4">
              <h3 class="font-bold text-lg border-b pb-2">{d.name} Presets</h3>
              
              <PresetButtonGroup 
                device={d} 
                onPresetSelected={(id) => setTimeout(() => updateNowPlaying(d), 1000)} 
              />

              {#if d.nowPlaying && d.nowPlaying.isPresetable}
                <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                   <p class="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-3">Save current stream as preset:</p>
                   <div class="flex gap-2">
                      {#each [1, 2, 3, 4, 5, 6] as id}
                        <Button size="xs" color="blue" onclick={() => storeCurrentAsPreset(d, id)}>
                          {id}
                        </Button>
                      {/each}
                   </div>
                </div>
              {/if}

              <div class="mt-4">
                <Accordion flush>
                  <AccordionItem open>
                    {#snippet header()}
                       <span class="text-sm font-semibold">Media Server ({d.name})</span>
                    {/snippet}
                    <DeviceMediaServerTab bind:this={mediaServerTabs[d.ip]} targetDeviceIp={d.ip} />
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          {:else}
            <p class="text-center text-gray-500 py-10">No device selected.</p>
          {/if}
        </section>

      {:else if activeTab === 'zones'}
        <section id="zones" class="space-y-6">
          {#if selectedDevice}
            {@const d = selectedDevice}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border p-4">
              <h3 class="font-bold text-lg mb-4">Zone Management</h3>
              <p class="text-sm text-gray-500 mb-6">Select a master speaker to create a zone.</p>
              <div class="space-y-8">
                <div class="">
                  <h4 class="font-semibold mb-2 flex items-center gap-2">
                     <Badge color="indigo">Master</Badge> {d.name}
                  </h4>
                  <ZoneManager bind:this={zoneManagerInstances[d.ip]} {devices} master={d} />
                </div>
              </div>
            </div>
          {:else}
            <p class="text-center text-gray-500 py-10">No devices available for zone management.</p>
          {/if}
        </section>

      {:else if activeTab === 'info'}
        <section id="info" class="space-y-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border overflow-hidden">
            <div class="p-4 bg-gray-50 dark:bg-gray-700 border-b flex justify-between items-center">
              <h3 class="font-bold">Technical Details</h3>
              <Button size="xs" onclick={discover}>Refresh</Button>
            </div>
            <div class="divide-y dark:divide-gray-700">
              {#if selectedDevice}
                {@const d = selectedDevice}
                <div class="p-4 space-y-1">
                  <p class="font-bold">{d.name}</p>
                  <div class="grid grid-cols-2 text-xs gap-y-1">
                    <span class="text-gray-500">IP Address:</span>
                    <span class="font-mono">{d.ip}</span>
                    {#if d.macAddresses && d.macAddresses.length > 0}
                      {#each d.macAddresses as mac, i}
                        <span class="text-gray-500">MAC Address {d.macAddresses.length > 1 ? i + 1 : ''}:</span>
                        <span class="font-mono">{mac}</span>
                      {/each}
                    {:else}
                      <span class="text-gray-500">MAC Address:</span>
                      <span class="font-mono">{d.mac || 'N/A'}</span>
                    {/if}
                    <span class="text-gray-500">Device ID:</span>
                    <span class="font-mono">{d.deviceID || 'N/A'}</span>
                    <span class="text-gray-500">Type:</span>
                    <span>{d.type || 'SoundTouch'}</span>
                    <span class="text-gray-500">Software:</span>
                    <span class="font-mono">{d.softwareVersion || 'N/A'}</span>
                    <span class="text-gray-500">Serial Number:</span>
                    <span class="font-mono">{d.serialNumber || 'N/A'}</span>
                  </div>
                </div>
              {:else}
                <p class="p-4 text-center text-gray-500">No device selected.</p>
              {/if}
            </div>
          </div>

          <Card class="w-full max-w-none">
            <h3 class="font-bold mb-2">About BosMan</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              SvelteKit-based app for local management of Bose SoundTouch devices.
            </p>
          </Card>
        </section>
      {/if}
    </main>
  </div>
  <BottomNav {activeTab} onTabChange={handleTabChange} />
</div>
