from datetime import date

import pandas as pd
import streamlit as st
from supabase import Client

from services.repositories import (
    create_worker_activity_log,
    ensure_activity,
    get_tasks_for_user,
    list_activities_catalog,
    list_tasks,
    list_worker_activity_logs,
)
from services.scoring import calculate_points, get_activity_capture_mode


def _render_dynamic_fields(task_name: str, idx: int) -> tuple[float | None, int | None, bool | None, str]:
    tipo, unidad = get_activity_capture_mode(task_name)

    # Siempre habilitamos el campo de cantidad para que se guarde en la BD independientemente del tipo de tarea
    cantidad = st.number_input(f"Cantidad ({unidad or 'unidades'})", min_value=0.0, step=1.0, value=1.0 if tipo == "cumplimiento" else 0.0, key=f"cantidad_{idx}")
    
    minutos = None
    cumplimiento = None

    if tipo == "tiempo":
        horas = st.number_input("Horas", min_value=0, step=1, key=f"horas_{idx}")
        mins = st.number_input("Minutos", min_value=0, max_value=59, step=1, key=f"mins_{idx}")
        minutos = int(horas) * 60 + int(mins)
        st.caption(f"Tiempo total: {minutos} min")
    else:
        cumplimiento = st.checkbox("Cumplido", value=True, key=f"cumpl_{idx}")

    detalle = st.text_area("Detalle (opcional)", placeholder="Comentarios de lo realizado", key=f"detalle_{idx}")
    return cantidad, minutos, cumplimiento, detalle


def render_worker(supabase: Client, user: dict) -> None:
    tab1, tab2, tab3 = st.tabs(["Mis tareas", "Registrar actividad", "Historial"])

    with tab1:
        st.subheader("Tus tareas")
        tasks = get_tasks_for_user(supabase, user)
        if not tasks:
            st.info("No hay tareas asignadas por el momento.")
        else:
            st.dataframe(pd.DataFrame(tasks), width="stretch")

    with tab2:
        st.subheader("Registrar lo realizado")
        tasks = get_tasks_for_user(supabase, user)

        if not tasks:
            st.warning("No tienes tareas asignadas para registrar actividades.")
            return

        task_map = {f"{t.get('id')} - {t.get('nombre') or t.get('titulo') or 'Sin título'}": t for t in tasks}

        if "worker_items_count" not in st.session_state:
            st.session_state.worker_items_count = 1

        col_add, col_remove = st.columns(2)
        with col_add:
            if st.button("Añadir tarea realizada"):
                st.session_state.worker_items_count += 1
                st.rerun()
        with col_remove:
            if st.button("Quitar última") and st.session_state.worker_items_count > 1:
                st.session_state.worker_items_count -= 1
                st.rerun()

        st.caption(f"Registros a cargar: {st.session_state.worker_items_count}")

        with st.form("worker_log_form"):
            fecha = st.date_input("Fecha", value=date.today())
            registros = []

            for i in range(st.session_state.worker_items_count):
                st.markdown(f"### Registro {i + 1}")
                task_key = st.selectbox("Tarea realizada", list(task_map.keys()), key=f"task_{i}")
                selected_task = task_map[task_key]
                task_name = selected_task.get("nombre") or selected_task.get("titulo") or "Sin título"
                st.caption(f"Actividad: {task_name}")

                cantidad, minutos, cumplimiento, detalle = _render_dynamic_fields(task_name, i)
                registros.append(
                    {
                        "task_key": task_key,
                        "task_name": task_name,
                        "cantidad": cantidad,
                        "minutos": minutos,
                        "cumplimiento": cumplimiento,
                        "detalle": detalle,
                    }
                )
                st.divider()

            guardar = st.form_submit_button("Guardar registros")

        if guardar:
            total_puntos = 0
            guardados_bd = 0
            errores = 0
            for item in registros:
                puntos = calculate_points(item["task_name"], item["cantidad"], item["minutos"], item["cumplimiento"])
                actividad_id = ensure_activity(supabase, item["task_name"])
                if not actividad_id:
                    errores += 1
                    continue

                payload = {
                    "trabajador_id": user.get("id"),
                    "tarea_id": task_map[item["task_key"]].get("id"),
                    "actividad_id": actividad_id,
                    "fecha_registro": str(fecha),
                    "cantidad": item["cantidad"],
                    "tiempo_minutos": item["minutos"],
                    "cumplimiento": item["cumplimiento"],
                    "detalle": (item["detalle"] or "").strip() or None,
                    "puntos_obtenidos": puntos,
                }
                try:
                    create_worker_activity_log(supabase, payload)
                    guardados_bd += 1
                    total_puntos += puntos
                except Exception:
                    errores += 1

            if guardados_bd:
                st.success(f"Se guardaron {guardados_bd} registros en base de datos. Puntos totales: {total_puntos}")
            if errores:
                st.error(f"{errores} registros no se pudieron guardar. Revisa que exista la tabla registro_actividades.")
            st.session_state.worker_items_count = 1
            st.rerun()

    with tab3:
        st.subheader("Historial")
        logs = list_worker_activity_logs(supabase, user.get("id"))
        if not logs:
            st.info("Aún no tienes registros.")
            return

        task_rows = list_tasks(supabase)
        task_name_by_id = {
            t.get("id"): (t.get("nombre") or t.get("titulo") or f"Tarea {t.get('id')}")
            for t in task_rows
        }
        activity_rows = list_activities_catalog(supabase)
        activity_name_by_id = {
            a.get("id"): a.get("actividad") or f"Actividad {a.get('id')}"
            for a in activity_rows
        }

        rows = []
        for r in logs:
            tarea_nombre = task_name_by_id.get(r.get("tarea_id"))
            actividad_nombre = activity_name_by_id.get(r.get("actividad_id"))
            rows.append(
                {
                    "Fecha": r.get("fecha_registro"),
                    "Tarea": tarea_nombre,
                    "Actividad": actividad_nombre or tarea_nombre,
                    "Cantidad": r.get("cantidad"),
                    "Tiempo (min)": r.get("tiempo_minutos"),
                    "Cumplimiento": r.get("cumplimiento"),
                    "Puntos": r.get("puntos_obtenidos"),
                    "Detalle": r.get("detalle"),
                }
            )

        st.dataframe(pd.DataFrame(rows), width="stretch")
