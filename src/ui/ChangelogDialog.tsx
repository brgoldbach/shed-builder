import { useEffect, useRef, type ReactNode } from 'react';
import changelog from '../../CHANGELOG.md?raw';
import { parseChangelog, type Block } from './changelog';

const BLOCKS = parseChangelog(changelog);

// Bold, code, and links: the inline Markdown the changelog uses.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'heading') return block.level === 2 ? <h3>{block.text}</h3> : <h4>{block.text}</h4>;
  if (block.kind === 'paragraph') return <p>{inline(block.text)}</p>;
  return (
    <ul>
      {block.items.map((item, index) => (
        <li key={index}>{inline(item)}</li>
      ))}
    </ul>
  );
}

/** The changelog in a modal dialog. Esc, Close, or a click outside it closes it. */
export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // React's development double run would open it twice.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="changelog"
      aria-labelledby="changelog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="changelog-bar">
        <h2 id="changelog-title">Changelog</h2>
        <button onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <div className="changelog-body">
        {BLOCKS.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </dialog>
  );
}
