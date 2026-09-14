import { useState } from 'react';
import { Button, PanelGroup, ResizablePanel, Stack } from './index.js';
import styles from './panelStories.module.css';
export default { title: 'UI/Panels', parameters: { layout: 'fullscreen' } };
export function Adjustable() {
  const [width, setWidth] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={styles.example}>
      <PanelGroup>
        <ResizablePanel
          side="start"
          label="탐색 패널 너비"
          width={width}
          onWidthChange={setWidth}
          collapsed={collapsed}
        >
          <div className={styles.region}>
            <Stack>
              <h2>탐색</h2>
              <p>구분선을 드래그하거나 방향키·Home·End로 조절합니다.</p>
            </Stack>
          </div>
        </ResizablePanel>
        <div className={styles.content}>
          <Stack>
            <h1>작업 영역</h1>
            <p>표시 데이터와 callback만 받는 공통 배치입니다. 저장은 호출하는 앱이 담당합니다.</p>
            <Button onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? '탐색 펼치기' : '탐색 접기'}
            </Button>
            <Button variant="secondary" onClick={() => setWidth(null)}>
              기본 너비
            </Button>
          </Stack>
        </div>
      </PanelGroup>
    </div>
  );
}
