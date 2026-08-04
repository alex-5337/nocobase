// 临时验证脚本：检查固定行距内联逻辑
const WORD_BODY_FONT_FAMILY = "Helvetica, Arial, 'Microsoft YaHei', SimSun, sans-serif";
const WORD_BODY_FONT_SIZE = '13px';
const WORD_BODY_LINE_HEIGHT = 1.42;

function getWordLineHeight(fontSize) {
  const px = /([\d.]+)px/i.exec(fontSize);
  if (px) return `${Math.round(parseFloat(px[1]) * WORD_BODY_LINE_HEIGHT * 10) / 10}px`;
  const pt = /([\d.]+)pt/i.exec(fontSize);
  if (pt) return `${Math.round(parseFloat(pt[1]) * WORD_BODY_LINE_HEIGHT * 10) / 10}pt`;
  return `${Math.round(13 * WORD_BODY_LINE_HEIGHT * 10) / 10}px`;
}
function getWordBlockStyle(fontSize = WORD_BODY_FONT_SIZE) {
  return {
    'font-family': WORD_BODY_FONT_FAMILY,
    'font-size': fontSize,
    'line-height': getWordLineHeight(fontSize),
    margin: '0',
  };
}
function mergeCss(existing, added) {
  const map = {};
  existing.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx > 0) map[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  });
  Object.entries(added).forEach(([k, v]) => {
    if (!(k in map)) map[k] = v;
  });
  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}
const QUILL_ALIGN_CLASSES = { 'ql-align-center': 'center', 'ql-align-right': 'right', 'ql-align-justify': 'justify' };
function inlineStyleToTag(html, tagName, style) {
  const re = new RegExp(`(<${tagName}\\b[^>]*?)(/?)>`, 'gi');
  return html.replace(re, (match, open, selfClose) => {
    const styleAttr = /\sstyle="([^"]*)"/i.exec(open);
    let fontSize = style['font-size'] || WORD_BODY_FONT_SIZE;
    if (styleAttr) {
      const fs = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(styleAttr[1]);
      if (fs) fontSize = fs[1].trim();
    }
    const toAdd = { ...style, 'line-height': getWordLineHeight(fontSize) };
    const classAttr = /\sclass="([^"]*)"/i.exec(open);
    if (classAttr) {
      const classNames = classAttr[1].split(/\s+/);
      const align = classNames.find((c) => QUILL_ALIGN_CLASSES[c]);
      if (align && !('text-align' in toAdd)) toAdd['text-align'] = QUILL_ALIGN_CLASSES[align];
      const indentMatch = /^ql-indent-(\d)$/.exec(classNames.find((c) => /^ql-indent-\d$/.test(c)) || '');
      if (indentMatch && !('padding-left' in toAdd)) toAdd['padding-left'] = `${parseInt(indentMatch[1], 10) * 3}em`;
    }
    if (styleAttr) {
      const merged = mergeCss(styleAttr[1], toAdd);
      return `${open.replace(/\sstyle="[^"]*"/i, ` style="${merged}"`)}${selfClose}>`;
    }
    const css = Object.entries(toAdd)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    return `${open} style="${css}"${selfClose}>`;
  });
}
function inlineWordStyles(html) {
  let out = html;
  out = inlineStyleToTag(out, 'table', { 'border-collapse': 'collapse', border: 'none', width: '100%' });
  out = inlineStyleToTag(out, 'th', {
    border: '1px solid #000',
    padding: '2px 5px',
    'vertical-align': 'top',
    background: '#f0f0f0',
    ...getWordBlockStyle(),
  });
  out = inlineStyleToTag(out, 'td', {
    border: '1px solid #000',
    padding: '2px 5px',
    'vertical-align': 'top',
    ...getWordBlockStyle(),
  });
  out = inlineStyleToTag(out, 'p', getWordBlockStyle());
  out = inlineStyleToTag(out, 'div', getWordBlockStyle());
  out = inlineStyleToTag(out, 'li', getWordBlockStyle());
  out = inlineStyleToTag(out, 'blockquote', getWordBlockStyle());
  out = inlineStyleToTag(out, 'h1', getWordBlockStyle('26px'));
  out = inlineStyleToTag(out, 'h2', getWordBlockStyle('19.5px'));
  out = inlineStyleToTag(out, 'h3', getWordBlockStyle('15px'));
  out = inlineStyleToTag(out, 'h4', getWordBlockStyle('13px'));
  out = inlineStyleToTag(out, 'h5', getWordBlockStyle('11px'));
  out = inlineStyleToTag(out, 'h6', getWordBlockStyle('9px'));
  return out;
}

const sample = `<p>默认段</p><p style="font-size:16pt">大字号段</p><p class="ql-align-center">居中</p><h1>标题</h1><table><tbody><tr><th>表头</th><td>单元</td></tr></tbody></table>`;
const inlined = inlineWordStyles(sample);
console.log(inlined);
console.log('');
const assert = (name, ok) => console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name);
const p1 = inlined.match(/<p style="([^"]*)">/)[1];
const p2 = inlined.match(/<p style="font-size:16pt;([^"]*)">/)[1];
const p3 = inlined.match(/<p class="ql-align-center" style="([^"]*)">/)[1];
const h1 = inlined.match(/<h1 style="([^"]*)">/)[1];
const td = inlined.match(/<td style="([^"]*)">/)[1];
console.log('p 默认:', p1);
console.log('p 16pt:', p2);
console.log('h1:', h1);
console.log('td:', td);
console.log('');
assert('p 默认 line-height 18.5px', /line-height: 18.5px/.test(p1));
assert('p 16pt line-height 22.7pt（随字号）', /line-height: 22.7pt/.test(p2) && /font-size: 16pt/.test(p2));
assert('h1 line-height 36.9px（随字号）', /line-height: 36.9px/.test(h1) && /font-size: 26px/.test(h1));
assert('td line-height 18.5px', /line-height: 18.5px/.test(td));
assert('p 居中 text-align', /text-align: center/.test(p3));
