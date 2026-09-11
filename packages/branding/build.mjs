import { fileURLToPath } from 'node:url';
import { buildBrand } from './build-brand.mjs';

const directory = fileURLToPath(new URL('./', import.meta.url));
await buildBrand(directory);
