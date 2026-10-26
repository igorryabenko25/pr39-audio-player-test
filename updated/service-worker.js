'use strict';
const scope = new URL(self.registration.scope);
if(scope.pathname!=='/pr39-audio-player-test/updated/')throw Error('Refusing worker scope outside the approved updated/ directory');
const nativeFetch = self.fetch.bind(self);
const faults = new Map();
let bytesPromise;
const assets = new Set(['index.html','lab.js','bundle.js','style.css','audio/resurs.mp3']);
function own(url) { return url.origin === scope.origin && url.pathname.startsWith(scope.pathname); }
function staticFetch(request) {
  const url = new URL(typeof request === 'string' ? request : request.url);
  const key = url.pathname.slice(scope.pathname.length) || 'index.html';
  if (!own(url) || !assets.has(key)) throw Error('External or unapproved worker fetch denied');
  return nativeFetch(request,{redirect:'error'});
}
self.fetch = staticFetch;
for(const name of ['WebSocket','XMLHttpRequest','EventSource','Worker'])if(name in self)self[name]=class{constructor(){throw Error('Worker outbound API denied: '+name);}};
self.importScripts=()=>{throw Error('Dynamic worker imports denied');};
function bytes() {
  if (!bytesPromise) bytesPromise = staticFetch(new URL('audio/resurs.mp3',scope).href).then(response => {
    if (!response.ok) throw Error('Local MP3 unavailable'); return response.arrayBuffer();
  }).catch(error => { bytesPromise = null; throw error; });
  return bytesPromise;
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if(!event.source?.url||!own(new URL(event.source.url))){event.ports[0]?.postMessage({ok:false,error:'Client outside updated/ scope'});return;}
  const data = event.data || {};
  event.waitUntil((async () => {
    try {
      if (data.type === 'ready') await bytes();
      else if (data.type === 'fault' && typeof data.token === 'string' && ['normal','hold','late','broken'].includes(data.mode)) faults.set(data.token,data.mode);
      else throw Error('Unknown worker command');
      event.ports[0]?.postMessage({ok:true});
    } catch(error) { event.ports[0]?.postMessage({ok:false,error:error.message}); }
  })());
});
async function report(clientId, detail) { const client = await self.clients.get(clientId); client?.postMessage({type:'media',...detail}); }
async function media(request, url, clientId) {
  const token = url.searchParams.get('token');
  const mode = (url.searchParams.get('player')==='ordinary' ? faults.get(token) : null) || url.searchParams.get('mode') || 'normal';
  await report(clientId,{mode,generation:url.searchParams.get('generation'),range:request.headers.get('range'),event:'request'});
  if (mode === 'broken') return new Response('Injected MP3 failure',{status:503,headers:{'Cache-Control':'no-store'}});
  if (mode === 'late') await new Promise(resolve=>setTimeout(resolve,18000));
  const data = await bytes(), size = data.byteLength;
  let start=0,end=size-1,status=200;
  const range=request.headers.get('range');
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    if(!match[1])start=Math.max(0,size-Number(match[2]));
    else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    status=206;
  }
  const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'no-store'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  if(mode==='hold'){
    const stream=new ReadableStream({start(){},cancel(){void report(clientId,{mode,event:'cancel'});}});
    return new Response(stream,{status,headers});
  }
  await report(clientId,{mode,event:'response',status});
  return new Response(request.method==='HEAD'?null:data.slice(start,end+1),{status,headers});
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(!own(url)||!['GET','HEAD'].includes(request.method)){event.respondWith(new Response('Denied',{status:403}));return;}
  if(url.pathname===new URL('media/resource.mp3',scope).pathname){event.respondWith(media(request,url,event.clientId));return;}
  const key=url.pathname.slice(scope.pathname.length)||'index.html';
  event.respondWith(assets.has(key)?staticFetch(request):Promise.resolve(new Response('Not found',{status:404})));
});
