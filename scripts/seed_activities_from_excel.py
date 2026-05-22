from __future__ import annotations

from pathlib import Path

import pandas as pd
from dotenv import dotenv_values
from supabase import create_client

EXCEL_PATH = Path(r"c:\Users\ferna\Downloads\tabla_puntuacion_actividades.xlsx")


def infer_type_and_unit(row: pd.Series) -> tuple[str, str | None]:
    vals = [str(v).strip().lower() for v in row.tolist() if pd.notna(v)]
    joined = " ".join(vals)

    if "cumplimiento" in joined:
        return "cumplimiento", None
    if "hora" in joined or "minuto" in joined or "día" in joined:
        return "tiempo", "minutos"
    if "par" in joined:
        return "cantidad", "pares"
    if "caja" in joined:
        return "cantidad", "cajas"
    if "contenedor" in joined:
        return "cantidad", "contenedores"
    return "cantidad", "unidades"


def main() -> None:
    cfg = dotenv_values(".env")
    url = cfg.get("SUPABASE_URL")
    key = cfg.get("SUPABASE_SECRET_KEY") or cfg.get("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise SystemExit("Faltan variables en .env")

    if not EXCEL_PATH.exists():
        raise SystemExit(f"No existe el Excel: {EXCEL_PATH}")

    supabase = create_client(url, key)
    df = pd.read_excel(EXCEL_PATH, sheet_name="Tabla de Puntos").fillna("")

    point_cols = [c for c in df.columns if c != "Actividad"]

    for _, row in df.iterrows():
        actividad = str(row.get("Actividad", "")).strip()
        if not actividad:
            continue

        tipo, unidad = infer_type_and_unit(row[point_cols])

        existing = (
            supabase.table("actividades_catalogo")
            .select("id")
            .eq("actividad", actividad)
            .limit(1)
            .execute()
            .data
            or []
        )

        payload = {
            "actividad": actividad,
            "tipo_medicion": tipo,
            "unidad_base": unidad,
            "activo": True,
        }

        if existing:
            supabase.table("actividades_catalogo").update(payload).eq("id", existing[0]["id"]).execute()
            print("ACTUALIZADA:", actividad)
        else:
            supabase.table("actividades_catalogo").insert(payload).execute()
            print("CREADA:", actividad)


if __name__ == "__main__":
    main()
