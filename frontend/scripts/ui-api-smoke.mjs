// Run with: node scripts/ui-api-smoke.mjs
// Uses a local Chrome/Edge and Node's built-in CDP client. All API requests are mocked.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserPath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
assert(browserPath, 'Install Chrome/Edge or set CHROME_PATH.');
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const until = async (fn, label) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await fn();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
};
const reserve = createServer();
await new Promise((done) => reserve.listen(0, '127.0.0.1', done));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const origin = `http://127.0.0.1:${port}`;
const tempRoot = resolve(tmpdir());
const profile = await mkdtemp(join(tempRoot, 'kma-ui-smoke-'));
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_API_URL: `${origin}/api/v1` }, stdio: 'ignore', windowsHide: true,
});
let browser;
let browserLog = '';
let socket;
let call;
const requests = [];
const failures = [];
const errors = [];
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const makeUser = (n, username, role = 'user') => ({ id: id(n), username, display_name: username, email: `${username}@example.com`, role, status: 'active', bio: '', website: null, avatar_url: null, is_verified: false, followers_count: 21, following_count: 21, posts_count: 1, replies_count: 0, reposts_count: 0, is_following: false, ai_assistant_enabled: false, created_at: '2026-10-01T00:00:00Z' });
const member = makeUser(1, 'member');
const admin = makeUser(2, 'admin', 'admin');
const other = makeUser(3, 'other');
let currentUser = member;
const media = { id: id(50), url: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', mime_type: 'image/gif', size_bytes: 12345, created_at: '2026-10-01T00:00:00Z' };
let post = { id: id(10), content: 'Nội dung ban đầu', author: member, media: [media], likes_count: 21, reposts_count: 21, replies_count: 0, liked: false, reposted: false, bookmarked: false, is_short: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
let notifications = [1, 2].map((n) => ({ id: id(20 + n), actor: other, type: 'like', message: `Thông báo ${n}`, post_id: post.id, is_read: false, created_at: '2026-10-01T00:00:00Z' }));
let reports = [
  { id: id(30), post_id: post.id, user_id: null, reason: 'spam', status: 'open', details: 'Báo cáo bài viết', created_at: '2026-10-01T00:00:00Z' },
  { id: id(31), post_id: null, user_id: other.id, reason: 'harassment', status: 'open', details: 'Báo cáo tài khoản', created_at: '2026-10-01T00:00:00Z' },
];
// React StrictMode mounts effects twice in development; fail both initial reads.
let peopleFailures = 2;
let failReportOnce = true;
let failSaveOnce = true;
let expireAccess = false;
let rejectLogin = false;
const people = Array.from({ length: 21 }, (_, n) => makeUser(100 + n, `person${n}`));
const page = (items, params) => { const offset = Number(params.get('offset') || 0); const limit = Number(params.get('limit') || 20); return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }; };

function mock(method, url, body, headers) {
  const path = url.pathname.replace('/api/v1', '');
  if (expireAccess && !path.startsWith('/auth/') && (headers.Authorization || headers.authorization) !== 'Bearer access-new') return { status: 401, data: { detail: 'Token expired' } };
  if (path === '/users/me') return currentUser;
  if (path === '/auth/forgot-password') return { message: 'Created', reset_token: 'development-reset-token' };
  if (path === '/auth/reset-password') return { message: 'Password reset' };
  if (path === '/auth/login') return rejectLogin ? { status: 401, data: { detail: 'Thông tin đăng nhập không đúng' } } : { access_token: 'access', refresh_token: 'refresh', user: currentUser };
  if (path === '/auth/refresh') return { access_token: 'access-new', refresh_token: 'refresh-new', user: currentUser };
  if (path === '/posts' || path.startsWith('/feed/')) return page([post], url.searchParams);
  if (/^\/users\/[^/]+$/.test(path)) return path.endsWith('/other') ? other : currentUser;
  if (/\/(followers|following|likes|reposts)$/.test(path) && method === 'GET') {
    if (peopleFailures > 0) { peopleFailures--; return { status: 500, data: { detail: 'Không thể tải danh sách thử nghiệm' } }; }
    return page(people, url.searchParams);
  }
  if (path === `/media/${media.id}`) return media;
  if (path === `/posts/${post.id}`) {
    if (method === 'PATCH') {
      if (failSaveOnce) { failSaveOnce = false; return { status: 422, data: { detail: [{ msg: 'Nội dung chưa hợp lệ' }] } }; }
      post = { ...post, content: body.content, updated_at: '2026-10-04T00:00:00Z' };
    }
    return post;
  }
  if (path === '/reports') {
    if (failReportOnce) { failReportOnce = false; return { status: 409, data: { detail: 'Bạn đã báo cáo đối tượng này' } }; }
    return { id: id(40), ...body, status: 'open' };
  }
  if (path === '/notifications') return { ...page(notifications, url.searchParams), unread_count: notifications.filter((n) => !n.is_read).length };
  if (path === '/notifications/read-all') { notifications = notifications.map((n) => ({ ...n, is_read: true })); return { message: 'Read all' }; }
  if (path.startsWith('/notifications/')) {
    const notificationId = path.split('/')[2];
    if (method === 'DELETE') { notifications = notifications.filter((n) => n.id !== notificationId); return { message: 'Deleted' }; }
    notifications = notifications.map((n) => n.id === notificationId ? { ...n, is_read: true } : n);
    return notifications.find((n) => n.id === notificationId);
  }
  if (path === '/admin/reports') return page(reports.filter((r) => !url.searchParams.get('report_status') || r.status === url.searchParams.get('report_status')), url.searchParams);
  if (path.startsWith('/admin/reports/')) {
    const reportId = path.split('/')[3];
    reports = reports.map((r) => r.id === reportId ? { ...r, ...body } : r);
    return reports.find((r) => r.id === reportId);
  }
  if (path.startsWith('/admin/users/')) return { ...other, status: path.endsWith('/ban') ? 'banned' : 'active' };
  if (path.startsWith('/admin/posts/')) return { message: 'Moderated' };
  failures.push(`${method} ${path}`);
  return { status: 404, data: { detail: `Unexpected API: ${method} ${path}` } };
}

try {
  await until(async () => { try { return (await fetch(origin)).ok; } catch { return false; } }, 'Vite server');
  browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  browser.stderr.on('data', (data) => { browserLog += data; });
  browser.on('error', (error) => { browserLog += error.message; });
  const activePort = await until(async () => { try { return await readFile(join(profile, 'DevToolsActivePort'), 'utf8'); } catch { return false; } }, 'Chrome CDP');
  const debuggerOrigin = `http://127.0.0.1:${activePort.split('\n')[0]}`;
  const targets = await (await fetch(`${debuggerOrigin}/json/list`)).json();
  const tab = targets.find((target) => target.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  let loadCount = 0;
  const pending = new Map();
  call = (method, params = {}) => new Promise((done, reject) => { const requestId = ++sequence; pending.set(requestId, { done, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
  socket.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data);
    if (data.id) { const task = pending.get(data.id); pending.delete(data.id); if (data.error) task?.reject(new Error(data.error.message)); else task?.done(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.method === 'Page.loadEventFired') loadCount++;
    if (data.method === 'Page.javascriptDialogOpening') await call('Page.handleJavaScriptDialog', { accept: true });
    if (data.method === 'Fetch.requestPaused') {
      const { request, requestId } = data.params;
      try {
        const url = new URL(request.url);
        const body = request.postData ? JSON.parse(request.postData) : null;
        requests.push({ method: request.method, path: url.pathname.replace('/api/v1', ''), body });
        const result = mock(request.method, url, body, request.headers);
        if (url.pathname.endsWith('/auth/refresh')) await delay(200);
        await call('Fetch.fulfillRequest', { requestId, responseCode: typeof result?.status === 'number' ? result.status : 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(result?.data || result)).toString('base64') });
      } catch (error) { errors.push(error.message); await call('Fetch.failRequest', { requestId, errorReason: 'Failed' }); }
    }
  });
  await call('Page.enable'); await call('Runtime.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*' }] });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const visibleText = (text) => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
  const waitText = (text) => until(() => visibleText(text), text);
  const click = async (text, selector = 'button') => {
    await until(() => evaluate(`!!Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.trim() === ${JSON.stringify(text)} && e.getClientRects().length && !e.disabled)`), `click ${text}`);
    await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.trim() === ${JSON.stringify(text)} && e.getClientRects().length && !e.disabled).click()`);
  };
  const clickSelector = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  const navigate = async (path) => { const previousLoad = loadCount; await call('Page.navigate', { url: `${origin}${path}` }); await until(() => loadCount > previousLoad, `load ${path}`); await until(() => evaluate('document.readyState === "complete" && !!document.querySelector("#root")'), `navigate ${path}`); };
  const loginAs = async (user) => {
    currentUser = user;
    await evaluate(`localStorage.setItem('user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('access_token', 'access'); localStorage.setItem('refresh_token', 'refresh')`);
    await navigate('/'); await waitText('Tất cả bài viết');
  };
  const requested = (method, path) => requests.some((request) => request.method === method && request.path === path);

  await navigate('/auth'); await waitText('Quên mật khẩu?');
  await click('Quên mật khẩu?'); await fill('input[name=email]', 'member@example.com'); await click('Gửi yêu cầu');
  await waitText('Đặt lại mật khẩu');
  assert.equal(await evaluate('document.querySelector("input[autocomplete=off]").value'), 'development-reset-token');
  await fill('input[name=password]', 'NewPassword123!'); await fill('input[name=confirm_password]', 'Mismatch123!'); await click('Đặt lại mật khẩu'); await waitText('Mật khẩu xác nhận chưa khớp.');
  assert(!requested('POST', '/auth/reset-password'));
  await fill('input[name=confirm_password]', 'NewPassword123!'); await click('Đặt lại mật khẩu'); await waitText('Đã đặt lại mật khẩu.');
  assert.equal(requests.find((r) => r.path === '/auth/reset-password').body.token, 'development-reset-token');
  await navigate('/reset-password?token=link-token'); await waitText('Mã đặt lại mật khẩu');
  assert.equal(await evaluate('document.querySelector("input[autocomplete=off]").value'), 'link-token');
  rejectLogin = true;
  await evaluate("localStorage.setItem('refresh_token', 'stale-refresh')");
  await navigate('/auth'); await waitText('Quên mật khẩu?'); await fill('input[name=login]', 'member'); await fill('input[name=password]', 'Incorrect123!'); await click('Tiếp tục'); await waitText('Thông tin đăng nhập không đúng');
  assert(!requested('POST', '/auth/refresh'), 'Unauthenticated login must not refresh an old session');
  rejectLogin = false;
  console.log('PASS password recovery, confirmation and reset link');

  await loginAs(member); await click('Tất cả bài viết', 'a'); await until(() => requested('GET', '/posts'), 'all posts request'); await waitText('Nội dung ban đầu');
  await clickSelector('button[aria-label="Tùy chọn bài viết"]'); await click('Chỉnh sửa'); await fill('dialog textarea', 'Nội dung đã chỉnh sửa'); await click('Lưu thay đổi'); await waitText('Nội dung chưa hợp lệ');
  assert(await evaluate('!!document.querySelector("dialog[open]")'));
  await click('Lưu thay đổi'); await waitText('Đã lưu bài viết.');
  assert.equal(post.content, 'Nội dung đã chỉnh sửa');
  await click('21 lượt thích'); await waitText('Không thể tải danh sách thử nghiệm'); await click('Thử lại'); await waitText('person0'); await click('Xem thêm'); await waitText('person20');
  await clickSelector('dialog button[aria-label="Đóng"]');
  await click('21 lượt đăng lại'); await waitText('person0'); await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(() => evaluate('!document.querySelector("dialog[open]")'), 'Escape closes dialog');
  await clickSelector('button[aria-label="Tùy chọn bài viết"]'); await click('Thông tin tệp đính kèm'); await waitText('image/gif'); await clickSelector('dialog button[aria-label="Đóng"]');
  await navigate(`/posts/${post.id}`); await waitText('Nội dung đã chỉnh sửa'); assert(requested('GET', `/posts/${post.id}`));
  console.log('PASS edit/error handling, post details, interaction lists, pagination and media details');

  await navigate('/other'); await waitText('other'); await until(() => evaluate('!!document.querySelector(".profile-stats button")'), 'profile controls');
  await click('21 người theo dõi'); await waitText('person0'); await clickSelector('dialog button[aria-label="Đóng"]');
  await click('Đang theo dõi 21 người'); await waitText('person0'); await clickSelector('dialog button[aria-label="Đóng"]');
  await clickSelector('button[aria-label="Tùy chọn trang cá nhân"]'); await click('Báo cáo người dùng'); await fill('dialog textarea', 'Báo cáo kiểm tra'); await click('Gửi báo cáo'); await waitText('Bạn đã báo cáo đối tượng này');
  await click('Gửi báo cáo'); await waitText('Đã gửi báo cáo người dùng');
  assert(requests.some((r) => r.path === '/reports' && r.body.user_id === other.id && !r.body.post_id));
  assert(!(await evaluate('document.body.innerText.includes("Kiểm duyệt tài khoản")')));
  console.log('PASS followers/following, report user, report error and user permissions');

  await navigate('/activity'); await waitText('Thông báo 1'); await clickSelector('button[aria-label="Đánh dấu thông báo đã đọc"]'); await until(() => notifications[0].is_read, 'read notification');
  await clickSelector('button[aria-label="Xóa thông báo"]'); await until(() => notifications.length === 1, 'delete notification');
  await click('Đọc tất cả'); await until(() => notifications.every((n) => n.is_read), 'read all notifications');
  await click('Xem bài viết', 'a'); await waitText('Nội dung đã chỉnh sửa');
  console.log('PASS individual notification read/delete, read all and post navigation');

  expireAccess = true;
  await navigate('/'); await waitText('Nội dung đã chỉnh sửa');
  assert.equal(requests.filter((request) => request.path === '/auth/refresh').length, 1, 'Concurrent authenticated reads should share one refresh');
  expireAccess = false;
  console.log('PASS session refresh concurrency and unauthenticated login error');

  await loginAs(admin); await navigate('/admin'); await waitText('Báo cáo bài viết');
  await click('Ẩn bài'); await waitText('Ẩn bài viết thành công.'); await click('Bỏ ẩn'); await waitText('Bỏ ẩn bài viết thành công.');
  await click('Khóa tài khoản'); await waitText('Khóa tài khoản thành công.'); await click('Mở khóa'); await waitText('Mở khóa tài khoản thành công.');
  await fill('.resolution-note textarea', 'Đã kiểm tra nội dung'); await click('Đang xem xét'); await until(() => reports[0].status === 'reviewing', 'review report');
  await click('Đã xử lý'); await until(() => reports[0].status === 'resolved', 'resolve report');
  assert.equal(reports[0].resolution_note, 'Đã kiểm tra nội dung');
  await click('Bỏ qua'); await until(() => reports[0].status === 'rejected', 'reject report');
  await click('Mở lại'); await until(() => reports[0].status === 'open', 'reopen report');
  await fill('.admin-filter select', 'open'); await waitText('Báo cáo bài viết');
  await click('Xóa bài'); await waitText('Xóa vĩnh viễn bài viết thành công.');
  await fill('input[name=target_id]', post.id); await click('Mở công cụ kiểm duyệt');
  assert(await evaluate('document.querySelector(".admin-target").innerText.includes("Bỏ ẩn")'));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert(await evaluate('document.documentElement.scrollWidth <= 390'), 'Admin mobile layout overflows horizontally');
  await navigate('/other'); await until(() => evaluate('!!document.querySelector(".profile-stats button")'), 'mobile profile');
  await click('21 người theo dõi'); await waitText('person0');
  assert(await evaluate('document.querySelector("dialog").getBoundingClientRect().width <= 390'), 'Mobile dialog exceeds viewport');
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(profile, 'mobile-dialog.png'), Buffer.from(screenshot.data, 'base64'));
  if (process.env.SMOKE_SCREENSHOT) await writeFile(resolve(process.env.SMOKE_SCREENSHOT), Buffer.from(screenshot.data, 'base64'));
  console.log('PASS all admin actions, report states/notes/filter, direct target management and mobile layout');

  for (const [method, path] of [
    ['POST', '/auth/forgot-password'], ['POST', '/auth/reset-password'], ['GET', `/users/${other.id}/followers`], ['GET', `/users/${other.id}/following`],
    ['PATCH', `/posts/${post.id}`], ['GET', `/posts/${post.id}/likes`], ['GET', `/posts/${post.id}/reposts`],
    ['PATCH', `/notifications/${id(21)}/read`], ['DELETE', `/notifications/${id(21)}`], ['DELETE', `/admin/posts/${post.id}`],
    ['PATCH', `/admin/posts/${post.id}/block`], ['PATCH', `/admin/posts/${post.id}/unblock`], ['PATCH', `/admin/users/${other.id}/ban`], ['PATCH', `/admin/users/${other.id}/unban`],
  ]) assert(requested(method, path), `Missing API coverage: ${method} ${path}`);
  assert.deepEqual(failures, [], 'Unexpected API requests');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(`PASS all 14 missing endpoints exercised through UI (${requests.length} requests), no runtime errors`);
} catch (error) {
  if (browserLog) console.error(browserLog.slice(-3000));
  console.error('Recent requests:', JSON.stringify(requests.slice(-8)));
  if (call && socket?.readyState === WebSocket.OPEN) {
    const result = await call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    console.error('Page text:', result.result.value);
  }
  throw error;
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close(); browser?.kill(); vite.kill();
  await delay(500);
  // Only remove the temporary profile created by this test, never another browser's data.
  const resolvedProfile = resolve(profile);
  assert(resolvedProfile.startsWith(tempRoot + sep) && dirname(resolvedProfile) === tempRoot);
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
}
