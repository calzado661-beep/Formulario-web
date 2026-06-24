import re
from typing import Any

from supabase import Client

from services.scoring import get_activity_capture_mode
from services.security import hash_password

_TASK_TABLE_NAME: str | None = None
_ACTIVITY_LOG_RESOURCE_NAME: str | None = None
_MISSING_COLUMN_RE = re.compile(r"Could not find the '([^']+)' column")
_MISSING_RESOURCE_RE = re.compile(r"Could not find the table 'public\.([^']+)'")


def _task_table_name(supabase: Client) -> str:
    global _TASK_TABLE_NAME
    if _TASK_TABLE_NAME:
        return _TASK_TABLE_NAME

    for table_name in ("tarea", "tareas"):
        try:
            supabase.table(table_name).select("id").limit(1).execute()
            _TASK_TABLE_NAME = table_name
            return table_name
        except Exception:
            continue

    raise RuntimeError("No se encontró la tabla de tareas. Asegúrate de que exista 'public.tarea' o 'public.tareas'.")


def _activity_log_resource_name(supabase: Client) -> str:
    global _ACTIVITY_LOG_RESOURCE_NAME
    if _ACTIVITY_LOG_RESOURCE_NAME:
        return _ACTIVITY_LOG_RESOURCE_NAME

    for resource_name in ("v_registro_actividades", "registros_tareas", "registro_actividades"):
        try:
            supabase.table(resource_name).select("*").limit(1).execute()
            _ACTIVITY_LOG_RESOURCE_NAME = resource_name
            return resource_name
        except Exception:
            continue

    raise RuntimeError(
        "No se encontro 'public.registros_tareas', 'public.registro_actividades' ni "
        "'public.v_registro_actividades'. "
        "Ejecuta el script sql/003_reparar_registro_actividades.sql en Supabase."
    )


def _activity_log_resource_candidates(supabase: Client) -> list[str]:
    return ["registros_tareas", "registro_actividades"]


def _activity_log_user_columns(resource_name: str) -> tuple[str, ...]:
    if resource_name in {"registros_tareas", "v_registro_actividades"}:
        return ("usuario_id", "trabajador_id")
    return ("trabajador_id", "usuario_id")


def _normalize_activity_log(row: dict[str, Any]) -> dict[str, Any]:
    normalized = row.copy()
    if "usuario_id" in normalized and "trabajador_id" not in normalized:
        normalized["trabajador_id"] = normalized.get("usuario_id")
    if "observacion" in normalized and "detalle" not in normalized:
        normalized["detalle"] = normalized.get("observacion")
    if "dato_extra" in normalized and "tiempo_minutos" not in normalized:
        normalized["tiempo_minutos"] = normalized.get("dato_extra")
    if "tarea" in normalized and "actividad_nombre" not in normalized:
        normalized["actividad_nombre"] = normalized.get("tarea")
    return normalized


def _normalize_activity_logs(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_normalize_activity_log(row) for row in rows]


def list_task_score_ranges(supabase: Client, tarea_id: Any) -> list[dict[str, Any]]:
    return (
        supabase.table("rangos_puntaje")
        .select("*")
        .eq("tarea_id", tarea_id)
        .order("puntos", desc=False)
        .execute()
        .data
        or []
    )


def delete_task_score_ranges(supabase: Client, tarea_id: Any) -> None:
    supabase.table("rangos_puntaje").delete().eq("tarea_id", tarea_id).execute()


def set_task_score_ranges(supabase: Client, tarea_id: Any, ranges: list[dict[str, Any]]) -> None:
    delete_task_score_ranges(supabase, tarea_id)
    if not ranges:
        return
    normalized = []
    for item in ranges:
        normalized.append(
            {
                "tarea_id": tarea_id,
                "cantidad_desde": item.get("cantidad_desde"),
                "cantidad_hasta": item.get("cantidad_hasta"),
                "puntos": item.get("puntos"),
            }
        )
    supabase.table("rangos_puntaje").insert(normalized).execute()


def select_users(supabase: Client) -> list[dict[str, Any]]:
    cols = "id,nombre,email,rol,activo,created_at"
    try:
        return supabase.table("usuarios").select(cols).order("id", desc=False).execute().data or []
    except Exception:
        return supabase.table("usuarios").select("*").order("id", desc=False).execute().data or []


