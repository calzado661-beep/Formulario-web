import {
  BarChart3,
  CalendarCheck2,
  ClipboardList,
  LogOut,
  Menu,
  ShieldCheck,
  Store,
  UserCog,
  UsersRound
} from "lucide-react";
import { normalizeRole } from "../lib/scoring";
import { Button } from "./ui";

const adminItems = [
  { key: "Usuarios", icon: UsersRound },
  { key: "Tareas", label: "Tareas y puntajes", icon: ClipboardList },
  { key: "Asistencia", icon: CalendarCheck2 },
  { key: "Tiendas", icon: Store },
  { key: "Puntos", icon: BarChart3 }
];

export default function Layout({ user, adminSection, onAdminSectionChange, onLogout, children }) {
  const role = normalizeRole(user?.rol);
  const title =
    role === "administrador"
      ? "Panel Administrativo"
      : role === "jefe de equipo"
        ? "Panel de Jefe de Equipo"
        : role === "jefe de grupo"
          ? "Panel de Jefe de Grupo"
          : "Panel de Trabajo";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark small">F</div>
            <div>
              <strong>Formulario</strong>
              <span>Gestion operativa</span>
            </div>
          </div>
          <div className="profile-box">
            <ShieldCheck />
            <div>
              <span>{user?.nombre || user?.email || "Usuario"}</span>
              <small>{role || "rol no reconocido"}</small>
            </div>
          </div>
          {role === "administrador" ? (
            <nav className="side-nav" aria-label="Gestion administrativa">
              {adminItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={adminSection === key ? "active" : ""}
                  onClick={() => onAdminSectionChange(key)}
                >
                  <Icon />
                  <span>{label || key}</span>
                </button>
              ))}
            </nav>
          ) : (
            <div className="sidebar-note">
              <Menu />
              <span>
                {role === "jefe de grupo"
                  ? "Registra trabajos por trabajador y deja identificado al encargado en cada registro."
                  : "Registra lo realizado y revisa tu historial sin perder el contexto del dia."}
              </span>
            </div>
          )}
        </div>
        <Button variant="secondary" icon={LogOut} onClick={onLogout}>
          Cerrar sesion
        </Button>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{title}</p>
            <h1>Sistema de Formularios</h1>
          </div>
          <div className="header-chip">{role}</div>
        </header>
        {children}
      </main>
    </div>
  );
}
