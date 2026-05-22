import os
import streamlit as st
from dotenv import load_dotenv
from supabase import create_client, Client

from views.login_view import render_login
from views.admin_view import render_admin
from views.worker_view import render_worker
from services.styles import apply_styles
from services.sidebar import render_sidebar

load_dotenv()

st.set_page_config(page_title="Formulario por Roles", page_icon="🧾", layout="wide")

def _get_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        st.error(f"Falta la variable de entorno: {name}")
        st.stop()
    return value

def get_supabase() -> Client:
    url = _get_env("SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip() or os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
    if not key:
        st.error("Falta SUPABASE_SECRET_KEY o SUPABASE_PUBLISHABLE_KEY en .env")
        st.stop()
    return create_client(url, key)

def logout() -> None:
    st.session_state.clear()

def app() -> None:
    supabase = get_supabase()
    apply_styles() # Aplicamos los estilos globales

    user = st.session_state.get("usuario")

    if not user:
        render_login(supabase)
        return

    # Renderizamos la barra lateral con info de admin/trabajador y logout
    render_sidebar(user, logout)
    
    role = str(user.get("rol", "")).lower()
    st.title("Sistema de Formularios")
    st.caption(f"Bienvenido al panel de {role}")

    if role == "administrador":
        render_admin(supabase)
    elif role == "trabajador":
        render_worker(supabase, user)
    else:
        st.error("Rol no reconocido. Usa 'administrador' o 'trabajador'.")

if __name__ == "__main__":
    app()
