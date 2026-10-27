import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Carga (una vez) las tablas relacionadas que usan los selects: { academias: [...], ... }
export default function useSourceRows(defs = []) {
  const key = [...new Set(defs.filter((d) => d.source).map((d) => d.source.path))].join(',');
  const [rows, setRows] = useState({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    Promise.all(key.split(',').map((path) => api(`/${path}`, { params: { limit: 500 } }).then((r) => [path, r.data])))
      .then((entries) => !cancelled && setRows(Object.fromEntries(entries)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return rows;
}

export function optionsFor(def, sourceRows, values = {}) {
  if (def.options) return def.options;
  if (!def.source) return [];
  return (sourceRows[def.source.path] ?? [])
    .filter((row) => !def.filter || def.filter(row, values))
    .map((row) => ({ value: String(row.id), label: def.source.label(row) }));
}
