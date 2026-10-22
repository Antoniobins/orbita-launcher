const path = require('node:path');
const { spawn } = require('node:child_process');
const { version } = require('../package.json');
const folder = path.resolve(__dirname, '..', 'dist', 'v' + version, `Orbita-${process.platform}-${process.arch}`);
const executable = process.platform === 'win32' ? path.join(folder, 'Orbita.exe') : path.join(folder, 'Orbita.app', 'Contents', 'MacOS', 'Orbita');
const child = spawn(executable, ['--smoke-test'], { stdio: 'inherit', windowsHide: true });
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code === 0 ? 0 : 1; });
