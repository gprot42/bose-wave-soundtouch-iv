<!--
Copyright (c) 2026 Kambrium Software GmbH
Licensed under the MIT License.
-->
<script lang="ts">

  import { BottomNav, BottomNavItem, DarkMode } from 'flowbite-svelte';
  import { HomeSolid, MusicSolid, GridSolid, InfoCircleSolid } from 'flowbite-svelte-icons';

  interface Props {
    activeTab: string;
    onTabChange: (tab: string) => void;
  }

  let { activeTab, onTabChange } = $props<Props>();

</script>

<BottomNav position="fixed" class="z-50 border-t border-gray-200 dark:border-gray-600 w-full max-w-none h-20">
  <div class="grid h-full max-w-lg grid-cols-5 mx-auto font-medium">
    <BottomNavItem label="Devices" active={activeTab === 'devices'} onclick={() => onTabChange('devices')} class="inline-flex flex-col items-center justify-center px-5 hover:bg-gray-50 dark:hover:bg-gray-800 group">
      <HomeSolid class="mb-1 h-7 w-7 {activeTab === 'devices' ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-500'}" />
    </BottomNavItem>
    <BottomNavItem label="Media" active={activeTab === 'media'} onclick={() => onTabChange('media')} class="inline-flex flex-col items-center justify-center px-5 hover:bg-gray-50 dark:hover:bg-gray-800 group">
      <MusicSolid class="mb-1 h-7 w-7 {activeTab === 'media' ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-500'}" />
    </BottomNavItem>
    <BottomNavItem label="Zones" active={activeTab === 'zones'} onclick={() => onTabChange('zones')} class="inline-flex flex-col items-center justify-center px-5 hover:bg-gray-50 dark:hover:bg-gray-800 group">
      <GridSolid class="mb-1 h-7 w-7 {activeTab === 'zones' ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-500'}" />
    </BottomNavItem>
    <BottomNavItem label="Info" active={activeTab === 'info'} onclick={() => onTabChange('info')} class="inline-flex flex-col items-center justify-center px-5 hover:bg-gray-50 dark:hover:bg-gray-800 group">
      <InfoCircleSolid class="mb-1 h-7 w-7 {activeTab === 'info' ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-500'}" />
    </BottomNavItem>
    <div class="inline-flex flex-col items-center justify-center px-5 hover:bg-gray-50 dark:hover:bg-gray-800 group cursor-pointer">
      <DarkMode class="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-500" />
    </div>
  </div>
</BottomNav>
