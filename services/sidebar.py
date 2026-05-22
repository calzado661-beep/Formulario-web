import streamlit as st

def render_sidebar(user: dict, logout_func):
    """
    Renderiza la barra lateral con la información del usuario y acciones globales.
    """
    role = str(user.get("rol", "")).lower()

    if role == "administrador":
        render_admin_sidebar(user, logout_func)
    elif role == "trabajador":
        render_worker_sidebar(user, logout_func)
    else:
        with st.sidebar:
            st.error("Rol no identificado")
            _render_logout_section(logout_func)

def render_admin_sidebar(user: dict, logout_func):
    """
    Sidebar personalizado para el perfil de Administrador.
    """
    with st.sidebar:
        st.title("🛡️ Panel Administrativo")
        _render_user_profile(user)
        st.divider()
        st.markdown("### 📊 Gestión de Operaciones")
        st.caption("Usa el menú inferior para navegar entre las secciones de control.")
        _render_logout_section(logout_func)

def render_worker_sidebar(user: dict, logout_func):
    """
    Sidebar personalizado para el perfil de Trabajador.
    """
    with st.sidebar:
        st.title("👷 Panel de Trabajo")
        _render_user_profile(user)
        st.divider()
        st.info("💡 **Consejo:** No olvides registrar todas tus actividades para acumular puntos.")
        _render_logout_section(logout_func)

def _render_user_profile(user: dict):
    """Muestra la información del usuario logueado de forma común."""
    st.markdown("### 👤 Mi Perfil")
    st.markdown(f"**Nombre:** {user.get('nombre')}")
    st.caption(f"Acceso: {str(user.get('rol', '')).capitalize()}")

def _render_logout_section(logout_func):
    """Botón de cierre de sesión y pie de página del sidebar."""
    st.divider()
    st.button("Cerrar sesión", on_click=logout_func, use_container_width=True, type="primary")
    st.sidebar.caption("v1.2 - Sistema de Gestión")