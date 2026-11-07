/**
 * Sourcely portal backend. Google Apps Script bound to a Google Sheet.
 *
 * Script properties (Project Settings > Script properties):
 *   ADMIN_PASSWORD  required. The password for /admin/. Make it long.
 *   SITE_URL        your site address with no trailing slash, e.g. https://sourcely.com
 *   PILOT_CAP       optional, default 10. Orders after the cap go on the waitlist.
 *   NOTIFY_EMAIL    optional. Where new-order alerts go. Default: the script owner.
 *
 * Run setup() once from the editor. Then Deploy > New deployment > Web app,
 * Execute as: Me, Who has access: Anyone.
 *
 * Tabs it creates: Orders, Reports, Sessions, Codes. You can read Orders and Reports in the Sheet.
 * Do not share the Sheet with anyone you don't trust: it holds client emails and private report links.
 */
var SHEETS = {
  Orders: ['Order ID', 'Created', 'Name', 'Email', 'Company', 'Category', 'Details', 'Budget', 'Status', 'Client token', 'Admin notes', 'Updated', 'Case study OK', 'Pilot'],
  Reports: ['Order ID', 'Title', 'Body', 'Published', 'Drive link', 'Updated'],
  Sessions: ['Token hash', 'Role', 'Email', 'Expires'],
  Codes: ['Email', 'Code hash', 'Expires', 'Attempts']
};
var STATUSES = ['New', 'Waitlist', 'In progress', 'Report ready', 'Delivered', 'Closed'];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var CLIENT_SESSION_MS = 14 * 24 * 3600 * 1000;
var ADMIN_SESSION_MS = 12 * 3600 * 1000;
var CODE_MS = 10 * 60 * 1000;

// ---------- entry points ----------
function doGet() { return out_({ ok: true, service: 'sourcely' }); }

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  var a = String(d.action || '');
  try {
    if (a === 'admin_login') return adminLogin_(d);               // no lock: it may sleep on a wrong password
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (a) {
        case 'spots': return spots_();
        case 'order_create': return orderCreate_(d);
        case 'track': return track_(d);
        case 'login_request': return loginRequest_(d);
        case 'login_verify': return loginVerify_(d);
        case 'my_orders': return myOrders_(d);
        case 'logout': return logout_(d);
        case 'admin_orders': return adminOrders_(d);
        case 'admin_order': return adminOrder_(d);
        case 'admin_update': return adminUpdate_(d);
        case 'admin_report_save': return adminReportSave_(d);
        case 'admin_notify': return adminNotify_(d);
        case 'admin_delete': return adminDelete_(d);
        default: return out_({ ok: false, error: 'unknown_action' });
      }
    } finally {
      try { lock.releaseLock(); } catch (x) {}
    }
  } catch (err) {
    return out_({ ok: false, error: 'server' });
  }
}

// Run once from the editor. Creates the tabs and asks for permissions.
function setup() {
  Object.keys(SHEETS).forEach(function (n) { sh_(n); });
  var p = props_();
  if (!p.getProperty('SALT')) p.setProperty('SALT', rand_(32));
  MailApp.getRemainingDailyQuota(); // triggers the email permission prompt
  Logger.log('Ready. ADMIN_PASSWORD set: ' + !!p.getProperty('ADMIN_PASSWORD') + ' | SITE_URL: ' + (p.getProperty('SITE_URL') || '(not set)'));
}

// ---------- helpers ----------
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props_() { return PropertiesService.getScriptProperties(); }
function nowIso_() { return new Date().toISOString(); }
function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function siteUrl_() { return (props_().getProperty('SITE_URL') || 'https://YOUR-DOMAIN.com').replace(/\/+$/, ''); }
function notifyTo_() { return props_().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail(); }
function cap_() { var n = parseInt(props_().getProperty('PILOT_CAP'), 10); return isNaN(n) ? 10 : n; }

