import { createWorknaruCore } from '@worknaru/core';
import { createPaseoRuntime } from '@worknaru/paseo-adapter';
import { CliError } from './arguments.js';
import type { DaemonConfiguration } from './arguments.js';

/** Composition only: select the implementation and inject it into Core. */
export function createCore(configuration: DaemonConfiguration) {
  try {
    return createWorknaruCore({ runtime: createPaseoRuntime(configuration) });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new CliError('invalid_configuration', 'Invalid daemon configuration. Use a ws/wss endpoint without credentials, query parameters or fragments.');
    }
    throw error;
  }
}
