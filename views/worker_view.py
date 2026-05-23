from datetime import datetime
from zoneinfo import ZoneInfo

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


def _render_dynamic_fields(task_name: str, idx: int) -> tuple[float | None, int | None, bool | None, str, str | None]:
    tipo, unidad = get_activity_capture_mode(task_name)

    cantidad = None
    minutos = None
    cumplimiento = None
    turno = None

    if tipo == "cantidad":
        cantidad = st.number_input(f"Cantidad ({unidad or 'unidades'})", min_value=0.0, step=1.0, value=0.0, key=f"cantidad_{idx}")
        cumplimiento = True # Para tareas de cantidad, se asume cumplimiento si se registra una cantidad
    elif tipo == "tiempo":
        horas = st.number_input("Horas", min_value=0, step=1, key=f"horas_{idx}")
        mins = st.number_input("Minutos", min_value=0, max_value=59, step=1, key=f"mins_{idx}")
        minutos = int(horas) * 60 + int(mins)
        st.caption(f"Tiempo total: {minutos} min")
        cantidad = 0.0 # Las tareas de tiempo no tienen una cantidad explícita
        cumplimiento = True # Para tareas de tiempo, se asume cumplimiento si se registra un tiempo
    elif tipo == "cumplimiento":
        # Para tareas de cumplimiento, la cantidad es fija en 1 y no se muestra el input
        cantidad = 1.0
        cumplimiento = st.checkbox("Cumplido", value=True, key=f"cumpl_{idx}")
        # El campo de cantidad no se renderiza para este tipo de actividad
    elif tipo == "turno": # New type for turno selection
        turno_option = st.radio(
            "Selecciona el turno",
            ["Turno mañana o tarde", "Turno mañana y tarde"],
            key=f"turno_{idx}"
        )
        turno = turno_option
        # Map turno selection to a numerical quantity for point calculation
        cantidad = 1.0 if turno == "Turno mañana o tarde" else 2.0
        cumplimiento = True # Turno selection implies compliance
        minutos = None # Not applicable for turno-based tasks


    detalle = st.text_area("Detalle (opcional)", placeholder="Comentarios de lo realizado", key=f"detalle_{idx}")
    return cantidad, minutes, cumplimiento, detalle, turno


