from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st
from supabase import Client

from services.repositories import (
    create_worker_activity_log,
    get_tasks_for_user,
    list_task_score_ranges,
    list_tasks,
    list_worker_activity_logs,
)
from services.scoring import calculate_points, get_activity_capture_mode

NO_TASK_OPTION = "Ninguno"


def _render_dynamic_fields(
    task_name: str,
    idx: int,
    task_tipo: str = None,
    task_unidad: str = None,
    task_data: dict[str, Any] | None = None,
) -> tuple[float | None, int | None, bool | None, str, str | None]:
    tipo_bd = (task_tipo or "").strip().lower()
    tipos_validos = {"cantidad", "tiempo", "fijo", "cumplimiento", "turno"}
    if tipo_bd in tipos_validos:
        tipo, unidad = tipo_bd, task_unidad
    else:
        tipo, unidad = get_activity_capture_mode(task_name)

    cantidad = None
    minutos = None
    cumplimiento = None
    turno = None

    if tipo == "cantidad":
        cantidad = st.number_input(
            f"Cantidad ({unidad or 'unidades'})",
            min_value=0.0,
            step=1.0,
            value=0.0,
            key=f"cantidad_{idx}",
        )
        cumplimiento = True
    elif tipo == "tiempo":
        horas = st.number_input("Horas", min_value=0, step=1, key=f"horas_{idx}")
        mins = st.number_input("Minutos", min_value=0, max_value=59, step=1, key=f"mins_{idx}")
        minutos = int(horas) * 60 + int(mins)
        st.caption(f"Tiempo total: {minutos} min")
        cantidad = 0.0
        cumplimiento = True
    if tipo in {"fijo", "cumplimiento"}:
        cantidad = 1.0
        cumplimiento = st.checkbox("Cumplido", value=True, key=f"cumpl_{idx}")
        st.caption("Esta tarea usa puntaje fijo definido en la tarea.")
    elif tipo == "turno":
        turno_option = st.radio(
            "Selecciona el turno",
            ["Turno mañana o tarde", "Turno mañana y tarde"],
            key=f"turno_{idx}",
        )
        turno = turno_option
        cantidad = 1.0 if turno == "Turno mañana o tarde" else 2.0
        cumplimiento = True
        minutos = None
        if task_data:
            simple = task_data.get("puntaje_turno_simple") or task_data.get("puntos_turno_simple") or 0
            completo = task_data.get("puntaje_turno_completo") or task_data.get("puntos_turno_completo") or 0
            st.caption(f"Puntaje configurado: mañana/tarde = {simple}, completo = {completo}")

    detalle = st.text_area("Detalle (opcional)", placeholder="Comentarios de lo realizado", key=f"detalle_{idx}")
    return cantidad, minutos, cumplimiento, detalle, turno


