import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './panels.module.css';
export function PanelGroup({ className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'style'>) {
  return (
    <div
      {...props}
      className={[styles.group, className].filter(Boolean).join(' ')}
      data-panel-group
    />
  );
}

/** CSS tokens own the constraints. Null selects the role's default width. */
export function normalizePanelWidth(width: unknown): number | null {
  if (typeof width !== 'number' || !Number.isFinite(width)) return null;
  const css = getComputedStyle(document.documentElement);
  const min = parseFloat(css.getPropertyValue('--panel-min-width')) || 0;
  const max = parseFloat(css.getPropertyValue('--panel-max-width')) || Number.MAX_SAFE_INTEGER;
  return Math.max(min, Math.min(max, width));
}
export interface ResizablePanelProps {
  label: string;
  side: 'start' | 'end';
  width: number | null;
  onWidthChange: (width: number) => void;
  collapsed?: boolean;
  children: ReactNode;
}
export function ResizablePanel({
  label,
  side,
  width,
  onWidthChange,
  collapsed = false,
  children,
}: ResizablePanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dimensions, setDimensions] = useState({ min: 0, max: 0, width: 0, step: 0 });
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const measure = () => {
      const css = getComputedStyle(document.documentElement);
      const token = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
      const min = token('--panel-min-width');
      const group = element.closest('[data-panel-group]') ?? element.parentElement;
      if (!group?.clientWidth) return;
      const max = Math.max(
        min,
        Math.min(
          token('--panel-max-width'),
          group.clientWidth - token('--work-min-width') - token('--panel-handle-width'),
        ),
      );
      const desired = width ?? token(side === 'start' ? '--sidebar-width' : '--details-width');
      const actual = Math.max(min, Math.min(max, desired));
      setDimensions((current) =>
        current.min === min && current.max === max && current.width === actual
          ? current
          : { min, max, width: actual, step: token('--space-4') },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element.closest('[data-panel-group]') ?? element.parentElement!);
    return () => observer.disconnect();
  }, [width, side, collapsed]);
  const change = (next: number) =>
    onWidthChange(Math.max(dimensions.min, Math.min(dimensions.max, next)));
  return (
    <div
      ref={panel}
      className={styles.panel}
      data-side={side}
      data-collapsed={collapsed}
      style={{ '--panel-size': `${dimensions.width}px` } as CSSProperties}
    >
      <div id={id} className={styles.content}>
        {children}
      </div>
      <div
        role="separator"
        aria-label={label}
        aria-controls={id}
        aria-orientation="vertical"
        aria-valuemin={dimensions.min}
        aria-valuemax={dimensions.max}
        aria-valuenow={dimensions.width}
        aria-valuetext={`${Math.round(dimensions.width)} 픽셀`}
        tabIndex={collapsed ? -1 : 0}
        className={styles.handle}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, width: dimensions.width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            change(
              drag.current.width + (event.clientX - drag.current.x) * (side === 'start' ? 1 : -1),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          change(
            event.key === 'Home'
              ? dimensions.min
              : event.key === 'End'
                ? dimensions.max
                : dimensions.width +
                  (event.key === 'ArrowRight' ? 1 : -1) *
                    (side === 'start' ? 1 : -1) *
                    dimensions.step,
          );
        }}
      />
    </div>
  );
}
