import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { getRenderModule } from "../kit/registry";
import { loadSubject } from "../kit/load-subject";
import { RenderStage, type RenderStageHandle } from "../kit/stage";
import { DEFAULT_SUBJECT_ID, listSubjects, type SubjectDescriptor } from "../kit/subjects";
import { decodeConfig, encodeConfig } from "../kit/url-config";
import { getThumbnail, storeThumbnail } from "../kit/thumbnails";
import { WorkshopOverlay } from "./workshop-overlay";
import type { Subject } from "../kit/types";

type Loaded =
  | { state: "chargement" }
  | { state: "prêt"; subject: Subject }
  | { state: "échec"; message: string };

export function WorkshopPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subjects, setSubjects] = useState<SubjectDescriptor[]>([]);
  const [loaded, setLoaded] = useState<Loaded>({ state: "chargement" });
  const stageRef = useRef<RenderStageHandle>(null);

  const module = id ? getRenderModule(id) : undefined;
  const subjectId = searchParams.get("s") ?? DEFAULT_SUBJECT_ID;

  const config = useMemo(
    () =>
      module
        ? decodeConfig(searchParams.get("c"), module.defaultConfig, module.controls)
        : ({} as Record<string, unknown>),
    [module, searchParams],
  );

  useEffect(() => {
    void listSubjects().then(setSubjects);
  }, []);

  // Une vignette se prend une fois le rendu installé, pas à la première frame :
  // un rendu chorégraphié serait capturé sur son écran presque vide.
  useEffect(() => {
    if (!module || loaded.state !== "prêt") return;

    const timer = setTimeout(() => {
      void getThumbnail(module.id).then((existante) => {
        if (existante) return;
        const vignette = stageRef.current?.snapshot();
        if (vignette) void storeThumbnail(module.id, vignette);
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [module, loaded.state]);

  useEffect(() => {
    if (!subjects.length) return;

    const descriptor = subjects.find((candidate) => candidate.id === subjectId) ?? subjects[0];
    let cancelled = false;
    setLoaded({ state: "chargement" });

    void loadSubject(descriptor)
      .then((subject) => {
        if (!cancelled) setLoaded({ state: "prêt", subject });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoaded({
          state: "échec",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [subjects, subjectId]);

  if (!module) {
    return (
      <div className="workshop-missing" role="alert">
        <p>Aucun rendu ne porte l'identifiant « {id} ».</p>
        <Link to="/">Retour à la galerie</Link>
      </div>
    );
  }

  // L'URL porte le réglage ET le sujet : l'adresse courante suffit à reproduire
  // exactement ce qu'on a sous les yeux.
  const updateParams = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="workshop" style={{ background: module.background }}>
      {loaded.state === "prêt" && (
        <RenderStage
          ref={stageRef}
          module={module}
          subject={loaded.subject}
          config={config}
          className="workshop-canvas"
        />
      )}
      {loaded.state === "chargement" && <p className="workshop-loading">Chargement du sujet…</p>}
      {loaded.state === "échec" && (
        <p className="stage-error" role="alert">
          {loaded.message}
        </p>
      )}

      <WorkshopOverlay
        module={module}
        subjects={subjects}
        subjectId={subjectId}
        config={config}
        onChange={(next) => updateParams({ c: encodeConfig(next) })}
        onReset={() => updateParams({ c: null })}
        onSubjectChange={(next) => updateParams({ s: next })}
        onAction={(actionId) => stageRef.current?.runAction(actionId)}
      />
    </div>
  );
}