def verify_user(supabase: Client, email: str, password: str) -> dict[str, Any] | None:
    hashed = hash_password(password)
    try:
        r = supabase.table("usuarios").select("*").eq("email", email).eq("password_hash", hashed).limit(1).execute()
        if r.data:
            return r.data[0]
    except Exception:
        pass
    try:
        r = supabase.table("usuarios").select("*").eq("email", email).eq("password", hashed).limit(1).execute()
        if r.data:
            return r.data[0]
    except Exception:
        pass
    return None


def get_tasks_for_user(supabase: Client, user: dict[str, Any]) -> list[dict[str, Any]]:
    role = (user.get("rol") or "").lower()
    if role != "trabajador":
        return supabase.table(_task_table_name(supabase)).select("*").execute().data or []

    user_id = user.get("id")
    email = user.get("email")
    filters = [
        f"asignado_a.eq.{user_id}",
        f"trabajador_id.eq.{user_id}",
        f"usuario_id.eq.{user_id}",
        f"email_trabajador.eq.{email}",
        f"correo_trabajador.eq.{email}",
        f"email.eq.{email}",
    ]
    for cond in filters:
        try:
            data = supabase.table(_task_table_name(supabase)).select("*").or_(cond).execute().data or []
            if data:
                return data
        except Exception:
            continue

    return supabase.table(_task_table_name(supabase)).select("*").execute().data or []


def create_user(supabase: Client, payload: dict[str, Any], plain_password: str) -> None:
    data = payload.copy()
    pwd_hash = hash_password(plain_password)
    try:
        data["password_hash"] = pwd_hash
        supabase.table("usuarios").insert(data).execute()
    except Exception:
        data.pop("password_hash", None)
        data["password"] = pwd_hash
        supabase.table("usuarios").insert(data).execute()


def update_user(supabase: Client, user_id: Any, changes: dict[str, Any], new_password: str | None = None) -> None:
    data = changes.copy()
    if new_password:
        pwd_hash = hash_password(new_password)
        try:
            data["password_hash"] = pwd_hash
            supabase.table("usuarios").update(data).eq("id", user_id).execute()
            return
        except Exception:
            data.pop("password_hash", None)
            data["password"] = pwd_hash
    supabase.table("usuarios").update(data).eq("id", user_id).execute()


def delete_user(supabase: Client, user_id: Any) -> None:
    supabase.table("usuarios").delete().eq("id", user_id).execute()


def list_tasks(supabase: Client) -> list[dict[str, Any]]:
    return supabase.table(_task_table_name(supabase)).select("*").order("id", desc=False).execute().data or []

def _task_table_columns(supabase: Client) -> list[str] | None:
    try:
        rows = supabase.table(_task_table_name(supabase)).select("*").limit(1).execute().data
        if rows and len(rows) > 0:
            return list(rows[0].keys())
    except Exception:
        pass
    return None


def _filter_payload_columns(payload: dict[str, Any], columns: list[str] | None) -> dict[str, Any]:
    if not columns:
        return payload
    return {key: value for key, value in payload.items() if key in columns}


def _missing_payload_column(error: Exception) -> str | None:
    match = _MISSING_COLUMN_RE.search(str(error))
    if not match:
        return None
    return match.group(1)


def _is_missing_resource(error: Exception) -> bool:
    return _MISSING_RESOURCE_RE.search(str(error)) is not None


