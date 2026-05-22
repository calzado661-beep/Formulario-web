import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=True)


def get_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value

    try:
        value = str(st.secrets.get(name, "")).strip()
    except Exception:
        value = ""

    if not value:
        st.error(f"Falta la variable de entorno: {name}")
        st.stop()

    return value
