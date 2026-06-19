<!--
Copyright (c) 2026 Kambrium Software GmbH
Licensed under the MIT License.
-->
<script lang="ts">

  import { DarkMode } from 'flowbite-svelte';
  import "../app.css";
</script>

<svelte:head>
  <title>BosMan — Bose Manager</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="hidden">
  <DarkMode mode="dark" />
</div>

<slot />
