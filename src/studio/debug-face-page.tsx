import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { createFaceLandmarker } from "../kit/face/landmarker";

type Status =
  | { step: "chargement" }
  | { step: "caméra" }
  | { step: "détection"; points: number }
  | { step: "échec"; reason: string };

/**
 * Page de vérification du portage MediaPipe sous Vite. La spec désigne cette
 * brique comme le seul risque capable de faire dérailler le calendrier : le
 * critère de réussite est net, **468** doit s'afficher et ne pas se figer.
 */
export function DebugFacePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ step: "chargement" });

  useEffect(() => {
    let landmarker: FaceLandmarker | undefined;
    let stream: MediaStream | undefined;
    let frameId: number | null = null;
    let lastVideoTime = -1;
    let cancelled = false;

    const run = async () => {
      try {
        landmarker = await createFaceLandmarker();
      } catch (cause) {
        setStatus({
          step: "échec",
          reason: `Le runtime MediaPipe n'a pas démarré — ${String(cause)}`,
        });
        return;
      }
      if (cancelled) return;

      setStatus({ step: "caméra" });
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (cause) {
        const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
        setStatus({
          step: "échec",
          reason: denied
            ? "Caméra refusée. Autorisez l'accès puis rechargez."
            : "Aucune caméra disponible sur cet appareil.",
        });
        return;
      }
      if (cancelled) return;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const loop = () => {
        frameId = requestAnimationFrame(loop);
        if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        const result = landmarker.detectForVideo(video, performance.now());
        setStatus({ step: "détection", points: result.faceLandmarks[0]?.length ?? 0 });
      };
      loop();
    };

    void run();

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
      landmarker?.close();
    };
  }, []);

  return (
    <section className="debug-face">
      <h1>Vérification MediaPipe</h1>
      <p className="debug-face-hint">
        Attendu : <strong>468</strong> points détectés, sans figement. C'est le nombre de
        repères du modèle <code>face_landmarker.task</code>.
      </p>

      <video ref={videoRef} playsInline muted className="debug-face-video" />

      <output className="debug-face-status" data-step={status.step}>
        {status.step === "chargement" && "Chargement du runtime MediaPipe…"}
        {status.step === "caméra" && "Runtime chargé. Ouverture de la caméra…"}
        {status.step === "détection" && (
          <>
            <span className="debug-face-count">{status.points}</span> points détectés
          </>
        )}
        {status.step === "échec" && status.reason}
      </output>
    </section>
  );
}
