import { useEffect, useRef } from 'react';

/**
 * A yes-or-no question in a modal dialog. The app does not use `confirm()`: some embedded browsers
 * do not show it and answer no. Esc or Cancel answers no.
 */
export function ConfirmDialog({ question, action, onAnswer }: { question: string; action: string; onAnswer: (yes: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const yes = useRef(false);
  // React's development double run would open it twice.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="confirm" onClose={() => onAnswer(yes.current)}>
      <p>{question}</p>
      <div className="confirm-bar">
        <button onClick={() => dialog.current?.close()}>Cancel</button>
        <button
          autoFocus
          onClick={() => {
            yes.current = true;
            dialog.current?.close();
          }}
        >
          {action}
        </button>
      </div>
    </dialog>
  );
}
