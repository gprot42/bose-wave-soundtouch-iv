<!--
  - Copyright (c) 2026 Kambrium Software GmbH
  - Licensed under the MIT License.
  -->
<script lang="ts">

  interface Props {
    value: number;
    min?: number;
    max?: number;
    onchange?: (value: number) => void;
    oninput?: (value: number) => void;
    class?: string;
    horizontal?: boolean;
  }

  let { 
    value = $bindable(), 
    min = 0, 
    max = 100, 
    onchange, 
    oninput,
    class: className = '',
    horizontal = false
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    value = val;
    oninput?.(val);
  }

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    onchange?.(val);
  }
</script>

<div class="fader-container {className}" class:horizontal>
  <div class="fader-track-bg"></div>
  <div class="fader-track-slot"></div>
  
  <input
    type="range"
    {min}
    {max}
    bind:value
    oninput={handleInput}
    onchange={handleChange}
    onmousedown={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
    ontouchstart={(e) => e.stopPropagation()}
    class="fader-input"
    style="--value-percent: {((value - min) / (max - min)) * 100}%"
  />
  
  <div class="fader-scale">
    {#if horizontal}
      {#each [0, 25, 50, 75, 100] as step}
        <div class="scale-mark">
          <span class="scale-label">{step}</span>
        </div>
      {/each}
    {:else}
      {#each [100, 75, 50, 25, 0] as step}
        <div class="scale-mark">
          <span class="scale-label">{step}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .fader-container {
    position: relative;
    height: 180px;
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    user-select: none;
  }

  .fader-container.horizontal {
    height: 40px;
    width: 180px;
    flex-direction: row;
    padding: 0;
    justify-content: center;
    box-sizing: border-box;
  }

  .fader-track-bg {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 24px;
    background: linear-gradient(to right, #1a1a1a, #333 50%, #1a1a1a);
    border-radius: 4px;
    box-shadow: inset 1px 1px 3px rgba(0,0,0,0.8), 1px 1px 1px rgba(255,255,255,0.05);
    border: 1px solid #111;
    z-index: 1;
  }

  .horizontal .fader-track-bg {
    top: 8px;
    bottom: 8px;
    left: 0;
    right: 0;
    width: auto;
    height: 24px;
    background: linear-gradient(to bottom, #1a1a1a, #333 50%, #1a1a1a);
  }

  .fader-track-slot {
    position: absolute;
    top: 10px;
    bottom: 10px;
    width: 4px;
    background: #050505;
    border-radius: 2px;
    box-shadow: inset 1px 1px 2px rgba(0,0,0,0.5);
    z-index: 2;
  }

  .horizontal .fader-track-slot {
    left: 24px;
    right: 24px;
    top: 18px;
    width: auto;
    height: 4px;
  }

  .fader-input {
    -webkit-appearance: none;
    appearance: none;
    width: 40px;
    height: 180px;
    background: transparent;
    cursor: pointer;
    z-index: 10;
    margin: 0;
    padding: 0;
    /* Native vertikale Unterstützung */
    writing-mode: vertical-lr;
    direction: rtl;
    position: absolute;
    top: 0;
    left: 0;
  }

  .horizontal .fader-input {
    width: 180px;
    height: 40px;
    writing-mode: horizontal-tb;
    direction: ltr;
    top: 0;
    left: 0;
    margin: 0;
    padding: 0;
  }

  .fader-input::-webkit-slider-runnable-track {
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
  }

  .fader-input::-moz-range-track {
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
  }

  /* Thumb / Knob */
  .fader-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 32px;
    height: 48px;
    background: #ccc;
    background-image: 
        linear-gradient(to right, transparent 48%, #333 48%, #333 52%, transparent 52%),
        linear-gradient(to bottom, #eee 0%, #999 40%, #777 50%, #999 60%, #eee 100%);
    border-radius: 4px;
    border: 1px solid #555;
    box-shadow: 
        0 4px 8px rgba(0,0,0,0.7),
        inset 0 1px 1px rgba(255,255,255,0.4);
    cursor: grab;
  }

  .horizontal .fader-input::-webkit-slider-thumb {
    width: 48px;
    height: 32px;
    background-image: 
        linear-gradient(to right, transparent 48%, #333 48%, #333 52%, transparent 52%),
        linear-gradient(to right, #eee 0%, #999 40%, #777 50%, #999 60%, #eee 100%);
  }

  .fader-input::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .fader-input::-moz-range-thumb {
    width: 32px;
    height: 48px;
    background: #ccc;
    background-image: 
        linear-gradient(to right, transparent 48%, #333 48%, #333 52%, transparent 52%),
        linear-gradient(to bottom, #eee 0%, #999 40%, #777 50%, #999 60%, #eee 100%);
    border-radius: 4px;
    border: 1px solid #555;
    box-shadow: 
        0 4px 8px rgba(0,0,0,0.7),
        inset 0 1px 1px rgba(255,255,255,0.4);
    cursor: grab;
  }

  .horizontal .fader-input::-moz-range-thumb {
    width: 48px;
    height: 32px;
    background-image: 
        linear-gradient(to right, transparent 48%, #333 48%, #333 52%, transparent 52%),
        linear-gradient(to right, #eee 0%, #999 40%, #777 50%, #999 60%, #eee 100%);
  }

  .fader-input::-moz-range-thumb:active {
    cursor: grabbing;
  }

  .fader-input:focus {
    outline: none;
  }

  .fader-scale {
    position: absolute;
    left: -20px;
    top: 24px;
    bottom: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;
    align-items: flex-end;
    z-index: 5;
  }

  .horizontal .fader-scale {
    left: 24px;
    right: 5px;
    top: auto;
    bottom: -15px;
    flex-direction: row;
    height: 8px;
    width: auto;
    align-items: flex-start;
  }

  .scale-mark {
    width: 8px;
    height: 1px;
    background: #444;
    position: relative;
    display: flex;
    justify-content: center;
  }

  .horizontal .scale-mark {
    width: 1px;
    height: 8px;
    flex-direction: column;
    align-items: center;
  }

  .scale-label {
    position: absolute;
    right: 12px;
    font-size: 8px;
    color: #888;
    font-family: monospace;
    white-space: nowrap;
    line-height: 1;
  }

  .horizontal .scale-label {
    right: auto;
    top: 12px;
  }
</style>
