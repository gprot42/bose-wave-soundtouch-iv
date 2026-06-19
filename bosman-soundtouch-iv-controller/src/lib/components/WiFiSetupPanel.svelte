<!--
  - Copyright (c) 2026 Kambrium Software GmbH
  - Licensed under the MIT License.
  -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Spinner } from 'flowbite-svelte';
  import {
    addWifiProfile,
    getWifiStatus,
    probeSetupCli,
    scanWifiNetworks,
    type ScannedNetwork,
    type SetupProbeResult,
    type WifiSecurity
  } from '$lib/bose/setup';
  import { retainLocalWifi } from '$lib/native/wifiInfo';

  interface Props {
    speakerHost: string;
    onProvisioned?: () => void;
  }

  let { speakerHost, onProvisioned }: Props = $props();

  let scanning = $state(false);
  let provisioning = $state(false);
  let checking = $state(false);
  let setupAvailable = $state<boolean | null>(null);
  let probeInfo = $state<SetupProbeResult | null>(null);
  let networks = $state<ScannedNetwork[]>([]);
  let selectedSsid = $state('');
  let manualSsid = $state('');
  let password = $state('');
  let security = $state<WifiSecurity>('wpa_or_wpa2');
  let statusMessage = $state<string | null>(null);
  let error = $state<string | null>(null);

  let activeSsid = $derived(selectedSsid || manualSsid.trim());

  async function checkSetupCli() {
    checking = true;
    error = null;
    probeInfo = null;
    try {
      await retainLocalWifi();
      const result = await probeSetupCli(speakerHost);
      probeInfo = result;
      setupAvailable = result.ok;
      if (!result.ok) {
        error = `Cannot reach the Bose setup server at ${speakerHost}. ${result.detail}. Confirm the speaker is in setup mode (WiFi light blinking), that this phone is joined to the speaker’s setup WiFi, keep mobile data off, and allow BosMan **Nearby devices** permission in Android Settings.`;
      }
    } finally {
      checking = false;
    }
  }

  async function scan() {
    scanning = true;
    error = null;
    statusMessage = null;
    try {
      await retainLocalWifi();
      if (setupAvailable !== true) {
        await checkSetupCli();
        if (!setupAvailable) return;
      }
      networks = await scanWifiNetworks(speakerHost);
      if (networks.length === 0) {
        statusMessage = 'Scan returned no networks. Enter your home WiFi name manually below.';
      } else {
        selectedSsid = networks[0].ssid;
        security = networks[0].security;
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'WiFi scan failed';
    } finally {
      scanning = false;
    }
  }

  async function provision() {
    if (!activeSsid) {
      error = 'Choose or enter a WiFi network name.';
      return;
    }
    if (security !== 'none' && !password.trim()) {
      error = 'Enter the WiFi password.';
      return;
    }

    provisioning = true;
    error = null;
    statusMessage = null;
    try {
      await retainLocalWifi();
      const matched = networks.find((n) => n.ssid === activeSsid);
      const result = await addWifiProfile(activeSsid, security, password, speakerHost, matched);
      if (!result.ok) {
        error = result.message;
        return;
      }
      statusMessage = result.message;
      const status = await getWifiStatus(speakerHost);
      if (status.ok && status.message) {
        statusMessage += `\n\n${status.message}`;
      }
      onProvisioned?.();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Provisioning failed';
    } finally {
      provisioning = false;
    }
  }

  onMount(() => {
    checkSetupCli();
  });
</script>

<div class="mx-auto max-w-sm rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 text-left text-sm text-blue-900 dark:text-blue-200 space-y-4">
  <div>
    <p class="font-semibold mb-1">Set up home WiFi with BosMan</p>
    <p class="text-xs">
            <strong>Wave SoundTouch IV (SoundTouch 4)</strong> uses the older Gabbo setup path: an embedded web server on the speaker’s setup access point (gateway <span class="font-mono">192.168.1.1</span>). BosMan reads the network list from <span class="font-mono">/setup/index.asp</span> and submits your WiFi over HTTP. Port <span class="font-mono">8090</span> control appears only after the speaker joins home WiFi.
    </p>
  </div>

  {#if checking}
    <div class="flex items-center gap-2 text-xs">
      <Spinner size="4" />
      Checking setup server at {speakerHost}…
    </div>
  {:else if setupAvailable === false}
    <p class="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">{error}</p>
    {#if probeInfo?.isWaveSetupAp}
      <p class="text-xs text-amber-800 dark:text-amber-200">
        Make sure this phone is connected to the speaker’s own setup WiFi (the speaker’s WiFi light should be blinking). The setup web server lives at <span class="font-mono">192.168.1.1</span>; once the speaker joins your home WiFi, BosMan controls it on port <span class="font-mono">8090</span>.
      </p>
    {/if}
    {#if probeInfo?.phoneIp}
      <p class="text-xs font-mono text-blue-800/70 dark:text-blue-200/70">
        Phone {probeInfo.phoneIp}{probeInfo.ssid ? ` · ${probeInfo.ssid}` : ''}
      </p>
    {/if}
    <Button size="xs" color="blue" onclick={checkSetupCli}>Retry connection</Button>
  {:else}
    <div class="space-y-3">
      <Button size="sm" color="blue" class="w-full" onclick={scan} disabled={scanning || provisioning}>
        {#if scanning}
          <Spinner size="4" class="mr-2" />
          Scanning for home networks…
        {:else}
          Scan for home WiFi networks
        {/if}
      </Button>

      {#if networks.length > 0}
        <label class="block text-xs">
          <span class="font-semibold">Detected networks</span>
          <select
            class="mt-1 w-full rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            bind:value={selectedSsid}
            onchange={() => {
              const match = networks.find((n) => n.ssid === selectedSsid);
              if (match) security = match.security;
            }}
          >
            {#each networks as network}
              <option value={network.ssid}>{network.ssid} ({network.security})</option>
            {/each}
          </select>
        </label>
      {/if}

      <label class="block text-xs">
        <span class="font-semibold">Or enter SSID manually</span>
        <input
          class="mt-1 w-full rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono"
          bind:value={manualSsid}
          placeholder="SKYADJ5Z"
        />
      </label>

      <label class="block text-xs">
        <span class="font-semibold">Security</span>
        <select
          class="mt-1 w-full rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          bind:value={security}
        >
          <option value="wpa_or_wpa2">WPA / WPA2</option>
          <option value="wep">WEP</option>
          <option value="none">Open (no password)</option>
        </select>
      </label>

      {#if security !== 'none'}
        <label class="block text-xs">
          <span class="font-semibold">WiFi password</span>
          <input
            type="password"
            class="mt-1 w-full rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            bind:value={password}
            autocomplete="off"
          />
        </label>
      {/if}

      <Button size="sm" color="green" class="w-full" onclick={provision} disabled={provisioning || scanning}>
        {#if provisioning}
          <Spinner size="4" class="mr-2" />
          Connecting speaker to home WiFi…
        {:else}
          Connect speaker to home WiFi
        {/if}
      </Button>
    </div>
  {/if}

  {#if error && setupAvailable !== false}
    <p class="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">{error}</p>
  {/if}

  {#if statusMessage}
    <p class="text-xs whitespace-pre-wrap">{statusMessage}</p>
    <p class="text-xs text-blue-800/80 dark:text-blue-200/80">
      When the base WiFi light turns white/green, connect this phone to the same home WiFi and tap <strong>Search again</strong>.
    </p>
  {/if}
</div>