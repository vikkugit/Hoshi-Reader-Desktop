import { persisted } from "./persisted.svelte";

export type TtsConfig = {
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
};

const defaults: TtsConfig = {
  voice: "",
  rate: 1,
  pitch: 1,
  volume: 1,
};

const store = persisted<TtsConfig>("tts.config", defaults);

export const ttsConfig = store.config;
export const saveTtsConfig = store.save;
