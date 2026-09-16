/** Trusted reference Module: code points (including newlines), and CRLF/CR/LF lines. */
export const textStats = {
  definition: { id: 'text-stats', version: '1.0.0', name: '텍스트 통계', contexts: ['standalone', 'workspace', 'project'] },
  validateInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || typeof value.text !== 'string' || value.text.length > 100000) throw Error('Invalid text');
    return { text: value.text };
  },
  async execute({ text }) {
    return { characters: Array.from(text).length, lines: text.length ? text.split(/\r\n|\r|\n/).length : 0 };
  },
  validateResult(value) {
    if (!value || Object.keys(value).length !== 2
      || !Number.isSafeInteger(value.characters) || value.characters < 0
      || !Number.isSafeInteger(value.lines) || value.lines < 0) throw Error('Invalid result');
    return { characters: value.characters, lines: value.lines };
  },
};
