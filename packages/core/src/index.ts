import type { DaemonStatus, Runtime } from '@worknaru/runtime';

export type { DaemonStatus } from '@worknaru/runtime';

/** Product API used by Worknaru applications. */
export interface WorknaruCore {
  getDaemonStatus(): Promise<DaemonStatus>;
}

/** The caller selects a Runtime; Core does not discover or configure providers. */
export function createWorknaruCore({ runtime }: { readonly runtime: Runtime }): WorknaruCore {
  return {
    getDaemonStatus: () => runtime.getDaemonStatus(),
  };
}
