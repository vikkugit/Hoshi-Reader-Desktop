<script lang="ts">
  import { Pause, Play, SkipBack, SkipForward, Square } from "@lucide/svelte";
  import SettingGroup from "./SettingGroup.svelte";
  import SettingSlider from "./SettingSlider.svelte";
  import { saveTtsConfig, ttsConfig } from "./ttsConfig.svelte";
  import type { TtsPlayer } from "./ttsPlayer.svelte";

  let { player }: { player: TtsPlayer } = $props();

  const selectedVoice = $derived(
    player.voices.find((voice) => voice.name === ttsConfig.voice)?.name ?? player.voices[0]?.name ?? "",
  );

  function changed() {
    saveTtsConfig();
    player.settingsChanged();
  }
</script>

<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
  <div class="flex items-center justify-center gap-2">
    <button class="btn btn-ghost btn-sm btn-square" title="Previous sentence" disabled={!player.active} onclick={() => player.prev()}>
      <SkipBack class="size-4" />
    </button>
    <button class="btn btn-primary btn-circle" title={player.state === "playing" ? "Pause" : "Read aloud"} onclick={() => player.toggle()}>
      {#if player.state === "playing"}
        <Pause class="size-5" />
      {:else}
        <Play class="size-5" />
      {/if}
    </button>
    <button class="btn btn-ghost btn-sm btn-square" title="Next sentence" disabled={!player.active} onclick={() => player.next()}>
      <SkipForward class="size-4" />
    </button>
    <button class="btn btn-ghost btn-sm btn-square" title="Stop" disabled={!player.active} onclick={() => player.stop()}>
      <Square class="size-4" />
    </button>
  </div>

  {#if player.active && player.total}
    <span class="text-center text-xs tabular-nums text-base-content/50">Sentence {player.index + 1} / {player.total}</span>
  {/if}

  {#if !player.supported}
    <span class="text-sm text-error">Speech synthesis is not available on this system.</span>
  {:else if player.errorMessage}
    <span class="select-text text-sm text-error">{player.errorMessage}</span>
  {/if}

  <SettingGroup title="Voice">
    {#if player.voices.length}
      <select
        class="select select-sm w-full"
        value={selectedVoice}
        onchange={(e) => {
          ttsConfig.voice = e.currentTarget.value;
          changed();
        }}
      >
        {#each player.voices as voice (voice.voiceURI)}
          <option value={voice.name}>{voice.name} ({voice.lang})</option>
        {/each}
      </select>
    {:else}
      <span class="text-sm text-base-content/60">
        No voices found. Install a Japanese voice in Windows Settings → Time &amp; language → Speech.
      </span>
    {/if}
  </SettingGroup>

  <SettingGroup>
    <SettingSlider
      label="Speed"
      compact
      value={ttsConfig.rate}
      display={`${ttsConfig.rate.toFixed(2)}x`}
      min={0.5}
      max={2.5}
      step={0.05}
      onchange={(value) => (ttsConfig.rate = value)}
      onrelease={changed}
    />
    <SettingSlider
      label="Pitch"
      compact
      value={ttsConfig.pitch}
      display={ttsConfig.pitch.toFixed(2)}
      min={0.5}
      max={2}
      step={0.05}
      onchange={(value) => (ttsConfig.pitch = value)}
      onrelease={changed}
    />
    <SettingSlider
      label="Volume"
      compact
      value={ttsConfig.volume}
      display={`${Math.round(ttsConfig.volume * 100)}%`}
      min={0}
      max={1}
      step={0.05}
      onchange={(value) => (ttsConfig.volume = value)}
      onrelease={changed}
    />
  </SettingGroup>

  <p class="text-xs text-base-content/50">
    Reads from the first sentence on the current page, highlights it and turns pages automatically.
  </p>
</div>
