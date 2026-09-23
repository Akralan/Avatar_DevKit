import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listRenderModules } from "../kit/registry";
import { getThumbnail } from "../kit/thumbnails";
import { scheduleWarmup } from "../kit/thumbnail-warmup";

/** Les quatre rendus livrés avec le repo portent cet auteur. */
const HOUSE_AUTHOR = "MyTwin";

export function GalleryPage() {
  const modules = listRenderModules();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => scheduleWarmup(), []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      modules.map(async (module) => [module.id, await getThumbnail(module.id)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setThumbnails(
        Object.fromEntries(entries.filter((entry): entry is [string, string] => !!entry[1])),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [modules]);

  return (
    <section className="gallery">
      <header className="gallery-head">
        <h1>Rendus</h1>
        <p>
          {modules.length} modules découverts dans <code>src/renders/</code>. Déposer un
          dossier suffit — il n'y a aucun index à tenir à jour.
        </p>
      </header>

      {/* Une seule grille : une création a le même statut qu'une référence. */}
      <ul className="gallery-grid">
        {modules.map((module) => (
          <li key={module.id}>
            <Link to={`/render/${module.id}`} className="tile">
              <span className="tile-image" style={{ background: module.background }}>
                {thumbnails[module.id] ? (
                  <img src={thumbnails[module.id]} alt="" />
                ) : (
                  <span className="tile-pending">vignette à venir</span>
                )}
                <span className="tile-flag">
                  {module.author === HOUSE_AUTHOR ? "référence" : module.author}
                </span>
              </span>
              <span className="tile-body">
                <strong>{module.title}</strong>
                <span>{module.description}</span>
              </span>
            </Link>
          </li>
        ))}

        <li>
          {/* Le seul endroit où la commande se découvre sans lire le README. */}
          <div className="tile tile-new">
            <span className="tile-plus">+</span>
            <code>npm run new:render</code>
            <span>Part d'un effet qui tourne déjà, prêt à être déformé</span>
          </div>
        </li>
      </ul>
    </section>
  );
}
