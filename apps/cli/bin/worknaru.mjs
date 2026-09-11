#!/usr/bin/env node
import { run } from '../entry.mjs';
process.exitCode = await run(process.argv.slice(2), process.env);
