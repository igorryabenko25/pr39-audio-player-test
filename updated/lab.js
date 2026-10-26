'use strict';
(() => {
  const base = new URL('.',location.href);
  const kind = new URL(location.href).searchParams.get('player') === 'ordinary' ? 'ordinary' : 'protected';
  const lab = window.lab = {kind,token:crypto.randomUUID(),fault:'normal',generation:0,log:[],events:[],api:[],analytics:[],denied:[],memory:null};
  lab.note = message => {lab.log.push({at:Date.now(),message});document.getElementById('log').textContent=lab.log.slice(-60).map(row=>new Date(row.at).toLocaleTimeString()+' '+row.message).join('\n');};
  lab.mediaUrl = (mode,generation) => {const url=new URL('media/resource.mp3',base);url.search=new URLSearchParams({token:lab.token,player:kind,mode,generation:String(generation)});return url.href;};
  function deny(api){lab.denied.push(api);throw Error('External network API denied: '+api);}
  window.fetch = async (input, options={}) => {
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin||url.search||url.hash)return deny('fetch');
    if(url.pathname==='/api/analytics/audio'&&options.method==='POST') {lab.analytics.push(JSON.parse(options.body));return new Response('{}',{status:200});}
    if(url.pathname!=='/api/audio/offline-practice'||(options.method&&options.method!=='GET'))return deny('fetch');
    const fault=options.cache==='no-store'?lab.fault:'normal';
    const generation=++lab.generation;lab.api.push({generation,fault,at:Date.now()});lab.note('API в памяти: '+fault+', поколение '+generation);
    if(fault==='late-api')await new Promise(resolve=>setTimeout(resolve,18000));
    if(options.signal?.aborted&&fault!=='late-api')throw new DOMException('Aborted','AbortError');
    return new Response(JSON.stringify({url:lab.mediaUrl(fault==='late-api'?'normal':fault,generation)}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  for(const name of ['WebSocket','XMLHttpRequest','EventSource','RTCPeerConnection','webkitRTCPeerConnection','Worker','SharedWorker'])if(name in window)window[name]=class{constructor(){deny(name)}};
  Object.defineProperty(navigator,'sendBeacon',{value:()=>{deny('sendBeacon');return false;}});
  document.addEventListener('securitypolicyviolation',event=>{lab.denied.push('CSP:'+event.effectiveDirective);lab.note('CSP: '+event.effectiveDirective);});
  function workerMessage(data){return new Promise((resolve,reject)=>{
    if(navigator.serviceWorker.controller?.scriptURL!==new URL('service-worker.js',base).href){reject(Error('Unexpected controlling worker'));return;}
    const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('Worker command timed out'));},15000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data.ok?resolve(event.data):reject(Error(event.data.error));};
    navigator.serviceWorker.controller.postMessage(data,[channel.port2]);
  });}
  lab.setFault=async mode=>{
    if(!['normal','hold','late','broken','late-api'].includes(mode))throw Error('Unknown fault');
    if(kind==='ordinary'&&mode==='late-api')throw Error('Этот режим только для защищённого плеера');
    await workerMessage({type:'fault',token:lab.token,mode:kind==='ordinary'?mode:'normal'});
    lab.fault=mode;lab.note('Режим '+mode+' применён');
  };
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='media'){lab.events.push({at:Date.now(),worker:event.data});lab.note('MP3: '+event.data.event+', '+event.data.mode);}});
  lab.ready=(async()=>{
    if(base.pathname!=='/pr39-audio-player-test/updated/')throw Error('Разрешён только каталог /pr39-audio-player-test/updated/');
    if(!['http:','https:'].includes(location.protocol)||!navigator.serviceWorker)throw Error('Нужен HTTP(S) и Service Worker; file:// не поддерживается');
    const registration=await navigator.serviceWorker.register(new URL('service-worker.js',base),{scope:base.pathname});
    await navigator.serviceWorker.ready;
    const expectedWorker=new URL('service-worker.js',base).href;
    if(navigator.serviceWorker.controller?.scriptURL!==expectedWorker)await new Promise((resolve,reject)=>{
      const onChange=()=>{if(navigator.serviceWorker.controller?.scriptURL===expectedWorker){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',onChange);resolve();}};
      const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',onChange);reject(Error('Worker did not control this page'));},15000);
      navigator.serviceWorker.addEventListener('controllerchange',onChange);
      onChange();
    });
    if(registration.scope!==base.href)throw Error('Unexpected worker scope');
    await workerMessage({type:'ready'});lab.note('Worker и локальный MP3 готовы');
    document.getElementById('kind').textContent=kind==='ordinary'?'Обычный плеер':'Защищённый плеер';
    document.getElementById('status').textContent='Готово. Начните практику и дождитесь 5 секунд.';
  })();
  const audio=()=>document.querySelector('#root audio');
  // Chromium can reuse demuxed metadata for the same URL despite a new SW body.
  // For fault injection only, choose a fresh local resource at the load boundary,
  // AFTER the component captured its bookmark. All decoding/loading stays native.
  const nativeLoad=HTMLMediaElement.prototype.load;
  const instrumented=new WeakSet();let mediaNonce=0;
  function instrumentAudio(){const target=audio();if(!target||instrumented.has(target))return;instrumented.add(target);
    if(kind==='ordinary')target.load=function(){
      if(lab.fault!=='normal'&&this.getAttribute('src')){
        this.src=lab.mediaUrl(lab.fault,++mediaNonce);lab.note('Внесение сбоя: уникальный MP3 URL на границе native load()');
      }
      return nativeLoad.call(this);
    };
  }
  new MutationObserver(instrumentAudio).observe(document.getElementById('root'),{childList:true,subtree:true});
  function nativeButtons(){return [...document.querySelectorAll('#root button,[role=dialog] button')];}
  function button(text){return nativeButtons().find(item=>item.textContent.trim()===text);}
  lab.error=()=>{const a=audio();if(!a||!document.querySelector('[role=dialog]'))throw Error('Сначала начните практику');a.pause();a.dispatchEvent(new Event('error'));lab.note('Синтетическая исходная ошибка на '+a.currentTime.toFixed(2)+' с');};
  lab.seek=position=>{const input=document.querySelector('[role=dialog] input[type=range]');if(!input||input.disabled)throw Error('Перемотка недоступна');const value=Math.max(0,Math.min(Math.floor(position),Number(input.max)));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
  const actions={
    begin:()=>{const target=button('Начать практику');if(!target)throw Error('Плеер не готов');target.click();},
    toggle:()=>{const target=document.querySelector('[role=dialog] button[aria-label="Пауза"],[role=dialog] button[aria-label="Продолжить"],[role=dialog] button[aria-label="Воспроизвести"]');if(!target)throw Error('Дождитесь начала');target.click();},
    seek:()=>lab.seek(35),end:()=>lab.seek(audio().duration-2),fault:()=>lab.setFault(document.getElementById('fault').value),error:()=>lab.error(),
    recover:()=>{const target=button('Продолжить с этого места');if(!target||target.disabled)throw Error('Восстановление недоступно');target.click();},
    download:()=>{const report={kind,localFixedSources:true,syntheticInitialError:true,events:lab.events,api:lab.api,progress:lab.memory?.progress,denied:lab.denied,log:lab.log};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='pr39-'+kind+'-observations.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  };
  document.querySelectorAll('[data-action]').forEach(target=>target.addEventListener('click',async()=>{try{await lab.ready;await actions[target.dataset.action]();document.getElementById('status').textContent='Команда выполнена: '+target.textContent;}catch(error){document.getElementById('status').textContent=error.message;lab.note(error.message);}}));
  for(const name of ['loadedmetadata','seeked','playing','pause','timeupdate','error','ended'])document.addEventListener(name,event=>{const a=event.target;if(a instanceof HTMLAudioElement)lab.events.push({at:Date.now(),name,time:a.currentTime,src:a.currentSrc,readyState:a.readyState});},true);
  const refreshTimer=setInterval(()=>{const a=audio();if(a)document.getElementById('media').textContent=(a.paused?'Пауза':'Играет')+' · '+a.currentTime.toFixed(2)+' / '+(Number.isFinite(a.duration)?a.duration.toFixed(2):'?')+' с · режим '+lab.fault;},500);
  window.addEventListener('pagehide',()=>{clearInterval(refreshTimer);audio()?.pause();});
})();
