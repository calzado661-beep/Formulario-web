from __future__ import annotations

from typing import Any
import unicodedata


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    replacements = {
        "?": "o",
        "\u00f3": "o",
        "\u00e1": "a",
        "\u00e9": "e",
        "\u00ed": "i",
        "\u00fa": "u",
        "(": " ",
        ")": " ",
        "-": " ",
    }
    for old, new in replacements.items():
        s = s.replace(old, new)
    s = "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    return " ".join(s.split())


def _points_by_threshold(value: float, thresholds: list[tuple[float, int]]) -> int:
    points = 0
    for min_value, score in thresholds:
        if value >= min_value:
            points = score
    return points


def _task_title(task: dict[str, Any] | None) -> str:
    return str((task or {}).get("titulo") or (task or {}).get("nombre") or "")


def get_activity_capture_mode(task_name: str) -> tuple[str, str | None]:
    name = _norm(task_name)

    turno_tasks = [
        "visitar tienda",
        "visita de tienda",
        "apoyo tienda",
        "apoyo a tienda",
        "apoyo inter area",
        "reposicion",
        "repocicion",
        "clasificacion",
    ]
    if any(k in name for k in turno_tasks):
        return "turno", None

    cumplimiento_tasks = [
        "sacar basura",
        "limpieza",
        "transporte de bulto en grupo",
        "transporte de bulto solo",
        "transporte de bulto",
        "cuadre lote supervision",
        "cuadre lote impresion codigos",
        "pedido por mayor",
        "recepcion de guia",
    ]
    if any(k in name for k in cumplimiento_tasks):
        return "cumplimiento", None

    quantity_units = {
        "codificacion": "pares",
        "micro inventario": "pares",
        "levantar informacion merma": "cajas",
        "recepcion de mercaderia descargar": "contenedores",
    }
    for k, u in quantity_units.items():
        if k in name:
            return "cantidad", u

    time_tasks = [
        "pistoleado y embalado despacho",
        "envio nuevo",
    ]
    if any(k in name for k in time_tasks):
        return "tiempo", "minutos"

    return "cantidad", "unidades"


def _legacy_calculate_points(task_name: str, cantidad: float | None, tiempo_minutos: int | None, cumplimiento: bool | None) -> int:
    name = _norm(task_name)

    if "visitar tienda" in name or "visita de tienda" in name:
        if cantidad == 1:
            return 3
        if cantidad == 2:
            return 6
        return 0
    if "apoyo a tienda" in name or "apoyo tienda" in name:
        if cantidad == 1:
            return 4
        if cantidad == 2:
            return 8
        return 0
    if "apoyo inter area" in name:
        if cantidad == 1:
            return 3
        if cantidad == 2:
            return 7
        return 0
    if "reposicion" in name or "repocicion" in name:
        if cantidad == 1:
            return 3
        if cantidad == 2:
            return 6
        return 0
    if "clasificacion" in name:
        if cantidad == 1:
            return 3
        if cantidad == 2:
            return 6
        return 0

    if "codificacion" in name or "recepcion de guia" in name:
        return _points_by_threshold(float(cantidad or 0), [(15, 1), (50, 2), (100, 3), (150, 4), (300, 5), (350, 6), (400, 7), (450, 8), (500, 9), (600, 10)])

    if "micro inventario" in name:
        return _points_by_threshold(float(cantidad or 0), [(50, 1), (150, 2), (250, 3), (350, 4), (450, 5), (550, 6), (650, 7), (750, 8), (850, 9), (1000, 10)])

    if "levantar informacion" in name or "merma" in name:
        return _points_by_threshold(float(cantidad or 0), [(2, 1), (4, 2), (6, 3), (8, 4), (10, 5), (12, 6), (15, 7), (20, 10)])

    if "recepcion de mercaderia" in name:
        return _points_by_threshold(float(cantidad or 0), [(1, 3), (2, 6), (3, 9)])

    if "pistoleado" in name or "embalado" in name or "envio nuevo" in name:
        return _points_by_threshold(float(tiempo_minutos or 0), [(10, 1), (40, 2), (80, 3), (120, 4), (180, 5), (240, 6), (300, 7), (360, 8), (420, 9), (480, 10)])

    fixed = {
        "sacar basura": 1,
        "limpieza": 1,
        "transporte de bulto en grupo": 2,
        "transporte de bulto montacarga": 2,
        "transporte de bulto solo": 4,
        "cuadre lote supervision": 2,
        "cuadre lote impresion codigos": 2,
        "pedido por mayor": 2,
    }
    for k, p in fixed.items():
        if k in name:
            return p if cumplimiento else 0
    return 1 if cumplimiento else 0


