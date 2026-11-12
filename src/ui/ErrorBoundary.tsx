import { Component, type ReactNode } from 'react';
import { APP_VERSION } from '../core/config';
import { browserStore, savedDesign, setAside } from './autosave';
import { download } from './download';

interface State {
  error: Error | null;
}

/**
 * A recovery page in place of the app when a render throws. A render that throws commits nothing,
 * so autosave still holds the last design that rendered.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const store = browserStore();
    const saved = savedDesign(store);
    return (
      <main className="crash" role="alert">
        <h1>Shed Builder stopped</h1>
        <p className="muted">
          v{APP_VERSION}: {error.message}
        </p>
        <p>Reload to open the last design that worked. If this page comes back, download the design, then start a new one.</p>
        <div className="actions">
          {saved !== null && <button onClick={() => download('saved-design.shed.json', saved)}>Download the design</button>}
          <button onClick={() => window.location.reload()}>Reload</button>
          <button
            onClick={() => {
              setAside(store);
              window.location.reload();
            }}
          >
            Start a new design
          </button>
        </div>
      </main>
    );
  }
}
