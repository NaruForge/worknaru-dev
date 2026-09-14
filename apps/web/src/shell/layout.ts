import { useEffect, useState } from 'react';
import { normalizePanelWidth } from '@worknaru/ui';

export const layoutKey = 'worknaru.ui.layout.v1';
export const defaultLayout = {
  sidebarWidth: null as number | null,
  detailsWidth: null as number | null,
  sidebarCollapsed: false,
  detailsOpen: false,
};
export type PanelLayout = typeof defaultLayout;
export function readLayout(): PanelLayout {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(layoutKey) ?? 'null');
    if (!value || typeof value !== 'object') return defaultLayout;
    const saved = value as Record<string, unknown>;
    return {
      sidebarWidth: normalizePanelWidth(saved.sidebarWidth),
      detailsWidth: normalizePanelWidth(saved.detailsWidth),
      sidebarCollapsed: saved.sidebarCollapsed === true,
      detailsOpen: saved.detailsOpen === true,
    };
  } catch {
    return defaultLayout;
  }
}
export function usePanelLayout() {
  const [layout, setLayout] = useState(readLayout);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(layout));
      setStorageError('');
    } catch {
      setStorageError(
        '브라우저에 배치를 저장할 수 없습니다. 현재 탭에서는 계속 사용할 수 있습니다.',
      );
    }
  }, [layout]);
  return { layout, setLayout, storageError, reset: () => setLayout({ ...defaultLayout }) };
}
