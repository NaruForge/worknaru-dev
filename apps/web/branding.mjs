export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function renderBrand(template, brand) {
  const labels = { home: '홈페이지', docs: '문서', support: '지원' };
  const values = {
    name: escapeHtml(brand.displayName),
    favicon: brand.favicon ? `./${brand.favicon}` : 'data:,',
    logo: brand.logo ? `<img class="brand-logo" src="./${brand.logo}" alt="">` : '',
    links: Object.entries(brand.links).map(([key, href]) => `<a href="${escapeHtml(href)}">${labels[key]}</a>`).join('\n'),
  };
  return template.replace(/\{\{brand\.(name|favicon|logo|links)\}\}/g, (_, key) => values[key]);
}
