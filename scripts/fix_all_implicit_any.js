const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const targetDirs = ['D:/QuidMotion/app', 'D:/QuidMotion/lib'];

targetDirs.forEach(dir => {
  walkDir(dir, filePath => {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix implicit any in maps, filters, reduces, find
    let updated = content
      .replace(/\.map\(\(([a-zA-Z0-9_]+)\)\s*=>/g, '.map(($1: any) =>')
      .replace(/\.filter\(\(([a-zA-Z0-9_]+)\)\s*=>/g, '.filter(($1: any) =>')
      .replace(/\.find\(\(([a-zA-Z0-9_]+)\)\s*=>/g, '.find(($1: any) =>')
      .replace(/\.reduce\(\(([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_]+)\)\s*=>/g, '.reduce(($1: any, $2: any) =>');

    if (content !== updated) {
      fs.writeFileSync(filePath, updated, 'utf8');
      console.log('Fixed:', filePath);
    }
  });
});
