'use strict';
const crypto = require('crypto');
const SUITS = Object.freeze(['S','H','D','C']);
const RANKS = Object.freeze([2,3,4,5,6,7,8,9,10,11,12,13,14]);
function createDeck(randomInt=crypto.randomInt){
 const cards=[];for(const suit of SUITS)for(const rank of RANKS)cards.push({suit,rank});
 for(let i=cards.length-1;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
 return cards;
}
function teamForSeat(seat){if(!Number.isInteger(seat)||seat<0||seat>3)throw new RangeError('Invalid seat');return seat%2===0?0:1;}
function dealFive(deck){
 if(!Array.isArray(deck)||deck.length!==52)throw new TypeError('A standard 52-card deck is required');
 const remaining=deck.slice(),hands=[[],[],[],[]];
 for(let round=0;round<5;round++)for(let seat=0;seat<4;seat++)hands[seat].push(remaining.pop());
 return {hands,remaining};
}
function completeHands(hands,remaining){
 if(!Array.isArray(hands)||hands.length!==4||!Array.isArray(remaining))throw new TypeError('Invalid deal state');
 for(const hand of hands)if(!Array.isArray(hand)||hand.length!==5)throw new Error('Each player must hold exactly five cards before trump selection');
 for(const hand of hands)while(hand.length<13)hand.push(remaining.pop());
 if(remaining.length!==0||hands.some(h=>h.length!==13))throw new Error('Invalid card distribution');
 return hands;
}
function canPlayCard(hand,card,leadSuit){
 if(!leadSuit)return true;
 return !hand.some(c=>c.suit===leadSuit)||card.suit===leadSuit;
}
function winnerOfTrick(trick,trump){
 if(!Array.isArray(trick)||trick.length!==4||!SUITS.includes(trump))throw new Error('A trick requires four plays and a valid trump');
 const lead=trick[0].card.suit;
 const trumpPlays=trick.filter(x=>x.card.suit===trump);
 const pool=trumpPlays.length?trumpPlays:trick.filter(x=>x.card.suit===lead);
 return pool.reduce((best,x)=>x.card.rank>best.card.rank?x:best).seat;
}
function dealWinner(tricks){
 if(!Array.isArray(tricks)||tricks.length!==2||tricks[0]+tricks[1]!==13||tricks[0]===tricks[1])throw new Error('A completed deal must contain 13 tricks');
 return tricks[0]>tricks[1]?0:1;
}
module.exports={SUITS,RANKS,createDeck,teamForSeat,dealFive,completeHands,canPlayCard,winnerOfTrick,dealWinner};
