import base64
import os
import streamlit as st

@st.cache_data
def _get_base64_video(video_path: str) -> str | None:
    """Lee un archivo de video y lo devuelve en formato base64."""
    try:
        if os.path.exists(video_path):
            with open(video_path, "rb") as f:
                return base64.b64encode(f.read()).decode()
    except Exception:
        pass
    return None

def apply_styles():
    """
    Aplica estilos personalizados CSS a la aplicación.
    """
    st.markdown("""
        <style>
            /* Ocultar el botón de colapsar el sidebar (hacerlo estático) */
            [data-testid="collapsedControl"] {
                display: none;
            }

            /* Fondo general de la aplicación */
            footer,
            [data-testid="stDecoration"],
            [data-testid="stStatusWidget"],
            .viewerBadge_container__1QSob,
            .viewerBadge_link__1S137,
            .viewerBadge_text__1JaDK {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
            }

            .stApp {
                background-image: url("https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop");
                background-size: cover;
                background-position: center;
                background-attachment: fixed;
                background-repeat: no-repeat;
            }
            
            /* Contenedor principal con fondo semi-transparente para legibilidad */
            .main .block-container {
                background-color: rgba(255, 255, 255, 0.8);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                padding: 3rem;
                border-radius: 1rem;
                margin-top: 1.5rem;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            }

            /* Estilo difuminado (glassmorphism) para los expanders de detalle de trabajadores */
            div[data-testid="stExpander"] {
                background-color: rgba(255, 255, 255, 0.2) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                border-radius: 0.8rem !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
            }

            /* Estilo para los mensajes informativos de "sin registros" (st.caption) */
            div[data-testid="stCaptionContainer"] {
                background-color: rgba(255, 255, 255, 0.2) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                padding: 0.6rem 1rem !important;
                border-radius: 0.6rem !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                margin-bottom: 0.5rem !important;
            }

            /* Estilo para el contenedor agrupador de detalles (st.container con borde) */
            div[data-testid="stVerticalBlockBorderWrapper"] {
                background-color: rgba(255, 255, 255, 0.3) !important;
                backdrop-filter: blur(20px) !important;
                -webkit-backdrop-filter: blur(20px) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 1rem !important;
            }

            /* Estilo personalizado para el Sidebar */
            [data-testid="stSidebar"] {
                background-color: rgba(0, 0, 0, 0.6) !important;
                backdrop-filter: blur(15px) !important;
                -webkit-backdrop-filter: blur(15px) !important;
                border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
                padding-top: 1rem;
            }
            
            /* Color de texto claro para legibilidad en el sidebar oscuro */
            [data-testid="stSidebar"] h1, [data-testid="stSidebar"] h2, [data-testid="stSidebar"] h3, [data-testid="stSidebar"] p, [data-testid="stSidebar"] span, [data-testid="stSidebar"] label {
                color: #ffffff !important;
            }
            
            /* Títulos */
            h1, h2, h3 {
                color: #1e3a8a;
                font-weight: bold;
            }
            
            /* Botones */
            .stButton > button {
                border-radius: 5px;
                transition: 0.2s;
                font-weight: 600;
            }

            .stButton > button:hover {
                border: 1px solid #1e3a8a;
            }
            
            /* Input Fields */
            .stTextInput > div > div > input {
                border-radius: 6px;
            }
            
            /* Estilo de los bloques de información (st.info) */
            .stAlert {
                border-radius: 10px;
                border: none;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            
            /* Métricas */
            [data-testid="stMetricValue"] {
                color: #1e3a8a;
            }

            /* Divisores */
            hr {
                margin-top: 1rem;
            }
        </style>
    """, unsafe_allow_html=True)

def add_login_video_background(video_file: str = "fondovideo.mp4"):
    """
    Añade un video de fondo para la pantalla de login.
    """
    video_b64 = _get_base64_video(video_file)
    if video_b64:
        st.markdown(f"""
            <style>
                #bgVideo {{
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    z-index: -1;
                    filter: brightness(0.5);
                }}
                .stApp {{
                    background: none !important;
                }}
            </style>
            <video autoplay muted loop id="bgVideo">
                <source src="data:video/mp4;base64,{video_b64}" type="video/mp4">
            </video>
        """, unsafe_allow_html=True)
