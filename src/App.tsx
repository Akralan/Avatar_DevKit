import { NavLink, Route, Routes } from "react-router";
import { WorkshopPage } from "./studio/workshop-page";
import { DebugFacePage } from "./studio/debug-face-page";

export function App() {
  return (
    <div className="app">
      <nav className="app-nav">
        <span className="brand">MyTwin Avatar DevKit</span>
        {/* `end` : sans lui, le lien Rendus reste actif sur toutes les routes. */}
        <NavLink to="/" end>
          Rendus
        </NavLink>
        <NavLink to="/sujets">Sujets</NavLink>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<p>Galerie des rendus</p>} />
          <Route path="/render/:id" element={<WorkshopPage />} />
          <Route path="/sujets" element={<p>Sujets</p>} />
          <Route path="/debug/face" element={<DebugFacePage />} />
        </Routes>
      </main>
    </div>
  );
}
