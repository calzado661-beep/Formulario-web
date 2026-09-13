import { useEffect, useState } from "react";
import { LockKeyhole, LogIn, UserRound } from "lucide-react";
import { verifyUser } from "../lib/repository";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { Alert, Button } from "./ui";
import loginVideoUrl from "../../genera_un_video_de_fondo_para.mp4";

function isInactive(user) {
  const value = String(user?.activo ?? true).trim().toLowerCase();
  return ["false", "0", "no"].includes(value);
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loadBackgroundVideo, setLoadBackgroundVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const savesData = navigator.connection?.saveData === true;
    if (prefersReducedMotion || savesData) return undefined;

    let idleId;
    const timerId = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => setLoadBackgroundVideo(true), { timeout: 2500 });
      } else {
        setLoadBackgroundVideo(true);
      }
    }, 600);

    return () => {
      window.clearTimeout(timerId);
      if (idleId !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    };
  }, []);

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
      {loadBackgroundVideo ? (
        <video
          className={`login-background-video${videoReady ? " is-ready" : ""}`}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={() => setVideoReady(true)}
        >
          <source src={loginVideoUrl} type="video/mp4" />
        </video>
      ) : null}
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
