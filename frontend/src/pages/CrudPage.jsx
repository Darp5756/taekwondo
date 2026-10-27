import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import Modal from '../components/Modal.jsx';
import ResourceForm from '../components/ResourceForm.jsx';
import Spinner from '../components/Spinner.jsx';
import useSourceRows, { optionsFor } from '../components/useSourceRows.js';
import { RowActionLink } from '../resources.jsx';

const PAGE_SIZE = 20;

export default function CrudPage({ resource }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = resource.filters ?? [];
  const filterParams = Object.fromEntries(filters.map((f) => [f.name, searchParams.get(f.name) ?? '']));
  const filterKey = JSON.stringify(filterParams);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | fila
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const filterRows = useSourceRows(filters);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = resource.noPagination
        ? {}
        : { q, limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...JSON.parse(filterKey) };
      setResult(await api(`/${resource.path}`, { params }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [resource.path, resource.noPagination, q, page, filterKey]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (name, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
    setPage(0);
  };

  const confirmDelete = async () => {
    setDeleteError('');
    try {
      await api(`/${resource.path}/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {resource.icon} {resource.title}
          </h1>
          <p className="text-sm text-neutral-400">{result.total} registro(s)</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn btn-primary">
          + Nuevo {resource.singular}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {!resource.noPagination && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="input max-w-xs"
          />
        )}
        {filters.map((f) => (
          <select
            key={f.name}
            value={filterParams[f.name]}
            onChange={(e) => setFilter(f.name, e.target.value)}
            className="input max-w-xs"
            aria-label={f.label}
          >
            <option value="">{f.label}: todas</option>
            {optionsFor(f, filterRows).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      <Alert>{error}</Alert>

      <div className="card overflow-x-auto">
        {loading && !result.data.length ? (
          <Spinner />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs tracking-wide text-neutral-400 uppercase">
              <tr>
                {resource.columns.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-semibold">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50' : undefined}>
              {result.data.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  {resource.columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render ? c.render(row) : (row[c.key] ?? <span className="text-neutral-600">—</span>)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {resource.rowActions?.map((a) => (
                        <RowActionLink key={a.label} action={a} row={row} />
                      ))}
                      <button onClick={() => setEditing(row)} className="btn btn-secondary px-3 py-1">
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setDeleteError('');
                          setDeleting(row);
                        }}
                        className="btn px-3 py-1 text-red-300 hover:bg-tkd-red/20"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!result.data.length && (
                <tr>
                  <td colSpan={resource.columns.length + 1} className="px-4 py-10 text-center text-neutral-500">
                    No hay registros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!resource.noPagination && pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn btn-secondary">
            ← Anterior
          </button>
          <span className="text-neutral-400">
            Página {page + 1} de {pages}
          </span>
          <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="btn btn-secondary">
            Siguiente →
          </button>
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? `Nuevo ${resource.singular}` : `Editar ${resource.singular}`}
          onClose={() => setEditing(null)}
          width="max-w-2xl"
        >
          <ResourceForm
            resource={resource}
            row={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title={`Eliminar ${resource.singular}`} onClose={() => setDeleting(null)}>
          <div className="space-y-4">
            <p className="text-neutral-300">¿Seguro que quieres eliminar este registro? Esta acción no se puede deshacer.</p>
            <Alert>{deleteError}</Alert>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="btn btn-secondary">
                Cancelar
              </button>
              <button onClick={confirmDelete} className="btn btn-danger">
                Eliminar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