def render_worker(supabase: Client, user: dict) -> None:
    tab2, tab3 = st.tabs(["Registrar actividad", "Historial"])

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
        
        registros = []

        for i in range(st.session_state.worker_items_count):
            st.markdown(f"### Registro {i + 1}")
            task_key = st.selectbox("Tarea realizada", list(task_map.keys()), key=f"task_{i}")

            # Usamos el texto visible en el selectbox para determinar los campos.
            # Esto ignora errores en la base de datos y se guía por lo que tú seleccionaste.
            clean_name = task_key.split(" - ", 1)[-1] if " - " in task_key else task_key
            
            cantidad, minutos, cumplimiento, detalle, turno = _render_dynamic_fields(clean_name, i)
            
            registros.append(
                {
                    "task_key": task_key,
                    "task_name": clean_name,
                    "cantidad": cantidad,
                    "minutos": minutos,
                    "cumplimiento": cumplimiento,
                    "detalle": detalle,
                    "turno": turno,
                }
            )
            st.divider()

        # Cambiamos st.form_submit_button por un botón normal
        guardar = st.button("Guardar registros", type="primary", use_container_width=True)

        if guardar:
            total_puntos = 0
            guardados_bd = 0
            errores = 0
            last_error = ""
            
            # Capturamos el momento exacto en horario Perú Lima
            lima_tz = ZoneInfo("America/Lima")
            now_lima = datetime.now(lima_tz)
            today_str = now_lima.date().isoformat()

            # 1. Validar en el lote actual: Si hay un turno completo, no debe haber más registros
            has_full_shift_in_batch = any(item.get("turno") == "Turno mañana y tarde" for item in registros)
            
            if has_full_shift_in_batch and len(registros) > 1:
                st.error("Si seleccionas 'Turno mañana y tarde', no puedes registrar otras actividades el mismo día.")
                return

            # 2. Validar contra la base de datos (registros ya existentes hoy)
            existing_logs = list_worker_activity_logs(supabase, user.get("id"))
            logs_today = [l for l in existing_logs if str(l.get("fecha_registro")) == today_str]
            
            if logs_today:
                if has_full_shift_in_batch:
                    st.error("No puedes registrar un turno completo porque ya tienes actividades registradas hoy.")
                    return
                if any(l.get("turno") == "Turno mañana y tarde" for l in logs_today):
                    st.error("Ya registraste un turno completo hoy. No puedes añadir más actividades.")
                    return

            for item in registros:
                try:
                    puntos = calculate_points(item["task_name"], item["cantidad"], item["minutos"], item["cumplimiento"])
                    actividad_id = ensure_activity(supabase, item["task_name"])
                    if not actividad_id:
                        errores += 1
                        continue

                    payload = {
                        "trabajador_id": user.get("id"),
                        "tarea_id": task_map[item["task_key"]].get("id"),
                        "actividad_id": actividad_id,
                        "fecha_registro": now_lima.date().isoformat(),
                        "cantidad": item["cantidad"],
                        "tiempo_minutos": item["minutos"],
                        "cumplimiento": item["cumplimiento"],
                        "detalle": (item["detalle"] or "").strip() or None,
                        "turno": item.get("turno"),
                        "puntos_obtenidos": puntos,
                        "created_at": now_lima.isoformat(),
                    }
                    create_worker_activity_log(supabase, payload)
                    guardados_bd += 1
                    total_puntos += puntos
                except Exception as e:
                    errores += 1
                    last_error = str(e)

            if guardados_bd:
                st.success(f"Se guardaron {guardados_bd} registros en base de datos. Puntos totales: {total_puntos}")
            if errores:
                st.error(f"{errores} registros fallaron. Error: {last_error}")
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
            
            # --- CORRECCIÓN CRÍTICA DE HORARIO LIMA AL LEER DE SUPABASE ---
            created_at_str = r.get("created_at")
            fecha_display = str(r.get("fecha_registro") or "")
            if created_at_str:
                try:
                    # Supabase devuelve el string con 'Z' o con offsets (+00:00). 
                    # Reemplazar 'Z' asegura compatibilidad total al parsear.
                    clean_timestamp = created_at_str.replace('Z', '+00:00')
                    dt = datetime.fromisoformat(clean_timestamp)
                    
                    # Convertir explícitamente el objeto datetime a la zona de Lima
                    dt_lima = dt.astimezone(ZoneInfo("America/Lima"))
                    fecha_display = dt_lima.strftime("%d %b %y %H:%M:%S").title()
                except Exception:
                    pass
            # -------------------------------------------------------------

            # Lógica para mostrar "Turno" en lugar de 1 o 2 en el historial
            final_name = actividad_nombre or tarea_nombre or ""
            tipo_act, _ = get_activity_capture_mode(final_name)
            val_cant = r.get("cantidad")
            val_turno = r.get("turno")
            cant_display = val_turno if val_turno else val_cant
            
            if tipo_act == "turno" and not val_turno:
                cant_display = "Turno mañana o tarde" if float(val_cant or 0) == 1.0 else "Turno mañana y tarde"

            rows.append(
                {
                    "Fecha": fecha_display,
                    "Tarea": tarea_nombre,
                    "Actividad": final_name,
                    "Cantidad": str(val_cant) if val_cant is not None else "",
                    "Turno": val_turno if val_turno else (cant_display if tipo_act == "turno" else ""),
                    "Tiempo (min)": r.get("tiempo_minutos"),
                    "Cumplimiento": r.get("cumplimiento"),
                    "Puntos": r.get("puntos_obtenidos"),
                    "Detalle": r.get("detalle"),
                }
            )

        st.dataframe(pd.DataFrame(rows), width="stretch")