def _activity_log_insert_payload(resource_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    if resource_name != "registros_tareas":
        return payload.copy()

    mapped = {
        "usuario_id": payload.get("usuario_id") or payload.get("trabajador_id"),
        "tarea_id": payload.get("tarea_id"),
        "fecha_registro": payload.get("fecha_registro"),
        "cantidad": payload.get("cantidad"),
        "turno": payload.get("turno"),
        "observacion": payload.get("observacion") or payload.get("detalle"),
        "puntos_obtenidos": payload.get("puntos_obtenidos"),
    }
    if payload.get("tiempo_minutos") is not None:
        mapped["dato_extra"] = payload.get("tiempo_minutos")

    return {key: value for key, value in mapped.items() if value is not None}


def create_task(supabase: Client, payload: dict[str, Any]) -> dict[str, Any] | None:
    columns = _task_table_columns(supabase)
    filtered_payload = _filter_payload_columns(payload, columns)
    result = supabase.table(_task_table_name(supabase)).insert(filtered_payload).select("id").execute()
    return result.data[0] if result.data else None


def update_task(supabase: Client, task_id: Any, changes: dict[str, Any], existing_row: dict[str, Any] | None = None) -> None:
    if existing_row is not None:
        columns = list(existing_row.keys())
        changes = _filter_payload_columns(changes, columns)
    supabase.table(_task_table_name(supabase)).update(changes).eq("id", task_id).execute()


def create_worker_activity_log(supabase: Client, payload: dict[str, Any]) -> None:
    payload = payload.copy()
    payload.pop("created_at", None)

    attempts: list[dict[str, Any]] = []
    optional_groups = [
        (),
        ("created_at",),
        ("actividad_id",),
        ("actividad_nombre",),
        ("turno",),
        ("created_at", "actividad_id"),
        ("created_at", "actividad_nombre"),
        ("created_at", "turno"),
        ("actividad_id", "actividad_nombre"),
        ("created_at", "actividad_id", "actividad_nombre"),
        ("created_at", "actividad_id", "actividad_nombre", "turno"),
    ]
    seen_attempts: set[tuple[str, ...]] = set()
    for optional_fields in optional_groups:
        candidate = payload.copy()
        for field in optional_fields:
            candidate.pop(field, None)
        signature = tuple(candidate.keys())
        if signature in seen_attempts:
            continue
        seen_attempts.add(signature)
        attempts.append(candidate)

    last_err: Exception | None = None
    for resource_name in _activity_log_resource_candidates(supabase):
        for candidate in attempts:
            current_candidate = _activity_log_insert_payload(resource_name, candidate)
            for _ in range(len(current_candidate) + 1):
                try:
                    supabase.table(resource_name).insert(current_candidate).execute()
                    return
                except Exception as e:
                    if _is_missing_resource(e):
                        if last_err is None:
                            last_err = e
                        break
                    last_err = e
                    missing_column = _missing_payload_column(e)
                    if not missing_column or missing_column not in current_candidate:
                        break
                    current_candidate.pop(missing_column, None)

    if last_err:
        raise last_err


def list_worker_activity_logs(supabase: Client, trabajador_id: Any) -> list[dict[str, Any]]:
    for resource_name in ("v_registro_actividades", "registros_tareas", "registro_actividades"):
        for user_column in _activity_log_user_columns(resource_name):
            try:
                rows = (
                    supabase.table(resource_name)
                    .select("*")
                    .eq(user_column, trabajador_id)
                    .order("fecha_registro", desc=True)
                    .execute()
                    .data
                    or []
                )
                return _normalize_activity_logs(rows)
            except Exception:
                try:
                    rows = (
                        supabase.table(resource_name)
                        .select("*")
                        .eq(user_column, trabajador_id)
                        .order("created_at", desc=True)
                        .execute()
                        .data
                        or []
                    )
                    return _normalize_activity_logs(rows)
                except Exception:
                    try:
                        rows = (
                            supabase.table(resource_name)
                            .select("*")
                            .eq(user_column, trabajador_id)
                            .execute()
                            .data
                            or []
                        )
                        return _normalize_activity_logs(rows)
                    except Exception:
                        continue
    return []


def list_all_activity_logs(supabase: Client) -> list[dict[str, Any]]:
    for resource_name in ("v_registro_actividades", "registros_tareas", "registro_actividades"):
        try:
            rows = (
                supabase.table(resource_name)
                .select("*")
                .order("fecha_registro", desc=True)
                .execute()
                .data
                or []
            )
            return _normalize_activity_logs(rows)
        except Exception:
            try:
                rows = (
                    supabase.table(resource_name)
                    .select("*")
                    .order("created_at", desc=True)
                    .execute()
                    .data
                    or []
                )
                return _normalize_activity_logs(rows)
            except Exception:
                try:
                    rows = supabase.table(resource_name).select("*").execute().data or []
                    return _normalize_activity_logs(rows)
                except Exception:
                    continue
    return []
