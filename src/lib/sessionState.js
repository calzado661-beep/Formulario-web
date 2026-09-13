import { useEffect, useState } from "react";

export const SESSION_STATE_PREFIX = "formulario:session:v1:";

export function readSessionState(key, fallbackValue) {
  try {
    const stored = window.sessionStorage.getItem(`${SESSION_STATE_PREFIX}${key}`);
    return stored === null ? fallbackValue : JSON.parse(stored);
  } catch {
    return fallbackValue;
  }
}

export function writeSessionState(key, value) {
  try {
    window.sessionStorage.setItem(`${SESSION_STATE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // El formulario sigue funcionando si el navegador bloquea sessionStorage.
  }
}

export function removeSessionState(key) {
  try {
    window.sessionStorage.removeItem(`${SESSION_STATE_PREFIX}${key}`);
  } catch {
    // Nada que eliminar si sessionStorage no esta disponible.
  }
}

export function clearApplicationSessionState() {
  clearSessionStatePrefix("");
}

export function clearSessionStatePrefix(keyPrefix) {
  try {
    const keys = [];
    const fullPrefix = `${SESSION_STATE_PREFIX}${keyPrefix}`;
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(fullPrefix)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Nada que limpiar si sessionStorage no esta disponible.
  }
}

export function useSessionState(key, initialValue) {
  const resolveInitial = () => typeof initialValue === "function" ? initialValue() : initialValue;
  const [value, setValue] = useState(() => readSessionState(key, resolveInitial()));

  useEffect(() => {
    writeSessionState(key, value);
  }, [key, value]);

  return [value, setValue];
}
