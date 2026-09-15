"use client";

import { useRef, useState } from "react";
import type { SpeechRecognitionLike } from "@/lib/speech";

export default function MicButton({ onText, title = "Falar" }: { onText: (text: string) => void; title?: string }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggle() {
    if (transcribing) return;
    if (recording) {
      recRef.current?.stop();
      mrRef.current?.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.lang = "pt-BR";
      r.interimResults = false;
      r.onstart = () => setRecording(true);
      r.onend = () => setRecording(false);
      r.onresult = (e) => {
        const t = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim();
        if (t) onText(t);
      };
      recRef.current = r;
      r.start();
      return;
    }

    // Fallback para navegadores sem SpeechRecognition (Safari/iOS antigo):
    // grava o áudio e transcreve no servidor via /api/extract
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        const fd = new FormData();
        fd.append("file", new File([blob], `audio.${ext}`, { type: blob.type }));
        try {
          const res = await fetch("/api/extract", { method: "POST", body: fd, credentials: "include" });
          const data = await res.json();
          if (data.text?.trim()) onText(data.text.trim());
          else alert(data.error || "Não consegui transcrever o áudio");
        } catch {
          alert("Erro ao transcrever áudio");
        }
        setTranscribing(false);
      };
      mrRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("Microfone não disponível. Libere a permissão ou use outro navegador.");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="ghost icon"
      disabled={transcribing}
      title={transcribing ? "Transcrevendo..." : recording ? "Parar" : title}
      style={recording ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
    >
      {transcribing ? "⏳" : recording ? "⏹" : "🎤"}
    </button>
  );
}
