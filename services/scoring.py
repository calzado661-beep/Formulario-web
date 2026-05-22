from __future__ import annotations

import unicodedata


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace("?", "o")
    s = "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    return " ".join(s.split())


def _points_by_threshold(value: float, thresholds: list[tuple[float, int]]) -> int:
    points = 0
    for min_value, score in thresholds:
        if value >= min_value:
            points = score
    return points


def get_activity_capture_mode(task_name: str) -> tuple[str, str | None]:
    name = _norm(task_name)

    cumplimiento_tasks = [
        "sacar basura",
        "recepcion de guia",
        "apoyo a tienda",
        "limpieza",
        "transporte de bulto (en grupo)",
        "transporte de bulto (solo)",
        "transporte de bulto (montacarga)",
        "cuadre lote (supervision)",
        "cuadre lote (impresion codigos)",
        "pedido por mayor",
    ]
    if any(k in name for k in cumplimiento_tasks):
        return "cumplimiento", None

    quantity_units = {
        "codificacion": "pares",
        "micro inventario": "pares",
        "clasificacion": "pares",
        "levantar informacion (merma)": "cajas",
        "recepcion de mercaderia (descargar)": "contenedores",
    }
    for k, u in quantity_units.items():
        if k in name:
            return "cantidad", u

    # Actividades por tiempo según el Excel
    time_tasks = [
        "visita de tienda (atencion)",
        "reposicion",
        "apoyo inter-area",
        "apoyo inter area",
        "pistoleado y embalado (despacho)",
        "envio nuevo",
    ]
    if any(k in name for k in time_tasks):
        return "tiempo", "minutos"

    # Por defecto, si no coincide con ninguna regla: cantidad.
    return "cantidad", "unidades"


def calculate_points(task_name: str, cantidad: float | None, tiempo_minutos: int | None, cumplimiento: bool | None) -> int:
    name = _norm(task_name)

    if "codificacion" in name:
        return _points_by_threshold(float(cantidad or 0), [(15, 1), (50, 2), (100, 3), (150, 4), (300, 5), (350, 6), (400, 7), (450, 8), (500, 9), (600, 10)])

    if "micro inventario" in name:
        return _points_by_threshold(float(cantidad or 0), [(50, 1), (150, 2), (250, 3), (350, 4), (450, 5), (550, 6), (650, 7), (750, 8), (850, 9), (1000, 10)])

    if "clasificacion" in name:
        return _points_by_threshold(float(cantidad or 0), [(50, 1), (150, 3), (400, 6)])

    if "levantar informacion" in name or "merma" in name:
        return _points_by_threshold(float(cantidad or 0), [(2, 1), (4, 2), (6, 3), (8, 4), (10, 5), (12, 6), (15, 7), (20, 10)])

    if "recepcion de mercaderia" in name:
        return _points_by_threshold(float(cantidad or 0), [(1, 3), (2, 6), (3, 9)])

    if "pistoleado" in name or "embalado" in name or "envio nuevo" in name:
        return _points_by_threshold(float(tiempo_minutos or 0), [(10, 1), (40, 2), (80, 3), (120, 4), (180, 5), (240, 6), (300, 7), (360, 8), (420, 9), (480, 10)])

    if "visita de tienda" in name or "reposicion" in name:
        return _points_by_threshold(float(tiempo_minutos or 0), [(60, 3), (90, 4), (150, 5)])

    if "apoyo inter-area" in name or "apoyo inter area" in name:
        return _points_by_threshold(float(tiempo_minutos or 0), [(120, 3), (180, 5), (420, 7)])

    fixed = {
        "sacar basura": 1,
        "limpieza": 1,
        "apoyo a tienda": 7,
        "transporte de bulto (en grupo)": 4,
        "transporte de bulto (montacarga)": 2,
        "cuadre lote (supervision)": 2,
        "cuadre lote (impresion codigos)": 2,
        "pedido por mayor": 2,
    }
    for k, p in fixed.items():
        if k in name:
            return p if cumplimiento else 0

    if "transporte de bulto (solo)" in name:
        return 0
    if "recepcion de guia" in name:
        return 0

    return 1 if cumplimiento else 0
