(function (root) {
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
    const needle = String(query).toLocaleLowerCase('pt-BR');
    let previous = 'info';
    const visible = lines.filter(line => {
      const kind = classify(line, previous);
      if (line.trim()) previous = kind;
      return (level === 'all' || kind === level) && line.toLocaleLowerCase('pt-BR').includes(needle);
    });
    return { text: visible.join('\n'), total: lines.length, count: visible.length };
  }
  if (typeof module === 'object' && module.exports) module.exports = { filterLogs, classify };
  else root.orbitaLogs = { filterLogs };
})(typeof window === 'object' ? window : globalThis);
