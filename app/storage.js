(function(root){
'use strict';
const T=root.SwissCourtTournament||(typeof require==='function'?require('./tournament.js'):null);
const key='swisscourt-tournament-v1',backupKey=key+'-previous';
function decode(raw){if(raw.length>10*1024*1024)throw Error('Файл слишком большой.');return T.validate(JSON.parse(raw));}
function read(storage){
 try{const raw=storage.getItem(key);return {state:raw?decode(raw):T.newDay(),error:'',exists:!!raw};}
 catch{let recovery=null;try{const raw=storage.getItem(backupKey);if(raw)recovery=decode(raw);}catch{}
  return {state:recovery||T.newDay(),recovery,error:'Не удалось прочитать текущий день. Исходные данные сохранены; запись заблокирована. Восстановите резервную копию.'};}
}
function commit(storage,next,expected){
 const previous=storage.getItem(key),current=previous?decode(previous):null;
 if(current&&(current.id!==expected.id||current.revision!==expected.revision))throw Error('День изменён в другой вкладке. Обновите страницу перед продолжением.');
 const saved=structuredClone(next);saved.revision=(current?.revision??expected.revision)+1;T.validate(saved);
 const raw=JSON.stringify(saved);
 if(previous)storage.setItem(backupKey,previous);
 storage.setItem(key,raw);
 return saved;
}
function recover(storage,recovery){const next=structuredClone(recovery);T.validate(next);next.revision++;storage.setItem(key,JSON.stringify(next));return next;}
const api={key,backupKey,decode,read,commit,recover};root.SwissCourtStorage=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
