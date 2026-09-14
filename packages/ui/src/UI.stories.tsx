import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  IconButton,
  Inline,
  Link,
  Loading,
  Menu,
  Select,
  Stack,
  TextArea,
  TextField,
} from './index.js';

export default { title: 'UI/Components', parameters: { layout: 'padded' } };
export function Buttons() {
  return (
    <Stack>
      <Inline>
        <Button>저장</Button>
        <Button variant="secondary">취소</Button>
        <Button variant="ghost">자세히</Button>
        <Button variant="danger">보관</Button>
        <Button disabled>처리 중…</Button>
        <IconButton icon="plus" label="추가" />
      </Inline>
      <Inline>
        <Button size="small">작은 버튼</Button>
        <Link href="#examples">도움말</Link>
        <Menu label="메뉴" items={[{ label: '예제 선택', onSelect: () => {} }]} />
      </Inline>
    </Stack>
  );
}
export function Fields() {
  return (
    <Stack>
      <TextField label="이름" hint="화면에 표시할 이름입니다." defaultValue="주간 업무" />
      <TextField label="작업 폴더" error="폴더를 입력해 주세요." />
      <TextField label="비활성 입력" disabled />
      <Select label="전송 방식">
        <option>대기열에 추가</option>
        <option>추가 지시</option>
      </Select>
      <TextArea label="메시지" rows={3} />
    </Stack>
  );
}
export function States() {
  return (
    <Stack>
      <Inline>
        <Badge>대기 중</Badge>
        <Badge tone="success">완료</Badge>
        <Badge tone="warning">응답 필요</Badge>
        <Badge tone="error">실패</Badge>
      </Inline>
      <Alert>메시지를 접수했습니다.</Alert>
      <Alert tone="warning">실행 상태를 확인해 주세요.</Alert>
      <Alert tone="error">연결하지 못했습니다.</Alert>
      <Loading />
      <EmptyState title="아직 항목이 없습니다" action={<Button>추가</Button>}>
        항목을 추가하면 여기에서 볼 수 있습니다.
      </EmptyState>
    </Stack>
  );
}
export function Dialogs() {
  const [kind, setKind] = useState<'dialog' | 'sheet' | 'confirm' | null>(null);
  return (
    <>
      <Inline>
        <Button onClick={() => setKind('dialog')}>입력 창</Button>
        <Button variant="secondary" onClick={() => setKind('sheet')}>
          보조 패널
        </Button>
        <Button variant="danger" onClick={() => setKind('confirm')}>
          확인 창
        </Button>
      </Inline>
      {kind === 'confirm' ? (
        <ConfirmDialog
          open
          onOpenChange={() => setKind(null)}
          title="항목 보관"
          description="기록은 남고 목록에서 보관함으로 이동합니다."
          confirmLabel="보관"
          onConfirm={() => setKind(null)}
        >
          <p>선택한 항목 1개</p>
        </ConfirmDialog>
      ) : (
        kind && (
          <Dialog
            open
            onOpenChange={() => setKind(null)}
            title="입력 창"
            description="키보드로 이동하고 Escape로 닫을 수 있습니다."
            presentation={kind}
          >
            <Stack>
              <TextField label="이름" />
              <Button onClick={() => setKind(null)}>완료</Button>
            </Stack>
          </Dialog>
        )
      )}
    </>
  );
}
