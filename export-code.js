const fs = require('fs');
const path = require('path');

// 配置：要扫描的目录
const SCAN_DIRS = ['pages', 'utils', 'services', 'components'];
// 配置：要读取的文件后缀
const EXTENSIONS = ['.js', '.wxml', '.wxss', '.json'];
// 输出文件
const OUTPUT_FILE = 'project_context.txt';

let outputContent = '';

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            scanDir(filePath); // 递归
        } else {
            const ext = path.extname(file);
            // 过滤文件类型，且排除 miniprogram_npm 和 node_modules
            if (EXTENSIONS.includes(ext) && !filePath.includes('miniprogram_npm')) {
                const content = fs.readFileSync(filePath, 'utf8');
                outputContent += `\n\n--- FILE START: ${filePath} ---\n`;
                outputContent += content;
                outputContent += `\n--- FILE END: ${filePath} ---\n`;
            }
        }
    });
}

console.log('正在提取代码灵力...');
SCAN_DIRS.forEach(dir => {
    scanDir(path.join(__dirname, dir));
});
// 加上 app.js 和 app.json
['app.js', 'app.json', 'app.wxss'].forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        outputContent += `\n\n--- FILE START: ${file} ---\n`;
        outputContent += content;
        outputContent += `\n--- FILE END: ${file} ---\n`;
    }
});

fs.writeFileSync(OUTPUT_FILE, outputContent);
console.log(`✅ 代码已提取至 ${OUTPUT_FILE}，请打开该文件，全选复制发给 AI。`);