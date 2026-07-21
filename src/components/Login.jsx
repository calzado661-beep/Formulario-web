import { useState } from "react";
import { LockKeyhole, LogIn, UserRound } from "lucide-react";
import { verifyUser } from "../lib/repository";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { Alert, Button } from "./ui";

function isInactive(user) {
  const value = String(user?.activo ?? true).trim().toLowerCase();
  return ["false", "0", "no"].includes(value);
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Completa usuario y contrasena.");
      return;
    }

    setLoading(true);
    try {
      const user = await verifyUser(email, password);
      if (!user) {
        setMessage("Credenciales invalidas o usuario no existe.");
        return;
      }
      if (isInactive(user)) {
        setMessage("Cuenta bloqueada. Tu usuario está inactivo y no puede ingresar. Contacta al administrador.");
        return;
      }
      onLogin(user);
    } catch (error) {
      setMessage(error?.message || "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-overlay" />
      <section className="login-card" aria-label="Inicio de sesion">
        <div className="brand-mark">F</div>
        <p className="eyebrow">Sistema por roles</p>
        <h1>Ingreso al sistema</h1>
        <p className="login-copy">Accede a operaciones, asistencia, tareas, incidencias y puntos desde un panel React.</p>

        {!isSupabaseConfigured ? (
          <Alert type="error">
            Faltan variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Revisa .env.example.
          </Alert>
        ) : null}

        {message ? <Alert type="error">{message}</Alert> : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="input-with-icon">
            <UserRound />
            <input
              type="text"
              placeholder="Usuario o correo"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="input-with-icon">
            <LockKeyhole />
            <input
              type="password"
              placeholder="Contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <Button type="submit" icon={LogIn} loading={loading} disabled={!isSupabaseConfigured}>
            Iniciar sesion
          </Button>
        </form>
      </section>
    </main>
  );
}
