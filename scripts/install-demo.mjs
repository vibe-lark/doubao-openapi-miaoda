/** Copy the demo snapshot into a freshly initialized Miaoda full-stack app. */
import { cp, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const source = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const targetArg = process.argv[2];
if (!targetArg || process.argv.length !== 3) {
  throw new Error('用法：bun run install:demo /path/to/fresh-miaoda-app');
}
const target = await realpath(resolve(targetArg));
for (const [parent, child] of [[source, target], [target, source]]) {
  const rel = relative(parent, child);
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error('目标必须是源码目录之外的独立妙搭应用目录');
  }
}
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.stack !== 'nestjs-react-fullstack' || !/^app_[a-zA-Z0-9]+$/.test(meta.app_id || '')) {
  throw new Error('目标不是已初始化的妙搭 full_stack 应用，请先执行 apps +init');
}
const gitRoot = await realpath(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: target, encoding: 'utf8' }).trim());
if (gitRoot !== target) throw new Error('目标必须是独立 Git 仓库的根目录');
if (execFileSync('git', ['status', '--porcelain'], { cwd: target, encoding: 'utf8' }).trim()) {
  throw new Error('目标存在未提交修改，请先保存，避免覆盖');
}
const appModule = await readFile(join(target, 'server/app.module.ts'), 'utf8');
if (!appModule.includes('@route-section: business-modules START')) throw new Error('目标缺少受支持的妙搭模块结构');
const businessSection = appModule.split('@route-section: business-modules START')[1].split('\n').slice(1).join('\n').split('@route-section: business-modules END')[0];
if (businessSection.replace(/\/\/[^\n]*/g, '').trim()) {
  throw new Error('目标已经接入业务模块，请在干净模板中导入，或手动合并已有业务');
}
const dirs = ['client', 'server', 'shared', 'tests', 'docs', 'scripts'];
const files = ['package.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.json',
  'vite.config.ts', 'nest-cli.json', 'tailwind.config.ts', 'postcss.config.js',
  'components.json', 'eslint.config.js', '.stylelintrc.js', '.prettierrc', '.npmrc', 'package-lock.json', 'bun.lock', 'SOURCE.json'];
// Refuse links to avoid traversing outside the intended scaffold.
for (const item of [...dirs, ...files]) {
  try {
    const location = join(target, item);
    const actual = await realpath(location);
    if (actual !== location) throw new Error(`目标路径含符号链接：${item}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const item of [...dirs, ...files]) {
  await stat(join(source, item));
  await cp(join(source, item), join(target, item), { recursive: true, dereference: false });
}
console.log('已导入 Demo 源码；目标 .spark、.env、平台指南、Git 远端和历史均保留。');
console.log('请在目标目录检查 git diff，按 docs/MIAODA_SETUP.md 初始化业务表和环境变量，再安装依赖与验证。');
