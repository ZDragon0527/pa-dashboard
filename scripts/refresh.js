// PA 업무 현황판(공개용) 데이터 받기 — GitHub Actions에서 실행
// 사용법: node scripts/refresh.js <작업 폴더>
// 환경변수
//   NOTION_TOKEN   노션 내부 연결(읽기 전용) 토큰                 — 저장소 Secrets
//   GOOGLE_SA_KEY  구글 서비스 계정 키(JSON 전체)                  — 저장소 Secrets
//   CALENDAR_ID    캘린더 ID(비우면 PA추진팀 일정)                 — 저장소 Variables(선택)
// 출력: <작업 폴더>/out/ 의 calendar.json, tasks.json, activities.json, reqs.json, orgs.json, snapshot.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const work = process.argv[2] || 'work';
const out = path.join(work, 'out');
fs.mkdirSync(out, { recursive: true });

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const SA_RAW = process.env.GOOGLE_SA_KEY;
const CALENDAR_ID = process.env.CALENDAR_ID || 'mqrdv5mu21livimk34dc0qvh8s@group.calendar.google.com';
const IN_CI = process.env.CI === 'true';
if (!NOTION_TOKEN) { console.error('ERROR: NOTION_TOKEN 이 없습니다(저장소 Secrets 확인).'); process.exit(3); }
if (!SA_RAW && IN_CI) { console.error('ERROR: GOOGLE_SA_KEY 가 없습니다(저장소 Secrets 확인).'); process.exit(3); }

const DB = {
  tasks: '516d10c6ed394bec8ff66d1e12c55e5c',
  activities: '23884873451880b4a96bedbfca975e73',
  reqs: '3cf7f59fc3de45949e65cebb8c5bd546',
  orgs: '99307abaf9e54e3e8a2abba3fc6df097',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (name, rows) => { fs.writeFileSync(path.join(out, name), JSON.stringify(rows)); console.log(name + ': ' + rows.length + '행'); };
const kstDate = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- 구글 캘린더 (서비스 계정) ----------
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('구글 인증 실패 ' + res.status + ': ' + (j.error_description || j.error || ''));
  return j.access_token;
}
async function calendarRows() {
  if (!SA_RAW) { console.log('WARNING: GOOGLE_SA_KEY 가 없어 일정 없이 진행합니다(로컬 시험용).'); return []; }
  const sa = JSON.parse(SA_RAW);
  const token = await googleToken(sa);
  const today = kstDate(new Date());
  const rows = []; let pageToken;
  do {
    const q = new URLSearchParams({ timeMin: today + 'T00:00:00+09:00', timeMax: addDays(today, 15) + 'T23:59:59+09:00', singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeZone: 'Asia/Seoul' });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(CALENDAR_ID) + '/events?' + q, { headers: { Authorization: 'Bearer ' + token } });
    const j = await res.json();
    if (!res.ok) {
      const hint = res.status === 404 ? ' (캘린더를 서비스 계정 ' + sa.client_email + ' 에게 공유했는지 확인)' : '';
      throw new Error('캘린더 조회 실패 ' + res.status + ': ' + ((j.error && j.error.message) || '') + hint);
    }
    for (const e of j.items || []) {
      if (e.status === 'cancelled') continue;
      rows.push({
        id: e.id, title: e.summary || '',
        start: (e.start && (e.start.dateTime || e.start.date)) || '', end: (e.end && (e.end.dateTime || e.end.date)) || '',
        all_day: !(e.start && e.start.dateTime), location: e.location || '', link: e.htmlLink || '',
      });
    }
    pageToken = j.nextPageToken;
  } while (pageToken);
  return rows;
}

