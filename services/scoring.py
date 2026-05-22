from __future__ import annotations

import unicodedata


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    # Limpieza profunda de caracteres y símbolos comunes en errores de codificación, incluyendo 'ñ'
    replacements = {
        "?": "o", "ó": "o", "á": "a", "é": "e", "í": "i", "ú": "u",
        "(": " ", ")": " ", "-": " "
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


def get_activity_capture_mode(task_name: str) -> tuple[str, str | None]:
    name = _norm(task_name)

    # New: Activities by turno selection
    turno_tasks = [
        "visitar tienda",
        "visita de tienda",
        "apoyo tienda",
        "apoyo a tienda",
        "apoyo inter area", # _norm convierte inter-area en inter area
        "reposicion",
        "clasificacion",
    ]
    if any(k in name for k in turno_tasks):
        return "turno", None

    cumplimiento_tasks = [
        "sacar basura", # 1p
        "limpieza",     # 1p
        "transporte de bulto en grupo", # 2p
        "transporte de bulto solo",     # 4p
        "transporte de bulto",            # Captura cualquier variante de transporte
        "cuadre lote supervision",     # 2p
        "cuadre lote impresion codigos", # 2p
        "pedido por mayor", # 2p
        "recepcion de guia"
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

    # Actividades por tiempo según el Excel
    time_tasks = [
        "pistoleado y embalado despacho",
        "envio nuevo",
    ]
    if any(k in name for k in time_tasks):
        return "tiempo", "minutos"

    # Por defecto, si no coincide con ninguna regla: cantidad.
    return "cantidad", "unidades"


def calculate_points(task_name: str, cantidad: float | None, tiempo_minutos: int | None, cumplimiento: bool | None) -> int:
    name = _norm(task_name)

    # New: Points for turno-based activities
    if "visitar tienda" in name or "visita de tienda" in name:
        if cantidad == 1: # turno mñn o tarde
            return 3
        elif cantidad == 2: # turno mñn y tarde
            return 6
        return 0 # Default if no valid quantity
    if "apoyo a tienda" in name or "apoyo tienda" in name:
        if cantidad == 1: # turno mñn o tarde
            return 4
        elif cantidad == 2: # turno mñn y tarde
            return 8
        return 0
    if "apoyo inter area" in name:
        if cantidad == 1: # turno mñn o tarde
            return 3
        elif cantidad == 2: # turno mñn y tarde
            return 7
        return 0
    if "reposicion" in name:
        if cantidad == 1: # turno mñn o tarde
            return 3
        elif cantidad == 2: # turno mñn y tarde
            return 6
        return 0
    if "clasificacion" in name:
        if cantidad == 1: # turno mñn o tarde
            return 3
        elif cantidad == 2: # turno mñn y tarde
            return 6
        return 0

    if "codificacion" in name:
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
        "sacar basura": 1, # 1p
        "limpieza": 1, # 1p
        "transporte de bulto en grupo": 2, # 2p
        "transporte de bulto montacarga": 2, # 2p
        "transporte de bulto solo": 4, # 4p
        "cuadre lote supervision": 2,
        "cuadre lote impresion codigos": 2,
        "pedido por mayor": 2,
    }
    for k, p in fixed.items():
        if k in name:
            return p if cumplimiento else 0
    if "recepcion de guia" in name:
        return 0

    return 1 if cumplimiento else 0
