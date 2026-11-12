import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ShedConfig } from '../core/config';
import type { FinishPart } from '../core/gen/finishes';
import type { Member, Solid, Vec3 } from '../core/member';
import { FramingScene } from '../view3d/scene';
import { download } from './download';

interface Props {
  members: readonly Member[];
  solids: readonly Solid[];
  finishes: readonly FinishPart[];
  missing: readonly (readonly Vec3[])[]; // left-out parts, as red loops
  trimColor: string | null; // paints the fascia and fly rafters
  front: ShedConfig['front'];
  glbName: string; // the file name for Download 3D
  selected: ReadonlySet<string>;
  onPick: (id: string | null) => void;
  toolbar?: ReactNode;
  children?: ReactNode;
}

export function View3D({ members, solids, finishes, missing, trimColor, front, glbName, selected, onPick, toolbar, children }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<FramingScene | null>(null);
  const pick = useRef(onPick);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const scene = new FramingScene(host.current!, (id) => pick.current(id));
    view.current = scene;
    return () => {
      scene.dispose();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.setModel(members, solids, finishes, trimColor, missing);
  }, [members, solids, finishes, trimColor, missing]);

  useEffect(() => {
    view.current?.setSelection(selected);
  }, [selected]);

  useEffect(() => {
    view.current?.setFront(front);
  }, [front]);

  return (
    <>
      <div ref={host} className="canvas-host" />
      <div className="view-toolbar">
        {toolbar}
        <button className="fit" onClick={() => view.current?.fit()}>
          Fit view
        </button>
        <button
          title="The shown layers as a glTF model, in meters"
          disabled={making}
          onClick={async () => {
            if (!view.current) return;
            const pieces = view.current.pieces();
            setMaking(true);
            setFailed(null);
            try {
              // Loaded on demand, outside the main bundle.
              const { toGlb } = await import('../view3d/export');
              download(glbName, await toGlb(pieces), 'model/gltf-binary');
            } catch (error) {
              setFailed(`The 3D file was not made: ${(error as Error).message}`);
            } finally {
              setMaking(false);
            }
          }}
        >
          {making ? 'Making 3D…' : 'Download 3D'}
        </button>
        {failed && (
          <small className="error" role="alert">
            {failed}
          </small>
        )}
      </div>
      {children}
    </>
  );
}
