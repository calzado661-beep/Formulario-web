import streamlit as st

def apply_styles():
    """
    Aplica estilos personalizados CSS a la aplicación.
    """
    st.markdown("""
        <style>
            /* Fondo general de la aplicación */
            .stApp {
                background-image: url("https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop");
                background-size: cover;
                background-position: center;
                background-attachment: fixed;
                background-repeat: no-repeat;
            }
            
            /* Contenedor principal con fondo semi-transparente para legibilidad */
            .main .block-container {
                background-color: rgba(255, 255, 255, 0.95);
                padding: 3rem;
                border-radius: 1rem;
                margin-top: 1.5rem;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            }

            /* Estilo personalizado para el Sidebar */
            [data-testid="stSidebar"] {
                background-color: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(12px);
                border-right: 2px solid #1e3a8a;
                padding-top: 1rem;
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