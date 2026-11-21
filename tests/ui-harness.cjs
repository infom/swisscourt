// Offline view checks: execute the real renderer without a browser or network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../app/core.js');
const S=require('../app/simulation.js');
const legacyDay=require('../prototype/fixtures/legacy-day.cjs');
const B=require('../app/brackets.js'),P=require('../app/planning.js');
const T=require('../app/tournament.js'),D=require('../app/storage.js'),A=require('../app/scheduling.js');
const script=['app.js','planner-ui.js','display-ui.js','real-ui.js'].map(file=>fs.readFileSync(path.join(__dirname,'../app',file),'utf8')).join('\n');

function boot({hash='',search='',savedState,legacyState,simulationControl,realState,lock=true,workerClass}={}){
 const nodes=new Map(),listeners=new Map(),intervals=[],downloads=[];
 let focused='';
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set(/^#score-\d-\d$/.test(id)?['score-input']:[]);
   nodes.set(id,{id:id.replace(/^#/,''),innerHTML:'',scrollTop:0,value:'',open:false,disabled:false,textContent:'',
    classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},contains:name=>classes.has(name),
     toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}},
    focus(){focused=id;},select(){this.selected=true;},closest(){return null;},setAttribute(){},
    showModal(){
     this.open=true;
     for(const match of this.innerHTML.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g)){
      node('#'+match[1]).value=match[2];node('#'+match[1]).disabled=false;
     }
    },close(){this.open=false;}});
  }
  return nodes.get(id);
 };
 const storage=new Map(savedState?[['swisscourt-ui-md-wd-7-v1-live',JSON.stringify(savedState)]]:[]);
 if(realState)storage.set(D.key,JSON.stringify(realState));
 if(legacyState)storage.set('swisscourt-ui-v1-live',JSON.stringify(legacyState));
 if(simulationControl)storage.set('swisscourt-yug-arena-simulation-v1',JSON.stringify(simulationControl));
 const context=vm.createContext({
  SwissCourtCore:C,SwissCourtBrackets:B,SwissCourtPlanning:P,SwissCourtSimulation:S,SwissCourtTournament:T,SwissCourtStorage:D,SwissCourtScheduling:A,Worker:workerClass,crypto,AbortSignal,
  navigator:{locks:{request:async(name,options,fn)=>fn(lock?{}:null)},storage:{persist:async()=>true}},structuredClone,URLSearchParams,Blob,console,Date,
  URL:class extends URL{static createObjectURL(blob){downloads.push(blob);return 'blob:test';}static revokeObjectURL(){}},
  location:{hash,search,href:'http://localhost/#'+hash},history:{replaceState(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),createElement(){return {click(){}};},addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);}},
  window:{addEventListener(){},scrollTo(){}},setInterval(fn,ms){intervals.push({fn,ms});},setTimeout(){},clearTimeout(){}
 });
 vm.runInContext(script,context);
 return {run:code=>vm.runInContext(code,context),html:()=>node('#app').innerHTML,node,storage,intervals,downloads,
  focused:()=>focused,
  input(id,value){const target=node(id);target.value=String(value);for(const fn of listeners.get('input')||[])fn({target});},
  enter(id){for(const fn of listeners.get('keydown')||[])fn({key:'Enter',target:node(id),preventDefault(){}});},
  click(dataset){const target={dataset};target.closest=()=>target;for(const fn of listeners.get('click')||[])fn({target});}};
}


module.exports={boot};
