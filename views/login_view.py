import streamlit as st
from supabase import Client

from services.repositories import verify_user
from services.styles import add_login_video_background


def render_login(supabase: Client) -> None:
    add_login_video_background("fondovideo.mp4")

    st.markdown("""
        <style>
            [data-testid="stAppViewBlockContainer"] {
                max-width: 420px !important;
                margin: 0 auto;
                padding-top: 0.75rem;
            }
            [data-testid="stForm"] {
                background: rgba(255, 255, 255, 0.18);
                border-radius: 16px;
                padding: 1rem;
                box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
            .login-card {
                max-width: 420px;
                margin: 0 auto;
            }
            .login-card h1 {
                text-align: center;
                margin-bottom: 0.15rem;
            }
            .login-card p {
                text-align: center;
                margin-bottom: 0.6rem;
            }
            .stTextInput > div > div > input,
            .stButton > button {
                border-radius: 10px;
            }
        </style>
    """, unsafe_allow_html=True)

    left, center, right = st.columns([1, 4, 1])
    submitted = False
    with center:
        st.markdown('<div class="login-card">', unsafe_allow_html=True)
        st.title("Ingreso al sistema")
        st.caption("Roles soportados: administrador y operante")

        with st.form("login_form", clear_on_submit=False):
            email = st.text_input("Correo", placeholder="usuario@empresa.com").strip().lower()
            password = st.text_input("Contraseña", type="password")
            submitted = st.form_submit_button("Iniciar sesión")

        st.markdown("</div>", unsafe_allow_html=True)

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
