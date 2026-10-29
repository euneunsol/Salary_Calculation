import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { iconButtonClass } from './classNames';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 모달 박스 최대 너비 (Tailwind max-w-* 클래스) */
  widthClassName?: string;
}

/**
 * 접근성 있는 모달 컨테이너.
 * - role="dialog" + aria-modal
 * - 열릴 때 첫 포커스 가능한 요소로 포커스 이동, 닫힐 때 이전 포커스 복원
 * - Esc 키로 닫기, 배경 클릭으로 닫기
 */
export function Modal({ open, onClose, title, children, widthClassName = 'max-w-sm' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[85vh] w-full ${widthClassName} overflow-y-auto rounded-2xl bg-paper p-5 shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {title && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className={iconButtonClass('h-9 w-9')}>
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
