from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st
from supabase import Client


def render_team_leader_workspace(supabase: Client, user: dict) -> None:
    tab_activity, tab_incident = st.tabs(["Registro de actividad", "Reporte de incidencia"])

    with tab_activity:
        from views.worker_view import render_worker

        render_worker(supabase, user)

    with tab_incident:
        _render_incident_section(supabase, user)


def _render_incident_section(supabase: Client, user: dict) -> None:
    from services.repositories import create_incidente, list_incidentes, list_operantes_and_team_leads, list_tasks, list_tiendas

    st.subheader("Reportar incidencias")
    st.caption("Registra turno, tarea, tienda, guia y tipo de error.")

    tasks = list_tasks(supabase)
    tiendas = list_tiendas(supabase)
    users = list_operantes_and_team_leads(supabase)

    if not tiendas:
        st.warning("Aun no hay tiendas registradas. Un administrador debe crear al menos una.")
    if not users:
        st.warning("No hay usuarios con rol operante o jefe de equipo para seleccionar.")

    with st.form("create_incidente"):
        nombre_options = ["Selecciona un usuario"] + [
            f"{u.get('id')} - {u.get('nombre') or u.get('email')}"
            for u in users
        ]
        nombre_sel = st.selectbox("Nombre", nombre_options)
        nombre = ""
        if nombre_sel != "Selecciona un usuario":
            nombre = nombre_sel.split(" - ", 1)[1]

        turno = st.selectbox("Turno", ["turno regular", "incidencia", "turno extra"])

        task_options = ["Selecciona una tarea"] + [
            f"{task.get('id')} - {task.get('nombre') or task.get('titulo') or 'Tarea sin nombre'}"
            for task in tasks
        ]
        tarea_sel = st.selectbox("Proceso / Tarea", task_options)
        tarea_id = None
        tarea_nombre = None
        if tarea_sel != "Selecciona una tarea":
            tarea_id = int(tarea_sel.split(" - ", 1)[0])
            tarea_nombre = tarea_sel.split(" - ", 1)[1]

        tienda_options = ["Selecciona una tienda"] + [str(tienda.get("nombre") or "") for tienda in tiendas if str(tienda.get("nombre") or "").strip()]
        tienda_sel = st.selectbox("Tienda", tienda_options)
        tienda_id = None
        if tienda_sel != "Selecciona una tienda":
            tienda_match = next((t for t in tiendas if str(t.get("nombre") or "") == tienda_sel), None)
            tienda_id = tienda_match.get("id") if tienda_match else None

        numero_guia = st.text_input("Numero de guia")
        observacion = st.text_area("Observacion")
        tipo_error = st.selectbox("Tipo de error", ["CONTENIDO", "LIBERADO"])
        guardar = st.form_submit_button("Registrar incidente", type="primary")

    if guardar:
        if nombre_sel == "Selecciona un usuario":
            st.error("Debes seleccionar un usuario.")
            return
        if tarea_id is None:
            st.error("Debes seleccionar una tarea.")
            return
        if tienda_id is None:
            st.error("Debes seleccionar una tienda.")
            return

        payload = {
            "turno": turno,
            "nombre": nombre.strip(),
            "tarea_id": tarea_id,
            "tarea_nombre": tarea_nombre,
            "tienda_id": tienda_id,
            "numero_guia": numero_guia.strip() or None,
            "observacion": observacion.strip() or None,
            "tipo_error": tipo_error,
            "created_by": user.get("id"),
        }
        create_incidente(supabase, payload)
        st.success("Incidente registrado.")
        st.rerun()

    st.divider()
    st.markdown("### Historial de incidentes")
    incidents = list_incidentes(supabase)
    if not incidents:
        st.info("Todavia no hay incidentes registrados.")
        return

    tienda_by_id = {t.get("id"): t.get("nombre") for t in tiendas}
    rows = []
    for item in incidents:
        created_at = item.get("created_at")
        created_display = created_at
        if created_at:
            try:
                dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                created_display = dt.astimezone(ZoneInfo("America/Lima")).strftime("%d/%m/%Y %H:%M")
            except Exception:
                created_display = created_at
        rows.append(
            {
                "Fecha": created_display,
                "Turno": item.get("turno"),
                "Nombre": item.get("nombre"),
                "Tarea": item.get("tarea_nombre"),
                "Tienda": tienda_by_id.get(item.get("tienda_id")),
                "Guia": item.get("numero_guia"),
                "Observacion": item.get("observacion"),
                "Tipo Error": item.get("tipo_error"),
            }
        )

    st.dataframe(pd.DataFrame(rows), width="stretch")
