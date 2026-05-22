import pandas as pd
import streamlit as st
from supabase import Client

from services.repositories import (
    create_task,
    create_user,
    delete_user,
    list_activities_catalog,
    list_all_activity_logs,
    list_tasks,
    select_users,
    update_user,
)


def render_admin(supabase: Client) -> None:
    menu = st.sidebar.radio("Panel", ["Usuarios", "Tareas", "Realizadas / Puntos"])
    if menu == "Usuarios":
        _users_crud(supabase)
    elif menu == "Tareas":
        _tasks_panel(supabase)
    else:
        _worker_points_panel(supabase)


def _users_crud(supabase: Client) -> None:
    st.subheader("Gestión de usuarios")
    users = select_users(supabase)
    st.dataframe(pd.DataFrame(users), width="stretch")

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
            create_user(supabase, payload, password)
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
                update_user(
                    supabase,
                    selected["id"],
                    changes,
                    new_password.strip() if new_password.strip() else None,
                )
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
                delete_user(supabase, target["id"])
                st.success("Usuario eliminado.")
                st.rerun()


def _tasks_panel(supabase: Client) -> None:
    st.subheader("Gestión de tareas")
    tasks = list_tasks(supabase)
    st.dataframe(pd.DataFrame(tasks), width="stretch")

    with st.expander("Crear tarea"):
        with st.form("create_task"):
            titulo = st.text_input("Nombre de tarea")
            descripcion = st.text_area("Descripción")
            estado = st.text_input("Estado", value="pendiente")
            asignado_a = st.text_input("Asignado a (id usuario)")
            crear = st.form_submit_button("Crear tarea")

        if crear:
            payload = {
                "nombre": titulo.strip(),
                "descripcion": descripcion.strip(),
                "estado": estado.strip(),
            }
            if asignado_a.strip().isdigit():
                payload["asignado_a"] = int(asignado_a.strip())
            create_task(supabase, payload)
            st.success("Tarea creada.")
            st.rerun()


def _worker_points_panel(supabase: Client) -> None:
    st.subheader("Tareas realizadas y puntos por trabajador")
    logs = list_all_activity_logs(supabase)

    if not logs:
        st.info("No hay registros todavía.")
        return

    users = select_users(supabase)
    user_name_by_id = {u.get("id"): (u.get("nombre") or u.get("email")) for u in users}
    user_email_by_id = {u.get("id"): u.get("email") for u in users}
    tasks = list_tasks(supabase)
    task_name_by_id = {t.get("id"): (t.get("nombre") or t.get("titulo") or f"Tarea {t.get('id')}") for t in tasks}
    activities = list_activities_catalog(supabase)
    activity_name_by_id = {a.get("id"): (a.get("actividad") or f"Actividad {a.get('id')}") for a in activities}

    rows = []
    for r in logs:
        trabajador_id = r.get("trabajador_id")
        tarea_nombre = task_name_by_id.get(r.get("tarea_id"))
        actividad_nombre = activity_name_by_id.get(r.get("actividad_id")) or tarea_nombre
        rows.append(
            {
                "Fecha": r.get("fecha_registro"),
                "Trabajador": user_name_by_id.get(trabajador_id),
                "Email": user_email_by_id.get(trabajador_id),
                "Tarea": tarea_nombre,
                "Actividad": actividad_nombre,
                "Cantidad": r.get("cantidad"),
                "Tiempo (min)": r.get("tiempo_minutos"),
                "Cumplimiento": r.get("cumplimiento"),
                "Puntos": float(r.get("puntos_obtenidos") or 0),
            }
        )

    df = pd.DataFrame(rows)
    resumen = (
        df.groupby(["Trabajador", "Email"], dropna=False, as_index=False)["Puntos"]
        .sum()
        .sort_values("Puntos", ascending=False)
    )

    st.markdown("### Acumulado por trabajador")
    st.dataframe(resumen, width="stretch")
    st.metric("Puntos totales registrados", f"{resumen['Puntos'].sum():.0f}")

    st.markdown("### Detalle")
    st.dataframe(df, width="stretch")

