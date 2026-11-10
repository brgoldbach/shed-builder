import { useEffect, useRef, type ReactNode } from 'react';
import type { ShedConfig } from '../core/config';
import type { FinishPart } from '../core/gen/finishes';
import type { Member, Solid } from '../core/member';
import { FramingScene } from '../view3d/scene';

interface Props {
  members: readonly Member[];
  solids: readonly Solid[];
  finishes: readonly FinishPart[];
  trimColor: string | null; // paints the fascia and fly rafters
  front: ShedConfig['front'];
  selected: ReadonlySet<string>;
  onPick: (id: string | null) => void;
  toolbar?: ReactNode;
  children?: ReactNode;
}

export function View3D({ members, solids, finishes, trimColor, front, selected, onPick, toolbar, children }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<FramingScene | null>(null);
  const pick = useRef(onPick);

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
    view.current?.setModel(members, solids, finishes, trimColor);
  }, [members, solids, finishes, trimColor]);

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
      </div>
      {children}
    </>
  );
}
