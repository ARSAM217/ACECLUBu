'use strict';
// Static release guardrails; this is not a substitute for HTTP/integration tests.
const fs = require('fs');
const assert = require('assert');
const server = fs.readFileSync('server.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');
const bot = fs.readFileSync('rubika-bot.js', 'utf8');
const checks = [
  ['Rubika bot is installed in the main server process', /require\('\.\/rubika-bot'\)/.test(server) && /installRubikaBot\(/.test(server)],
  ['Rubika bot uses the existing ACE CLUB database', /function installRubikaBot\(\{app, db, cfg/.test(fs.readFileSync('rubika-bot.js','utf8')) && /CREATE TABLE IF NOT EXISTS rubika_links/.test(fs.readFileSync('rubika-bot.js','utf8'))],
  ['Rubika registration creates users in the shared users table', /INSERT INTO users\(username,display_name,phone,password_hash/.test(fs.readFileSync('rubika-bot.js','utf8'))],
  ['Rubika login verifies the existing ACE CLUB password hash', /bcrypt\.compareSync\(text,user\.password_hash\)/.test(fs.readFileSync('rubika-bot.js','utf8'))],
  ['Rubika linking does not use a six-digit connection code', !/rubika_link_codes|consumeSiteLinkCode|6 رقمی/.test(fs.readFileSync('rubika-bot.js','utf8'))],
  ['Rubika account connection status is available in site settings', /rubikaLinkScreen/.test(app) && app.includes("api('/rubika/status')")],
  ['Rubika profile lookup supports slash username and privacy/block filtering', bot.includes('const profileQuery=text.match') && bot.includes('account_privacy') && bot.includes('FROM blocks')],
  ['Rubika explore returns real public usernames without @ and block filtering', bot.includes('SELECT id,display_name,username,level,fame,bio FROM users') && bot.includes('• /${x.username}')],
  ['Rubika profile like action writes to the shared likes table', /INSERT INTO likes\(from_id,to_id\)/.test(bot)],
  ['Rubika support tickets are created in native ticket tables', /INSERT INTO tickets\(user_id,subject\)/.test(bot) && /INSERT INTO ticket_messages\(ticket_id,sender_id,body\)/.test(bot)],
  ['Rubika support reply polling tracks sent replies', /pollTicketReplies/.test(bot) && /rubika_ticket_sent/.test(bot)],
  ['Rubika store purchases use shared wallet and transaction records', /INSERT INTO transactions\(user_id,amount,kind,note\)/.test(bot) && /UPDATE users SET coins=coins-\? WHERE id=\? AND coins>=\?/.test(bot)],
  ['Rubika direct messages bridge to shared conversation and quota APIs', /function rubikaStartDirect\(/.test(server) && /function rubikaSendDirect\(/.test(server) && /sendMessage\(c,userId,'text',body/.test(server) && /rubikaStartDirect\?\./.test(bot) && /rubikaSendDirect\?\./.test(bot)],
  ['Rubika DM notification polling deduplicates and marks site messages read', /pollDirectMessages/.test(bot) && /rubika_dm_sent/.test(bot) && /read_at=CURRENT_TIMESTAMP/.test(bot)],
  ['Rubika random chat uses shared anonymous matchmaking maps and report/block tables', /function rubikaRandomJoin\(/.test(server) && /anonQueue\.set\(uid,\{userId:uid,prefs:p,origin:'rubika'/.test(server) && /function rubikaRandomReport\(/.test(server) && /function rubikaRandomBlock\(/.test(server)],
  ['Rubika random chat events and commands are implemented', /rubika_random_events/.test(bot) && /\/random_next/.test(bot) && /\/random_end/.test(bot) && /\/random_report/.test(bot) && /\/random_block/.test(bot)],
  ['Rubika location sharing is consent-driven and expires after 30 minutes', /step==='await_location'/.test(bot) && /type:'Location'/.test(bot) && /datetime\(updated_at\)>datetime\('now','-30 minutes'\)/.test(bot) && /DELETE FROM user_locations WHERE user_id/.test(bot)],
  ['Rubika cosmetics use the real store catalog and shared currency purchase/equip tables', /rubikaCosmeticList/.test(server) && /rubikaBuyCosmetic/.test(server) && /INSERT INTO user_cosmetics\(user_id,item_id\)/.test(server) && /rubikaEquipCosmetic/.test(bot)],
  ['Rubika logout clears bot session states without deleting the ACE CLUB account', /DELETE FROM rubika_links WHERE chat_id/.test(bot) && /DELETE FROM rubika_dm_state WHERE chat_id/.test(bot) && /DELETE FROM rubika_location_state WHERE chat_id/.test(bot)],
  ['Rubika ticket replies poll all linked users tickets', /WHERE t.user_id=\? AND tm.sender_id<>\? ORDER BY tm.id/.test(bot) && /ticket_messages WHERE ticket_id=\? ORDER BY id DESC LIMIT 3/.test(bot)],
  ['Rubika DM respects privacy requests, blocks, restrictions and quotas', /account_privacy==='private'/.test(server) && /message_requests WHERE status='accepted'/.test(server) && /blockedBetween\(userId,other\)/.test(server) && /restriction_type IN \('messages','conversation','app'\)/.test(server) && /consumeFreeMessageQuota\(userId\)/.test(server) && /consumeProQuota\(userId,false\)/.test(server)],
  ['Rubika direct/random message bridge has per-user anti-spam limits', /function rubikaMessageRateLimit\(/.test(server) && /shortCount>=5/.test(server) && /longCount>=30/.test(server) && /rubikaMessageRateLimit\(userId,'dm'\)/.test(server) && /rubikaMessageRateLimit\(uid,'random'\)/.test(server)],
  ['Rubika random matching applies both private blocks and random-chat blocks', /blockedBetween\(uid,q.userId\)/.test(server) && /random_blocks WHERE \(user_id=\? AND blocked_id=\?\) OR \(user_id=\? AND blocked_id=\?\)/.test(server)],
  ['Rubika shop has the four requested category buttons and real cosmetic item listing', /storeKeypad=makeKeypad/.test(bot) && /🚀 شتاب‌دهی/.test(bot) && /👑 اشتراک پرو/.test(bot) && /💬 اشتراک پیام/.test(bot) && /🎨 پروفایل شخصی/.test(bot) && /cosmeticListText/.test(bot)],
  ['Rubika install app URL is exact', bot.includes('https://aceclub.ir/install')],
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
  ['private chat composer controls remain visible on mobile', /chat-compose>textarea#messageText\{display:block!important/.test(css) && /chat-compose>label\.iconbtn\{display:grid!important/.test(css) && /chat-compose>\.voice-coming-soon\{display:inline-flex!important/.test(css)],
  ['private chat delete supports personal and both-side modes', /req\.body\?\.mode==='both'/.test(server) && /hidden_a=1,hidden_b=1,closed_at=NULL/.test(server) && /hidden_a=0,hidden_b=0/.test(server)],
  ['shared delete permits a fresh message request', /UPDATE message_requests SET status='closed'/.test(server) && /UPDATE notifications SET action=NULL,request_id=NULL/.test(server) && /UPDATE message_requests SET status='pending',created_at=CURRENT_TIMESTAMP/.test(server) && /existing\?\.status==='accepted'/.test(server) && /function activateConversation\(c\)/.test(server) && !/UPDATE conversations SET hidden_a=1,hidden_b=1,closed_at=COALESCE\(closed_at,CURRENT_TIMESTAMP\)/.test(server)],
  ['database writes are coalesced per event-loop turn', /const persistDb = \(\) => \{[\s\S]*?setImmediate\(/.test(server) && /const flushDb = \(\) =>/.test(server) && /flushDb\(\);\s*const shutdownAceClub/.test(server)],
  ['private chat reads latest 300 messages with reply context', /SELECT m\.\*,\(SELECT body FROM messages r WHERE r\.id=m\.reply_to\) AS reply_to_body[\s\S]*?LIMIT 300\) m ORDER BY m\.id ASC/.test(server)],
  ['private chat new messages append without reloading history', /function appendPrivateMessage\(m\)/.test(app) && /socket\.on\('message',m=>\{if\(Number\(activeChat\)===Number\(m\.conversation_id\)\)\{appendPrivateMessage\(m\)/.test(app)],
  ['private chat has lightweight read receipt endpoint', /app\.post\('\/api\/chats\/:id\/read'/.test(server)],
  ['home independent data loads run in parallel', /Promise\.allSettled\(\[[\s\S]*?api\('\/active-users'\), api\('\/config'\)/.test(app)],
  ['session touch avoids rewriting the whole session file on every request', /touch\(sid,sess,cb\)\{if\(this\.items\[sid\]\)\{this\.items\[sid\]\.cookie=sess\.cookie;if\(Date\.now\(\)-this\.lastSavedAt>30000\)this\._save\(\);\}/.test(server)],
  ['device history backfill runs after device_id migration', server.indexOf("ALTER TABLE users ADD COLUMN ${col} ${def}") < server.indexOf('Preserve the legacy first-device binding')],
  ['safe clickable URLs in chat messages', /function aceLinkify\(/.test(app) && /target="\x27\+\(internal\?\x27_self\x27:\x27_blank\x27\)\+\x27"/.test(app)],
  ['private chat prevents duplicate sends while request is pending', /privateSendPending/.test(app) && /if\(!body\|\|privateSendPending\)return/.test(app) && /sendButton\.classList\.add\('is-sending'\)/.test(app)],
  ['private chat follows latest message when keyboard opens', /function bindPrivateViewport\(/.test(app) && /visualViewport\.addEventListener\('resize'/.test(app)],
  ['private reply jumps to original message without exposing numeric ID', /data-jump-private-reply/.test(app) && /data-jump-private-reply=/.test(app)],
  ['reward posts remain in explore until 50 likes', /p\.reward_enabled=1 AND \(SELECT COUNT\(\*\) FROM post_likes pl WHERE pl\.post_id=p\.id\)<50/.test(server)],
  ['support-only posts retain view-based explore limit', /COALESCE\(p\.reward_enabled,0\)=0 AND p\.support_completed=0 AND \(SELECT COUNT\(\*\) FROM post_views v WHERE v\.post_id=p\.id\)<p\.display_limit/.test(server)],
  ['profile cosmetics tab is disabled as coming soon without deleting store data', /data-store-tab="cosmetics" class="ace-coming-soon-tab" disabled/.test(app) && /id="storeCosmetics"/.test(app)],
  ['private chat delete confirmation has designed selection ticks', /function aceDeleteConversationChoice\(\)/.test(app) && /ace-delete-check/.test(css) && /data-delete-choice=\"both\"/.test(app)],
  ['Connect-exclusive endpoints remain absent and legacy client is not loaded', !/\/api\/connect\//.test(server) && !/connect-game\.js/.test(html)],
  ['all app links require a safety confirmation before navigation', /Global safe-link gate/.test(app) && /aceConfirm\(message\)/.test(app) && /window\.location\.assign\(dest\.href\)/.test(app)],
  ['links follow the selected app theme color', /\.ace-chat-link,a\[href\]\{color:var\(--blue/.test(css) && /function applyTheme\(t\)/.test(app)],
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  assert.ok(ok, `Static check failed: ${name}`);
}
console.log(`\n${checks.length}/${checks.length} static checks passed. No live database or HTTP integration is exercised by this script.`);
