import { useState } from 'react';

const TABS = [
  { id: '3d', label: '3D', milestone: 'M2' },
  { id: 'framing', label: 'Framing', milestone: 'M6' },
  { id: 'cutlist', label: 'Cut list', milestone: 'M2' },
  { id: 'bom', label: 'BOM', milestone: 'M7' },
  { id: 'warnings', label: 'Warnings', milestone: 'M8' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tab, setTab] = useState<TabId>('3d');
  const active = TABS.find((entry) => entry.id === tab)!;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Shed Builder</h1>
      </header>
      <aside className="sidebar">
        <h2>Design</h2>
        <p className="muted">Config form arrives in M1.</p>
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
            </button>
          ))}
        </nav>
        <section className="panel" role="tabpanel">
          <p className="muted">
            {active.label} view arrives in {active.milestone}.
          </p>
        </section>
      </main>
    </div>
  );
}