function rand_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}
function hash_(s) {
  var salt = props_().getProperty('SALT') || 'sourcely';
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + s));
}
function code6_() {
  var n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000;
  return ('000000' + n).slice(-6);
}

// Count hits per key in a window. Returns false once over the limit.
function allow_(key, max, seconds) {
  var c = CacheService.getScriptCache();
  var n = parseInt(c.get(key) || '0', 10);
  if (n >= max) return false;
  c.put(key, String(n + 1), seconds);
  return true;
}

function sh_(name) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  var head = SHEETS[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@'); // plain text: nothing becomes a date or formula
  }
  return sh;
}
function rows_(name) {
  var sh = sh_(name), last = sh.getLastRow(), n = SHEETS[name].length;
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, n).getValues().map(function (r, i) {
    var o = { _row: i + 2 };
    SHEETS[name].forEach(function (h, j) { o[h] = String(r[j]); });
    return o;
  });
}
function putRow_(name, rowNum, obj) {
  var sh = sh_(name), head = SHEETS[name];
  var vals = head.map(function (h) { return obj[h] == null ? '' : String(obj[h]); });
  var r = rowNum || sh.getLastRow() + 1;
  var rg = sh.getRange(r, 1, 1, head.length);
  rg.setNumberFormat('@');
  rg.setValues([vals]);
}
function delRow_(name, rowNum) { sh_(name).deleteRow(rowNum); }

function findOrder_(id) {
  id = String(id || '').toUpperCase();
  var all = rows_('Orders');
  for (var i = 0; i < all.length; i++) if (all[i]['Order ID'] === id) return all[i];
  return null;
}
function findOrderByToken_(t) {
  t = String(t || '');
  if (t.length < 20) return null;
  var all = rows_('Orders');
  for (var i = 0; i < all.length; i++) if (all[i]['Client token'] === t) return all[i];
  return null;
}
function reportFor_(id) {
  var all = rows_('Reports');
  for (var i = 0; i < all.length; i++) if (all[i]['Order ID'] === id) return all[i];
  return null;
}

// ---------- sessions ----------
function newSession_(role, email, ms) {
  purgeSessions_();
  var token = rand_(40);
  putRow_('Sessions', 0, { 'Token hash': hash_(token), Role: role, Email: email, Expires: String(Date.now() + ms) });
  return token;
}
function purgeSessions_() {
  var all = rows_('Sessions'), now = Date.now();
  for (var i = all.length - 1; i >= 0; i--) if (parseInt(all[i].Expires, 10) < now) delRow_('Sessions', all[i]._row);
}
function sessionOf_(token) {
  token = String(token || '');
  if (token.length < 20) return null;
  var h = hash_(token), all = rows_('Sessions'), now = Date.now();
  for (var i = 0; i < all.length; i++) {
    if (all[i]['Token hash'] === h) return parseInt(all[i].Expires, 10) > now ? all[i] : null;
  }
  return null;
}
function needClient_(d) { var s = sessionOf_(d.session); return s && s.Role === 'client' ? s : null; }
function needAdmin_(d) { var s = sessionOf_(d.session); return s && s.Role === 'admin' ? s : null; }

// ---------- public ----------
function spots_() {
  var used = rows_('Orders').filter(function (o) { return o.Pilot === 'Yes'; }).length;
  return out_({ ok: true, cap: cap_(), remaining: Math.max(0, cap_() - used) });
}

