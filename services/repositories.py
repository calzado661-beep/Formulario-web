from typing import Any

from supabase import Client

from services.activity_catalog import ACTIVIDADES
from services.scoring import get_activity_capture_mode
from services.security import hash_password


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
        return supabase.table("tarea").select("*").execute().data or []

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
            data = supabase.table("tarea").select("*").or_(cond).execute().data or []
            if data:
                return data
        except Exception:
            continue

    return supabase.table("tarea").select("*").execute().data or []


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
    return supabase.table("tarea").select("*").order("id", desc=False).execute().data or []


def create_task(supabase: Client, payload: dict[str, Any]) -> None:
    supabase.table("tarea").insert(payload).execute()


def list_activities_catalog(supabase: Client) -> list[dict[str, Any]]:
    try:
        data = supabase.table("actividades_catalogo").select("*").order("actividad", desc=False).execute().data or []
        if data:
            return data
    except Exception:
        pass
    return [{"id": -i, **a} for i, a in enumerate(ACTIVIDADES, start=1)]


def ensure_activity(supabase: Client, activity_name: str) -> int | None:
    try:
        found = (
            supabase.table("actividades_catalogo")
            .select("id")
            .eq("actividad", activity_name)
            .limit(1)
            .execute()
            .data
            or []
        )
        if found:
            return int(found[0]["id"])

        mode, unit = get_activity_capture_mode(activity_name)
        payload = {
            "actividad": activity_name,
            "tipo_medicion": mode,
            "unidad_base": unit,
            "activo": True,
        }
        created = supabase.table("actividades_catalogo").insert(payload).execute().data or []
        if created:
            return int(created[0]["id"])
    except Exception:
        return None
    return None


def create_worker_activity_log(supabase: Client, payload: dict[str, Any]) -> None:
    supabase.table("registro_actividades").insert(payload).execute()


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
