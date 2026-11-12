import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { APP_VERSION, parseConfigText, shedSchema, type ShedConfig } from '../core/config';
import { DISCLAIMER } from '../core/disclaimer';
import { ASSEMBLIES, LAYERS, layerOf, type Layer } from '../core/member';
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
import { backupDesign, browserStore, restore, save } from './autosave';
import { BomView } from './BomView';
import { ChangelogDialog } from './ChangelogDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { CutListTable } from './CutListTable';
import { SpanTable } from './SpanTable';
import { DesignForm } from './DesignForm';
import { download } from './download';
import { PanelBoundary } from './ErrorBoundary';
import { FramingView } from './FramingView';
import { record, redo, startHistory, undo, type UndoHistory } from './history';
import { PieceInfo } from './PieceInfo';

// Three.js is most of the app's code. In its own chunk, it loads after the form can work. Each try
// is a new lazy component, because React keeps a failed one.
const loadView3D = () => lazy(() => import('./View3D').then((module) => ({ default: module.View3D })));

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

const PHONE = 'screen and (max-width: 760px)'; // the phone layout's breakpoint in app.css
const MAX_FILE = 1_000_000; // bytes

interface LoadError {
  file: string;
  errors: string[];
  stored?: boolean; // the design saved in this browser did not load, and its text is in the backup
}

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

// A change that leaves the design as it was is not an undo step.
const change = (next: ShedConfig) => (designs: UndoHistory<ShedConfig>) =>
  JSON.stringify(next) === JSON.stringify(designs.present) ? designs : record(designs, next);

// Text boxes keep the browser's own undo for the text being typed.
const TEXT_INPUTS = new Set(['text', 'number', 'search', 'email', 'url', 'tel', 'password']);

