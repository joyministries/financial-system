import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, subtitle, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    // Intentional: clicking the backdrop must NOT close the modal — users
    // asked for forms to survive accidental outside clicks. Close via the
    // X button or Escape.
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-ledger-ink/45" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-ledger-border bg-ledger-surface">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-lg border-b border-ledger-border bg-ledger-surface px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-normal text-ledger-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ledger-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ledger-muted transition-colors hover:bg-ledger-row-hover hover:text-ledger-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
