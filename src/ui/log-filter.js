(function (root) {
  function literalPattern(query, flags = 'iu') {
    return new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  }
  function highlightSegments(text, query = '') {
    text = String(text);
    if (!query) return [{ text, match: false }];
    const segments = [];
    let end = 0;
    for (const found of text.matchAll(literalPattern(query, 'giu'))) {
      if (found.index > end) segments.push({ text: text.slice(end, found.index), match: false });
      segments.push({ text: found[0], match: true });
      end = found.index + found[0].length;
    }
    if (end < text.length) segments.push({ text: text.slice(end), match: false });
    return segments.length ? segments : [{ text, match: false }];
  }
  function classify(line, previous = 'info') {
    if (/\b(error|exception|fatal|failed|failure|erro|falha|panic)\b|^[ \t]*[✕✗]/i.test(line)) return 'error';
    if (/\b(warn(?:ing)?|aviso|deprecated|deprecat(?:ed|ion))\b|\[!\]/i.test(line)) return 'warning';
    // Keep stack frames and indented diagnostic context with their header.
    if (/^(?:[ \t]+\S|#\d+\s|Caused by:|\.\.\. \d+ more)/.test(line)) return previous;
    return 'info';
  }
  function filterLogs(text, query = '', level = 'all') {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    if (lines.at(-1) === '') lines.pop();
    const pattern = query ? literalPattern(query) : null;
    let previous = 'info';
    const visible = lines.filter(line => {
      const kind = classify(line, previous);
      if (line.trim()) previous = kind;
      return (level === 'all' || kind === level) && (!pattern || pattern.test(line));
    });
    return { text: visible.join('\n'), total: lines.length, count: visible.length };
  }
  if (typeof module === 'object' && module.exports) module.exports = { filterLogs, classify, highlightSegments };
  else root.orbitaLogs = { filterLogs, highlightSegments };
})(typeof window === 'object' ? window : globalThis);
