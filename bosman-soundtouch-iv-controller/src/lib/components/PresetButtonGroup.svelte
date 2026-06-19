<!--
  - Copyright (c) 2026 Kambrium Software GmbH
  - Licensed under the MIT License.
  -->
<script lang="ts">

  import { Button, ButtonGroup } from 'flowbite-svelte';
  import { apiGetPresets, apiSendCommand } from '$lib/api';
  import type { DiscoveredDevice } from '$lib/utils/boseShared';
  import { isPresetActive } from '$lib/utils/boseShared';

  interface Props {
    device: DiscoveredDevice;
    onPresetSelected?: (presetId: number) => void;
  }

  let { device, onPresetSelected } = $props<Props>();

  async function updatePresets() {
    try {
      device.presets = await apiGetPresets(device.ip);
    } catch (e) {
      console.error(`Failed to update presets for ${device.ip}`, e);
    }
  }

  async function selectPreset(presetId: number) {
    try {
      if (!device.presets || device.presets.length === 0) {
        await updatePresets();
      }
      
      await apiSendCommand(`PRESET_${presetId}`, device.ip);
      
      if (onPresetSelected) {
        onPresetSelected(presetId);
      }
    } catch (e) {
      console.error(`Failed to select preset ${presetId} for ${device.ip}`, e);
    }
  }
</script>

<div class="flex flex-col gap-1">
  <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Presets</span>
  <div class="px-1 space-y-2">
    <ButtonGroup class="w-full">
      {#each Array(3) as _, i}
        {@const presetId = i + 1}
        {@const preset = device.presets?.find(p => p.id === presetId)}
        {@const active = preset ? isPresetActive(device, preset) : false}
        <Button 
          color={active ? "blue" : "alternative"}
          class="flex-1 px-2 py-3 min-w-0 h-14 flex items-center justify-center transition-all active:scale-95"
          onclick={() => selectPreset(presetId)}
        >
          <span class="text-xs truncate w-full text-center font-bold">
            <span class="mr-1 opacity-60">{presetId}:</span>
            {preset?.itemName || 'Empty'}
          </span>
        </Button>
      {/each}
    </ButtonGroup>
    <ButtonGroup class="w-full">
      {#each Array(3) as _, i}
        {@const presetId = i + 4}
        {@const preset = device.presets?.find(p => p.id === presetId)}
        {@const active = preset ? isPresetActive(device, preset) : false}
        <Button 
          color={active ? "blue" : "alternative"}
          class="flex-1 px-2 py-3 min-w-0 h-14 flex items-center justify-center transition-all active:scale-95"
          onclick={() => selectPreset(presetId)}
        >
          <span class="text-xs truncate w-full text-center font-bold">
            <span class="mr-1 opacity-60">{presetId}:</span>
            {preset?.itemName || 'Empty'}
          </span>
        </Button>
      {/each}
    </ButtonGroup>
  </div>
</div>