function orderCreate_(d) {
  if (str_(d.website, 50)) return out_({ ok: true, orderId: 'SRC-0000', token: '', status: 'New' }); // honeypot: pretend success
  var name = str_(d.name, 80), email = str_(d.email, 120).toLowerCase();
  var company = str_(d.company, 100), category = str_(d.category, 100);
  var details = str_(d.details, 2000), budget = str_(d.budget, 100);
  if (!name) return out_({ ok: false, error: 'name' });
  if (!EMAIL_RE.test(email)) return out_({ ok: false, error: 'email' });
  if (!category) return out_({ ok: false, error: 'category' });
  if (details.length < 10) return out_({ ok: false, error: 'details' });
  if (!d.agree) return out_({ ok: false, error: 'agree' });
  if (!allow_('ord:' + email, 3, 86400) || !allow_('ord:all', 60, 3600)) return out_({ ok: false, error: 'rate' });

  var all = rows_('Orders');
  var used = all.filter(function (o) { return o.Pilot === 'Yes'; }).length;
  var waitlist = used >= cap_();
  var id;
  do { id = 'SRC-' + rand_(4).toUpperCase(); } while (all.some(function (o) { return o['Order ID'] === id; }));
  var token = rand_(40);
  var order = {
    'Order ID': id, Created: nowIso_(), Name: name, Email: email, Company: company, Category: category,
    Details: details, Budget: budget, Status: waitlist ? 'Waitlist' : 'New', 'Client token': token,
    'Admin notes': '', Updated: nowIso_(), 'Case study OK': d.caseStudy ? 'Yes' : 'No', Pilot: waitlist ? 'No' : 'Yes'
  };
  putRow_('Orders', 0, order);

  var link = siteUrl_() + '/portal/?t=' + token;
  var mailed = send_(email, waitlist ? 'You are on the Sourcely waitlist (' + id + ')' : 'We got your request (' + id + ')',
    mailShell_('Hi ' + esc_(name) + ',',
      waitlist
        ? '<p>Thanks for your request. We are at capacity right now, so you are on the waitlist. We will email you when we have room.</p>'
        : '<p>Thanks for your request. We have started on it and will send your factory comparison report within 48 hours.</p>',
      '<p>Your order number is <b>' + id + '</b>. Track it and read your report here (no account needed):</p>', link, 'Open my order',
      '<p style="color:#666;font-size:13px">Anyone with this link can see your order, so keep it private.</p>'));
  send_(notifyTo_(), 'New Sourcely order ' + id + (waitlist ? ' (waitlist)' : ''),
    '<p><b>' + esc_(name) + '</b> (' + esc_(email) + ')<br>' + esc_(category) + '</p><p>' + esc_(details).replace(/\n/g, '<br>') + '</p><p>Open the admin to work on it.</p>');
  return out_({ ok: true, orderId: id, token: token, status: order.Status, mailed: mailed });
}

function viewOrder_(o) {
  return { id: o['Order ID'], created: o.Created, name: o.Name, category: o.Category, details: o.Details, status: o.Status, pilot: o.Pilot === 'Yes' };
}
function viewReport_(r) {
  if (!r || r.Published !== 'Yes') return null;
  return { title: r.Title, body: r.Body, driveLink: r['Drive link'], updated: r.Updated };
}

function track_(d) {
  var o = findOrderByToken_(d.token);
  if (!o) return out_({ ok: false, error: 'not_found' });
  return out_({ ok: true, order: viewOrder_(o), report: viewReport_(reportFor_(o['Order ID'])) });
}

function loginRequest_(d) {
  var email = str_(d.email, 120).toLowerCase();
  if (!EMAIL_RE.test(email)) return out_({ ok: false, error: 'email' });
  if (!allow_('lr:' + email, 5, 3600) || !allow_('lr:all', 40, 3600)) return out_({ ok: false, error: 'rate' });
  var has = rows_('Orders').some(function (o) { return o.Email === email; });
  if (has) {
    var code = code6_();
    rows_('Codes').forEach(function (c) { if (c.Email === email) delRow_('Codes', c._row); });
    putRow_('Codes', 0, { Email: email, 'Code hash': hash_(email + '|' + code), Expires: String(Date.now() + CODE_MS), Attempts: '0' });
    send_(email, 'Your Sourcely sign-in code: ' + code,
      mailShell_('Hi,', '<p>Your sign-in code is:</p><p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:8px 0">' + code + '</p><p>It works for 10 minutes. If you did not ask for it, ignore this email.</p>', '', '', '', ''));
  }
  return out_({ ok: true }); // same answer either way, so nobody can test which emails have orders
}

