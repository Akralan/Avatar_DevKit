export interface SubjectDescriptor {
  id: string;
  label: string;
  url: string;
  origin: "livré" | "personnel";
  /** Un sujet verrouillé ne peut être ni supprimé ni refait. */
  locked: boolean;
}

export const DEFAULT_SUBJECT_ID = "male_body";

// Le corps versionné avec le dépôt. Il garantit que tout le monde compare ses
// rendus sur le même modèle.
const SHIPPED: SubjectDescriptor[] = [
  {
    id: "male_body",
    label: "male_body",
    url: "/models/male_body.glb",
    origin: "livré",
    locked: true,
  },
];

/**
 * Corps présents chez certains seulement : déposés dans `public/models/` mais
 * **non versionnés** — un scan de corps identifiable n'a pas sa place dans un
 * dépôt public.
 *
 * Ils sont proposés si le fichier répond, ignorés sinon. Les lister en dur
 * donnerait à quiconque clone un sujet qui échoue au chargement ; les retirer
 * complètement priverait ceux qui les ont d'un corps réel pour éprouver leurs
 * rendus.
 */
const OPTIONAL: SubjectDescriptor[] = [
  {
    id: "rubens",
    label: "Corps réel",
    url: "/models/Rubens_MyTwin.glb",
    origin: "livré",
    locked: true,
  },
];

/**
 * Vite sert `index.html` en repli pour tout chemin inconnu : un fichier absent
 * répond donc 200, mais en `text/html`. C'est le type de contenu qui tranche,
 * pas le code de statut.
 */
async function estPresent(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return false;

    return !(response.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Asynchrone aussi par anticipation : le pipeline avatar y ajoutera
 * l'emplacement personnel, lu dans IndexedDB.
 */
export async function listSubjects(): Promise<SubjectDescriptor[]> {
  const presents = await Promise.all(
    OPTIONAL.map(async (subject) => ((await estPresent(subject.url)) ? subject : null)),
  );

  return [...SHIPPED, ...presents.filter((subject) => subject !== null)];
}
