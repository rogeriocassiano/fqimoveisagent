export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous?: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: { transcript: string; isFinal?: boolean }[][] }) => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
