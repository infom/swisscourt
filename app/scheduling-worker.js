'use strict';
importScripts('./core.js','./tournament.js','./scheduling.js');
self.onmessage=event=>{
 const {state,category}=event.data;
 try{self.postMessage({proposal:SwissCourtScheduling.plan(state,category)});}
 catch(error){self.postMessage({error:error.message});}
};