def _render_save_success_screen(message: str) -> None:
    st.markdown(
        f"""
        <style>
            .worker-success-screen {{
                min-height: 62vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 1.25rem;
                margin: 1rem 0 1.5rem;
                padding: 3rem 2rem;
                border-radius: 0.9rem;
                background: linear-gradient(135deg, rgba(22, 163, 74, 0.96), rgba(21, 128, 61, 0.96));
                color: #ffffff;
                text-align: center;
                box-shadow: 0 18px 45px rgba(0, 0, 0, 0.25);
            }}
            .worker-success-screen__title {{
                margin: 0;
                font-size: clamp(2.4rem, 6vw, 5.5rem);
                line-height: 1.05;
                font-weight: 800;
                color: #ffffff !important;
            }}
            .worker-success-screen__message {{
                margin: 0;
                font-size: clamp(1.15rem, 2.2vw, 1.8rem);
                font-weight: 600;
            }}
        </style>
        <div class="worker-success-screen">
            <h1 class="worker-success-screen__title">Se guardo correctamente</h1>
            <p class="worker-success-screen__message">{message}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.button("Aceptar", type="primary", use_container_width=True, key="worker_success_accept"):
        st.session_state.pop("worker_save_success", None)
        st.rerun()


def _render_sticky_save_button_styles() -> None:
    st.markdown(
        """
        <style>
            .main .block-container {
                padding-bottom: 7rem;
            }
            .st-key-worker_save_records {
                position: fixed;
                right: 2rem;
                bottom: 1.5rem;
                z-index: 999;
                width: min(420px, calc(100vw - 4rem));
                padding: 0.75rem;
                border-radius: 0.8rem;
                background: rgba(255, 255, 255, 0.92);
                box-shadow: 0 14px 35px rgba(0, 0, 0, 0.24);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            }
            .st-key-worker_save_records button {
                min-height: 3.25rem;
                font-size: 1.05rem;
            }
            @media (max-width: 640px) {
                .st-key-worker_save_records {
                    left: 1rem;
                    right: 1rem;
                    bottom: 1rem;
                    width: auto;
                }
            }
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.dialog("Confirmar guardado")
def _render_save_confirmation_dialog() -> None:
    st.markdown(
        """
        <style>
            .worker-confirm-screen {
                padding: 1.5rem 1rem 1rem;
                border-radius: 0.9rem;
                background: rgba(254, 243, 199, 0.96);
                border: 2px solid #f59e0b;
                text-align: center;
            }
            .worker-confirm-screen__title {
                margin: 0 0 0.75rem;
                color: #92400e !important;
                font-size: clamp(1.6rem, 3vw, 2.5rem);
                line-height: 1.1;
                font-weight: 800;
            }
            .worker-confirm-screen__message {
                margin: 0;
                color: #78350f;
                font-size: clamp(1rem, 1.5vw, 1.25rem);
                font-weight: 600;
            }
        </style>
        <div class="worker-confirm-screen">
            <h2 class="worker-confirm-screen__title">¿Esta seguro de guardar los registros?</h2>
            <p class="worker-confirm-screen__message">Revise la informacion antes de confirmar.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    col_confirm, col_cancel = st.columns(2)
    with col_confirm:
        if st.button("Si, guardar", type="primary", use_container_width=True, key="worker_confirm_save"):
            st.session_state.pop("worker_save_confirm", None)
            st.session_state.worker_save_confirmed = True
            st.rerun()
    with col_cancel:
        if st.button("Cancelar", use_container_width=True, key="worker_cancel_save"):
            st.session_state.pop("worker_save_confirm", None)
            st.rerun()


@st.dialog("Seleccione una tarea")
def _render_missing_task_dialog() -> None:
    st.markdown(
        """
        <style>
            .worker-warning-screen {
                padding: 1.5rem 1rem 1rem;
                border-radius: 0.9rem;
                background: rgba(254, 226, 226, 0.98);
                border: 2px solid #ef4444;
                text-align: center;
            }
            .worker-warning-screen__title {
                margin: 0 0 0.75rem;
                color: #991b1b !important;
                font-size: clamp(1.55rem, 3vw, 2.4rem);
                line-height: 1.1;
                font-weight: 800;
            }
            .worker-warning-screen__message {
                margin: 0;
                color: #7f1d1d;
                font-size: clamp(1rem, 1.5vw, 1.25rem);
                font-weight: 600;
            }
        </style>
        <div class="worker-warning-screen">
            <h2 class="worker-warning-screen__title">Debe seleccionar una tarea</h2>
            <p class="worker-warning-screen__message">Elija una tarea antes de guardar el registro.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.button("Aceptar", type="primary", use_container_width=True, key="worker_missing_task_accept"):
        st.session_state.pop("worker_missing_task_alert", None)
        st.rerun()


def render_worker(supabase: Client, user: dict) -> None:
    tab2, tab3 = st.tabs(["Registrar actividad", "Historial"])

    with tab2:
        st.subheader("Registrar lo realizado")
        _render_sticky_save_button_styles()
        if "worker_save_success" in st.session_state:
            _render_save_success_screen(st.session_state.worker_save_success)
            return

        tasks = get_tasks_for_user(supabase, user)

        if not tasks:
            st.warning("No tienes tareas asignadas para registrar actividades.")
            return

        task_map = {f"{t.get('id')} - {t.get('nombre') or t.get('titulo') or 'Sin título'}": t for t in tasks}
        sorted_task_keys = sorted(task_map.keys(), key=lambda x: int(x.split(" - ")[0]))

        if "worker_items_count" not in st.session_state:
            st.session_state.worker_items_count = 1

        col_add, col_remove = st.columns(2)
        with col_add:
            if st.button("Añadir tarea realizada") and st.session_state.worker_items_count < len(sorted_task_keys):
                st.session_state.worker_items_count += 1
                st.rerun()
        with col_remove:
            if st.button("Quitar última") and st.session_state.worker_items_count > 1:
                st.session_state.worker_items_count -= 1
                st.rerun()

        st.caption(f"Registros a cargar: {st.session_state.worker_items_count}")

        registros = []
        tareas_seleccionadas = []

        for i in range(st.session_state.worker_items_count):
            st.markdown(f"### Registro {i + 1}")

            opciones_disponibles = [k for k in sorted_task_keys if k not in tareas_seleccionadas]

            if not opciones_disponibles:
                st.info("Has seleccionado todas las tareas únicas disponibles.")
                break

            if i == 0:
                opciones_disponibles = [NO_TASK_OPTION, *opciones_disponibles]

            task_key = st.selectbox("Tarea realizada", opciones_disponibles, key=f"task_{i}")
            if task_key == NO_TASK_OPTION:
                registros.append(
                    {
                        "task_key": None,
                        "task_name": "",
                        "cantidad": None,
                        "minutos": None,
                        "cumplimiento": None,
                        "detalle": "",
                        "turno": None,
                    }
                )
                st.caption("Seleccione una tarea para completar este registro.")
                st.divider()
                continue

            tareas_seleccionadas.append(task_key)

            clean_name = task_key.split(" - ", 1)[-1] if " - " in task_key else task_key
            selected_task = task_map[task_key]

            cantidad, minutos, cumplimiento, detalle, turno = _render_dynamic_fields(
                clean_name,
                i,
                task_tipo=selected_task.get("tipo_medicion"),
                task_unidad=selected_task.get("unidad_base"),
                task_data=selected_task,
            )

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

        guardar = st.button(
            "Guardar registros",
            type="primary",
            use_container_width=True,
            key="worker_save_records",
        )

        if guardar:
            if any(item.get("task_key") is None for item in registros):
                st.session_state.worker_missing_task_alert = True
            else:
                st.session_state.worker_save_confirm = True
            st.rerun()

        should_save = st.session_state.pop("worker_save_confirmed", False)
        if st.session_state.get("worker_missing_task_alert"):
            _render_missing_task_dialog()
            return

        if st.session_state.get("worker_save_confirm"):
            _render_save_confirmation_dialog()
            return

        if should_save:
            total_puntos = 0
            guardados_bd = 0
            errores = 0
            last_error = ""
            failed_payloads = []

            lima_tz = ZoneInfo("America/Lima")
            now_lima = datetime.now(lima_tz)
            today_str = now_lima.date().isoformat()

            has_full_shift_in_batch = any(item.get("turno") == "Turno mañana y tarde" for item in registros)

            if has_full_shift_in_batch and len(registros) > 1:
                st.error("Si seleccionas 'Turno mañana y tarde', no puedes registrar otras actividades el mismo día.")
                return

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
                    current_task = task_map[item["task_key"]].copy()
                    if str(current_task.get("tipo_medicion", "")).lower() == "cantidad":
                        current_task["rangos_puntaje"] = list_task_score_ranges(
                            supabase, current_task.get("id")
                        )
                    puntos = calculate_points(
                        current_task,
                        item["cantidad"],
                        item["minutos"],
                        item["cumplimiento"],
                    )

                    payload = {
                        "trabajador_id": user.get("id"),
                        "tarea_id": task_map[item["task_key"]].get("id"),
                        "actividad_nombre": item["task_name"],
                        "fecha_registro": now_lima.date().isoformat(),
                        "cantidad": item["cantidad"],
                        "tiempo_minutos": item["minutos"],
                        "cumplimiento": item["cumplimiento"],
                        "detalle": (item["detalle"] or "").strip() or None,
                        "turno": item.get("turno"),
                        "puntos_obtenidos": puntos,
                    }
                    create_worker_activity_log(supabase, payload)
                    guardados_bd += 1
                    total_puntos += puntos
                except Exception as e:
                    errores += 1
                    last_error = str(e)
                    failed_payloads.append(
                        {
                            "tarea": item.get("task_name"),
                            "error": str(e),
                        }
                    )

            if errores:
                if guardados_bd:
                    st.success(f"Se guardaron {guardados_bd} registros en base de datos. Puntos totales: {total_puntos}")
                st.error(f"{errores} registros fallaron. Error: {last_error}")
                st.caption("Detalle del error de guardado:")
                st.json(failed_payloads)
                return
            if guardados_bd:
                st.session_state.worker_save_success = (
                    f"Registro guardado correctamente. Puntos totales: {total_puntos}"
                    if guardados_bd == 1
                    else f"Se guardaron {guardados_bd} registros correctamente. Puntos totales: {total_puntos}"
                )
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

        rows = []
        for r in logs:
            tarea_nombre = task_name_by_id.get(r.get("tarea_id"))

            created_at_str = r.get("created_at")
            fecha_display = str(r.get("fecha_registro") or "")
            if created_at_str:
                try:
                    clean_timestamp = created_at_str.replace("Z", "+00:00")
                    dt = datetime.fromisoformat(clean_timestamp)
                    dt_lima = dt.astimezone(ZoneInfo("America/Lima"))
                    fecha_display = dt_lima.strftime("%d %b %y %H:%M:%S").title()
                except Exception:
                    pass

            final_name = tarea_nombre or ""
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