// ---------- 노션 ----------
const H = { Authorization: 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
async function api(method, url, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.notion.com/v1/' + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    const j = await res.json();
    if (!res.ok) {
      const hint = res.status === 401 ? ' (토큰이 틀렸거나 만료됨)' : res.status === 404 ? ' (이 DB가 노션 연결에 공유되지 않음)' : '';
      throw new Error(`Notion ${res.status} ${j.code || ''}: ${j.message || ''}${hint}`);
    }
    return j;
  }
  throw new Error('Notion API 재시도 한도 초과');
}
async function queryAll(dbId, sorts) {
  const rows = []; let cursor;
  do {
    const j = await api('POST', `databases/${dbId}/query`, { page_size: 100, start_cursor: cursor, sorts });
    rows.push(...j.results); cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return rows.filter((p) => !p.archived && !p.in_trash);
}
// 관계가 25개를 넘으면 쿼리 응답이 잘리므로 속성 엔드포인트로 다시 센다(p.id 는 이미 URL 인코딩된 값)
async function relationIds(page, name) {
  const p = page.properties[name];
  if (!p || p.type !== 'relation') return [];
  if (!p.has_more) return p.relation.map((r) => r.id);
  const ids = []; let cursor;
  do {
    const j = await api('GET', `pages/${page.id}/properties/${p.id}?page_size=100${cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''}`);
    for (const it of j.results || []) if (it.relation) ids.push(it.relation.id);
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return ids.length >= p.relation.length ? ids : p.relation.map((r) => r.id);
}
const text = (p) => {
  if (!p) return null;
  const arr = p.type === 'title' ? p.title : p.type === 'rich_text' ? p.rich_text : null;
  if (!arr) return null;
  const s = arr.map((t) => t.plain_text).join('').trim();
  return s || null;
};
const sel = (p) => (p && p.type === 'select' && p.select ? p.select.name : p && p.type === 'status' && p.status ? p.status.name : null);
const multi = (p) => (p && p.type === 'multi_select' && p.multi_select.length ? JSON.stringify(p.multi_select.map((o) => o.name)) : null);
const dateStart = (p) => (p && p.type === 'date' && p.date ? p.date.start : null);

(async () => {
  write('calendar.json', await calendarRows());

  const tasks = await queryAll(DB.tasks, [{ property: '마감일', direction: 'ascending' }]);
  write('tasks.json', tasks.map((p) => ({ url: p.url, name: text(p.properties['Name']), owner: sel(p.properties['담당']), status: sel(p.properties['상태']), due: dateStart(p.properties['마감일']) })));

  // 공개용: 활동 '반응'은 받지 않는다
  const acts = await queryAll(DB.activities, [{ property: '일시', direction: 'descending' }]);
  write('activities.json', acts.map((p) => {
    const start = dateStart(p.properties['일시']);
    return { url: p.url, title: text(p.properties['활동 내역']), start, is_datetime: start && start.includes('T') ? 1 : 0, kinds: multi(p.properties['활동종류']), regions: multi(p.properties['지역']), reaction: null, actors: multi(p.properties['활동자']), summary: text(p.properties['요약']) };
  }));

  // 공개용: 요구사항 '비고'는 받지 않는다
  const reqs = await queryAll(DB.reqs, [{ property: '최초제기일', direction: 'descending' }]);
  write('reqs.json', reqs.map((p) => ({ url: p.url, title: text(p.properties['요구내용']), status: sel(p.properties['상태']), kind: sel(p.properties['유형']), owners: multi(p.properties['담당']), term: sel(p.properties['조치기한']), raised: dateStart(p.properties['최초제기일']), note: null, sources: null })));

  // 공개용: 단체 '성향'·'비고'는 받지 않는다
  const orgs = await queryAll(DB.orgs, [{ property: '단체명', direction: 'ascending' }]);
  const orgRows = [];
  for (const p of orgs) {
    const a = await relationIds(p, '활동기록'), r = await relationIds(p, '요구사항');
    orgRows.push({ url: p.url, name: text(p.properties['단체명']), kind: sel(p.properties['단체유형']), regions: multi(p.properties['지역']), scope: sel(p.properties['대상범위']), lean: null, people: text(p.properties['주요 인물']), alias: text(p.properties['별칭·이표기']), note: null, review: sel(p.properties['검수상태']), act_links: JSON.stringify(a), req_links: JSON.stringify(r) });
  }
  write('orgs.json', orgRows);

  const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T').slice(0, 16);
  write('snapshot.json', [{ at }]);
  console.log('OK ' + at);
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
