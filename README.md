# Formulario-web

## Despliegue en Netlify

El proyecto incluye `netlify.toml` y una funcion backend para que `/api/*` funcione fuera de la computadora local.

Configura en **Netlify > Site configuration > Environment variables**:

- `VITE_SUPABASE_URL`: URL del proyecto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: clave publica usada por React.
- `SUPABASE_URL`: la misma URL del proyecto Supabase.
- `SUPABASE_SECRET_KEY`: clave secreta disponible solamente para Functions.
- `API_SESSION_SECRET`: cadena privada larga y aleatoria para firmar sesiones.

Las variables secretas deben configurarse en la interfaz, CLI o API de Netlify; no deben escribirse en `netlify.toml` ni subirse a Git.

El despliegue debe incluir el repositorio completo. Subir solamente la carpeta `dist` no despliega `netlify/functions`.
