import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Bug,
  CalendarCheck2,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Store,
  Truck,
  UserCog,
  UsersRound
} from "lucide-react";
import { normalizeRole } from "../lib/scoring";
import { Button, IconButton } from "./ui";

const SIDEBAR_STATE_KEY = "formulario_sidebar_collapsed";

const adminItems = [
  { key: "Dashboard", label: "Dashboard calzado", icon: LayoutDashboard },
  { key: "Usuarios", icon: UsersRound },
  { key: "Capacitaciones", icon: GraduationCap },
  { key: "Tareas", label: "Tareas y puntajes", icon: ClipboardList },
  { key: "Asistencia", icon: CalendarCheck2 },
  { key: "Notificaciones", icon: BellRing },
  { key: "Tiendas", label: "Tiendas y Marcas", icon: Store },
  { key: "Lotes", icon: Package },
  { key: "Guias", icon: Truck },
  { key: "Errores", icon: Bug },
  { key: "Amonestaciones", icon: AlertTriangle },
  { key: "Documentos", icon: FileSpreadsheet }
];

export default function Layout({ user, adminSection, onAdminSectionChange, onLogout, children }) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches
  ));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const handleChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setMobileSidebarOpen(false);
    };
    setIsMobile(media.matches);
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isMobile || !mobileSidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobile, mobileSidebarOpen]);

  const role = normalizeRole(user?.rol);
  const isDashboardView = role === "administrador" && adminSection === "Dashboard";
  const title =
    role === "administrador"
      ? "Panel Administrativo"
      : role === "lider de equipo"
        ? "Panel de Líder de Equipo"
        : role === "jefe de grupo"
          ? "Panel de Jefe de Grupo"
          : role === "otros"
            ? "Perfil de Usuario"
          : "Panel de Trabajo";

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${mobileSidebarOpen ? " mobile-sidebar-open" : ""}${isDashboardView ? " dashboard-view" : ""}`}>
      <aside className={`sidebar${!isMobile && sidebarCollapsed ? " collapsed" : ""}`} aria-label="Barra lateral">
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
              label={isMobile ? "Cerrar menu" : sidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
              icon={isMobile ? PanelLeftClose : sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
              aria-expanded={isMobile ? mobileSidebarOpen : !sidebarCollapsed}
              aria-controls="primary-sidebar-navigation"
              onClick={() => isMobile ? setMobileSidebarOpen(false) : setSidebarCollapsed((current) => !current)}
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
                  onClick={() => {
                    onAdminSectionChange(key);
                    if (isMobile) setMobileSidebarOpen(false);
                  }}
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
                  : role === "otros"
                    ? "Usuario registrado como personal de otras funciones."
                  : "Registra lo realizado y revisa tu historial sin perder el contexto del dia."}
              </span>
            </div>
          )}
        </div>
        <Button className="sidebar-logout" variant="secondary" icon={LogOut} onClick={onLogout} title={sidebarCollapsed ? "Cerrar sesion" : undefined}>
          Cerrar sesion
        </Button>
      </aside>

      {isMobile && mobileSidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar menu lateral"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <main className={`workspace${isDashboardView ? " dashboard-workspace" : ""}`}>
        {isDashboardView && isMobile ? (
          <IconButton
            className="dashboard-mobile-menu"
            label="Abrir menu lateral"
            icon={Menu}
            aria-expanded={mobileSidebarOpen}
            aria-controls="primary-sidebar-navigation"
            onClick={() => setMobileSidebarOpen(true)}
          />
        ) : null}
        {!isDashboardView ? <header className="workspace-header">
          <div className="workspace-title-row">
            <IconButton
              className="mobile-sidebar-trigger"
              label="Abrir menu lateral"
              icon={Menu}
              aria-expanded={mobileSidebarOpen}
              aria-controls="primary-sidebar-navigation"
              onClick={() => setMobileSidebarOpen(true)}
            />
            <div>
              <p className="eyebrow">{title}</p>
              <h1>Sistema de Formularios</h1>
            </div>
          </div>
          <div className="header-chip">{role}</div>
        </header> : null}
        {children}
      </main>
    </div>
  );
}
