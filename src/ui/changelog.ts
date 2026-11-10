/** A block of the changelog. */
export type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

const LINK_DEFINITION = /^\[[^\]]+\]: /;

/**
 * The changelog's Markdown as blocks. It reads only what CHANGELOG.md uses: `##` and `###`
 * headings, `- ` list items with indented continuation lines, and paragraphs. The `#` title and
 * the link definitions are left out, and a heading's link brackets, as in `[0.1.0]`, are dropped.
 */
export function parseChangelog(markdown: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null; // the block the next plain line continues
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{2,3}) (.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 2 | 3, text: heading[2].replace(/^\[([^\]]+)\]/, '$1') });
      open = null;
    } else if (line === '' || line.startsWith('# ') || LINK_DEFINITION.test(line)) {
      open = null;
    } else if (line.startsWith('- ')) {
      if (open?.kind !== 'list') {
        open = { kind: 'list', items: [] };
        blocks.push(open);
      }
      open.items.push(line.slice(2));
    } else if (open?.kind === 'list') {
      open.items[open.items.length - 1] += ` ${line.trim()}`;
    } else if (open?.kind === 'paragraph') {
      open.text += ` ${line.trim()}`;
    } else {
      open = { kind: 'paragraph', text: line.trim() };
      blocks.push(open);
    }
  }
  return blocks;
}
