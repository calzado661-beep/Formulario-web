import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarCheck2,
  ClipboardList,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Store,
  UserCog,
  UsersRound
} from "lucide-react";
import { normalizeRole } from "../lib/scoring";
import { Button, IconButton } from "./ui";

const SIDEBAR_STATE_KEY = "formulario_sidebar_collapsed";

const adminItems = [
  { key: "Usuarios", icon: UsersRound },
  { key: "Tareas", label: "Tareas y puntajes", icon: ClipboardList },
  { key: "Asistencia", icon: CalendarCheck2 },
  { key: "Tiendas", icon: Store },
  { key: "Puntos", icon: BarChart3 }
];

export default function Layout({ user, adminSection, onAdminSectionChange, onLogout, children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STATE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, String(sidebarCollapsed));
    } catch {
      // La barra sigue funcionando aunque el navegador bloquee el almacenamiento.
    }
  }, [sidebarCollapsed]);

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
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-header-row">
            <div className="brand-row">
              <div className="brand-mark small">F</div>
              <div className="sidebar-copy">
                <strong>Formulario</strong>
                <span>Gestion operativa</span>
              </div>
            </div>
            <IconButton
              label={sidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
              icon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
              aria-expanded={!sidebarCollapsed}
              aria-controls="primary-sidebar-navigation"
              onClick={() => setSidebarCollapsed((current) => !current)}
            />
          </div>
          <div className="profile-box">
            <ShieldCheck />
            <div className="sidebar-copy">
              <span>{user?.nombre || user?.email || "Usuario"}</span>
              <small>{role || "rol no reconocido"}</small>
            </div>
          </div>
          {role === "administrador" ? (
            <nav id="primary-sidebar-navigation" className="side-nav" aria-label="Gestion administrativa">
              {adminItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={adminSection === key ? "active" : ""}
                  onClick={() => onAdminSectionChange(key)}
                  title={sidebarCollapsed ? label || key : undefined}
                >
                  <Icon />
                  <span className="sidebar-copy">{label || key}</span>
                </button>
              ))}
            </nav>
          ) : (
            <div className="sidebar-note">
              <Menu />
              <span className="sidebar-copy">
                {role === "jefe de grupo"
                  ? "Registra trabajos por trabajador y deja identificado al encargado en cada registro."
                  : "Registra lo realizado y revisa tu historial sin perder el contexto del dia."}
              </span>
            </div>
          )}
        </div>
        <Button className="sidebar-logout" variant="secondary" icon={LogOut} onClick={onLogout} title={sidebarCollapsed ? "Cerrar sesion" : undefined}>
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
