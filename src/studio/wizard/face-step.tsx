import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { createFaceLandmarker } from "../../kit/face/landmarker";
import { buildFaceGlb, FACE_TEX_MAX } from "../../kit/avatar/build-face-glb";
import { SubjectPreview } from "../../kit/avatar/subject-preview";
import { useCamera } from "./use-camera";

/** Le backend ignore le masque en mode test : un blob minimal suffit à occuper
 *  le champ du formulaire. */
const MASQUE_FACTICE = new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], {
  type: "model/gltf-binary",
});

interface FaceStepProps {
  onCaptured(faceGlb: Blob): void;
  /** Mode test : le backend greffera `visage.glb` et ignorera ce qu'on envoie. */
  localFace: boolean;
}

/**
 * Capture du visage. Tout se passe dans le navigateur : la détection est locale
 * (MediaPipe en WASM), et aucune image ne part avant que l'utilisateur ait
 * validé son masque.
 */
export function FaceStep({ onCaptured, localFace }: FaceStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const derniersPoints = useRef<NormalizedLandmark[] | null>(null);
  const dernierePose = useRef<number[] | null>(null);

  const [visageDetecte, setVisageDetecte] = useState(false);
  const [masque, setMasque] = useState<{ glb: Blob; url: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const camera = useCamera(!localFace && !masque);

  useEffect(() => {
    if (localFace || camera.step !== "prête") return;

    const video = videoRef.current;
    if (!video) return;

    let frameId: number | null = null;
    let dernierTemps = -1;
    let cancelled = false;

    const demarrer = async () => {
      let landmarker: FaceLandmarker;
      try {
        landmarker = await createFaceLandmarker();
      } catch {
        if (!cancelled) setErreur("Le détecteur de visage n'a pas démarré.");
        return;
      }

      // Quitter l'écran pendant le chargement du WASM est fréquent : sans cette
      // fermeture, le détecteur naît après le démontage et personne ne le ferme
      // plus jamais.
      if (cancelled) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;

      try {
        video.srcObject = camera.stream;
        // `play()` peut rejeter (politique d'autoplay) et ne renvoie même pas
        // toujours une promesse. Sans ce garde, l'échec sortait de la fonction
        // asynchrone sans que personne ne le rattrape.
        await video.play()?.catch(() => {});
      } catch {
        if (!cancelled) setErreur("La caméra n'a pas pu démarrer dans cette page.");
        return;
      }

      const boucle = () => {
        frameId = requestAnimationFrame(boucle);

        const landmarker = landmarkerRef.current;
        if (!landmarker || video.readyState < 2) return;
        // Une inférence par nouvelle image vidéo, pas par frame d'affichage.
        if (video.currentTime === dernierTemps) return;
        dernierTemps = video.currentTime;

        const result = landmarker.detectForVideo(video, performance.now());
        const points = result.faceLandmarks[0];
        derniersPoints.current = points ?? null;
        dernierePose.current = result.facialTransformationMatrixes?.[0]?.data ?? null;
        setVisageDetecte(Boolean(points));
      };

      boucle();
    };

    void demarrer();

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [camera, localFace]);

  useEffect(() => () => {
    if (masque) URL.revokeObjectURL(masque.url);
  }, [masque]);

  const capturer = () => {
    const video = videoRef.current;
    const points = derniersPoints.current;
    if (!video || !points) return;

    // Texture plafonnée : protection mémoire du backend, pas un réglage de
    // qualité — les repères étant normalisés, la réduction ne les touche pas.
    const echelle = Math.min(1, FACE_TEX_MAX / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * echelle);
    canvas.height = Math.round(video.videoHeight * echelle);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const glb = buildFaceGlb(points, canvas, dernierePose.current);
      setMasque({ glb, url: URL.createObjectURL(glb) });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Masque facial illisible.");
    }
  };

  if (erreur) {
    return (
      <div role="alert" className="stage-error">
        {erreur}
      </div>
    );
  }

  if (localFace) {
    return (
      <div className="face-step">
        <p className="face-hint">
          Mode test : le backend greffera son visage de référence, la caméra ne sert à rien.
        </p>
        <button type="button" onClick={() => onCaptured(MASQUE_FACTICE)}>
          Utiliser le visage de test
        </button>
      </div>
    );
  }

  if (masque) {
    return (
      <div className="face-step">
        <SubjectPreview src={masque.url} className="face-preview" />
        <p className="face-hint">Votre masque, tel qu'il partira à la greffe.</p>
        <div className="face-actions">
          <button type="button" onClick={() => setMasque(null)}>
            Reprendre
          </button>
          <button type="button" onClick={() => onCaptured(masque.glb)}>
            Valider ce visage
          </button>
        </div>
      </div>
    );
  }

  if (camera.step === "refusée") {
    return (
      <div role="alert" className="stage-error">
        Caméra refusée. Autorisez l'accès dans votre navigateur, puis rechargez la page.
      </div>
    );
  }

  if (camera.step === "absente") {
    return (
      <div className="face-step">
        <p role="alert" className="face-hint">
          Aucune caméra disponible sur cet appareil.
        </p>
        <button type="button" onClick={() => onCaptured(MASQUE_FACTICE)}>
          Utiliser le visage de test
        </button>
      </div>
    );
  }

  return (
    <div className="face-step">
      <div className="face-stage">
        <video ref={videoRef} playsInline muted className="face-video" />
        <div className={`face-oval${visageDetecte ? " is-detected" : ""}`} />
      </div>

      <p className="face-hint">
        {visageDetecte
          ? "Visage détecté — vous pouvez prendre la photo."
          : "Placez votre visage dans l'ovale."}
      </p>

      <button type="button" disabled={!visageDetecte} onClick={capturer}>
        Prendre la photo
      </button>
    </div>
  );
}
