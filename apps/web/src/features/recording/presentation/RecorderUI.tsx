"use client";

import { useEffect, useState, useRef } from "react";
import {
  checkBrowserSupport,
  type SupportResult,
  captureDisplay,
  captureUserMedia,
  mixStreams,
  createChunkedUploader,
  createRecorder,
  getEncodingMimeType,
  type DisplaySurface,
  type UploaderState,
  type ChunkedUploader,
  type RecorderResult,
} from "@recordmint/recorder";

export function RecorderUI({ workspaceId }: { workspaceId: string }) {
  const [support, setSupport] = useState<SupportResult | null>(null);
  const [source, setSource] = useState<DisplaySurface>("monitor");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploaderState, setUploaderState] = useState<UploaderState | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const recorderRef = useRef<{
    recorder: RecorderResult;
    uploader: ChunkedUploader;
    recordingId: string;
    publicId: string;
  } | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const extRef = useRef<string>("mp4");

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
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      setError(null);
      setShareLink(null);
      setCopied(false);
      setLocalBlobUrl(null);
      setElapsed(0);
      setUploaderState(null);
      recordedChunksRef.current = [];

      // 1. Capture Media
      const displayRes = await captureDisplay({ surface: source });
      streamsRef.current.push(displayRes.stream);

      let userStream: MediaStream | null = null;
      if (micEnabled || cameraEnabled) {
        userStream = await captureUserMedia({ audio: micEnabled, video: cameraEnabled });
        streamsRef.current.push(userStream);
      }

      // Display live camera preview bubble if camera video track is available
      if (cameraEnabled && userStream && userStream.getVideoTracks().length > 0) {
        const cameraOnlyStream = new MediaStream(userStream.getVideoTracks());
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = cameraOnlyStream;
        }
      }

      // Combine video from display and user audio from mic
      const streamsToMix: MediaStream[] = [displayRes.stream];
      if (userStream) {
        const audioTracks = userStream.getAudioTracks();
        if (audioTracks.length > 0) {
          streamsToMix.push(new MediaStream(audioTracks));
        }
      }

      const mixedStream = mixStreams(streamsToMix);
      streamsRef.current.push(mixedStream);

      const mimeType = getEncodingMimeType();
      const ext = mimeType.includes("webm") ? "webm" : "mp4";
      extRef.current = ext;

      // 2. Start API
      const startRes = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, container: ext }),
      });
      if (!startRes.ok) throw new Error("Failed to start recording on server");
      const { recordingId, publicId } = await startRes.json();

      // 3. Setup Chunked Uploader with chunk retention
      const rawUploader = createChunkedUploader({
        signPart: async (partNumber) => {
          const res = await fetch(`/api/recordings/${recordingId}/parts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partNumber }),
          });
          if (!res.ok) throw new Error("Failed to sign part");
          return res.json();
        },
        putPart: async (url, blob) => {
          const res = await fetch(url, { method: "PUT", body: blob });
          if (!res.ok) throw new Error("Failed to upload part");
          const eTag = res.headers.get("ETag");
          if (!eTag) {
            throw new Error(
              "S3 did not return an ETag header for this part — check the bucket's CORS configuration exposes ETag",
            );
          }
          return { eTag };
        },
        completeUpload: async (parts) => {
          const res = await fetch(`/api/recordings/${recordingId}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parts, container: ext }),
          });
          if (!res.ok) throw new Error("Failed to complete upload");
        },
      });

      const uploader: ChunkedUploader = {
        ...rawUploader,
        addChunk: (chunk: Blob) => {
          recordedChunksRef.current.push(chunk);
          rawUploader.addChunk(chunk);
        },
      };

      // 4. Start Recorder
      const recorder = createRecorder({
        stream: mixedStream,
        uploader,
        mimeType,
      });

      recorder.start();
      recorderRef.current = { recorder, uploader, recordingId, publicId };
      setIsRecording(true);
      setIsPaused(false);
      setUploaderState(uploader.getState());

      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      progressIntervalRef.current = setInterval(() => {
        setUploaderState(uploader.getState());
      }, 500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      cleanup();
    }
  };

  const pauseRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.recorder.pause();
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setUploaderState(recorderRef.current.uploader.getState());
  };

  const resumeRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.recorder.resume();
    setIsPaused(false);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    setUploaderState(recorderRef.current.uploader.getState());
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    const { recorder, publicId } = recorderRef.current;

    cleanup();
    setIsRecording(false);
    setIsPaused(false);

    try {
      await recorder.stop();

      const link = `${window.location.origin}/v/${publicId}`;
      setShareLink(link);
      setCopied(true);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(link).catch(() => {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Retain local recording blob so user never loses their data
      if (recordedChunksRef.current.length > 0) {
        const mimeType = getEncodingMimeType();
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        setLocalBlobUrl(blobUrl);
      }

      setError(
        `Upload could not finish: ${msg}. Your recording has been preserved locally — you can retry the upload or download it directly.`,
      );
    }
  };

  const retryUpload = async () => {
    if (!recorderRef.current) return;
    const { uploader, publicId } = recorderRef.current;
    setIsRetrying(true);
    setError(null);

    try {
      uploader.retryFailedParts();
      await uploader.complete();

      const link = `${window.location.origin}/v/${publicId}`;
      setShareLink(link);
      setCopied(true);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(link).catch(() => {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Retry failed: ${msg}. Your local recording remains safe.`);
    } finally {
      setIsRetrying(false);
    }
  };

  const resetForNewRecording = () => {
    setShareLink(null);
    setCopied(false);
    setError(null);
    setLocalBlobUrl(null);
    setElapsed(0);
    setUploaderState(null);
    recorderRef.current = null;
    recordedChunksRef.current = [];
  };

  if (!support) {
    return <div data-testid="capability-probe-loading">Checking browser capabilities...</div>;
  }

  const uploadedMb = ((uploaderState?.uploadedBytes ?? 0) / (1024 * 1024)).toFixed(2);
  const bufferedMb = ((uploaderState?.bufferedBytes ?? 0) / (1024 * 1024)).toFixed(2);
  const partsCount = uploaderState?.completedParts.length ?? 0;

  return (
    <div className="recorder-ui">
      {/* Capability Probe Verdict — shown before recording starts */}
      <div
        className={`capability-verdict ${support.supported ? "capability-supported" : "capability-unsupported"}`}
        data-testid="capability-verdict"
        role={support.supported ? "status" : "alert"}
      >
        {support.supported ? (
          <div>
            <strong>Ready to record:</strong> Browser supports screen capture and video encoding.
            {support.systemAudio === "unknown" && (
              <span className="capability-note"> (Tab and system audio vary by browser and platform.)</span>
            )}
          </div>
        ) : (
          <div>
            <strong>Browser unsupported:</strong> {support.reasons.join(", ")}. Recording is disabled.
          </div>
        )}
      </div>

      {/* Honest Error Banner with Local Blob Retention */}
      {error && (
        <div className="error-banner" data-testid="error-banner" role="alert">
          <p>{error}</p>
          <div className="error-actions">
            {recorderRef.current && (
              <button
                type="button"
                onClick={retryUpload}
                disabled={isRetrying}
                data-testid="retry-upload-button"
              >
                {isRetrying ? "Retrying upload..." : "Retry Upload"}
              </button>
            )}
            {localBlobUrl && (
              <a
                href={localBlobUrl}
                download={`recording.${extRef.current}`}
                className="download-link"
                data-testid="download-local-recording"
              >
                Download Local Recording ({extRef.current.toUpperCase()})
              </a>
            )}
          </div>
        </div>
      )}

      {/* Share Link Presentation on Stop */}
      {shareLink && (
        <div className="share-section" data-testid="share-section">
          <h3>Recording ready!</h3>
          <p className="clipboard-notice" data-testid="clipboard-notice">
            {copied ? "✓ Share link copied to clipboard automatically" : "Share link ready"}
          </p>
          <div className="share-link-row">
            <input
              type="text"
              readOnly
              value={shareLink}
              data-testid="share-link-input"
              className="share-link-input"
            />
            <a
              href={shareLink}
              target="_blank"
              rel="noreferrer"
              className="share-link-anchor"
              data-testid="share-link-anchor"
            >
              {shareLink}
            </a>
          </div>
          <button type="button" onClick={resetForNewRecording} data-testid="record-again-button">
            Record another video
          </button>
        </div>
      )}

      {/* Pre-recording Controls */}
      {!isRecording && !shareLink && (
        <div className="recorder-pre-record" data-testid="recorder-controls">
          <div className="recorder-field">
            <label htmlFor="source-picker">Capture Source</label>
            <select
              id="source-picker"
              value={source}
              onChange={(e) => setSource(e.target.value as DisplaySurface)}
              disabled={!support.supported}
              data-testid="source-picker"
            >
              <option value="monitor">Entire Screen</option>
              <option value="window">Window</option>
              <option value="browser">Browser Tab</option>
            </select>
          </div>

          <div className="recorder-toggles">
            <label htmlFor="mic-toggle">
              <input
                id="mic-toggle"
                type="checkbox"
                checked={micEnabled}
                onChange={(e) => setMicEnabled(e.target.checked)}
                disabled={!support.supported}
                data-testid="mic-toggle"
              />
              Microphone
            </label>

            <label htmlFor="camera-toggle">
              <input
                id="camera-toggle"
                type="checkbox"
                checked={cameraEnabled}
                onChange={(e) => setCameraEnabled(e.target.checked)}
                disabled={!support.supported}
                data-testid="camera-toggle"
              />
              Camera
            </label>
          </div>

          <button
            type="button"
            onClick={startRecording}
            disabled={!support.supported}
            className="record-start-btn"
            data-testid="start-recording-button"
          >
            Start Recording
          </button>
        </div>
      )}

      {/* Live State while Recording */}
      {isRecording && (
        <div className="recorder-live" data-testid="recorder-live">
          <div className="live-status-row">
            <span
              className={`status-pill ${isPaused ? "status-paused" : "status-recording"}`}
              data-testid="recording-status"
            >
              {isPaused ? "Paused" : "Recording"}
            </span>
            <span className="elapsed-time" data-testid="elapsed-time">
              Time: {formatElapsed(elapsed)}
            </span>
          </div>

          <div className="upload-progress" data-testid="upload-progress">
            <span>
              Uploaded: {uploadedMb} MB ({partsCount} {partsCount === 1 ? "part" : "parts"})
            </span>
            <span> | Buffered: {bufferedMb} MB</span>
          </div>

          <div className="live-actions">
            {isPaused ? (
              <button
                type="button"
                onClick={resumeRecording}
                className="resume-btn"
                data-testid="resume-button"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={pauseRecording}
                className="pause-btn"
                data-testid="pause-button"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={stopRecording}
              className="stop-btn"
              data-testid="stop-recording-button"
            >
              Stop Recording
            </button>
          </div>

          {/* Picture-in-picture camera preview bubble when camera is toggled */}
          {cameraEnabled && (
            <div className="camera-preview-container" data-testid="camera-preview-container">
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                className="camera-preview-video"
                data-testid="camera-preview-video"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
