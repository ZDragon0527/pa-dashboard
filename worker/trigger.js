// (선택) 새로고침 버튼용 Cloudflare Worker
// 공개 페이지에서 버튼을 누르면 이 주소로 POST가 오고, GitHub Actions 갱신을 한 번 실행한다.
// GitHub 토큰은 이 Worker의 비밀 값에만 두고 페이지에는 절대 넣지 않는다.
// 설정할 값(Worker → Settings → Variables and Secrets)
//   GITHUB_TOKEN   (Secret) 이 저장소 하나만, 권한 'Actions: Read and write' 인 fine-grained 토큰
//   REPO           (Text)   예: moonshine1977/pa-dashboard
//   ALLOWED_ORIGIN (Text)   예: https://moonshine1977.github.io
// 남용 방지: 갱신이 진행 중이거나 최근 5분 안에 시작됐으면 새로 실행하지 않는다.
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ status: 'method_not_allowed' }, 405);
    if (env.ALLOWED_ORIGIN && request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json({ status: 'forbidden' }, 403);

    const gh = (p, init = {}) => fetch('https://api.github.com/repos/' + env.REPO + p, {
      ...init,
      headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'pa-dashboard-trigger', ...(init.headers || {}) },
    });

    const runsRes = await gh('/actions/workflows/update.yml/runs?per_page=1');
    if (!runsRes.ok) return json({ status: 'error', step: 'list', code: runsRes.status }, 502);
    const last = ((await runsRes.json()).workflow_runs || [])[0];
    if (last && (last.status !== 'completed' || Date.now() - Date.parse(last.created_at) < 5 * 60 * 1000)) return json({ status: 'cooldown' }, 429);

    const r = await gh('/actions/workflows/update.yml/dispatches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
    return r.status === 204 ? json({ status: 'started' }) : json({ status: 'error', step: 'dispatch', code: r.status }, 502);
  },
};
