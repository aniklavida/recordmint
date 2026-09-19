"use client";

import { useEffect, useState, useRef } from "react";
import { checkBrowserSupport, type SupportResult, captureDisplay, captureUserMedia, mixStreams, createChunkedUploader, createRecorder, getEncodingMimeType } from "@recordmint/recorder";

export function RecorderUI({ workspaceId }: { workspaceId: string }) {
  const [support, setSupport] = useState<SupportResult | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progressBytes, setProgressBytes] = useState(0);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const recorderRef = useRef<{ recorder: ReturnType<typeof createRecorder>; uploader: ReturnType<typeof createChunkedUploader>; recordingId: string; publicId: string } | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const res = checkBrowserSupport();
      setSupport(res);
    } catch (e: unknown) {
      setError("Capability check failed: " + (e instanceof Error ? e.message : String(e)));
    }
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
  };

  const startRecording = async () => {
    try {
      setError(null);
      setShareLink(null);
      setElapsed(0);
      setProgressBytes(0);

      // 1. Capture Media
      const displayRes = await captureDisplay();
      streamsRef.current.push(displayRes.stream);

      let userStream: MediaStream | null = null;
      if (micEnabled || cameraEnabled) {
        userStream = await captureUserMedia({ audio: micEnabled, video: cameraEnabled });
        streamsRef.current.push(userStream);
      }

      const streamsToMix = [displayRes.stream];
      if (userStream) {
        streamsToMix.push(userStream);
      }

      const mixedStream = mixStreams(streamsToMix);
      streamsRef.current.push(mixedStream);

      const mimeType = getEncodingMimeType();
      const ext = mimeType.includes("webm") ? "webm" : "mp4";

      // 2. Start API
      const startRes = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, container: ext })
      });
      if (!startRes.ok) throw new Error("Failed to start recording on server");
      const { recordingId, publicId } = await startRes.json();

      // 3. Setup Uploader
      const uploader = createChunkedUploader({
        signPart: async (partNumber) => {
          const res = await fetch(`/api/recordings/${recordingId}/parts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partNumber })
          });
          if (!res.ok) throw new Error("Failed to sign part");
          return res.json();
        },
        putPart: async (url, blob) => {
          const res = await fetch(url, { method: "PUT", body: blob });
          if (!res.ok) throw new Error("Failed to upload part");
          return { eTag: res.headers.get("ETag") || "mock-etag" };
        },
        completeUpload: async (parts) => {
          const res = await fetch(`/api/recordings/${recordingId}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parts, container: ext })
          });
          if (!res.ok) throw new Error("Failed to complete upload");
        }
      });

      // 4. Start Recorder
      const recorder = createRecorder({
        stream: mixedStream,
        uploader,
        mimeType
      });

      recorder.start();
      recorderRef.current = { recorder, uploader, recordingId, publicId };
      setIsRecording(true);
      setIsPaused(false);

      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      progressIntervalRef.current = setInterval(() => {
        setProgressBytes(uploader.getState().bufferedBytes);
      }, 1000);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      cleanup();
    }
  };

  const pauseRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.recorder.pause();
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const resumeRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.recorder.resume();
    setIsPaused(false);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    const { recorder, uploader, recordingId, publicId } = recorderRef.current;
    
    cleanup();
    setIsRecording(false);
    
    try {
      await recorder.stop();
      
      const link = `${window.location.origin}/v/${publicId}`;
      setShareLink(link);
      navigator.clipboard.writeText(link).catch(() => {});
      
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (uploader.getState().isRecoverable) {
        setError(`Upload failed, but local blob is retained. Reason: ${msg}`);
        // Can add a retry UI using uploader.retryFailedParts()
      } else {
        setError(`Upload failed completely: ${msg}`);
      }
      await fetch(`/api/recordings/${recordingId}/fail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: msg })
      }).catch(() => {});
    }
  };

  if (!support) return <div>Checking browser capabilities...</div>;

  return (
    <div className="recorder-ui">
      <h2>Record</h2>
      
      {!support.supported && (
        <div className="error">
          Browser not supported: {support.reasons.join(", ")}
        </div>
      )}

      {error && <div className="error" style={{ color: 'red' }}>{error}</div>}
      
      {shareLink && (
        <div className="success" style={{ color: 'green' }}>
          Recording ready! Link copied to clipboard: <a href={shareLink}>{shareLink}</a>
        </div>
      )}

      {!isRecording && (
        <div>
          <label>
            <input type="checkbox" checked={micEnabled} onChange={e => setMicEnabled(e.target.checked)} />
            Microphone
          </label>
          <br/>
          <label>
            <input type="checkbox" checked={cameraEnabled} onChange={e => setCameraEnabled(e.target.checked)} />
            Camera
          </label>
          <br/>
          <button onClick={startRecording} disabled={!support.supported}>Start Recording</button>
        </div>
      )}

      {isRecording && (
        <div>
          <div>Elapsed: {elapsed}s | Buffered: {(progressBytes / 1024 / 1024).toFixed(2)} MB</div>
          {isPaused ? (
            <button onClick={resumeRecording}>Resume</button>
          ) : (
            <button onClick={pauseRecording}>Pause</button>
          )}
          <button onClick={stopRecording}>Stop Recording</button>
        </div>
      )}
    </div>
  );
}
