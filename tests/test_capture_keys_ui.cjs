// Enter finishes a shortcut recording; Escape cancels. Neither key submits to the target app.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {boot,flush}=require('./test_translation_ui.cjs');
(async()=>{
 const app=boot({quick:true,language:'en',status:{nativeDesktop:true}});await flush();
 let stops=0,closed=0;
 app.context.__stop=()=>stops++;
 app.context.window.pywebview.api.close_quick=async()=>{if(app.context.window.relayQuickClose())closed++;};
 const record=()=>vm.runInContext("listening=true;busy=false;quickEnding=false;recorder={state:'recording',stop(){this.state='inactive';__stop();}}",app.context);
 const key=(name,extra={})=>{let prevented=false;app.context.quickKeydown({key:name,preventDefault(){prevented=true;},...extra});return prevented;};
 record();assert.ok(key('Enter'));assert.equal(stops,1);
 assert.equal(vm.runInContext('discardAudio',app.context),false);
 assert.ok(key('Enter',{repeat:true}));assert.equal(stops,1);
 record();assert.ok(key('Escape'));assert.equal(closed,1);assert.equal(stops,2);
 assert.equal(vm.runInContext('discardAudio',app.context),true);
 for(const modifiers of [{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true}]){
  record();assert.equal(key('Enter',modifiers),false);assert.equal(stops,2);
 }
 vm.runInContext('listening=false;busy=true',app.context);app.context.window.relayQuickFinish();assert.equal(stops,2);
 assert.equal(app.posted('/api/send').length,0);
 const main=boot();await flush();let prevented=false;
 main.context.quickKeydown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,false);

 // Native shortcut labels and clipboard hints match the platform in both languages.
 for(const language of ['en','ar']){
  const labels=boot({language});await flush();
  vm.runInContext('historyLoaded=false',labels.context);
  const choices={'ctrl-alt-space':'Control + Option + Space','ctrl-alt-r':'Control + Option + R','ctrl-shift-space':'Control + Shift + Space'};
  labels.nodes.get('shortcutChoice').options=Object.keys(choices).map(value=>({value}));
  labels.context.showShortcut({platform:'darwin',available:true,choice:'ctrl-alt-r',label:choices['ctrl-alt-r'],choices});
  assert.equal(labels.nodes.get('topShortcut').textContent,'Control + Option + R');
  assert.equal(labels.nodes.get('shortcutChoice').value,'ctrl-alt-r');
  assert.deepEqual(labels.nodes.get('shortcutChoice').options.map(o=>o.textContent),Object.values(choices));
  assert.match(labels.nodes.get('captureKeysHelp').textContent,/Return/);
  assert.match(labels.context.tr('اتنسخ، الصق بـ {paste}.'),/Command \+ V/);
  assert.match(labels.context.tr('ما قدرتش أنسخ. افتح النص وانسخه بـ {copy}.'),/Command \+ C/);
  await labels.nodes.get('copy').click();
  assert.match(labels.nodes.get('notice').textContent,/Command \+ C/);
  labels.context.showShortcut({platform:'win32',available:true,label:'Ctrl + Alt + Space'});
  assert.match(labels.nodes.get('captureKeysHelp').textContent,/Enter/);
  assert.match(labels.context.tr('اتنسخ، الصق بـ {paste}.'),/Ctrl \+ V/);
 }

 // Flow can finish immediately instead of waiting for the typing pause, but respects IME composition.
 const flow=boot({quick:true,provider:'wispr',translate:{english:'Keep React.'}});await flush();
 await flow.context.window.relayQuickToggle();flow.nodes.get('flowCapture').value='خلي React';
 vm.runInContext('quickComposing=true',flow.context);flow.context.window.relayQuickFinish();assert.equal(flow.posted('/api/translate').length,0);
 vm.runInContext('quickComposing=false',flow.context);flow.context.window.relayQuickFinish();await flush();
 assert.equal(flow.posted('/api/translate').length,1);assert.equal(flow.nodes.get('english').value,'Keep React.');
 console.log('Enter/Esc: finish, cancel, repeat suppression, modifiers, IME, Flow and main-window isolation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
