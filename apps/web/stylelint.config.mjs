import stylelint from 'stylelint';
const ruleName = 'worknaru/design-tokens';
const tokens = stylelint.createPlugin(ruleName, () => (root, result) => {
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) {
      stylelint.utils.report({
        ruleName,
        result,
        node: declaration,
        message: 'Define tokens only in packages/ui/src/tokens.css; see docs/ui-design.md.',
      });
      return;
    }
    const rawColor = /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch|color-mix)\(/i.test(declaration.value);
    const rawSize = /(?:^|[\s,(])-?\d*\.?\d+(?:px|rem|em)\b/.test(declaration.value);
    if (
      rawColor ||
      rawSize ||
      (['font-size', 'font-family', 'font-weight', 'box-shadow', 'border-radius'].includes(
        declaration.prop,
      ) &&
        !/^(?:var\(|inherit|none|0$)/.test(declaration.value))
    ) {
      stylelint.utils.report({
        ruleName,
        result,
        node: declaration,
        message:
          'Use a semantic CSS token from packages/ui/src/tokens.css instead of a raw visual value.',
      });
    }
  });
});
export default {
  plugins: [tokens],
  rules: {
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'color-named': 'never',
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color',
      'color-mix',
      'light-dark',
      'device-cmyk',
    ],
    'declaration-block-no-duplicate-properties': true,
    'property-no-unknown': true,
    'declaration-no-important': true,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
    [ruleName]: true,
  },
  overrides: [
    {
      files: ['../../packages/ui/src/tokens.css'],
      rules: { [ruleName]: null, 'color-named': null, 'function-disallowed-list': null },
    },
  ],
};
