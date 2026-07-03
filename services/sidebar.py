import streamlit as st


def render_sidebar(user: dict, logout_func):
    """
    Renderiza la barra lateral con la informacion del usuario y acciones globales.
    """
    role = str(user.get("rol", "")).lower()
    if role == "trabajador":
        role = "operante"

    if role == "administrador":
        render_admin_sidebar(user, logout_func)
    elif role == "operante":
        render_worker_sidebar(user, logout_func)
    elif role == "jefe de equipo":
        render_team_leader_sidebar(user, logout_func)
    else:
        with st.sidebar:
            st.error("Rol no identificado")
            _render_logout_section(logout_func)


def render_admin_sidebar(user: dict, logout_func):
    """
    Sidebar personalizado para el perfil de Administrador.
    """
    with st.sidebar:
        st.title("Panel Administrativo")
        _render_user_profile(user)
        st.divider()
        st.markdown("### Gestion de Operaciones")

        if "admin_menu" not in st.session_state:
            st.session_state.admin_menu = "Usuarios"

        if st.button(
            "Usuarios",
            use_container_width=True,
            type="primary" if st.session_state.admin_menu == "Usuarios" else "secondary",
        ):
            st.session_state.admin_menu = "Usuarios"
            st.rerun()

        if st.button(
            "Tareas",
            use_container_width=True,
            type="primary" if st.session_state.admin_menu == "Tareas" else "secondary",
        ):
            st.session_state.admin_menu = "Tareas"
            st.rerun()

        if st.button(
            "Asistencia",
            use_container_width=True,
            type="primary" if st.session_state.admin_menu == "Asistencia" else "secondary",
        ):
            st.session_state.admin_menu = "Asistencia"
            st.rerun()

        if st.button(
            "Tiendas",
            use_container_width=True,
            type="primary" if st.session_state.admin_menu == "Tiendas" else "secondary",
        ):
            st.session_state.admin_menu = "Tiendas"
            st.rerun()

        _render_logout_section(logout_func)


def render_worker_sidebar(user: dict, logout_func):
    """
    Sidebar personalizado para el perfil de Trabajador.
    """
    with st.sidebar:
        st.title("Panel de Trabajo")
        _render_user_profile(user)
        st.divider()
        st.info("Consejo: No olvides registrar todas tus actividades para acumular puntos.")
        _render_logout_section(logout_func)


def render_team_leader_sidebar(user: dict, logout_func):
    """
    Sidebar personalizado para el perfil de Jefe de Equipo.
    """
    with st.sidebar:
        st.title("Panel de Jefe de Equipo")
        _render_user_profile(user)
        _render_logout_section(logout_func)


def _render_user_profile(user: dict):
    """Muestra la informacion del usuario logueado de forma comun."""
    st.markdown("### Mi Perfil")
    st.markdown(f"**Nombre:** {user.get('nombre')}")
    role = str(user.get("rol", "")).lower()
    if role == "trabajador":
        role = "operante"
    st.caption(f"Acceso: {role.capitalize()}")


def _render_logout_section(logout_func):
    """Boton de cierre de sesion y pie de pagina del sidebar."""
    st.divider()
    st.button("Cerrar sesion", on_click=logout_func, use_container_width=True, type="primary")
    st.sidebar.caption("v1.2 - Sistema de Gestion")
