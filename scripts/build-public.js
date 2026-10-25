// 공개용 현황판 HTML 만들기 — GitHub Pages 에 올릴 완성된 문서를 만든다
// 사용법: node scripts/build-public.js <작업 폴더> <출력 폴더>
// 환경변수 TRIGGER_URL(선택): 새로고침 버튼이 갱신을 요청할 주소(Cloudflare Worker). 비우면 버튼은 최신 게시본만 다시 불러온다.
const fs = require('fs');
const path = require('path');

const work = process.argv[2] || 'work';
const dist = process.argv[3] || 'dist';
const out = path.join(work, 'out');
fs.mkdirSync(dist, { recursive: true });
const read = (n) => JSON.parse(fs.readFileSync(path.join(out, n + '.json'), 'utf8'));
const part = (n) => fs.readFileSync(path.join(__dirname, '..', 'templates', n), 'utf8').replace(/^﻿/, '');

// 공개하지 않는 항목은 여기서 한 번 더 지운다
const data = {
  calendar: read('calendar'),
  tasks: read('tasks'),
  activities: read('activities').map((r) => ({ ...r, reaction: null })),
  reqs: read('reqs').map((r) => ({ ...r, note: null })),
  orgs: read('orgs').map((o) => ({ ...o, lean: null, note: null })),
  snapshot: read('snapshot'),
};

const head = part('public-head.html');
const ti = head.indexOf('</title>') + '</title>'.length;
const body = part('public-body.html');
const si = body.indexOf('<script>');
if (si < 0) throw new Error('public-body.html 에 <script> 가 없습니다');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const trigger = '<script>window.PA_TRIGGER = ' + JSON.stringify(process.env.TRIGGER_URL || '').replace(/</g, '\\u003c') + ';</script>\n';

// 안드로이드 등에서 '앱 설치'가 되도록 웹앱 설정(manifest)·아이콘·서비스 워커를 연결한다
const appHead = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">',
  '<link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="theme-color" content="#132a40">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="PA 현황판">',
].join('\n') + '\n';
const swReg = "<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n";

const html = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<meta name="robots" content="noindex,nofollow">\n'
  + appHead
  + head.slice(0, ti) + '\n</head>\n<body>\n'
  + head.slice(ti) + body.slice(0, si) + '\n</div>\n'
  + trigger + part('public-shim.html').replace('__PA_DATA__', () => json) + body.slice(si)
  + swReg
  + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
// assets 폴더(웹앱 설정·아이콘·서비스 워커)를 그대로 함께 게시
fs.cpSync(path.join(__dirname, '..', 'assets'), dist, { recursive: true });
console.log('dist/index.html: ' + Math.round(html.length / 1024) + 'KB');
