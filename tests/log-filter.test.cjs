const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterLogs } = require('../src/ui/log-filter.js');
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
