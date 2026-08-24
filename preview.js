const { execSync } = require('child_process');
const path = require('path');

// 1. 构建最新的 preview.html
console.log('正在构建最新的 HTML 预览页...');
require('./build-preview.js');

// 2. 自动在系统默认浏览器中打开 preview.html
const previewFile = path.join(__dirname, 'preview.html');
console.log('正在打开默认浏览器预览:', previewFile);

try {
  if (process.platform === 'win32') {
    execSync(`start "" "${previewFile}"`);
  } else if (process.platform === 'darwin') {
    execSync(`open "${previewFile}"`);
  } else {
    execSync(`xdg-open "${previewFile}"`);
  }
  console.log('🚀 预览页已在浏览器中启动！');
} catch (e) {
  console.error('打开浏览器失败，请手动双击打开 preview.html:', e.message);
}
