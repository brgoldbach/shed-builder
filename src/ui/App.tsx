import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION, parseConfigText, serializeConfig, shedSchema, type ShedConfig } from '../core/config';
import { DISCLAIMER } from '../core/disclaimer';
import { LAYERS, layerOf, type Layer } from '../core/member';
import { buildFinishes } from '../core/gen/finishes';
import { buildModel } from '../core/model';
import { naming } from '../core/naming';
import { buildBom } from '../core/out/bom';
import { buildCutList, LENGTH_RULE } from '../core/out/cutlist';
import { bomCsv, cutListCsv } from '../core/out/csv';
import { checkSpans, spanWarnings } from '../core/out/spans';
import { PRESETS } from '../core/presets';
import { designFileText, designFromLink, designToLink, LINK_KEY, linkData } from '../core/share';
import { buildDrawings } from '../drawings/sheets';
import { BomView } from './BomView';
import { ChangelogDialog } from './ChangelogDialog';
import { CutListTable } from './CutListTable';
import { SpanTable } from './SpanTable';
import { DesignForm } from './DesignForm';
import { FramingView } from './FramingView';
import { PieceInfo } from './PieceInfo';
import { View3D } from './View3D';

// On a phone the form is a tab of its own; on a wider screen it stays beside the workspace.
const TABS = [
  { id: 'design', label: 'Design' },
  { id: '3d', label: '3D' },
  { id: 'framing', label: 'Framing' },
  { id: 'cutlist', label: 'Cut list' },
  { id: 'bom', label: 'BOM' },
  { id: 'warnings', label: 'Warnings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const STORAGE_KEY = 'shed-builder.config';
const PHONE = '(max-width: 760px)'; // the phone layout's breakpoint in app.css

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}
// The framing view hides the finishes; the finished view hides only the sheathing under them.
const VIEWS = {
  Framing: ['sheathing', 'siding', 'roofing', 'openings'],
  Finished: ['sheathing'],
} as const satisfies Record<string, readonly Layer[]>;

function saved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Storage is blocked.
  }
}

// The saved design, or the first preset when there is none or storage is blocked.
function restore(): ShedConfig {
  const text = saved();
  const result = text === null ? null : parseConfigText(text);
  return result?.ok ? result.config : PRESETS[0];
}

