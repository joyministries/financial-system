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
      <div className="fixed inset-0 animate-fade-in bg-primary-950/55 backdrop-blur-[2px]" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg animate-modal-in overflow-y-auto rounded-xl border border-line bg-white shadow-lift">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-xl border-b border-line-soft bg-white px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1.5 text-faint transition-colors hover:bg-[#f3efe6] hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
