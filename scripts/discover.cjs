// Explicit, local-only discovery. Never reads secrets or modifies source projects.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ignored = new Set(['node_modules', '.git', '.dart_tool', 'build', 'dist', 'target', 'Pods', '.symlinks', '.venv', '.claude', '.codex', '.agents']);
const args = process.argv.slice(2);
const output = args.shift();
if (!output || !args.length) { console.error('Uso: node scripts/discover.cjs data/projects.json Coleção=/caminho/projetos [...]'); process.exit(1); }
const windows = process.platform === 'win32';
let flutter = windows ? 'flutter.bat' : 'flutter';
if (!windows) { try { flutter = execFileSync('/bin/zsh', ['-lc', 'command -v flutter'], { encoding: 'utf8' }).trim(); } catch {} }
const quote = text => windows ? '"' + text + '"' : "'" + text.replace(/'/g, "'\\''") + "'";
const projects = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
let port = 8300;
const usedPorts = new Set(projects.filter(p => p.url).map(p => new URL(p.url).port));
function visit(dir, group, depth = 0) {
  if (depth > 7) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const flutterProject = entries.some(e => e.name === 'pubspec.yaml');
  const mavenProject = entries.some(e => e.name === 'pom.xml') && !flutterProject;
  if (flutterProject || mavenProject) {
    if (projects.some(p => p.path === dir)) return;
    const basename = path.basename(dir);
    const name = basename.replace(/[_-]/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase());
    while (usedPorts.has(String(port))) port++;
    const currentPort = port++;
    usedPorts.add(String(currentPort));
    let command = '', url = '';
    if (flutterProject) {
      command = `${quote(flutter)} run -d chrome --web-port=${currentPort}`;
      url = `http://localhost:${currentPort}`;
    } else {
      const wrapper = entries.some(e => e.name === (windows ? 'mvnw.cmd' : 'mvnw')) && fs.existsSync(path.join(dir, '.mvn/wrapper/maven-wrapper.properties'));
      command = `${wrapper ? (windows ? '.\\mvnw.cmd' : './mvnw') : 'mvn'} spring-boot:run`;
      // Keep the service's existing port/configuration. Don't rewrite backend settings.
      const candidates = ['src/main/resources/application.properties', 'src/main/resources/application.yml', 'src/main/resources/application.yaml'];
      for (const candidate of candidates) {
        if (!fs.existsSync(path.join(dir, candidate))) continue;
        const text = fs.readFileSync(path.join(dir, candidate), 'utf8');
        const match = text.match(/^server\.port\s*=\s*(\d+)/m);
        if (match) url = `http://localhost:${match[1]}`;
        if (!match && /\.ya?ml$/.test(candidate)) {
          const yamlPort = text.match(/^server:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+port:\s*(\d+)/m);
          if (yamlPort) url = `http://localhost:${yamlPort[1]}`;
        }
      }
      if (!url) url = 'http://localhost:8080';
    }
    const archived = /antigo|estudo|cópia|notutilized/i.test(dir);
    projects.push({ id: randomUUID(), name, group, path: dir, command, url, description: `${flutterProject ? 'Flutter' : 'Java · Spring Boot'}${archived ? ' · Estudos / versões anteriores' : ' · Ambiente de desenvolvimento'}`, favorite: !archived });
    return;
  }
  for (const entry of entries) if (entry.isDirectory() && !entry.name.startsWith('.') && !ignored.has(entry.name)) visit(path.join(dir, entry.name), group, depth + 1);
}
for (const arg of args) {
  const index = arg.indexOf('=');
  if (index < 1) throw new Error('Use Coleção=/caminho');
  visit(path.resolve(arg.slice(index + 1)), arg.slice(0, index));
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(projects, null, 2), { mode: 0o600 });
console.log(`Catálogo local: ${projects.length} projetos em ${output}`);
