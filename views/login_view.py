import streamlit as st
from supabase import Client

from services.repositories import verify_user


def render_login(supabase: Client) -> None:
    st.title("Ingreso al sistema")
    st.caption("Roles soportados: administrador y trabajador")

    with st.form("login_form", clear_on_submit=False):
        email = st.text_input("Correo", placeholder="usuario@empresa.com").strip().lower()
        password = st.text_input("Contraseña", type="password")
        submitted = st.form_submit_button("Iniciar sesión")

    if submitted:
        if not email or not password:
            st.warning("Completa correo y contraseña.")
            return

        user = verify_user(supabase, email, password)
        if not user:
            st.error("Credenciales inválidas o usuario no existe.")
            return

        if str(user.get("activo", True)).lower() in {"false", "0", "no"}:
            st.error("Usuario inactivo. Contacta al administrador.")
            return

        st.session_state["usuario"] = user
        st.success("Sesión iniciada correctamente.")
        st.rerun()
