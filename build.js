// 构建脚本：把 css/ 与 js/ 源文件内联进 index.template.html，
// 生成自包含的 index.html（双击、在线预览、GitHub Pages 均可直接渲染，
// 不依赖外部文件加载）。
// 修改源文件后运行：node build.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = '<style>\n' + read('css/style.css') + '\n  </style>';
const js = '<script>\n' +
  ['js/data.js', 'js/schedule.js', 'js/results.js', 'js/model.js', 'js/betting.js', 'js/app.js']
    .map((f) => `// ===== ${f} =====\n` + read(f))
    .join('\n') +
  '\n  </script>';

let html = read('index.template.html');
html = html.replace('{{CSS}}', css).replace('{{JS}}', js);
html = html.replace('<head>',
  '<head>\n  <!-- 本文件由 build.js 自动生成，请勿直接编辑；修改 css/ js/ 源文件后运行 node build.js -->');

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('已生成 index.html（' + (html.length / 1024).toFixed(0) + ' KB，自包含单文件）');
