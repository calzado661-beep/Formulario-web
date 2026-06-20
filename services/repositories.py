from typing import Any

from supabase import Client

from services.scoring import get_activity_capture_mode
from services.security import hash_password

_TASK_TABLE_NAME: str | None = None


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


def list_task_score_ranges(supabase: Client, tarea_id: Any) -> list[dict[str, Any]]:
    return (
        supabase.table("rangos_puntaje")
        .select("*")
        .eq("tarea_id", tarea_id)
        .order("cantidad_desde", desc=False)
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
    attempts: list[dict[str, Any]] = []
    attempts.append(payload.copy())

    no_activity_id = payload.copy()
    no_activity_id.pop("actividad_id", None)
    attempts.append(no_activity_id)

    no_activity_name = payload.copy()
    no_activity_name.pop("actividad_nombre", None)
    attempts.append(no_activity_name)

    minimal = payload.copy()
    minimal.pop("actividad_id", None)
    minimal.pop("actividad_nombre", None)
    attempts.append(minimal)

    last_err: Exception | None = None
    for candidate in attempts:
        try:
            supabase.table("registro_actividades").insert(candidate).execute()
            return
        except Exception as e:
            last_err = e
            continue

    if last_err:
        raise last_err


def list_worker_activity_logs(supabase: Client, trabajador_id: Any) -> list[dict[str, Any]]:
    try:
        return (
            supabase.table("registro_actividades")
            .select("*")
            .eq("trabajador_id", trabajador_id)
            .order("fecha_registro", desc=True)
            .execute()
            .data
            or []
        )
    except Exception:
        try:
            return (
                supabase.table("registro_actividades")
                .select("*")
                .eq("trabajador_id", trabajador_id)
                .order("created_at", desc=True)
                .execute()
                .data
                or []
            )
        except Exception:
            try:
                return (
                    supabase.table("registro_actividades")
                    .select("*")
                    .eq("trabajador_id", trabajador_id)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                return []


def list_all_activity_logs(supabase: Client) -> list[dict[str, Any]]:
    try:
        return (
            supabase.table("registro_actividades")
            .select("*")
            .order("fecha_registro", desc=True)
            .execute()
            .data
            or []
        )
    except Exception:
        return []
