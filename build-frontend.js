const fs = require('fs');
const path = require('path');

const root = __dirname;
const sourceRoot = path.join(root, 'desktop-ui');
const dist = path.join(root, 'dist');

// 清理并创建 dist 目录
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true });
}
fs.mkdirSync(dist, { recursive: true });

// 复制前端资源
const filesToCopy = ['index.html', 'data.json'];
const dirsToCopy = ['css', 'js'];

for (const file of filesToCopy) {
  const src = path.join(sourceRoot, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(dist, file));
  }
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dir of dirsToCopy) {
  const srcDir = path.join(sourceRoot, dir);
  if (fs.existsSync(srcDir)) {
    copyDir(srcDir, path.join(dist, dir));
  }
}

console.log('前端资源已复制到 dist/');