function loginVerify_(d) {
  var email = str_(d.email, 120).toLowerCase(), code = str_(d.code, 12).replace(/\s/g, '');
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return out_({ ok: false, error: 'code' });
  var rec = null;
  rows_('Codes').forEach(function (c) { if (c.Email === email) rec = c; });
  if (!rec || parseInt(rec.Expires, 10) < Date.now()) return out_({ ok: false, error: 'code' });
  var tries = parseInt(rec.Attempts, 10) || 0;
  if (tries >= 5) { delRow_('Codes', rec._row); return out_({ ok: false, error: 'code' }); }
  if (rec['Code hash'] !== hash_(email + '|' + code)) {
    rec.Attempts = String(tries + 1);
    putRow_('Codes', rec._row, rec);
    return out_({ ok: false, error: 'code' });
  }
  delRow_('Codes', rec._row);
  return out_({ ok: true, session: newSession_('client', email, CLIENT_SESSION_MS), email: email });
}

function myOrders_(d) {
  var s = needClient_(d);
  if (!s) return out_({ ok: false, error: 'auth' });
  var list = rows_('Orders').filter(function (o) { return o.Email === s.Email; }).map(function (o) {
    var r = reportFor_(o['Order ID']);
    return { id: o['Order ID'], created: o.Created, category: o.Category, status: o.Status, hasReport: !!(r && r.Published === 'Yes'), token: o['Client token'] };
  });
  list.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
  return out_({ ok: true, email: s.Email, orders: list });
}

function logout_(d) {
  var token = String(d.session || '');
  if (token.length >= 20) {
    var h = hash_(token);
    rows_('Sessions').forEach(function (r) { if (r['Token hash'] === h) delRow_('Sessions', r._row); });
  }
  return out_({ ok: true });
}