const fileName = (name: string, suffix: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shed'}.${suffix}`;

export function App() {
  const [start] = useState(() => restore(browserStore()));
  const [designHistory, setDesignHistory] = useState(() => startHistory(start.config));
  const config = designHistory.present;
  // Remounts the form after a load, so no field keeps a draft from the old design.
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<LoadError | null>(() =>
    start.errors && { file: 'the design saved in this browser', errors: start.errors, stored: true },
  );
  // On a phone the load banner is on the Design tab, so a failed load opens that tab.
  const [tab, setTab] = useState<TabId>(() => (start.errors && window.matchMedia(PHONE).matches ? 'design' : '3d'));
  const phone = usePhone();
  const showLoadError = (error: LoadError) => {
    setLoadError(error);
    if (phone) setTab('design');
  };
  // The Design tab exists only on a phone: elsewhere the form is always in view.
  const view: TabId = !phone && tab === 'design' ? '3d' : tab;
  const [layersOpen, setLayersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set(VIEWS.Framing));
  // A shared link replaces a design only after asking, unless this browser had none.
  const { hadDesign } = start;
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [question, setQuestion] = useState<{ text: string; action: string; accept: () => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [View3D, setView3D] = useState(loadView3D);

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
  const shownMissing = useMemo(
    () => model.warnings.flatMap(({ missing }) => (missing && !hidden.has(ASSEMBLIES[missing.assembly].layer) ? [missing.outline] : [])),
    [model, hidden],
  );
  const selectedLine = cutList.find((line) => line.mark === selected);
  const selectedIds = useMemo(() => new Set(selectedLine?.ids), [selectedLine]);
  const toggle = (mark: string | null) => setSelected((current) => (current === mark ? null : mark));
  const selectedMember = selectedLine && model.members.find((member) => member.id === selectedLine.ids[0]);
  const pickInfo = selectedLine && selectedMember && <PieceInfo line={selectedLine} member={selectedMember} names={names} onClose={() => setSelected(null)} />;

  useEffect(() => save(browserStore(), config), [config]);

  useEffect(() => {
    let current = true;
    designToLink(config).then(
      (data) => {
        if (current) setShareLink(`${window.location.origin}${window.location.pathname}#${LINK_KEY}${data}`);
      },
      // No CompressionStream in this browser: no link.
      () => current && setLinkFailed(true),
    );
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
        if (window.matchMedia(PHONE).matches) setTab('design');
        return;
      }
      const open = () => {
        setDesignHistory(change(result.config));
        setRevision((count) => count + 1);
        setLoadError(null);
      };
      if (!hadDesign) open();
      else {
        const text = `Open the shared design "${result.config.name}"? It replaces the design in this browser. Save yours first to keep it.`;
        setQuestion({ text, action: 'Open', accept: open });
      }
    }
    void openLink();
    window.addEventListener('hashchange', openLink);
    return () => window.removeEventListener('hashchange', openLink);
  }, [hadDesign]);

  // Ctrl+Z undoes; Ctrl+Shift+Z or Ctrl+Y redoes. Cmd on a Mac.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const { target } = event;
      if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type))) return;
      // A dialog over the form keeps the design as it is.
      if (target instanceof Element && target.closest('dialog, [role="dialog"]')) return;
      const key = event.key.toLowerCase();
      const step = key === 'z' ? (event.shiftKey ? redo : undo) : key === 'y' ? redo : null;
      if (!step) return;
      event.preventDefault();
      setDesignHistory(step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    setDesignHistory(change(result.data));
    return null;
  }

  function replace(next: ShedConfig) {
    setDesignHistory(change(next));
    setRevision((count) => count + 1);
    setLoadError(null);
  }

  // Arrow keys, Home, and End move along the shown tabs, as the ARIA tabs pattern asks.
  function moveTab(event: ReactKeyboardEvent) {
    const shown = TABS.flatMap(({ id }) => (phone || id !== 'design' ? [id] : []));
    const at = shown.indexOf(view);
    const next = ({ ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: shown.length - 1 } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = shown[(next + shown.length) % shown.length];
    setTab(id);
    document.getElementById(`tab-${id}`)?.focus();
  }

  async function open(file: File) {
    // A design file is a few kilobytes. Reading a large file that is not one would stall the page.
    if (file.size > MAX_FILE) return showLoadError({ file: file.name, errors: ['It is too large to be a design file.'] });
    try {
      const result = parseConfigText(await file.text());
      if (result.ok) replace(result.config);
      else showLoadError({ file: file.name, errors: result.errors });
    } catch (error) {
      showLoadError({ file: file.name, errors: [(error as Error).message] });
    }
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
        {question && (
          <ConfirmDialog
            question={question.text}
            action={question.action}
            onAnswer={(yes) => {
              setQuestion(null);
              if (yes) question.accept();
            }}
          />
        )}
        <span className="muted title">{config.name}</span>
        <div className="actions">
          <button title="Undo (Ctrl+Z)" disabled={designHistory.past.length === 0} onClick={() => setDesignHistory(undo)}>
            Undo
          </button>
          <button title="Redo (Ctrl+Shift+Z)" disabled={designHistory.future.length === 0} onClick={() => setDesignHistory(redo)}>
            Redo
          </button>
          <select
            value=""
            aria-label="New from preset"
            onChange={(event) => {
              const preset = PRESETS[Number(event.target.value)];
              setQuestion({ text: `Replace the current design with "${preset.name}"?`, action: 'Replace', accept: () => replace(preset) });
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
          <button
            title={linkFailed ? 'This browser cannot make a link' : 'Copy a link that opens this design'}
            disabled={!shareLink}
            onClick={() => shareLink && copyLink(shareLink)}
          >
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
      <aside className="sidebar" id="panel-design">
        {loadError && (
          <div className="banner" role="alert">
            <strong>Cannot load {loadError.file}</strong>
            <ul>
              {loadError.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            {loadError.stored && <p>The app opened the first preset. The saved design stays in this browser's backup until another design fails to load.</p>}
            {loadError.stored && (
              <button onClick={() => download('saved-design.shed.json', backupDesign(browserStore()) ?? '')}>Download the saved design</button>
            )}
            <button onClick={() => setLoadError(null)}>Dismiss</button>
          </div>
        )}
        <DesignForm key={revision} value={config} onChange={edit} />
        <p className="notice">{DISCLAIMER}</p>
      </aside>
      <nav className="tabs" role="tablist" onKeyDown={moveTab}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            id={`tab-${entry.id}`}
            role="tab"
            className={entry.id === 'design' ? 'phone-only' : undefined}
            aria-selected={entry.id === view}
            aria-controls={`panel-${entry.id}`}
            tabIndex={entry.id === view ? 0 : -1}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'warnings' && warnings.length > 0 && ` (${warnings.length})`}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <p className="notice print-only">{DISCLAIMER}</p>
        <section className="panel viewport" id="panel-3d" role="tabpanel" aria-labelledby="tab-3d" hidden={view !== '3d'}>
          <PanelBoundary message="The 3D view did not start. The rest of the app works without it." onRetry={() => setView3D(() => loadView3D())}>
            <Suspense fallback={<p className="loading-3d muted">Loading 3D…</p>}>
              <View3D
                members={shown}
                solids={shownSolids}
                finishes={shownFinishes}
                missing={shownMissing}
                trimColor={hidden.has('siding') ? null : config.finishes.trimColor}
                front={config.front}
                glbName={fileName(config.name, 'glb')}
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
            </Suspense>
          </PanelBoundary>
        </section>
        <section className="panel framing" id="panel-framing" role="tabpanel" aria-labelledby="tab-framing" hidden={view !== 'framing'}>
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
        <section className="panel" id="panel-cutlist" role="tabpanel" aria-labelledby="tab-cutlist" hidden={view !== 'cutlist'}>
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
        <section className="panel" id="panel-bom" role="tabpanel" aria-labelledby="tab-bom" hidden={view !== 'bom'}>
          <BomView bom={bom} marks={markOf} onCsv={() => download(fileName(config.name, 'bom.csv'), bomCsv(bom), 'text/csv')} />
        </section>
        <section className="panel" id="panel-warnings" role="tabpanel" aria-labelledby="tab-warnings" hidden={view !== 'warnings'}>
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