def calculate_points(task: dict[str, Any] | None, cantidad: float | None, tiempo_minutos: int | None, cumplimiento: bool | None) -> int:
    task_name = _task_title(task)
    tipo_medicion = str(task.get("tipo_medicion") if task else "").strip().lower()

    if tipo_medicion == "cumplimiento":
        tipo_medicion = "fijo"

    if tipo_medicion not in {"cantidad", "fijo", "tiempo", "turno"}:
        return _legacy_calculate_points(task_name, cantidad, tiempo_minutos, cumplimiento)

    if tipo_medicion == "cantidad":
        ranges = task.get("rangos_puntaje") if task else None
        if ranges:
            ordered_ranges = []
            for rango in ranges:
                try:
                    punto = int(rango.get("puntos") or 0)
                except Exception:
                    punto = 0
                try:
                    minimo = float(rango.get("cantidad_desde") or 0)
                except Exception:
                    minimo = 0.0
                ordered_ranges.append((punto, minimo, rango))

            ordered_ranges.sort(key=lambda item: item[0] if item[0] > 0 else 999)
            cantidad_val = float(cantidad or 0)
            candidate_points = 0
            for punto, minimo, rango in ordered_ranges:
                hasta = rango.get("cantidad_hasta")
                if hasta is None:
                    if cantidad_val >= minimo:
                        candidate_points = max(candidate_points, punto)
                else:
                    try:
                        hasta_val = float(hasta)
                    except Exception:
                        hasta_val = None
                    if hasta_val is None:
                        if cantidad_val >= minimo:
                            candidate_points = max(candidate_points, punto)
                    elif cantidad_val >= minimo and cantidad_val <= hasta_val:
                        candidate_points = max(candidate_points, punto)
            if candidate_points:
                return candidate_points

        if ranges:
            for rango in ranges:
                desde = float(rango.get("cantidad_desde") or 0)
                hasta = rango.get("cantidad_hasta")
                puntos = int(rango.get("puntos") or 0)
                cantidad_val = float(cantidad or 0)
                if hasta is None:
                    if cantidad_val >= desde:
                        return puntos
                else:
                    try:
                        hasta_val = float(hasta)
                    except Exception:
                        hasta_val = None
                    if hasta_val is None:
                        if cantidad_val >= desde:
                            return puntos
                    elif cantidad_val >= desde and cantidad_val <= hasta_val:
                        return puntos
        return 0

    if tipo_medicion == "fijo":
        puntaje = task.get("puntaje_fijo")
        if puntaje is None:
            puntaje = task.get("puntaje")
        if puntaje is None:
            return 0
        return int(puntaje) if cumplimiento else 0

    if tipo_medicion == "turno":
        simple = task.get("puntaje_turno_simple")
        if simple is None:
            simple = task.get("puntos_turno_simple")
        completo = task.get("puntaje_turno_completo")
        if completo is None:
            completo = task.get("puntos_turno_completo")

        cantidad_val = int(float(cantidad or 0))
        if cantidad_val == 1:
            return int(simple or 0)
        if cantidad_val == 2:
            return int(completo or 0)
        return 0

    if tipo_medicion == "tiempo":
        return _legacy_calculate_points(task_name, cantidad, tiempo_minutos, cumplimiento)

    return 0
