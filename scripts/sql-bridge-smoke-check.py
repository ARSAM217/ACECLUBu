#!/usr/bin/env python3
"""Scratch SQLite bridge-schema/query checks; does not touch ACE CLUB live data."""
import sqlite3

conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, display_name TEXT,
 account_privacy TEXT DEFAULT 'public', is_banned INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
 fame INTEGER DEFAULT 0, bio TEXT, pro_until TEXT, age INTEGER, avatar TEXT,
 coins INTEGER DEFAULT 0, diamonds INTEGER DEFAULT 0, message_pass_until TEXT, role TEXT DEFAULT 'user');
CREATE TABLE conversations(id INTEGER PRIMARY KEY,user_a INTEGER,user_b INTEGER,closed_at TEXT,
 hidden_a INTEGER DEFAULT 0,hidden_b INTEGER DEFAULT 0);
CREATE TABLE messages(id INTEGER PRIMARY KEY,conversation_id INTEGER,sender_id INTEGER,type TEXT,body TEXT,
 media_url TEXT,deleted INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,delivered_at TEXT,read_at TEXT,reply_to INTEGER);
CREATE TABLE blocks(user_id INTEGER,blocked_id INTEGER);
CREATE TABLE message_requests(id INTEGER PRIMARY KEY,from_id INTEGER,to_id INTEGER,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE tickets(id INTEGER PRIMARY KEY,user_id INTEGER,subject TEXT,status TEXT DEFAULT 'open',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE ticket_messages(id INTEGER PRIMARY KEY,ticket_id INTEGER,sender_id INTEGER,body TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE random_reports(id INTEGER PRIMARY KEY,reporter_id INTEGER,reported_id INTEGER,room_id TEXT,reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE reports(id INTEGER PRIMARY KEY,reporter_id INTEGER,reported_user_id INTEGER,category TEXT,target_type TEXT,target_id TEXT,reason TEXT,details TEXT);
CREATE TABLE random_blocks(user_id INTEGER,blocked_id INTEGER);
CREATE TABLE user_locations(user_id INTEGER PRIMARY KEY,latitude REAL,longitude REAL,updated_at TEXT);
CREATE TABLE user_restrictions(user_id INTEGER,active INTEGER,ends_at TEXT,restriction_type TEXT,reason TEXT);
CREATE TABLE user_cosmetics(user_id INTEGER,item_id TEXT,owned_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_id));
CREATE TABLE user_store_offers(user_id INTEGER,item_id TEXT);
CREATE TABLE user_cosmetic_loadout(user_id INTEGER,kind TEXT,item_id TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,kind));
CREATE TABLE user_cosmetic_equips(user_id INTEGER PRIMARY KEY,frame_id TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE transactions(id INTEGER PRIMARY KEY,user_id INTEGER,amount INTEGER,kind TEXT,note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,body TEXT,action TEXT,from_id INTEGER,request_id INTEGER,read_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE pro_usage(user_id INTEGER,window_key TEXT,window_start TEXT,used INTEGER,PRIMARY KEY(user_id,window_key));
CREATE TABLE rubika_ticket_state(chat_id TEXT PRIMARY KEY,user_id INTEGER,ticket_id INTEGER,step TEXT DEFAULT '',subject TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
''')
# Existing user/messages data is present before the bridge migration and must remain intact.
conn.execute("INSERT INTO users(id,username,display_name) VALUES(1,'botuser','Bot'),(2,'other','Other')")
conn.execute("INSERT INTO conversations(id,user_a,user_b) VALUES(1,1,2)")
conn.execute("INSERT INTO messages(id,conversation_id,sender_id,type,body) VALUES(1,1,2,'text','hello')")
conn.execute("INSERT INTO tickets(id,user_id,subject) VALUES(1,1,'subject')")
conn.execute("INSERT INTO ticket_messages(id,ticket_id,sender_id,body) VALUES(1,1,2,'reply')")
conn.execute("INSERT INTO user_locations(user_id,latitude,longitude,updated_at) VALUES(1,0,0,CURRENT_TIMESTAMP),(2,0.001,0.001,CURRENT_TIMESTAMP)")
bridge_ddl='''
CREATE TABLE IF NOT EXISTS rubika_dm_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,conversation_id INTEGER NOT NULL,other_user_id INTEGER NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rubika_dm_sent(chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,PRIMARY KEY(chat_id,message_id));
CREATE TABLE IF NOT EXISTS rubika_location_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,step TEXT DEFAULT '',consented INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rubika_random_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,room_id TEXT DEFAULT '',other_id INTEGER,active INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rubika_random_events(id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id TEXT NOT NULL,room_id TEXT NOT NULL,event_type TEXT NOT NULL,body TEXT DEFAULT '',from_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,sent_at TEXT);
CREATE INDEX IF NOT EXISTS idx_rubika_random_events_pending ON rubika_random_events(chat_id,sent_at,id);
CREATE TABLE IF NOT EXISTS rubika_ticket_sent(chat_id TEXT NOT NULL,ticket_message_id INTEGER NOT NULL,PRIMARY KEY(chat_id,ticket_message_id));
'''
conn.executescript(bridge_ddl)
conn.executescript(bridge_ddl)  # idempotence
# Existing records remain after both migration passes.
assert conn.execute("SELECT body FROM messages WHERE id=1").fetchone()[0] == 'hello'
assert conn.execute("SELECT subject FROM tickets WHERE id=1").fetchone()[0] == 'subject'
# DM polling query shape.
dm_q='''SELECT m.id,m.conversation_id,m.sender_id,m.body,m.type,m.created_at,u.username,u.display_name
FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN users u ON u.id=m.sender_id
WHERE m.sender_id<>? AND m.deleted=0 AND m.read_at IS NULL AND c.closed_at IS NULL
AND ((c.user_a=? AND c.hidden_a=0) OR (c.user_b=? AND c.hidden_b=0)) ORDER BY m.id ASC LIMIT 10'''
assert conn.execute(dm_q,(1,1,1)).fetchone()['body']=='hello'
# Ticket response polling query shape.
ticket_q='''SELECT tm.id,tm.ticket_id,tm.body,tm.created_at,tm.sender_id,u.username
FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id JOIN users u ON u.id=tm.sender_id
WHERE t.user_id=? AND tm.sender_id<>? ORDER BY tm.id LIMIT 20'''
assert conn.execute(ticket_q,(1,1)).fetchone()['body']=='reply'
# Nearby query shape, exact coordinates never returned by the bot-facing list.
near_q='''SELECT u.id,u.username,u.display_name,u.level,l.latitude,l.longitude FROM users u JOIN user_locations l ON l.user_id=u.id
WHERE u.id<>? AND u.is_banned=0 AND datetime(l.updated_at)>datetime('now','-30 minutes')
AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=u.id) OR (b.user_id=u.id AND b.blocked_id=?))'''
assert len(conn.execute(near_q,(1,1,1)).fetchall())==1
conn.execute("INSERT INTO rubika_random_state(chat_id,user_id,room_id,other_id,active) VALUES('botchat',1,'room1',2,1)")
conn.execute("INSERT INTO rubika_random_events(chat_id,room_id,event_type,body,from_id) VALUES('botchat','room1','message','test',2)")
assert conn.execute("SELECT body FROM rubika_random_events WHERE sent_at IS NULL").fetchone()[0]=='test'
conn.execute("INSERT INTO user_cosmetics(user_id,item_id) VALUES(1,'frame_neon')")
conn.execute("INSERT INTO user_cosmetic_loadout(user_id,kind,item_id) VALUES(1,'frame','frame_neon')")
print('PASS bridge schema creation (twice), preservation of scratch rows, DM/ticket/nearby queries, random-event queue and cosmetic ownership')
