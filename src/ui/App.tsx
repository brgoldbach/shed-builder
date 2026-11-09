import { useEffect, useMemo, useRef, useState } from 'react';
import { parseConfigText, serializeConfig, shedSchema, type ShedConfig } from '../core/config';
import { ASSEMBLIES, LAYERS, ROLES, type Layer } from '../core/member';
import { buildModel } from '../core/model';
import { naming } from '../core/naming';
import { buildCutList } from '../core/out/cutlist';
import { PRESETS } from '../core/presets';
import { formatInches } from '../core/units';
import { CutListTable, stockLabel } from './CutListTable';
import { DesignForm } from './DesignForm';
import { View3D } from './View3D';

const TABS = [
  { id: '3d', label: '3D' },
  { id: 'framing', label: 'Framing', milestone: 'M6' },
  { id: 'cutlist', label: 'Cut list' },
  { id: 'bom', label: 'BOM', milestone: 'M7' },
  { id: 'warnings', label: 'Warnings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const STORAGE_KEY = 'shed-builder.config';

function restore(): ShedConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const result = saved === null ? null : parseConfigText(saved);
    if (result?.ok) return result.config;
  } catch {
    // Storage is blocked. Start from the first preset.
  }
  return PRESETS[0];
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

const fileName = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shed'}.shed.json`;

export function App() {
  const [config, setConfig] = useState(restore);
  // Remounts the form after a load, so no field keeps a draft from the old design.
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<{ file: string; errors: string[] } | null>(null);
  const [tab, setTab] = useState<TabId>('3d');
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const active = TABS.find((entry) => entry.id === tab)!;

  const model = useMemo(() => buildModel(config), [config]);
  const names = useMemo(() => naming(config), [config]);
  const cutList = useMemo(() => buildCutList(model.members, names), [model, names]);
  const markOf = useMemo(
    () => new Map(cutList.flatMap((line) => line.ids.map((id) => [id, line.mark] as const))),
    [cutList],
  );
  const shown = useMemo(
    () => model.members.filter((member) => !hidden.has(ASSEMBLIES[member.assembly].layer)),
    [model, hidden],
  );
  const selectedLine = cutList.find((line) => line.mark === selected);
  const selectedIds = useMemo(() => new Set(selectedLine?.ids), [selectedLine]);
  const toggle = (mark: string | null) => setSelected((current) => (current === mark ? null : mark));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeConfig(config));
    } catch {
      // Storage is blocked. Autosave is off.
    }
  }, [config]);

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
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void open(file);
      }}
    >
      <header className="topbar">
        <h1>Shed Builder</h1>
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
          <button onClick={() => download(fileName(config.name), serializeConfig(config))}>Save</button>
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
      </aside>
      <main className="workspace">
        <nav className="tabs" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={entry.id === tab}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              {entry.id === 'warnings' && model.warnings.length > 0 && ` (${model.warnings.length})`}
            </button>
          ))}
        </nav>
        <section className="panel viewport" role="tabpanel" hidden={tab !== '3d'}>
          <View3D members={shown} front={config.front} selected={selectedIds} onPick={(id) => toggle(id && (markOf.get(id) ?? null))}>
            <div className="layer-toggles">
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
            {selectedLine && (
              <div className="pick-info">
                <strong>{selectedLine.mark}</strong> {names.assembly(selectedLine.assembly).label},{' '}
                {ROLES[selectedLine.role].toLowerCase()}: {selectedLine.ids.length} × {stockLabel(selectedLine)} at{' '}
                {formatInches(selectedLine.length)}
              </div>
            )}
          </View3D>
        </section>
        <section className="panel" role="tabpanel" hidden={tab !== 'cutlist'}>
          <CutListTable lines={cutList} names={names} selected={selected} onSelect={toggle} />
        </section>
        <section className="panel" role="tabpanel" hidden={tab !== 'warnings'}>
          {model.warnings.length === 0 ? (
            <p className="muted">No warnings.</p>
          ) : (
            <ul className="warnings">
              {model.warnings.map((warning) => (
                <li key={`${warning.source}: ${warning.message}`}>
                  <strong>{warning.source}</strong> {warning.message}
                </li>
              ))}
            </ul>
          )}
        </section>
        {'milestone' in active && (
          <section className="panel" role="tabpanel">
            <p className="muted">
              {active.label} view arrives in {active.milestone}.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
