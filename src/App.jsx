import { useEffect, useState } from "react";
import AdminDashboard from "./components/AdminDashboard";
import GroupLeaderDashboard from "./components/GroupLeaderDashboard";
import Layout from "./components/Layout";
import Login from "./components/Login";
import TeamLeaderDashboard from "./components/TeamLeaderDashboard";
import WorkerDashboard from "./components/WorkerDashboard";
import { Alert } from "./components/ui";
import { clearApiSession } from "./lib/repository";
import { normalizeRole } from "./lib/scoring";

const SESSION_KEY = "formulario_usuario";

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState(readStoredUser);
  const [adminSection, setAdminSection] = useState("Usuarios");

  useEffect(() => {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  }, [user]);

  if (!user) return <Login onLogin={setUser} />;

  const role = normalizeRole(user.rol);

  return (
    <Layout
      user={user}
      adminSection={adminSection}
      onAdminSectionChange={setAdminSection}
      onLogout={() => {
        clearApiSession();
        setUser(null);
      }}
    >
      {role === "administrador" ? <AdminDashboard section={adminSection} /> : null}
      {role === "operante" ? <WorkerDashboard user={user} /> : null}
      {role === "jefe de equipo" ? <TeamLeaderDashboard user={user} /> : null}
      {role === "jefe de grupo" ? <GroupLeaderDashboard user={user} /> : null}
      {!["administrador", "operante", "jefe de equipo", "jefe de grupo"].includes(role) ? (
        <Alert type="error">Rol no reconocido. Usa administrador, operante, jefe de equipo o jefe de grupo.</Alert>
      ) : null}
    </Layout>
  );
}
