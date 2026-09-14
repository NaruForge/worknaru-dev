import {
  useId,
  useRef,
  type AnchorHTMLAttributes,
  type ComponentPropsWithRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Dialog as PrimitiveDialog, DropdownMenu } from 'radix-ui';
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  Info,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Send,
  Settings,
  X,
} from 'lucide-react';
import styles from './ui.module.css';
export {
  PanelGroup,
  ResizablePanel,
  normalizePanelWidth,
  type ResizablePanelProps,
} from './ResizablePanel.js';

const cx = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ');
export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'regular';
};
export function Button({
  variant = 'primary',
  size = 'regular',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], size === 'small' && styles.small, className)}
      {...props}
    />
  );
}
const icons = {
  archive: Archive,
  back: ArrowLeft,
  check: Check,
  chevron: ChevronDown,
  info: Info,
  message: MessageSquare,
  more: MoreHorizontal,
  plus: Plus,
  send: Send,
  settings: Settings,
  close: X,
};
export type IconName = keyof typeof icons;
export function Icon({ name }: { name: IconName }) {
  const Component = icons[name];
  return <Component className={styles.icon} aria-hidden="true" strokeWidth={1.75} />;
}
export function IconButton({
  icon,
  label,
  className,
  ...props
}: Omit<ButtonProps, 'children'> & { icon: IconName; label: string }) {
  return (
    <Button
      variant="ghost"
      {...props}
      aria-label={label}
      title={label}
      className={cx(styles.iconButton, className)}
    >
      <Icon name={icon} />
    </Button>
  );
}
export function Link({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cx(styles.link, className)} {...props} />;
}
export function Stack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.stack, className)} {...props} />;
}
export function Inline({
  align,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: 'end' | 'between' }) {
  return <div className={cx(styles.inline, align && styles[align], className)} {...props} />;
}
export function ListDetail({
  navigation,
  selected,
  children,
}: {
  navigation: ReactNode;
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <main className={styles.listDetail} data-selected={selected}>
      <div className={styles.navigation}>{navigation}</div>
      <div className={styles.detailContent}>{children}</div>
    </main>
  );
}
export type FieldProps = { label: string; hint?: string; error?: string };
function Field({
  label,
  hint,
  error,
  id,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <small id={`${id}-hint`} className={styles.hint}>
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className={styles.errorText} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
function fieldAttributes(id: string, hint?: string, error?: string) {
  return {
    id,
    'aria-invalid': !!error,
    'aria-describedby':
      [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined,
  };
}
export function TextField({
  label,
  hint,
  error,
  id: suppliedId,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <Field {...{ label, id }} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <input
        className={cx(styles.input, className)}
        {...fieldAttributes(id, hint, error)}
        {...props}
      />
    </Field>
  );
}
export function TextArea({
  label,
  hint,
  error,
  id: suppliedId,
  className,
  ...props
}: ComponentPropsWithRef<'textarea'> & FieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <Field {...{ label, id }} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <textarea
        className={cx(styles.input, styles.textarea, className)}
        {...fieldAttributes(id, hint, error)}
        {...props}
      />
    </Field>
  );
}
export function Select({
  label,
  hint,
  error,
  id: suppliedId,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <Field {...{ label, id }} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <select
        className={cx(styles.input, className)}
        {...fieldAttributes(id, hint, error)}
        {...props}
      />
    </Field>
  );
}
export type Tone = 'neutral' | 'success' | 'warning' | 'error';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}
export function Alert({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx(styles.alert, styles[tone])}>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading({ children = '불러오는 중…' }: { children?: ReactNode }) {
  return <Alert>{children}</Alert>;
}
export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  busy?: boolean;
  presentation?: 'dialog' | 'sheet';
  returnFocus?: () => HTMLElement | null;
};
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  busy = false,
  presentation = 'dialog',
  returnFocus,
}: DialogProps) {
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  return (
    <PrimitiveDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <PrimitiveDialog.Portal>
        <PrimitiveDialog.Overlay className={styles.overlay} />
        <PrimitiveDialog.Content
          ref={content}
          className={cx(styles.dialog, presentation === 'sheet' && styles.sheet)}
          aria-busy={busy}
          onOpenAutoFocus={(event) => {
            opener.current = document.activeElement as HTMLElement;
            const input = content.current?.querySelector<HTMLElement>(
              'input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
            );
            if (input) {
              event.preventDefault();
              input.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus?.() ?? opener.current;
            if (target?.isConnected) target.focus();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <Inline align="between">
            <PrimitiveDialog.Title>{title}</PrimitiveDialog.Title>
            <IconButton
              label="창 닫기"
              icon="close"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            />
          </Inline>
          <PrimitiveDialog.Description className={styles.description}>
            {description}
          </PrimitiveDialog.Description>
          {children}
        </PrimitiveDialog.Content>
      </PrimitiveDialog.Portal>
    </PrimitiveDialog.Root>
  );
}
export function ConfirmDialog({
  confirmLabel,
  onConfirm,
  children,
  ...props
}: DialogProps & { confirmLabel: string; onConfirm: () => void }) {
  return (
    <Dialog {...props}>
      <Stack>
        {children}
        <Inline align="end">
          <Button
            variant="secondary"
            disabled={props.busy}
            onClick={() => props.onOpenChange(false)}
          >
            취소
          </Button>
          <Button variant="danger" disabled={props.busy} onClick={onConfirm}>
            {props.busy ? '처리 중…' : confirmLabel}
          </Button>
        </Inline>
      </Stack>
    </Dialog>
  );
}
export function Menu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost">
          {label}
          <Icon name="chevron" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} sideOffset={4}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={styles.item}
              onSelect={item.onSelect}
              disabled={!!item.disabled}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
