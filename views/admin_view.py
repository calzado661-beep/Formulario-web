from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st
from supabase import Client
from services.scoring import get_activity_capture_mode

from services.repositories import (
    create_task,
    create_user,
    delete_user,
    list_all_activity_logs,
    list_task_score_ranges,
    list_tasks,
    select_users,
    set_task_score_ranges,
    update_task,
    update_user,
)


def render_admin(supabase: Client) -> None:
    # Renderizar el contenido basado en la selección actual
    menu = st.session_state.get("admin_menu", "Usuarios")

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


def _render_quantity_ranges_form(prefix: str, existing_ranges: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    st.markdown("### Rangos de puntaje por cantidad (1 a 10)")
    existing_ranges = existing_ranges or []

    # Forzamos exactamente 10 rangos, uno por cada punto de 1 a 10.
    ranges: list[dict[str, Any]] = []
    for idx in range(10):
        existing = existing_ranges[idx] if idx < len(existing_ranges) else {}
        col_desde, col_hasta, col_puntos = st.columns([3, 3, 1])
        punto_val = idx + 1
        with col_desde:
            cantidad_desde = st.number_input(
                f"Punto {punto_val} - Desde",
                min_value=0.0,
                step=1.0,
                value=float(existing.get("cantidad_desde") or 0.0),
                key=f"{prefix}_desde_{idx}",
            )
        with col_hasta:
            cantidad_hasta_str = st.text_input(
                f"Punto {punto_val} - Hasta",
                value=str(existing.get("cantidad_hasta") or ""),
                placeholder="Dejar vacío para sin límite",
                key=f"{prefix}_hasta_{idx}",
            )
            cantidad_hasta = float(cantidad_hasta_str) if cantidad_hasta_str.strip() else None
        with col_puntos:
            # Mostrar el punto (1..10) como campo deshabilitado para claridad
            st.number_input(
                f"Pts",
                min_value=1,
                max_value=10,
                step=1,
                value=punto_val,
                key=f"{prefix}_puntos_{idx}",
                disabled=True,
            )

        ranges.append(
            {
                "cantidad_desde": cantidad_desde,
                "cantidad_hasta": cantidad_hasta,
                "puntos": punto_val,
            }
        )

    return ranges


def _tasks_panel(supabase: Client) -> None:
    st.subheader("Gestión de tareas")
    tasks = list_tasks(supabase)
    st.dataframe(pd.DataFrame(tasks), width="stretch")

    tab1, tab2 = st.tabs(["Crear tarea", "Editar tarea"])

    with tab1:
        with st.form("create_task"):
            titulo = st.text_input("Nombre de tarea")
            descripcion = st.text_area("Descripción")
            estado = st.text_input("Estado", value="pendiente")
            asignado_a = st.text_input("Asignado a (id usuario)")
            tipo_medicion = st.selectbox(
                "Tipo de medición",
                ["cantidad", "cumplimiento", "tiempo", "turno"],
                index=0,
            )
            unidad_base = st.text_input(
                "Unidad base (ej. pares, cajas, bultos)", placeholder="Opcional"
            )
            puntaje_fijo = None
            rangos = []

            if tipo_medicion == "cantidad":
                rangos = _render_quantity_ranges_form("create")
            elif tipo_medicion == "cumplimiento":
                puntaje_fijo = st.number_input(
                    "Puntaje fijo",
                    min_value=1,
                    max_value=10,
                    step=1,
                    value=1,
                    key="create_puntaje_fijo",
                )

            crear = st.form_submit_button("Crear tarea")

        if crear:
            if tipo_medicion == "cantidad":
                invalid_range = any(
                    r["cantidad_hasta"] is not None and r["cantidad_hasta"] < r["cantidad_desde"]
                    for r in rangos
                )
                if invalid_range:
                    st.error("Cada rango debe tener 'hasta' mayor o igual a 'desde'.")
                else:
                    payload = {
                        "titulo": titulo.strip(),
                        "descripcion": descripcion.strip(),
                        "estado": estado.strip(),
                        "tipo_medicion": tipo_medicion,
                        "unidad_base": unidad_base.strip() if unidad_base.strip() else None,
                    }
                    if asignado_a.strip().isdigit():
                        payload["asignado_a"] = int(asignado_a.strip())
                    created = create_task(supabase, payload)
                    if created and created.get("id"):
                        set_task_score_ranges(supabase, created["id"], rangos)
                    st.success("Tarea creada.")
                    st.rerun()
            else:
                payload = {
                    "titulo": titulo.strip(),
                    "descripcion": descripcion.strip(),
                    "estado": estado.strip(),
                    "tipo_medicion": tipo_medicion,
                    "unidad_base": unidad_base.strip() if unidad_base.strip() else None,
                    "puntaje_fijo": puntaje_fijo if tipo_medicion == "cumplimiento" else None,
                }
                if asignado_a.strip().isdigit():
                    payload["asignado_a"] = int(asignado_a.strip())
                create_task(supabase, payload)
                st.success("Tarea creada.")
                st.rerun()

    with tab2:
        if not tasks:
            st.info("No hay tareas para editar.")
            return

        # Construir mapa de tareas mostrando el nombre/título cuando exista
        task_entries: list[tuple[str, dict]] = []
        for t in tasks:
            title = t.get("nombre") or t.get("titulo") or ""
            key = f"{t.get('id')} - {title}"
            task_entries.append((key, t))

        # Ordenar por ID para consistencia en la UI
        task_entries.sort(key=lambda x: int(str(x[0]).split(" - ")[0]))
        task_map = {k: v for k, v in task_entries}

        selected_key = st.selectbox("Selecciona una tarea", list(task_map.keys()), key="edit_task_select")
        selected_task = task_map[selected_key]

        # Normalizar tipo_medicion antiguo 'fijo' a 'cumplimiento' para compatibilidad
        tipo_raw = str(selected_task.get("tipo_medicion", "cantidad")).strip().lower()
        if tipo_raw == "fijo":
            tipo_raw = "cumplimiento"

        existing_ranges = []
        if tipo_raw == "cantidad":
            existing_ranges = list_task_score_ranges(supabase, selected_task.get("id"))

        # Mostrar el selector fuera del form para que la UI reevalúe y muestre los campos correspondientes
        tipo_options = ["cantidad", "cumplimiento", "tiempo", "turno"]
        tipo_for_index = tipo_raw if tipo_raw in tipo_options else "cantidad"
        tipo_medicion_value = st.selectbox(
            "Tipo de medición",
            tipo_options,
            index=tipo_options.index(tipo_for_index),
            key="edit_task_tipo",
        )

        with st.form("edit_task"):
            # Prefill fields using either 'nombre' or 'titulo' for compatibility
            titulo_value = selected_task.get("nombre") or selected_task.get("titulo") or ""
            titulo = st.text_input("Nombre de tarea", value=str(titulo_value))
            descripcion = st.text_area("Descripción", value=str(selected_task.get("descripcion") or selected_task.get("descripcion") or ""))
            estado = st.text_input(
                "Estado",
                value=str(selected_task.get("estado", "pendiente")),
            )
            # 'Asignado a' no se edita desde aquí según requerimiento
            # Determinar índice inicial asegurando que 'fijo' esté mapeado a 'cumplimiento'
            tipo_options = ["cantidad", "cumplimiento", "tiempo", "turno"]
            tipo_for_index = tipo_raw if tipo_raw in tipo_options else "cantidad"
            # Usar la selección realizada fuera del formulario
            tipo_medicion = tipo_medicion_value
            unidad_base = st.text_input(
                "Unidad base (ej. pares, cajas, bultos)",
                value=str(selected_task.get("unidad_base") or selected_task.get("unidad") or ""),
                placeholder="Opcional",
            )
            puntaje_fijo = None
            rangos = []

            if tipo_medicion == "cantidad":
                rangos = _render_quantity_ranges_form("edit", existing_ranges)
            elif tipo_medicion == "cumplimiento":
                puntaje_default = int(selected_task.get("puntaje_fijo") or selected_task.get("puntaje") or 1)
                puntaje_fijo = st.number_input(
                    "Puntaje fijo",
                    min_value=1,
                    max_value=10,
                    step=1,
                    value=puntaje_default,
                    key="edit_puntaje_fijo",
                )

            guardar = st.form_submit_button("Guardar cambios")

        if guardar:
            if tipo_medicion == "cantidad":
                invalid_range = any(
                    r["cantidad_hasta"] is not None and r["cantidad_hasta"] < r["cantidad_desde"]
                    for r in rangos
                )
                if invalid_range:
                    st.error("Cada rango debe tener 'hasta' mayor o igual a 'desde'.")
                else:
                    changes = {
                        "titulo": titulo.strip(),
                        "descripcion": descripcion.strip(),
                        "estado": estado.strip(),
                        "tipo_medicion": tipo_medicion,
                        "unidad_base": unidad_base.strip() if unidad_base.strip() else None,
                        "puntaje_fijo": None,
                    }
                    if asignado_a.strip().isdigit():
                        changes["asignado_a"] = int(asignado_a.strip())
                    update_task(supabase, selected_task["id"], changes, selected_task)
                    set_task_score_ranges(supabase, selected_task["id"], rangos)
                    st.success("Tarea actualizada.")
                    st.rerun()
            else:
                changes = {
                    "titulo": titulo.strip(),
                    "descripcion": descripcion.strip(),
                    "estado": estado.strip(),
                    "tipo_medicion": tipo_medicion,
                    "unidad_base": unidad_base.strip() if unidad_base.strip() else None,
                    "puntaje_fijo": puntaje_fijo if tipo_medicion == "cumplimiento" else None,
                }
                if asignado_a.strip().isdigit():
                    changes["asignado_a"] = int(asignado_a.strip())
                update_task(supabase, selected_task["id"], changes, selected_task)
                if tipo_medicion != "cantidad":
                    set_task_score_ranges(supabase, selected_task["id"], [])
                st.success("Tarea actualizada.")
                st.rerun()


def _worker_points_panel(supabase: Client) -> None:
    st.subheader("Tareas realizadas y puntos por trabajador")
    logs = list_all_activity_logs(supabase)

    if not logs:
        st.info("No hay registros todavía.")
        return

    users = select_users(supabase)
    # Filtramos para excluir a los administradores de la lista de trabajadores
    workers = [u for u in users if str(u.get("rol", "")).lower() == "trabajador"]
    worker_ids = {u.get("id") for u in workers}
    user_name_by_id = {u.get("id"): (u.get("nombre") or u.get("email")) for u in workers}
    user_email_by_id = {u.get("id"): u.get("email") for u in workers}
    tasks = list_tasks(supabase)
    task_name_by_id = {t.get("id"): (t.get("nombre") or t.get("titulo") or f"Tarea {t.get('id')}") for t in tasks}

    rows = []
    for r in logs:
        trabajador_id = r.get("trabajador_id")
        # Omitir registros de usuarios que no son trabajadores (ej. administradores)
        if trabajador_id not in worker_ids:
            continue
            
        tarea_nombre = task_name_by_id.get(r.get("tarea_id"))
        actividad_nombre = tarea_nombre
        
        # Formatear fecha para visualización (ej: 23 May 26 10:55:06)
        created_at_str = r.get("created_at")
        fecha_display = str(r.get("fecha_registro") or "")
        if created_at_str:
            try:
                dt = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                dt_lima = dt.astimezone(ZoneInfo("America/Lima"))
                fecha_display = dt_lima.strftime("%d %b %y %H:%M:%S").title()
            except Exception:
                pass

        # Traducción de cantidad a Turno si corresponde
        val_cant = r.get("cantidad")
        val_turno = r.get("turno")
        cant_display = val_turno if val_turno else val_cant

        tipo_act, _ = get_activity_capture_mode(actividad_nombre or "")
        if tipo_act == "turno" and not val_turno:
            cant_display = "Turno mañana o tarde" if val_cant == 1.0 else "Turno mañana y tarde"

        rows.append(
            {
                "Fecha": fecha_display,
                "Trabajador": user_name_by_id.get(trabajador_id),
                "Email": user_email_by_id.get(trabajador_id),
                "Tarea": tarea_nombre,
                "Actividad": actividad_nombre,
                "Cantidad": str(val_cant) if val_cant is not None else "",
                "Turno": val_turno if val_turno else (cant_display if tipo_act == "turno" else ""),
                "Tiempo (min)": r.get("tiempo_minutos"),
                "Cumplimiento": r.get("cumplimiento"),
                "Puntos": float(r.get("puntos_obtenidos") or 0),
            }
        )

    df = pd.DataFrame(rows)

    st.markdown("### Acumulado por trabajador")
    resumen = (
        df.groupby(["Trabajador", "Email"], dropna=False, as_index=False)["Puntos"]
        .sum()
        .sort_values("Puntos", ascending=False)
    )
    st.dataframe(resumen, width="stretch")
    st.metric("Puntos totales registrados", f"{resumen['Puntos'].sum():.0f}")

    st.divider()
    
    # Agrupamos los detalles en un contenedor con borde para aplicar el efecto de fondo
    with st.container(border=True):
        st.markdown("### 🔍 Detalle Individual por Trabajador")
        for worker in workers:
            w_id = worker.get("id")
            w_email = user_email_by_id.get(w_id)
            w_name = user_name_by_id.get(w_id)
            
            # Filtrar datos del trabajador específico
            worker_df = df[df["Email"] == w_email]
            
            if not worker_df.empty:
                with st.expander(f"👤 {w_name} ({w_email}) - Total: {worker_df['Puntos'].sum():.1f} pts"):
                    st.write(f"**Actividades realizadas por {w_name}:**")
                    # Mostramos el detalle sin repetir el nombre y email en cada fila
                    st.dataframe(
                        worker_df.drop(columns=["Trabajador", "Email"]), 
                        use_container_width=True
                    )
            else:
                st.caption(f"ℹ️ {w_name} ({w_email}) no tiene registros todavía.")
