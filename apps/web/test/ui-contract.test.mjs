import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';

test('the product bundle preserves the flat public asset contract', async () => {
  const files = await readdir(new URL('../dist/', import.meta.url));
  assert.deepEqual(files.filter((file) => !file.startsWith('brand-')).sort(), [
    'app.js',
    'index.html',
    'styles.css',
  ]);
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /\.\/styles\.css/);
  assert.doesNotMatch(html, /storybook|connection\.json|main\.tsx/);
});
test('UI import and inline style violations fail with an actionable explanation', async () => {
  const eslint = new ESLint({
    cwd: new URL('../../../', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
  });
  const [result] = await eslint.lintText(
    'import {Dialog} from "radix-ui"; export const View = () => <div style={{color: "red"}} />;',
    { filePath: 'apps/web/src/Violation.tsx' },
  );
  assert.ok(result.messages.some((message) => message.ruleId === 'no-restricted-imports'));
  assert.ok(result.messages.some((message) => message.ruleId === 'worknaru/no-inline-style'));
  const [boundary] = await eslint.lintText('import {createWorknaruCore} from "@worknaru/core";', {
    filePath: 'packages/ui/src/Violation.tsx',
  });
  assert.ok(boundary.messages.some((message) => message.ruleId === 'no-restricted-imports'));
});
test('style checks reject raw visual values and accept shared tokens', async () => {
  const configFile = new URL('../stylelint.config.mjs', import.meta.url).pathname.replace(
    /^\/(?=[A-Za-z]:)/,
    '',
  );
  for (const declaration of [
    'color: #123456',
    'padding: 13px',
    'color: red',
    'background: rgba(0,0,0,.5)',
    'color: hsla(0,0%,0%,.5)',
    'color: oklch(50% .2 30)',
    'border: thin solid blue',
    'color: var(--text, red)',
  ]) {
    const bad = await stylelint.lint({ code: `.example { ${declaration}; }`, configFile });
    assert.equal(bad.errored, true, declaration);
  }
  const good = await stylelint.lint({
    code: '.example { color: var(--text); padding: var(--space-4); background: transparent; border-color: currentColor; }',
    configFile,
  });
  assert.equal(good.errored, false);
});
