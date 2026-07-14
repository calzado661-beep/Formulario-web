import base64
import os
import streamlit as st


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@st.cache_data
def _get_base64_file(file_path: str) -> str | None:
    try:
        if os.path.exists(file_path):
            with open(file_path, "rb") as file:
                return base64.b64encode(file.read()).decode()
    except Exception:
        pass
    return None


def _asset_path(file_name: str) -> str:
    return os.path.join(ROOT_DIR, file_name)


def _background_css() -> str:
    image_b64 = _get_base64_file(_asset_path("fondo.jpeg"))
    image_layer = f'url("data:image/jpeg;base64,{image_b64}") center / cover fixed' if image_b64 else "#07100f"
    return (
        "linear-gradient(135deg, rgba(4, 8, 7, 0.95), rgba(9, 20, 19, 0.92) 46%, "
        f"rgba(20, 18, 12, 0.95)), {image_layer}"
    )


def apply_styles():
    background = _background_css()
    st.markdown(f"""
        <style>
            :root {{
                --app-bg: #07100f;
                --app-surface: rgba(17, 27, 25, 0.92);
                --app-surface-strong: #172622;
                --app-soft: rgba(222, 238, 226, 0.075);
                --app-border: rgba(207, 226, 213, 0.18);
                --app-text: #ebe9de;
                --app-title: #fff4df;
                --app-muted: #aeb9ad;
                --app-accent: #2dd4bf;
                --app-gold: #f4b75e;
                --app-danger: #f43f5e;
            }}

            [data-testid="collapsedControl"],
            footer,
            [data-testid="stDecoration"],
            [data-testid="stStatusWidget"],
            .viewerBadge_container__1QSob,
            .viewerBadge_link__1S137,
            .viewerBadge_text__1JaDK {{
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
            }}

            .stApp {{
                background: {background};
                color: var(--app-text);
            }}

            .main .block-container {{
                max-width: 1320px;
                margin-top: 1.25rem;
                padding: 2rem;
                border: 1px solid var(--app-border);
                border-radius: 8px;
                background:
                    linear-gradient(180deg, rgba(25, 39, 35, 0.9), rgba(13, 21, 19, 0.92)),
                    var(--app-surface);
                box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
            }}

            [data-testid="stSidebar"] {{
                border-right: 1px solid var(--app-border) !important;
                background:
                    linear-gradient(180deg, rgba(10, 18, 16, 0.96), rgba(8, 12, 11, 0.94)),
                    rgba(8, 12, 11, 0.94) !important;
                box-shadow: 12px 0 36px rgba(0, 0, 0, 0.22);
                backdrop-filter: blur(16px) !important;
                -webkit-backdrop-filter: blur(16px) !important;
            }}

            [data-testid="stSidebar"] * {{
                color: var(--app-text) !important;
            }}

            h1,
            h2,
            h3 {{
                color: var(--app-title) !important;
                font-weight: 800 !important;
                letter-spacing: 0 !important;
            }}

            p,
            label,
            span,
            div[data-testid="stMarkdownContainer"] {{
                color: var(--app-text);
            }}

            div[data-testid="stCaptionContainer"] {{
                padding: 0.65rem 0.8rem !important;
                border: 1px solid var(--app-border) !important;
                border-radius: 8px !important;
                background: var(--app-soft) !important;
                color: var(--app-muted) !important;
            }}

            div[data-testid="stExpander"],
            div[data-testid="stVerticalBlockBorderWrapper"],
            div[data-testid="stMetric"],
            [data-testid="stDataFrame"],
            [data-testid="stTable"] {{
                border: 1px solid var(--app-border) !important;
                border-radius: 8px !important;
                background: rgba(222, 238, 226, 0.055) !important;
                box-shadow: none !important;
            }}

            div[data-testid="stExpander"] details,
            div[data-testid="stExpander"] summary {{
                color: var(--app-text) !important;
            }}

            [data-testid="stMetricLabel"] p {{
                color: var(--app-muted) !important;
                font-weight: 800 !important;
            }}

            [data-testid="stMetricValue"] {{
                color: var(--app-accent) !important;
            }}

            .stButton > button,
            [data-testid="baseButton-primary"],
            [data-testid="baseButton-secondary"] {{
                min-height: 42px;
                border: 1px solid transparent !important;
                border-radius: 8px !important;
                background: linear-gradient(135deg, var(--app-accent), #7dd3fc) !important;
                color: #06100f !important;
                font-weight: 800 !important;
                box-shadow: 0 12px 24px rgba(45, 212, 191, 0.18);
                transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
            }}

            .stButton > button:hover,
            [data-testid="baseButton-primary"]:hover,
            [data-testid="baseButton-secondary"]:hover {{
                border-color: rgba(207, 226, 213, 0.28) !important;
                transform: translateY(-1px);
                box-shadow: 0 16px 30px rgba(45, 212, 191, 0.24);
            }}

            .stTextInput input,
            .stNumberInput input,
            .stDateInput input,
            .stTextArea textarea,
            .stSelectbox [data-baseweb="select"] > div,
            .stMultiSelect [data-baseweb="select"] > div {{
                border: 1px solid var(--app-border) !important;
                border-radius: 8px !important;
                background: rgba(222, 238, 226, 0.075) !important;
                color: var(--app-text) !important;
                box-shadow: none !important;
            }}

            .stTextInput input:focus,
            .stNumberInput input:focus,
            .stDateInput input:focus,
            .stTextArea textarea:focus {{
                border-color: rgba(45, 212, 191, 0.7) !important;
                box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.13) !important;
            }}

            .stSelectbox [data-baseweb="popover"] {{
                background: #101a18 !important;
                color: var(--app-text) !important;
            }}

            .stTabs [data-baseweb="tab-list"] {{
                gap: 0.45rem;
                padding: 0.35rem;
                border: 1px solid var(--app-border);
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.24);
            }}

            .stTabs [data-baseweb="tab"] {{
                border-radius: 6px;
                color: var(--app-muted) !important;
                font-weight: 800;
            }}

            .stTabs [aria-selected="true"] {{
                background: rgba(244, 183, 94, 0.16) !important;
                color: var(--app-title) !important;
            }}

            .stAlert {{
                border: 1px solid var(--app-border) !important;
                border-radius: 8px !important;
                background: rgba(222, 238, 226, 0.075) !important;
                color: var(--app-text) !important;
                box-shadow: none !important;
            }}

            .stSuccess {{
                border-color: rgba(52, 211, 153, 0.35) !important;
                background: rgba(52, 211, 153, 0.14) !important;
            }}

            .stError {{
                border-color: rgba(244, 63, 94, 0.38) !important;
                background: rgba(244, 63, 94, 0.15) !important;
            }}

            .stDataFrame,
            .stTable {{
                color: var(--app-text) !important;
            }}

            hr {{
                border-color: var(--app-border);
                margin-top: 1rem;
            }}
        </style>
    """, unsafe_allow_html=True)


def add_login_video_background(video_file: str = "fondovideo.mp4"):
    video_b64 = _get_base64_file(_asset_path(video_file))
    if video_b64:
        st.markdown(f"""
            <style>
                #bgVideo {{
                    position: fixed;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    z-index: -1;
                    filter: brightness(0.38) saturate(0.9) contrast(1.04);
                }}

                .stApp {{
                    background:
                        linear-gradient(120deg, rgba(4, 8, 7, 0.95), rgba(9, 21, 20, 0.7) 58%, rgba(26, 21, 10, 0.72)),
                        linear-gradient(0deg, rgba(45, 212, 191, 0.11), rgba(244, 183, 94, 0.07)) !important;
                }}
            </style>
            <video autoplay muted loop playsinline id="bgVideo">
                <source src="data:video/mp4;base64,{video_b64}" type="video/mp4">
            </video>
        """, unsafe_allow_html=True)
