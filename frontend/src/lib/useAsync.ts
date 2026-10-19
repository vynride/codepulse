"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, errorMessage } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  offline: boolean;
  status: number | null;
  loading: boolean;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    fn()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        setOffline(false);
        setStatus(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(errorMessage(e));
        setOffline(e instanceof ApiError && e.kind === "network");
        setStatus(e instanceof ApiError ? e.status : null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { data, error, offline, status, loading, reload };
}
