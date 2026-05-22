import hashlib
import os
from typing import Any

import pandas as pd
import streamlit as st
from dotenv import load_dotenv
from supabase import Client, create_client

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
    # Usamos la llave secreta para operaciones administrativas (CRUD usuarios).
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip() or os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
    if not key:
        st.error("Falta SUPABASE_SECRET_KEY o SUPABASE_PUBLISHABLE_KEY en .env")
        st.stop()
    return create_client(url, key)


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def select_users(supabase: Client) -> list[dict[str, Any]]:
    columns = "id,nombre,email,rol,activo,created_at"
    try:
        return supabase.table("usuarios").select(columns).order("id", desc=False).execute().data or []
    except Exception:
        return supabase.table("usuarios").select("*").order("id", desc=False).execute().data or []


def verify_user(supabase: Client, email: str, password: str) -> dict[str, Any] | None:
    hashed = hash_password(password)

    # Intento 1: columna password_hash
    try:
        r = (
            supabase.table("usuarios")
            .select("*")
            .eq("email", email)
            .eq("password_hash", hashed)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception:
        pass

    # Intento 2: columna password
    try:
        r = (
            supabase.table("usuarios")
            .select("*")
            .eq("email", email)
            .eq("password", hashed)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception:
        pass

    return None


def get_tasks(supabase: Client, user: dict[str, Any]) -> list[dict[str, Any]]:
    role = (user.get("rol") or "").lower()
    query = supabase.table("tarea").select("*")

    if role == "trabajador":
        user_id = user.get("id")
        email = user.get("email")
        try:
            return query.or_(f"asignado_a.eq.{user_id},email_trabajador.eq.{email}").execute().data or []
        except Exception:
            return query.execute().data or []

    return query.execute().data or []


def logout() -> None:
    st.session_state.pop("usuario", None)
    st.rerun()


def login_view(supabase: Client) -> None:
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


def admin_users_crud(supabase: Client) -> None:
    st.subheader("Gestión de usuarios")

    users = select_users(supabase)
    st.dataframe(pd.DataFrame(users), use_container_width=True)

    tab1, tab2, tab3 = st.tabs(["Crear", "Editar", "Eliminar"])

    with tab1:
        with st.form("create_user"):
            nombre = st.text_input("Nombre")
            email = st.text_input("Correo")
            password = st.text_input("Contraseña", type="password")
            rol = st.selectbox("Rol", ["trabajador", "administrador"])
            activo = st.checkbox("Activo", value=True)
            ok = st.form_submit_button("Crear usuario")

        if ok:
            payload = {
                "nombre": nombre.strip(),
                "email": email.strip().lower(),
                "rol": rol,
                "activo": activo,
            }
            pwd_hash = hash_password(password)
            try:
                payload["password_hash"] = pwd_hash
                supabase.table("usuarios").insert(payload).execute()
            except Exception:
                payload.pop("password_hash", None)
                payload["password"] = pwd_hash
                supabase.table("usuarios").insert(payload).execute()
            st.success("Usuario creado.")
            st.rerun()

    with tab2:
        if not users:
            st.info("No hay usuarios para editar.")
        else:
            user_map = {f"{u.get('id')} - {u.get('email')}": u for u in users}
            sel = st.selectbox("Usuario", list(user_map.keys()), key="edit_user_sel")
            selected = user_map[sel]
            with st.form("edit_user"):
                new_nombre = st.text_input("Nombre", value=str(selected.get("nombre", "")))
                new_email = st.text_input("Correo", value=str(selected.get("email", "")))
                new_rol = st.selectbox(
                    "Rol",
                    ["trabajador", "administrador"],
                    index=0 if str(selected.get("rol", "trabajador")).lower() == "trabajador" else 1,
                )
                new_activo = st.checkbox("Activo", value=bool(selected.get("activo", True)))
                new_password = st.text_input("Nueva contraseña (opcional)", type="password")
                save = st.form_submit_button("Guardar cambios")

            if save:
                changes = {
                    "nombre": new_nombre.strip(),
                    "email": new_email.strip().lower(),
                    "rol": new_rol,
                    "activo": new_activo,
                }
                if new_password.strip():
                    pwd_hash = hash_password(new_password.strip())
                    try:
                        changes["password_hash"] = pwd_hash
                        supabase.table("usuarios").update(changes).eq("id", selected["id"]).execute()
                    except Exception:
                        changes.pop("password_hash", None)
                        changes["password"] = pwd_hash
                        supabase.table("usuarios").update(changes).eq("id", selected["id"]).execute()
                else:
                    supabase.table("usuarios").update(changes).eq("id", selected["id"]).execute()

                st.success("Usuario actualizado.")
                st.rerun()

    with tab3:
        if not users:
            st.info("No hay usuarios para eliminar.")
        else:
            user_map = {f"{u.get('id')} - {u.get('email')}": u for u in users}
            sel = st.selectbox("Usuario a eliminar", list(user_map.keys()), key="del_user_sel")
            target = user_map[sel]
            if st.button("Eliminar usuario", type="primary"):
                supabase.table("usuarios").delete().eq("id", target["id"]).execute()
                st.success("Usuario eliminado.")
                st.rerun()


def admin_tasks_panel(supabase: Client) -> None:
    st.subheader("Gestión de tareas")

    tasks = supabase.table("tarea").select("*").order("id", desc=False).execute().data or []
    st.dataframe(pd.DataFrame(tasks), use_container_width=True)

    with st.expander("Crear tarea"):
        with st.form("create_task"):
            titulo = st.text_input("Título")
            descripcion = st.text_area("Descripción")
            estado = st.text_input("Estado", value="pendiente")
            asignado_a = st.text_input("Asignado a (id usuario)")
            crear = st.form_submit_button("Crear tarea")

        if crear:
            payload = {
                "titulo": titulo.strip(),
                "descripcion": descripcion.strip(),
                "estado": estado.strip(),
            }
            if asignado_a.strip().isdigit():
                payload["asignado_a"] = int(asignado_a.strip())

            supabase.table("tarea").insert(payload).execute()
            st.success("Tarea creada.")
            st.rerun()


def worker_panel(supabase: Client, user: dict[str, Any]) -> None:
    st.subheader("Tus tareas")
    tasks = get_tasks(supabase, user)
    if not tasks:
        st.info("No hay tareas asignadas por el momento.")
        return
    st.dataframe(pd.DataFrame(tasks), use_container_width=True)


def app() -> None:
    supabase = get_supabase()

    user = st.session_state.get("usuario")
    if not user:
        login_view(supabase)
        return

    role = str(user.get("rol", "")).lower()

    col1, col2 = st.columns([0.8, 0.2])
    with col1:
        st.title("Sistema de Formularios")
        st.caption(f"Sesión activa: {user.get('nombre', user.get('email'))} | Rol: {role}")
    with col2:
        st.button("Cerrar sesión", on_click=logout, use_container_width=True)

    if role == "administrador":
        menu = st.sidebar.radio("Panel", ["Usuarios", "Tareas"])
        if menu == "Usuarios":
            admin_users_crud(supabase)
        else:
            admin_tasks_panel(supabase)
    elif role == "trabajador":
        worker_panel(supabase, user)
    else:
        st.error("Rol no reconocido. Usa 'administrador' o 'trabajador'.")


if __name__ == "__main__":
    app()
