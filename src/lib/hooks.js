import { useCallback, useEffect, useState } from "react";

export function useAsyncData(loader, deps = [], initialValue = null) {
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    Promise.resolve()
      .then(loader)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((err) => {
        if (alive) setError(err?.message || String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [...deps, version]);

  return { data, setData, loading, error, reload };
}
