'use strict';

// Shared synthetic service boundaries; send controllers and DOM bindings stay production code.
async function install(win, read, extraScripts = []) {
  const js = code => win.webContents.executeJavaScript(code, true);
  const { stubGlobals } = require('../../tests/fixture/chat-draft-harness.cjs');
  await js(`(()=>{const require=()=>{};(${stubGlobals.toString()})(window,{});delete window.require;})();
    window.calls=[];window.toasts=[];window.errors=[];window.clicks=[];window.enterPresses=[];window.modelCalls=0;window.modelReads=[];window.catalogMode='ok';window.catalogWaiters=[];
    document.addEventListener('click',e=>clicks.push(e.target.closest('button')?.id||e.target.tagName),true);
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nchatInput')enterPresses.push(e.isTrusted);},true);
    addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
    window.petSay=text=>toasts.push(String(text));window.render=()=>{};window.save=()=>{};window.workRoot=()=>'';
    window.task={id:'acceptance-task',title:'Verify synthetic delivery',status:'reviewing',canViewExecution:true,
      acceptanceCriteria:['The saved delivery can be reviewed'],workRouting:{conversationTurn:{conversationId:'restored-chat',state:'completed',executor:'native'}}};
    window.model={id:'glm5.2',name:'glm5.2',label:'glm5.2'};
    window.idle=()=>({status:'idle',messages:[{role:'assistant',text:'Synthetic completed delivery',done:true}],tools:[],adapterId:'pi',
      execution:{running:false,taskExecutions:[]},modelSelection:{name:model.id,model}});
    SoduWorkAPI={taskStorageKey:()=> 'synthetic-owner',getTask:async()=>structuredClone(task),listAttachments:async()=>[],
      myModels:async()=>{modelCalls++;modelReads.push(catalogMode);if(catalogMode==='reject')throw Error('Synthetic directory failure');
        if(catalogMode==='hang')return new Promise(resolve=>catalogWaiters.push(resolve));
        return {usable:[{name:model.id,label:model.label,...(model.localOnly?{localOnly:true}:{})}],defaultModels:{pi:model.id}};}};
    const ac={supported:true,schema:'soduwork.access-policy/v1',modes:['standard','readonly','full'],canChangeDuringSession:true};
    window.low={open:async options=>{calls.push({kind:'open',options});return {ok:true,ref:'ref-restored',sessionId:'restored-chat',adapterId:'pi',model,
        workdir:{dir:'',name:'Synthetic workspace'},snapshot:{...idle(),accessPolicy:{mode:'standard'},accessControl:ac}};},
      bindTask:async(...args)=>{calls.push({kind:'bind',args});return {ok:true};},
      send:async(ref,text,attachments,options)=>{calls.push({kind:'send',ref,text,attachments,options});
        if(window.holdNextSend){window.holdNextSend=false;await new Promise(resolve=>window.releaseSend=resolve);}
        return {ok:true,snapshot:idle()};},
      snapshot:async()=>({ok:true,snapshot:idle()}),onEvent:()=>()=>{},history:async()=>({ok:true,chats:[]}),release:async()=>({ok:true}),
      conversationRuntimes:async()=>({ok:true,runtimes:[{id:'pi',displayName:'Pi',modelMode:'managed'}],availableRuntimes:[{id:'pi',displayName:'Pi',modelMode:'managed'}]}),
      selectModel:async(ref,name)=>({ok:true,selection:{name,model:{id:name,label:name}}}),
      onModelsChanged:callback=>{window.modelsChanged=callback;return()=>{if(modelsChanged===callback)window.modelsChanged=null;};}};
    soduWorkAPI={conversationSession:low};ChatCollaborationStore=null;ChatWorkbenchAnnotations=null;
    low.runtimes=async()=>({ok:true,runtimes:[{id:'pi',displayName:'Pi',modelMode:'managed'}],availableRuntimes:[{id:'pi',displayName:'Pi',modelMode:'managed'}]});
    ChatChrome.header=()=>'';SessionMemoryEntry.options=()=>({});AccessControls.sync=()=>{};ChatWorkbench.render=()=>{};
    SoduWorkI18n.getLocale=()=> 'zh-CN';SoduWorkI18n.translateText=value=>value;
    SoduWorkI18n.t=(key,fallback,values={})=>String(fallback||key).replace(/\\{([^}]+)\\}/g,(_,name)=>values[name]??name);void 0;`);
  await js(read('core/requirement-review-context.js') + '\nvoid 0;');
  const scripts = ['agent-brand', 'work-composer', 'conversation-attachments', 'panels-chat-work-actions', 'chat-dom-patch', 'panels-chat-tools',
    'chat-session-controls', 'chat-runtime-picker', 'chat-composer-controls', 'chat-task-start', 'chat-task-controller',
    'chat-context-meter', 'chat-scroll-follow', 'chat-markdown', 'chat-acceptance-results', 'chat-message-renderer',
    'chat-draft-recovery', 'chat-composer-bindings', 'chat-session-controller'];
  for (const file of scripts) await js(read('components/panels/' + file + '.js') + '\nvoid 0;');
  await js(`{const create=ChatMessageRenderer.create;ChatMessageRenderer.create=ctx=>{window.fixtureContext=ctx;return create(ctx);};}void 0;`);
  for (const file of extraScripts) await js(read('components/panels/' + file + '.js') + '\nvoid 0;');
  await js(read('components/panels/panels-chat.js') + '\nvoid 0;');
}

module.exports = { install };
