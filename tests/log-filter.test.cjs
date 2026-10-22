const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterLogs, highlightSegments } = require('../src/ui/log-filter.js');
const logs = 'INFO started\nWARNING deprecated API\nERROR login failed\n    at login (app.js:3)\n#0 main\nINFO healthy\n';
test('combina tipo e busca literal sem diferenciar maiúsculas', () => {
  const result = filterLogs(logs, 'LOGIN', 'error');
  assert.equal(result.count, 2);
  assert.equal(result.total, 6);
  assert.equal(result.text, 'ERROR login failed\n    at login (app.js:3)');
  assert.equal(filterLogs(logs, '.*', 'all').count, 0);
});
test('mantém stack traces e separa avisos de mensagens informativas', () => {
  assert.equal(filterLogs(logs, '', 'error').count, 3);
  assert.equal(filterLogs(logs, '', 'warning').text, 'WARNING deprecated API');
  assert.equal(filterLogs(logs, '', 'info').text, 'INFO started\nINFO healthy');
});
test('lida com logs vazios, CRLF, novas linhas e conteúdo HTML literal', () => {
  assert.deepEqual(filterLogs(''), { text: '', count: 0, total: 0 });
  assert.equal(filterLogs('A\r\nB\rC\n').total, 3);
  assert.equal(filterLogs('<script>literal</script>\n', 'script').text, '<script>literal</script>');
  assert.equal(filterLogs('aviso: inicializando\nerro: conexão indisponível', '', 'error').count, 1);
});
test('marca todas as ocorrências preservando o texto original e a capitalização', () => {
  const text = 'Erro no LOGIN; tentar login novamente. Login.';
  const segments = highlightSegments(text, 'login');
  assert.deepEqual(segments.filter(part => part.match).map(part => part.text), ['LOGIN','login','Login']);
  assert.equal(segments.map(part => part.text).join(''), text);
  assert.deepEqual(highlightSegments('sem busca', ''), [{ text: 'sem busca', match: false }]);
});
test('marca buscas literais com acentos e metacaracteres sem interpretar HTML', () => {
  const text = '<script>ação</script> AÇÃO [a].* [a].*';
  assert.equal(highlightSegments(text, 'ação').filter(part => part.match).length, 2);
  assert.equal(highlightSegments(text, '[a].*').filter(part => part.match).length, 2);
  assert.equal(highlightSegments(text, '<script>').filter(part => part.match)[0].text, '<script>');
  assert.equal(highlightSegments(text, 'ausente').filter(part => part.match).length, 0);
});
