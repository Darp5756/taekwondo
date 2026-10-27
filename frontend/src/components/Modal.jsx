import { useEffect } from 'react';

export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={`card relative w-full ${width} bg-neutral-900 p-6 shadow-2xl`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-500 hover:text-white" aria-label="Cerrar">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
