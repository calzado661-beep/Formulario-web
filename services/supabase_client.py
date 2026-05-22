from supabase import Client, create_client

from config.settings import get_env


def get_supabase() -> Client:
    url = get_env("SUPABASE_URL")
    key = get_env("SUPABASE_SECRET_KEY") or get_env("SUPABASE_PUBLISHABLE_KEY")
    return create_client(url, key)
