'use strict';
// Static release guardrails; this is not a substitute for HTTP/integration tests.
const fs = require('fs');
const assert = require('assert');
const server = fs.readFileSync('server.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');
const checks = [
  ['group join requests API', /app\.post\('\/api\/groups\/:id\/join'/.test(server) && /app\.post\('\/api\/groups\/:id\/join-requests\/:requestId\/respond'/.test(server)],
  ['group join authorization', /فقط مدیران گروه می‌توانند درخواست را بررسی کنند/.test(server)],
  ['group mute persistence', /INSERT INTO group_user_settings\(group_id,user_id,muted/.test(server)],
  ['group member mute route does not shadow personal mute', (server.match(/app\.post\('\/api\/groups\/:id\/mute'/g)||[]).length===1 && /app\.post\('\/api\/groups\/:id\/members\/:userId\/mute'/.test(server)],
  ['group mode edit persistence', /UPDATE chat_groups SET name=\?,description=\?,avatar=\?,access_mode=\? WHERE id=\?/.test(server)],
  ['admin game history pagination', /LIMIT \$\{limit\} OFFSET \$\{offset\}/.test(server) && /COUNT\(\*\) n FROM game_rooms r/.test(server)],
  ['game history includes departed players', /FROM game_results WHERE room_id=\?/.test(server) && /UNION SELECT user_id,created_at AS joined_at,room_id FROM game_results/.test(server)],
  ['cosmetic coin purchase path', /const currency=item\.kind==='frame'\?'coins':'diamonds'/.test(server)],
  ['daily fame reward uses coins at 21 Iran time', /activity-coins:'\+today/.test(server) && /daily_activity_coin_distributions/.test(server) && /daily_activity_coins/.test(server)],
  ['APK upload endpoint', /app\.post\('\/api\/admin\/app-release'/.test(server)],
  ['APK download endpoint', /app\.get\('\/api\/app-release\/:id\/download'/.test(server)],
  ['install page link', /data-store-tab="cosmetics"/.test(app) && /نصب اپلیکیشن/.test(app)],
  ['group invite resumes after login', /async function resumeInitialGroupLink\(\)/.test(app) && /if\(initialGroupPath\)await resumeInitialGroupLink\(\)/.test(app)],
  ['hash routes survive refresh and support requested aliases', /async function resumeInitialHashRoute\(\)/.test(app) && /if\(initialHashRoute\)await resumeInitialHashRoute\(\)/.test(app) && /if\(h==='shop'\)return \{view:'store'\}/.test(app) && /if\(h==='groups'\)return \{view:'chats',groupTab:true\}/.test(app)],
  ['admin cosmetic picker shows frame coin currency', /i\.kind==='frame'\?'🪙':'💎'/.test(app)],
  ['all catalog frame palettes styled', ['neon','gold','ice','rose','ruby','emerald','rainbow','cosmic','plasma','aurora','sakura','sunset','ocean','royal','chrome','fire','mint','violet','opal','galaxy'].every(x=>css.includes('avatar-frame-'+x))],
  ['CONNECT player can explicitly leave an active match', /app\.post\('\/api\/connect\/game\/:id\/leave'/.test(server) && /function leaveGame\(\)/.test(fs.readFileSync('public/connect-game.js','utf8')) && /data-connect-leave/.test(fs.readFileSync('public/connect-game.js','utf8'))],
  ['CONNECT hides home navigation during active match', /connect-mode\.connect-in-match \.bottomnav\{display:none!important\}/.test(css) && /connect-mode\.connect-in-match \.topbar \.back-btn\{display:none!important\}/.test(css)],
  ['private chat composer controls remain visible on mobile', /chat-compose>textarea#messageText\{display:block!important/.test(css) && /chat-compose>label\.iconbtn\{display:grid!important/.test(css) && /chat-compose>\.voice-coming-soon\{display:inline-flex!important/.test(css)],
  ['private chat delete supports personal and both-side modes', /req\.body\?\.mode==='both'/.test(server) && /hidden_a=1,hidden_b=1,closed_at=NULL/.test(server) && /hidden_a=0,hidden_b=0/.test(server)],
  ['shared delete permits a fresh message request', /UPDATE message_requests SET status='closed'/.test(server) && /UPDATE notifications SET action=NULL,request_id=NULL/.test(server) && /UPDATE message_requests SET status='pending',created_at=CURRENT_TIMESTAMP/.test(server) && /existing\?\.status==='accepted'/.test(server) && /function activateConversation\(c\)/.test(server) && !/UPDATE conversations SET hidden_a=1,hidden_b=1,closed_at=COALESCE\(closed_at,CURRENT_TIMESTAMP\)/.test(server)],
  ['database writes are coalesced per event-loop turn', /const persistDb = \(\) => \{[\s\S]*?setImmediate\(/.test(server) && /const flushDb = \(\) =>/.test(server) && /flushDb\(\);\s*const shutdownAceClub/.test(server)],
  ['private chat reads latest 300 messages', /SELECT \* FROM \(SELECT \* FROM messages WHERE conversation_id=\? ORDER BY id DESC LIMIT 300\) ORDER BY id ASC/.test(server)],
  ['private chat new messages append without reloading history', /function appendPrivateMessage\(m\)/.test(app) && /socket\.on\('message',m=>\{if\(Number\(activeChat\)===Number\(m\.conversation_id\)\)\{appendPrivateMessage\(m\)/.test(app)],
  ['private chat has lightweight read receipt endpoint', /app\.post\('\/api\/chats\/:id\/read'/.test(server)],
  ['home independent data loads run in parallel', /Promise\.allSettled\(\[[\s\S]*?api\('\/active-users'\), api\('\/config'\)/.test(app)],
  ['session touch avoids rewriting the whole session file on every request', /touch\(sid,sess,cb\)\{if\(this\.items\[sid\]\)\{this\.items\[sid\]\.cookie=sess\.cookie;if\(Date\.now\(\)-this\.lastSavedAt>30000\)this\._save\(\);\}/.test(server)],
  ['device history backfill runs after device_id migration', server.indexOf("ALTER TABLE users ADD COLUMN ${col} ${def}") < server.indexOf('Preserve the legacy first-device binding')],
  ['private chat delete confirmation has designed selection ticks', /function aceDeleteConversationChoice\(\)/.test(app) && /ace-delete-check/.test(css) && /data-delete-choice=\"both\"/.test(app)],
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  assert.ok(ok, `Static check failed: ${name}`);
}
console.log(`\n${checks.length}/${checks.length} static checks passed. No live database or HTTP integration is exercised by this script.`);