// ---------- admin ----------
function adminLogin_(d) {
  var pw = props_().getProperty('ADMIN_PASSWORD');
  if (!pw || hash_(String(d.password || '')) !== hash_(pw)) { Utilities.sleep(1500); return out_({ ok: false, error: 'auth' }); }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return out_({ ok: true, session: newSession_('admin', '', ADMIN_SESSION_MS) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

function adminOrders_(d) {
  if (!needAdmin_(d)) return out_({ ok: false, error: 'auth' });
  var reports = {};
  rows_('Reports').forEach(function (r) { reports[r['Order ID']] = r.Published === 'Yes' ? 'published' : 'draft'; });
  var list = rows_('Orders').map(function (o) {
    return { id: o['Order ID'], created: o.Created, name: o.Name, email: o.Email, company: o.Company, category: o.Category, status: o.Status, pilot: o.Pilot, report: reports[o['Order ID']] || 'none' };
  });
  list.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
  return out_({ ok: true, orders: list, statuses: STATUSES, cap: cap_() });
}

function adminOrder_(d) {
  if (!needAdmin_(d)) return out_({ ok: false, error: 'auth' });
  var o = findOrder_(d.orderId);
  if (!o) return out_({ ok: false, error: 'not_found' });
  var r = reportFor_(o['Order ID']);
  return out_({
    ok: true,
    order: { id: o['Order ID'], created: o.Created, name: o.Name, email: o.Email, company: o.Company, category: o.Category, details: o.Details, budget: o.Budget, status: o.Status, notes: o['Admin notes'], caseStudy: o['Case study OK'], pilot: o.Pilot, link: siteUrl_() + '/portal/?t=' + o['Client token'] },
    report: r ? { title: r.Title, body: r.Body, published: r.Published === 'Yes', driveLink: r['Drive link'], updated: r.Updated } : null
  });
}

function adminUpdate_(d) {
  if (!needAdmin_(d)) return out_({ ok: false, error: 'auth' });
  var o = findOrder_(d.orderId);
  if (!o) return out_({ ok: false, error: 'not_found' });
  if (d.status != null) {
    if (STATUSES.indexOf(String(d.status)) < 0) return out_({ ok: false, error: 'status' });
    o.Status = String(d.status);
    if (o.Status === 'Waitlist') o.Pilot = 'No';
    else if (o.Pilot === 'No') o.Pilot = 'Yes';
  }
  if (d.notes != null) o['Admin notes'] = str_(d.notes, 4000);
  o.Updated = nowIso_();
  putRow_('Orders', o._row, o);
  return out_({ ok: true });
}

function adminReportSave_(d) {
  if (!needAdmin_(d)) return out_({ ok: false, error: 'auth' });
  var o = findOrder_(d.orderId);
  if (!o) return out_({ ok: false, error: 'not_found' });
  var link = str_(d.driveLink, 500);
  if (link && !/^https:\/\//.test(link)) return out_({ ok: false, error: 'link' });
  var rec = reportFor_(o['Order ID']) || { 'Order ID': o['Order ID'], _row: 0 };
  rec.Title = str_(d.title, 160) || 'Factory comparison report';
  rec.Body = String(d.body || '').slice(0, 40000);
  rec.Published = d.published ? 'Yes' : 'No';
  rec['Drive link'] = link;
  rec.Updated = nowIso_();
  putRow_('Reports', rec._row, rec);
  return out_({ ok: true });
}

function adminNotify_(d) {
  if (!needAdmin_(d)) return out_({ ok: false, error: 'auth' });
  var o = findOrder_(d.orderId);
  if (!o) return out_({ ok: false, error: 'not_found' });
  var r = reportFor_(o['Order ID']);
  if (!r || r.Published !== 'Yes') return out_({ ok: false, error: 'not_published' });
  var link = siteUrl_() + '/portal/?t=' + o['Client token'];
  var mailed = send_(o.Email, 'Your Sourcely report is ready (' + o['Order ID'] + ')',
    mailShell_('Hi ' + esc_(o.Name) + ',', '<p>Your factory comparison report is ready.</p>', '', link, 'Read my report',
      '<p>Have questions or want to talk next steps? Just reply to this email.</p>'));
  o.Status = 'Report ready';
  o.Updated = nowIso_();
  putRow_('Orders', o._row, o);
  return out_({ ok: mailed, mailed: mailed });
}

function adminDelete_(d) {
  if (!needAdmin_(d)) return out_({ ok: false, error: 'auth' });
  var o = findOrder_(d.orderId);
  if (!o) return out_({ ok: false, error: 'not_found' });
  var r = reportFor_(o['Order ID']);
  if (r) delRow_('Reports', r._row);
  // The order row may have shifted if the report tab is separate; it is not, so the row is still valid.
  delRow_('Orders', o._row);
  return out_({ ok: true });
}

// ---------- email ----------
function mailShell_(hello, body1, body2, link, linkText, foot) {
  var btn = link
    ? '<p style="margin:20px 0"><a href="' + link + '" style="background:#0B0B0F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">' + linkText + '</a></p>' +
      '<p style="color:#666;font-size:13px;word-break:break-all">Or paste this into your browser:<br>' + link + '</p>'
    : '';
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0B0B0F;line-height:1.55">' +
    '<div style="font-size:26px;font-weight:800;letter-spacing:-1px;margin-bottom:16px">Sourcely</div>' +
    '<p>' + hello + '</p>' + body1 + body2 + btn + (foot || '') +
    '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"><p style="color:#888;font-size:12px">Sourcely. Start your side hustle without getting burned.</p></div>';
}
function send_(to, subject, html) {
  try {
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'Sourcely', replyTo: notifyTo_() });
    return true;
  } catch (err) { return false; }
}
