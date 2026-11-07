'use strict';
const assert=require('assert');
const H=require('../lib/hokm-engine');
const deck=H.createDeck(()=>0);
assert.strictEqual(deck.length,52);
assert.strictEqual(new Set(deck.map(c=>c.suit+c.rank)).size,52);
assert.deepStrictEqual(H.SUITS,['S','H','D','C']);
assert.deepStrictEqual([0,1,2,3].map(H.teamForSeat),[0,1,0,1]);
const dealt=H.dealFive(H.createDeck(()=>0));
assert.deepStrictEqual(dealt.hands.map(h=>h.length),[5,5,5,5]);
assert.strictEqual(dealt.remaining.length,32);
H.completeHands(dealt.hands,dealt.remaining);
assert.deepStrictEqual(dealt.hands.map(h=>h.length),[13,13,13,13]);
assert.strictEqual(dealt.remaining.length,0);
const leadHand=[{suit:'H',rank:2},{suit:'S',rank:14}];
assert.strictEqual(H.canPlayCard(leadHand,{suit:'S',rank:14},'H'),false);
assert.strictEqual(H.canPlayCard(leadHand,{suit:'H',rank:2},'H'),true);
assert.strictEqual(H.canPlayCard([{suit:'S',rank:2}],{suit:'D',rank:14},'H'),true);
const trick=[
 {seat:0,card:{suit:'H',rank:14}},
 {seat:1,card:{suit:'S',rank:2}},
 {seat:2,card:{suit:'H',rank:10}},
 {seat:3,card:{suit:'H',rank:13}}
];
assert.strictEqual(H.winnerOfTrick(trick,'S'),1); // trump beats lead suit
assert.strictEqual(H.winnerOfTrick(trick,'D'),0); // highest lead suit wins
assert.strictEqual(H.dealWinner([7,6]),0);
assert.strictEqual(H.dealWinner([5,8]),1);
assert.throws(()=>H.dealWinner([6,6]));
assert.throws(()=>H.winnerOfTrick(trick.slice(0,3),'S'));
console.log('PASS Hokm engine: 16 rule and dealing assertions');