function download(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

const fileName = (name: string, suffix: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shed'}.${suffix}`;

export function App() {
  const [config, setConfig] = useState(restore);
  // Remounts the form after a load, so no field keeps a draft from the old design.
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<{ file: string; errors: string[] } | null>(null);
  const [tab, setTab] = useState<TabId>('3d');
  const phone = usePhone();
  // The Design tab exists only on a phone: elsewhere the form is always in view.
  const view: TabId = !phone && tab === 'design' ? '3d' : tab;
  const [layersOpen, setLayersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set(VIEWS.Framing));
  // A shared link replaces a design only after asking, unless this browser had none.
  const [hadDesign] = useState(() => saved() !== null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const model = useMemo(() => buildModel(config), [config]);
  const names = useMemo(() => naming(config), [config]);
  const cutList = useMemo(() => buildCutList(model.members, names), [model, names]);
  const markOf = useMemo(
    () => new Map(cutList.flatMap((line) => line.ids.map((id) => [id, line.mark] as const))),
    [cutList],
  );
  const drawings = useMemo(() => buildDrawings(config, model, names, markOf), [config, model, names, markOf]);
  const bom = useMemo(() => buildBom(config, model, markOf), [config, model, markOf]);
  const spans = useMemo(() => checkSpans(config, model, names), [config, model, names]);
  const warnings = [...model.warnings, ...bom.warnings, ...spanWarnings(spans, config)];
  const shown = useMemo(
    () => model.members.filter((member) => !hidden.has(layerOf(member))),
    [model, hidden],
  );
  const shownSolids = useMemo(() => model.solids.filter((solid) => !hidden.has(solid.layer)), [model, hidden]);
  const finishes = useMemo(() => buildFinishes(config, model), [config, model]);
  const shownFinishes = useMemo(() => finishes.filter((part) => !hidden.has(part.layer)), [finishes, hidden]);
  const selectedLine = cutList.find((line) => line.mark === selected);
  const selectedIds = useMemo(() => new Set(selectedLine?.ids), [selectedLine]);
  const toggle = (mark: string | null) => setSelected((current) => (current === mark ? null : mark));
  const selectedMember = selectedLine && model.members.find((member) => member.id === selectedLine.ids[0]);
  const pickInfo = selectedLine && selectedMember && <PieceInfo line={selectedLine} member={selectedMember} names={names} onClose={() => setSelected(null)} />;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeConfig(config));
    } catch {
      // Storage is blocked. Autosave is off.
    }
  }, [config]);

  useEffect(() => {
    let current = true;
    void designToLink(config).then((data) => {
      if (current) setShareLink(`${window.location.origin}${window.location.pathname}#${LINK_KEY}${data}`);
    });
    return () => {
      current = false;
    };
  }, [config]);

  // Open a design from the address: at load, and when a link is pasted into an open page. The
  // fragment then goes, so a reload keeps the design from storage instead of asking again.
  useEffect(() => {
    async function openLink() {
      const data = linkData(window.location.hash);
      if (data === null) return;
      history.replaceState(null, '', window.location.pathname + window.location.search);
      const result = await designFromLink(data);
      if (!result.ok) {
        setLoadError({ file: 'the shared link', errors: result.errors });
        return;
      }
      const question = `Open the shared design "${result.config.name}"? It replaces the design in this browser. Save yours first to keep it.`;
      if (hadDesign && !confirm(question)) return;
      setConfig(result.config);
      setRevision((count) => count + 1);
      setLoadError(null);
    }
    void openLink();
    window.addEventListener('hashchange', openLink);
    return () => window.removeEventListener('hashchange', openLink);
  }, [hadDesign]);

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      // No clipboard access: show the link to copy by hand.
      () => window.prompt('Copy this link:', link),
    );
  }

  function edit(next: ShedConfig): string | null {
    const result = shedSchema.safeParse(next);
    if (!result.success) return result.error.issues[0].message;
    setConfig(result.data);
    return null;
  }

  function replace(next: ShedConfig) {
    setConfig(next);
    setRevision((count) => count + 1);
    setLoadError(null);
  }

  async function open(file: File) {
    const result = parseConfigText(await file.text());
    if (result.ok) replace(result.config);
    else setLoadError({ file: file.name, errors: result.errors });
  }

  return (
    <div
      className="app"
      data-view={view}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void open(file);
      }}
    >
      <header className="topbar">
        <h1>Shed Builder</h1>
        <button className="version" title="Changelog" onClick={() => setChangelogOpen(true)}>
          v{APP_VERSION}
        </button>
        {changelogOpen && <ChangelogDialog onClose={() => setChangelogOpen(false)} />}
        <span className="muted title">{config.name}</span>
        <div className="actions">
          <select
            value=""
            aria-label="New from preset"
            onChange={(event) => {
              const preset = PRESETS[Number(event.target.value)];
              if (confirm(`Replace the current design with "${preset.name}"?`)) replace(preset);
            }}
          >
            <option value="" disabled>
              New from preset…
            </option>
            {PRESETS.map((preset, index) => (
              <option key={preset.name} value={index}>
                {preset.name}
              </option>
            ))}
          </select>
          <button onClick={() => fileInput.current?.click()}>Open…</button>
          <button onClick={() => download(fileName(config.name, 'shed.json'), designFileText(config))}>Save</button>
          <button title="Copy a link that opens this design" disabled={!shareLink} onClick={() => shareLink && copyLink(shareLink)}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void open(file);
            }}
          />
        </div>
      </header>
      <aside className="sidebar">
        {loadError && (
          <div className="banner" role="alert">
            <strong>Cannot load {loadError.file}</strong>
            <ul>
              {loadError.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <button onClick={() => setLoadError(null)}>Dismiss</button>
          </div>
        )}
        <DesignForm key={revision} value={config} onChange={edit} />
        <p className="notice">{DISCLAIMER}</p>
      </aside>
      <nav className="tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            className={entry.id === 'design' ? 'phone-only' : undefined}
            aria-selected={entry.id === view}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'warnings' && warnings.length > 0 && ` (${warnings.length})`}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <p className="notice print-only">{DISCLAIMER}</p>
        <section className="panel viewport" role="tabpanel" hidden={view !== '3d'}>
          <View3D
            members={shown}
            solids={shownSolids}
            finishes={shownFinishes}
            trimColor={hidden.has('siding') ? null : config.finishes.trimColor}
            front={config.front}
            toolbar={
              <div className={layersOpen ? 'layer-toggles open' : 'layer-toggles'}>
                {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((name) => (
                  <button
                    key={name}
                    aria-pressed={hidden.size === VIEWS[name].length && VIEWS[name].every((layer) => hidden.has(layer))}
                    onClick={() => setHidden(new Set(VIEWS[name]))}
                  >
                    {name}
                  </button>
                ))}
                {/* On a phone the layer list folds behind this button. */}
                <button className="layers-button" aria-expanded={layersOpen} onClick={() => setLayersOpen((open) => !open)}>
                  Layers
                </button>
                {(Object.keys(LAYERS) as Layer[]).map((layer) => (
                  <label key={layer}>
                    <input
                      type="checkbox"
                      checked={!hidden.has(layer)}
                      onChange={() =>
                        setHidden((current) => {
                          const next = new Set(current);
                          if (!next.delete(layer)) next.add(layer);
                          return next;
                        })
                      }
                    />
                    {LAYERS[layer]}
                  </label>
                ))}
              </div>
            }
            selected={selectedIds}
            onPick={(id) => toggle(id && (markOf.get(id) ?? null))}
          >
            {pickInfo && <div className="pick-info">{pickInfo}</div>}
          </View3D>
        </section>
        <section className="panel framing" role="tabpanel" hidden={view !== 'framing'}>
          <FramingView
            drawings={drawings}
            selected={selectedIds}
            onPick={(id) => toggle(markOf.get(id) ?? null)}
            designName={config.name}
            pdfName={fileName(config.name, 'plans.pdf')}
            shareLink={shareLink}
          />
          {pickInfo && <div className="pick-info sticky">{pickInfo}</div>}
        </section>
        <section className="panel" role="tabpanel" hidden={view !== 'cutlist'}>
          <div className="panel-toolbar">
            <button onClick={() => download(fileName(config.name, 'cutlist.csv'), cutListCsv(cutList, names), 'text/csv')}>
              Download CSV
            </button>
            <button onClick={() => window.print()}>Print</button>
          </div>
          <p className="muted hint cutlist-hint">
            {LENGTH_RULE} Select a line to see one of its pieces laid flat and dimensioned. The Framing tab's "Measuring cut
            lengths" sheet shows an example of each kind of end cut.
          </p>
          <CutListTable lines={cutList} names={names} selected={selected} onSelect={toggle} />
          {pickInfo && <div className="pick-info sticky">{pickInfo}</div>}
        </section>
        <section className="panel" role="tabpanel" hidden={view !== 'bom'}>
          <BomView bom={bom} marks={markOf} onCsv={() => download(fileName(config.name, 'bom.csv'), bomCsv(bom), 'text/csv')} />
        </section>
        <section className="panel" role="tabpanel" hidden={view !== 'warnings'}>
          {warnings.length === 0 ? (
            <p className="muted">No warnings.</p>
          ) : (
            <ul className="warnings">
              {warnings.map((warning) => (
                <li key={`${warning.source}: ${warning.message}`}>
                  <strong>{warning.source}</strong> {warning.message}
                </li>
              ))}
            </ul>
          )}
          <SpanTable checks={spans} species={config.catalog.species} />
        </section>
      </main>
    </div>
  );
}
