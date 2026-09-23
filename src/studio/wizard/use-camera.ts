import { useEffect, useRef, useState } from "react";

/**
 * Résolution idéale très haute : la webcam fournit alors son maximum réel,
 * plafonné par le navigateur. La texture du visage y gagne en netteté, et la
 * reconstruction du masque s'adapte au ratio obtenu.
 */
const CONTRAINTES: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 3840 }, height: { ideal: 2160 } },
  audio: false,
};

export type CameraState =
  | { step: "ouverture" }
  | { step: "prête"; stream: MediaStream }
  | { step: "refusée" }
  | { step: "absente" };

/**
 * Ouvre la caméra frontale. Distingue le refus de l'autorisation de l'absence
 * de matériel : les deux ne disent pas la même chose à l'utilisateur, et la
 * seconde n'a aucune action de rattrapage.
 */
export function useCamera(actif: boolean): CameraState {
  const [state, setState] = useState<CameraState>({ step: "ouverture" });
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!actif) return;

    let cancelled = false;

    const ouvrir = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CONTRAINTES);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setState({ step: "prête", stream });
      } catch (cause) {
        if (cancelled) return;
        const refus = cause instanceof DOMException && cause.name === "NotAllowedError";
        setState({ step: refus ? "refusée" : "absente" });
      }
    };

    void ouvrir();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [actif]);

  return state;
}
