import type { ReactNode } from 'react';

export function ModalShell({
  title,
  onClose,
  children,
  panelClassName,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className={`modal-panel ${panelClassName ?? ''}`} role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        {title ? (
          <header className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              type="button"
              tabIndex={-1}
              className="modal-close"
              onPointerDown={(e) => e.preventDefault()}
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </header>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className="modal-close modal-close-floating"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
