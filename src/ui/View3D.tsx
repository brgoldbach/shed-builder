import { useEffect, useRef, type ReactNode } from 'react';
import type { Member } from '../core/member';
import { FramingScene } from '../view3d/scene';

interface Props {
  members: readonly Member[];
  selected: ReadonlySet<string>;
  onPick: (id: string | null) => void;
  children?: ReactNode;
}

export function View3D({ members, selected, onPick, children }: Props) {
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
    view.current?.setMembers(members);
  }, [members]);

  useEffect(() => {
    view.current?.setSelection(selected);
  }, [selected]);

  return (
    <>
      <div ref={host} className="canvas-host" />
      <div className="overlay-actions">
        <button onClick={() => view.current?.fit()}>Fit view</button>
      </div>
      {children}
    </>
  );
}
