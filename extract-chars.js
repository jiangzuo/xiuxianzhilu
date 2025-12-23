// extract-chars.js (最终奥义 - font-carrier 核心 & 丹药符咒双修版)
const fs = require('fs');
const path = require('path');
const fontCarrier = require('font-carrier');

// --- 配置区 ---
const projectDir = __dirname;
const fontFileName = 'SIMLI.TTF';
const fontFilePath = path.join(projectDir, 'fonts', fontFileName); // 原始字体路径

// 输出子集化字体文件的路径和名称
const subsetFontDir = path.join(projectDir, 'fonts');
const subsetFontFileName = 'SIMLI_subset.ttf';
const subsetFontPath = path.join(subsetFontDir, subsetFontFileName);

const outputFontDataPath = path.join(projectDir, 'utils', 'font-data.js'); // Base64输出路径
// --- 配置区结束 ---


async function main() {
    try {
        // --- 阶段一：提取所有字符 ---
        console.log('--- [1/3] 开始扫描项目字符 ---');
        const allFiles = getAllFiles(projectDir, ['.wxml', '.js']);
        const uniqueChars = extractUniqueChars(allFiles);
        console.log(`> 字符提取成功，共 ${uniqueChars.length} 个独立字符。`);

        // --- 阶段二：使用 font-carrier 压缩字体 ---
        console.log('\n--- [2/3] 开始使用 font-carrier 压缩字体 ---');
        const transFont = fontCarrier.transfer(fontFilePath);
        transFont.min(uniqueChars);
        const buffers = transFont.output({ types: ['ttf'] });
        const ttfBuffer = buffers.ttf;
        if (!ttfBuffer) {
            throw new Error('font-carrier failed to generate TTF buffer.');
        }
        console.log('> 字体压缩成功，已在内存中生成！');

        // --- 阶段三：兵分两路，同时炼制“丹药”与“符咒” ---
        console.log('\n--- [3/3] 开始生成实体丹药 (subset.ttf) 和灵魂符咒 (Base64) ---');

        // 炼制实体丹药：将 Buffer 写入文件
        if (!fs.existsSync(subsetFontDir)) {
            fs.mkdirSync(subsetFontDir);
        }
        fs.writeFileSync(subsetFontPath, ttfBuffer);
        console.log(`> ✅ 实体丹药炼制成功！已保存至: ${subsetFontPath}`);
        
        // 炼制灵魂符咒：将 Buffer 转换为 Base64 并写入 JS 文件
        const base64Data = ttfBuffer.toString('base64');
        const jsContent = `const fontBase64 = '${base64Data}';\n\nmodule.exports = { fontBase64: fontBase64 };\n`;
        if (!fs.existsSync(path.dirname(outputFontDataPath))) {
            fs.mkdirSync(path.dirname(outputFontDataPath));
        }
        fs.writeFileSync(outputFontDataPath, jsContent, 'utf8');
        console.log(`> ✅ 灵魂符咒炼制成功！已写入: ${outputFontDataPath}`);
        
        console.log('\n--- ✨✨✨ 大道双成！✨✨✨ ---');
        console.log('现在请重启开发者工具并重新编译你的小程序。');

    } catch (error) {
        console.error('\n--- ❌❌❌ 操作失败 ❌❌❌ ---');
        console.error(error);
    }
}


// --- 辅助函数 (这里只有一份，绝无重复) ---
function getAllFiles(dirPath, extensions, fileList = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        if (['node_modules', 'miniprogram_npm', '.git'].includes(file)) return;
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, extensions, fileList);
        } else if (extensions.includes(path.extname(filePath))) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

function extractUniqueChars(files) {
    let fullContent = '';
    files.forEach(file => {
        fullContent += fs.readFileSync(file, 'utf8');
    });
    const charSet = new Set(fullContent);
    const uniqueChars = [...charSet].join('');
    return uniqueChars;
}

main();