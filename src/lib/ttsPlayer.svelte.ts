import { ttsConfig } from "./ttsConfig.svelte";

export type TtsState = "stopped" | "playing" | "paused";

type Command = "start" | "current" | "next" | "prev" | "stop";

/**
 * Text-to-speech controller. The reader frame owns the document side
 * (sentence extraction, highlighting, scrolling) and answers each command with
 * the sentence to read; this class owns the audio and the playback state.
 */
export class TtsPlayer {
  state = $state<TtsState>("stopped");
  index = $state(0);
  total = $state(0);
  errorMessage = $state("");
  voices = $state<SpeechSynthesisVoice[]>([]);

  // True while a new frame is loading and reading has to restart on it.
  private awaitingFrame = false;
  private token = 0;
  private readonly send: (cmd: Command) => void;
  private readonly synth: SpeechSynthesis | null =
    typeof speechSynthesis === "undefined" ? null : speechSynthesis;

  constructor(send: (cmd: Command) => void) {
    this.send = send;
    this.refreshVoices();
    if (this.synth) this.synth.onvoiceschanged = () => this.refreshVoices();
  }

  get supported() {
    return this.synth !== null;
  }

  get active() {
    return this.state !== "stopped";
  }

  private refreshVoices() {
    if (!this.synth) return;
    const all = this.synth.getVoices();
    const japanese = all.filter((voice) => voice.lang.toLowerCase().replace("_", "-").startsWith("ja"));
    const natural = (voice: SpeechSynthesisVoice) => (/natural|online/i.test(voice.name) ? 0 : 1);
    this.voices = (japanese.length ? japanese : all).slice().sort((a, b) => natural(a) - natural(b));
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    return this.voices.find((voice) => voice.name === ttsConfig.voice) ?? this.voices[0] ?? null;
  }

  private speak(text: string) {
    if (!this.synth) return;
    const token = ++this.token;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "ja-JP";
    }
    utterance.rate = ttsConfig.rate;
    utterance.pitch = ttsConfig.pitch;
    utterance.volume = ttsConfig.volume;
    utterance.onend = () => {
      if (token === this.token && this.state === "playing") this.send("next");
    };
    utterance.onerror = (event) => {
      if (token !== this.token) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      this.errorMessage = `Speech failed: ${event.error}`;
      this.stop();
    };
    this.synth.speak(utterance);
  }

  private silence() {
    this.token++;
    this.synth?.cancel();
  }

  start() {
    if (!this.synth) {
      this.errorMessage = "Speech synthesis is not available on this system.";
      return;
    }
    this.errorMessage = "";
    this.state = "playing";
    this.send("start");
  }

  pause() {
    if (this.state !== "playing") return;
    this.silence();
    this.state = "paused";
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.send("current");
  }

  toggle() {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
    else this.start();
  }

  stop() {
    this.silence();
    this.awaitingFrame = false;
    if (this.state !== "stopped") this.send("stop");
    this.state = "stopped";
    this.index = 0;
    this.total = 0;
  }

  next() {
    if (!this.active) return;
    this.silence();
    this.state = "playing";
    this.send("next");
  }

  prev() {
    if (!this.active) return;
    this.silence();
    this.state = "playing";
    this.send("prev");
  }

  /** Re-speak the current sentence after a voice or speed change. */
  settingsChanged() {
    if (this.state === "playing") {
      this.silence();
      this.send("current");
    }
  }

  /** Messages coming from the reader frame; null if the message is not a TTS one. */
  handleMessage(m: { hoshi: string; [key: string]: unknown }): "end" | "handled" | null {
    switch (m.hoshi) {
      case "tts-sentence":
        this.index = m.index as number;
        this.total = m.total as number;
        if (this.state === "playing") this.speak(m.text as string);
        return "handled";
      case "tts-end":
        this.silence();
        // The reader decides whether there is a following chapter.
        return "end";
      default:
        return null;
    }
  }

  /** A new document is loading: whatever was read belongs to the old one. */
  onFrameReady() {
    if (this.state === "stopped") return;
    this.silence();
    if (this.state === "playing") this.awaitingFrame = true;
    else this.state = "stopped";
  }

  /** The new document is laid out and positioned. */
  onPositioned() {
    if (!this.awaitingFrame) return;
    this.awaitingFrame = false;
    if (this.state === "playing") this.send("start");
  }

  dispose() {
    this.silence();
    if (this.synth) this.synth.onvoiceschanged = null;
  }
}
