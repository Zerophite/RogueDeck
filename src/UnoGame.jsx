import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { db } from "./firebase.js";
import { ref, set, get, onValue, update, remove, off } from "firebase/database";

const COLORS=["red","blue","green","yellow"];
const CH={red:"#ED1C24",blue:"#0956BF",green:"#00A651",yellow:"#FFDE00",wild:"#222"};
const CHR={red:[237,28,36],blue:[9,86,191],green:[0,166,81],yellow:[255,222,0]};
const CG={red:"linear-gradient(145deg,#FF3D3D,#E53935,#C62828)",blue:"linear-gradient(145deg,#42A5F5,#1976D2,#0D47A1)",
  green:"linear-gradient(145deg,#66BB6A,#2E7D32,#1B5E20)",yellow:"linear-gradient(145deg,#FFEE58,#FFD600,#F9A825)",
  wild:"linear-gradient(145deg,#444,#1a1a1a,#000)"};
/* ══ ELEMENTAL MAPPING: red=Fire, blue=Water, green=Wind, yellow=Lightning ══ */
const ELEM_META={
  red:{name:"FIRE",emoji:"🔥",glow:"#FF5722",c3:"#BF360C",grad:"linear-gradient(145deg,#FFAB40,#FF5722,#BF360C)"},
  blue:{name:"WATER",emoji:"💧",glow:"#29B6F6",c3:"#01579B",grad:"linear-gradient(145deg,#81D4FA,#29B6F6,#01579B)"},
  green:{name:"WIND",emoji:"🌪️",glow:"#66BB6A",c3:"#1B5E20",grad:"linear-gradient(145deg,#B9F6CA,#66BB6A,#1B5E20)"},
  yellow:{name:"LIGHTNING",emoji:"⚡",glow:"#FFEE58",c3:"#F57F17",grad:"linear-gradient(145deg,#FFF9C4,#FFEE58,#F57F17)"}};
function EM(color){return ELEM_META[color]||ELEM_META.yellow;}
const VALS=["0","1","2","3","4","5","6","7","8","9","skip","reverse","draw2"];
const ADMIN_PASS="admin123";
const TURN_TIME=15;
const ROUND_TIME=180;
const DEF_SETTINGS={turnTime:15,roundTime:180,startCards:7,stacking:true,specialCards:true,drawTilPlay:false,maxPlayers:4,teamMode:false,autoSplit:true};
const MAX_PLAYERS=4;
/* Team vs team mode: Chaos (fire/red) vs Order (ice/blue). A team wins the moment any
   of its members empties their hand. */
const TEAM_LOGO_URL=import.meta.env.BASE_URL+"teams/";
const UI_URL=import.meta.env.BASE_URL+"ui/";
const TEAMS={
  chaos:{name:"Chaos",color:"#FF5252",glow:"rgba(255,82,82,0.55)",grad:"linear-gradient(135deg,#B71C1C,#FF5252)",icon:"🔥",logo:"chaos.png"},
  order:{name:"Order",color:"#40C4FF",glow:"rgba(64,196,255,0.55)",grad:"linear-gradient(135deg,#0D47A1,#40C4FF)",icon:"❄️",logo:"order.png"},
};
const EMOTE_URL=import.meta.env.BASE_URL+"emotes/";
const EMOTES=[
  {id:"angry",gif:"angry.gif",sound:"angry.mp3",label:"Angry",vol:5.0},
  {id:"laughing",gif:"laughing.gif",sound:"laughing.mp3",label:"Haha",vol:1.0},
];
const SFX_URL=import.meta.env.BASE_URL+"sfx/";
const SFX_FILES=[
  {id:"uno",file:"uno.mp3",vol:1.0},
  {id:"skip",file:"skip.mp3",vol:1.0},
  {id:"draw",file:"draw.mp3",vol:1.0},
  {id:"deckdraw",file:"deckdraw.mp3",vol:1.0},
  {id:"penalty",file:"penalty.mp3",vol:1.0},
  {id:"reverse",file:"reverse.mp3",vol:1.0},
  {id:"shadow",file:"shadow.mp3",vol:1.0},
  {id:"discardall",file:"discardall.mp3",vol:1.0},
  {id:"clock5",file:"clock5.mp3",vol:1.0},
  {id:"timeout",file:"timeout.mp3",vol:1.0},
  {id:"win",file:"win.mp3",vol:1.0},
  {id:"defeat",file:"defeat.mp3",vol:1.0},
  {id:"join",file:"join.mp3",vol:1.0},
  {id:"click",file:"click.mp3",vol:0.8},
  {id:"carddist",file:"carddist.mp3",vol:1.0},
];

/* ══ BACKGROUND MUSIC (streamed MP3 tracks: menu + two gameplay tracks) ══ */
const MUSIC_URL=import.meta.env.BASE_URL+"music/";
const GAME_TRACKS=["gameplay1.mp3","gameplay2.mp3"];
class BGMusic{
  constructor(){this.playing=false;this.vol=0.32;this.mode=null;this.audio=null;this.lastGame=null;this.pool=[];this.ctx=null;}
  init(ctx){this.ctx=ctx;}
  /* Route each track through a Web Audio gain node so volume is controllable on
     iOS (iOS Safari ignores HTMLAudio.volume). Falls back to element volume. */
  _node(a){
    if(a._gnode!==undefined)return a._gnode;
    if(this.ctx){try{const src=this.ctx.createMediaElementSource(a);const g=this.ctx.createGain();
      g.gain.value=0;src.connect(g);g.connect(this.ctx.destination);a._gnode=g;}catch(e){a._gnode=null;}}
    else a._gnode=null;
    return a._gnode;}
  _setV(a,v){v=Math.max(0,Math.min(1,v));const g=this._node(a);
    if(g&&this.ctx){const n=this.ctx.currentTime;g.gain.cancelScheduledValues(n);g.gain.setValueAtTime(v,n);}
    else if(g){g.gain.value=v;}else{try{a.volume=v;}catch(e){}}}
  _curV(a){const g=a._gnode;return g?g.gain.value:(a.volume||0);}
  setVol(v){this.vol=v;const a=this.audio;if(a)this._setV(a,v);}
  /* Fade via the Web Audio clock (linearRamp) — runs on the audio thread, so it
     is NOT stalled when requestAnimationFrame is throttled (backgrounded tab,
     mid-transition). Falls back to rAF only when there's no gain node. */
  _fade(a,to,ms=1400,done){
    if(!a)return;to=Math.max(0,Math.min(1,to));const g=this._node(a);
    if(g&&this.ctx){const n=this.ctx.currentTime;const from=g.gain.value;
      g.gain.cancelScheduledValues(n);g.gain.setValueAtTime(from,n);g.gain.linearRampToValueAtTime(to,n+ms/1000);
      if(done)setTimeout(done,ms+50);return;}
    a._fadeId=(a._fadeId||0)+1;const id=a._fadeId;
    const from=this._curV(a),start=performance.now();
    const tick=()=>{if(a._fadeId!==id)return;
      const p=Math.min(1,(performance.now()-start)/ms);this._setV(a,from+(to-from)*p);
      if(p<1)requestAnimationFrame(tick);else if(done)done();};
    requestAnimationFrame(tick);}
  _fadeOut(a){if(a)this._fade(a,0,1600,()=>{try{a.pause();}catch(e){}});}
  /* Fade out every track except the current one so no orphaned audio keeps playing. */
  _fadeOthers(){this.pool.forEach(a=>{if(a!==this.audio){a.onended=null;this._fadeOut(a);}});
    this.pool=this.audio?[this.audio]:[];}
  _pickGame(){const opts=GAME_TRACKS.filter(t=>t!==this.lastGame);
    const pool=opts.length?opts:GAME_TRACKS;const t=pool[Math.floor(Math.random()*pool.length)];this.lastGame=t;return t;}
  /* Warm the buffers up-front (on app load) so the first play() starts instantly
     instead of waiting several seconds for the MP3 to download+buffer. */
  preload(){if(this._pre)return;this._pre={};
    ["menu.mp3",...GAME_TRACKS].forEach(f=>{try{const a=new Audio(MUSIC_URL+f);a.preload="auto";a.load();this._pre[f]=a;}catch(e){}});}
  _spawn(src,loop,onended){
    let a=this._pre&&this._pre[src];
    if(a){this._pre[src]=null;}else{a=new Audio(MUSIC_URL+src);a.preload="auto";}
    a.loop=loop;if(onended)a.onended=onended;this.pool.push(a);this._setV(a,0);
    if(this.ctx&&this.ctx.state==="suspended")this.ctx.resume().catch(()=>{});
    const go=()=>a.play().then(()=>{if(a===this.audio)this._fade(a,this.vol,1600);}).catch(()=>{});
    go();
    return a;}
  resume(){if(this.ctx&&this.ctx.state==="suspended")this.ctx.resume().catch(()=>{});
    // if music should be on but the element got paused (iOS suspend), kick it again
    if(this.playing&&this.audio&&this.audio.paused){try{this.audio.play().catch(()=>{});}catch(e){}}}
  _startMode(mode){
    this.mode=mode;this.playing=true;
    if(mode==="game"){
      const play=()=>{this.audio=this._spawn(this._pickGame(),false,()=>{if(this.playing&&this.mode==="game")play();});};
      play();
    }else this.audio=this._spawn("menu.mp3",true,null);
    this._fadeOthers();}
  start(mode="menu"){if(this.playing&&this.mode===mode)return;this._startMode(mode);}
  setMode(mode){if(!this.playing||this.mode===mode)return;this._startMode(mode);}
  stop(){this.playing=false;this.audio=null;
    this.pool.forEach(a=>{a.onended=null;this._fadeOut(a);});this.pool=[];}
  toggle(mode="menu"){if(this.playing){this.stop();return false;}this._startMode(mode);return true;}
}
const bgm=new BGMusic();

/* ══ ANIME SFX ENGINE (LOUD - matches music volume) ══ */
class AnimeSFX{
  constructor(){this.c=null;this.master=null;this.vol=1;}
  init(){if(!this.c)try{this.c=new(window.AudioContext||window.webkitAudioContext)();if(this.c.state==="suspended")this.c.resume();this.master=this.c.createGain();this.master.gain.value=this.vol;this.master.connect(this.c.destination);bgm.init(this.c);}catch(e){}}
  setVol(v){this.vol=v;if(this.master)this.master.gain.value=v;}
  _osc(freq,type,t,dur,vol=0.18){
    const o=this.c.createOscillator();const g=this.c.createGain();o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur);}
  _bend(freq,endFreq,type,t,dur,vol=0.18){
    const o=this.c.createOscillator();const g=this.c.createGain();o.type=type;
    o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(endFreq,t+dur*0.6);
    const lp=this.c.createBiquadFilter();lp.type="lowpass";lp.frequency.value=3500;lp.Q.value=6;
    g.gain.setValueAtTime(vol,t);g.gain.setValueAtTime(vol*0.8,t+dur*0.3);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(lp);lp.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur);}
  _noise(t,dur,vol=0.3){
    const buf=this.c.createBuffer(1,this.c.sampleRate*dur,this.c.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.12));
    const b=this.c.createBufferSource();b.buffer=buf;const g=this.c.createGain();g.gain.value=vol;
    const f=this.c.createBiquadFilter();f.type="highpass";f.frequency.value=2500;
    b.connect(f);f.connect(g);g.connect(this.master);b.start(t);}
  _shimmer(baseFreq,t,dur,vol=0.08){for(let i=0;i<5;i++){const f=baseFreq*(1+i*0.5)+Math.random()*100;this._osc(f,"sine",t+i*0.03,dur-i*0.03,vol*(1-i*0.15));}}
  _chime(notes,t,gap=0.08,vol=0.18){notes.forEach((f,i)=>{this._osc(f,"sine",t+i*gap,0.25,vol);this._osc(f*2,"sine",t+i*gap,0.12,vol*0.3);});}
  _thunder(t){
    const buf=this.c.createBuffer(1,this.c.sampleRate*0.8,this.c.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++){
      const env=i<d.length*0.05?i/(d.length*0.05):Math.exp(-(i-d.length*0.05)/(d.length*0.18));
      d[i]=(Math.random()*2-1)*env;}
    const b=this.c.createBufferSource();b.buffer=buf;
    const f=this.c.createBiquadFilter();f.type="lowpass";f.frequency.value=800;f.Q.value=2;
    const g=this.c.createGain();g.gain.value=0.4;
    b.connect(f);f.connect(g);g.connect(this.master);b.start(t);
    this._bend(80,25,"sine",t,0.5,0.2);this._bend(60,20,"sine",t+0.05,0.4,0.15);}
  _fNoise(t,dur,freq,q,type,vol=0.2){
    const buf=this.c.createBuffer(1,this.c.sampleRate*dur,this.c.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.2));
    const b=this.c.createBufferSource();b.buffer=buf;const f=this.c.createBiquadFilter();
    f.type=type;f.frequency.value=freq;f.Q.value=q;
    const g=this.c.createGain();g.gain.value=vol;
    b.connect(f);f.connect(g);g.connect(this.master);b.start(t);}
  _fireEl(t){
    for(let i=0;i<10;i++){const d=i*0.035;this._noise(t+d,0.04+Math.random()*0.03,0.2+Math.random()*0.15);}
    this._fNoise(t,0.5,600,4,"bandpass",0.25);this._fNoise(t+0.1,0.4,1200,3,"bandpass",0.15);
    this._bend(120,40,"sawtooth",t,0.5,0.22);this._bend(200,60,"triangle",t+0.05,0.45,0.16);
    this._osc(60,"sine",t,0.5,0.18);this._shimmer(3500,t+0.05,0.3,0.08);
    this._bend(800,2000,"sine",t+0.1,0.2,0.06);}
  _waterEl(t){
    this._fNoise(t,0.4,400,8,"lowpass",0.3);this._fNoise(t+0.05,0.3,800,5,"bandpass",0.15);
    for(let i=0;i<10;i++){const f=150+Math.random()*600;this._osc(f,"sine",t+0.03+i*0.035,0.08,0.1);}
    this._bend(500,80,"sine",t,0.5,0.18);this._bend(800,150,"sine",t+0.08,0.4,0.12);
    for(let i=0;i<3;i++){this._bend(600-i*100,200-i*30,"sine",t+0.2+i*0.1,0.15,0.08);}
    this._shimmer(600,t+0.15,0.35,0.06);}
  _windEl(t){
    this._fNoise(t,0.6,300,2,"bandpass",0.2);this._fNoise(t+0.1,0.5,800,3,"bandpass",0.15);
    this._fNoise(t+0.2,0.4,1500,2,"bandpass",0.1);
    this._bend(150,1200,"sine",t,0.5,0.15);this._bend(1200,150,"sine",t+0.2,0.4,0.12);
    this._bend(400,1800,"triangle",t+0.05,0.4,0.08);
    for(let i=0;i<5;i++){this._osc(2000+i*400,"sine",t+0.1+i*0.06,0.12,0.04);}
    this._shimmer(2200,t+0.05,0.5,0.07);}
  _lightEl(t){
    this._bend(5000,150,"square",t,0.05,0.25);this._bend(3500,100,"sawtooth",t+0.01,0.04,0.2);
    this._bend(4500,200,"square",t+0.03,0.04,0.18);
    this._noise(t+0.02,0.15,0.3);this._fNoise(t+0.04,0.2,3000,5,"highpass",0.2);
    this._thunder(t+0.06);this._thunder(t+0.2);
    for(let i=0;i<4;i++){this._osc(5000+i*1000,"sine",t+i*0.015,0.03,0.12);}
    this._osc(40,"sine",t+0.1,0.4,0.2);}
  _emBuf={};_emLoaded=false;
  loadEmotes(){if(!this.c||this._emLoaded)return;this._emLoaded=true;
    EMOTES.forEach(e=>{fetch(EMOTE_URL+e.sound).then(r=>r.arrayBuffer()).then(ab=>this.c.decodeAudioData(ab)).then(buf=>{this._emBuf[e.id]=buf;}).catch(()=>{});});}
  playEmote(id){if(!this.c||!this._emBuf[id])return;
    const em=EMOTES.find(e=>e.id===id);
    try{const s=this.c.createBufferSource();s.buffer=this._emBuf[id];
      const g=this.c.createGain();g.gain.value=em?.vol||3.0;
      s.connect(g);g.connect(this.master);s.start();}catch(e){}}
  _fxBuf={};_fxLoaded=false;
  loadSfxFiles(){if(!this.c||this._fxLoaded)return;this._fxLoaded=true;
    SFX_FILES.forEach(e=>{fetch(SFX_URL+e.file).then(r=>r.arrayBuffer()).then(ab=>this.c.decodeAudioData(ab)).then(buf=>{this._fxBuf[e.id]=buf;}).catch(()=>{});});}
  pFile(id){if(!this.c||!this._fxBuf[id])return false;
    const f=SFX_FILES.find(e=>e.id===id);
    try{const s=this.c.createBufferSource();s.buffer=this._fxBuf[id];
      const g=this.c.createGain();g.gain.value=f?.vol||1;
      s.connect(g);g.connect(this.master);s.start();return true;}catch(e){return false;}}
  // The 5-second ticking clip is a long, STOPPABLE sound: keep its source so it can be
  // cut the moment the turn ends (player drew/played) instead of ticking on.
  _clockSrc=null;
  playClock(){this.stopClock();if(!this.c||!this._fxBuf["clock5"])return;
    try{const s=this.c.createBufferSource();s.buffer=this._fxBuf["clock5"];
      const g=this.c.createGain();g.gain.value=1;s.connect(g);g.connect(this.master);s.start();
      this._clockSrc=s;s.onended=()=>{if(this._clockSrc===s)this._clockSrc=null;};}catch(e){}}
  stopClock(){if(this._clockSrc){try{this._clockSrc.stop();}catch(e){}this._clockSrc=null;}}
  _thrBuf={};_thrLoaded=false;
  loadThrowables(){if(!this.c||this._thrLoaded)return;this._thrLoaded=true;
    THROWABLES.filter(t=>t.sfx).forEach(t=>{fetch(THROW_SFX_URL+t.id+".mp3").then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(ab=>this.c.decodeAudioData(ab)).then(buf=>{this._thrBuf[t.id]=buf;}).catch(()=>{});});}
  playThrow(id){if(!this.c||!this._thrBuf[id])return false;
    const t=THROWABLES.find(x=>x.id===id);
    try{const s=this.c.createBufferSource();s.buffer=this._thrBuf[id];
      const g=this.c.createGain();g.gain.value=t?.vol||1;
      s.connect(g);g.connect(this.master);s.start();return true;}catch(e){return false;}}
  pEl(color){if(!this.c)return;try{const t=this.c.currentTime;
    switch(color){case"red":this._fireEl(t);break;case"blue":this._waterEl(t);break;
      case"green":this._windEl(t);break;case"yellow":this._lightEl(t);break;}}catch(e){}}
  p(type){if(!this.c)return;try{const n=this.c.currentTime;
    switch(type){
      case "card":this._fNoise(n,0.038,3200*(0.9+Math.random()*0.2),1.2,"bandpass",0.5);this._fNoise(n,0.055,700,1.4,"lowpass",0.34);this._osc(170,"sine",n,0.045,0.16);break;
      case "draw":if(this.pFile("draw"))break;this._fNoise(n,0.13,1700*(0.9+Math.random()*0.2),2.6,"bandpass",0.3);this._bend(1100,2400,"sine",n,0.1,0.05);this._osc(150,"sine",n+0.09,0.04,0.1);break;
      case "deckdraw":if(this.pFile("deckdraw"))break;this._fNoise(n,0.13,1700,2.6,"bandpass",0.3);break;
      case "cardLift":this._fNoise(n,0.03,2600,2,"bandpass",0.18);this._osc(900,"triangle",n,0.03,0.05);break;
      case "action":this._bend(400,1200,"sawtooth",n,0.2,0.12);this._bend(600,1600,"square",n+0.05,0.18,0.08);this._shimmer(800,n+0.1,0.3,0.06);break;
      case "turn":this._chime([880,1100,1320],n,0.07,0.16);this._shimmer(1200,n+0.15,0.2,0.05);break;
      case "uno":if(this.pFile("uno"))break;this._chime([523,784,1047,1319,1568],n,0.06,0.18);this._shimmer(1500,n+0.2,0.4,0.07);this._bend(500,2000,"sine",n,0.4,0.1);break;
      case "win":if(this.pFile("win"))break;this._chime([523,659,784,1047,1319,1568,2093],n,0.09,0.2);this._shimmer(2000,n+0.3,0.6,0.08);this._bend(400,2400,"sine",n,0.8,0.08);[523,1047,1568].forEach((f,i)=>this._osc(f,"triangle",n+0.5+i*0.1,0.4,0.12));break;
      case "error":this._bend(400,150,"sawtooth",n,0.2,0.18);this._bend(300,100,"square",n+0.1,0.2,0.12);break;
      case "join":if(this.pFile("join"))break;this._chime([440,554,659,880],n,0.07,0.16);this._shimmer(800,n+0.15,0.3,0.06);break;
      case "challenge":this._bend(600,1400,"triangle",n,0.15,0.2);this._bend(1400,600,"triangle",n+0.15,0.15,0.2);this._bend(600,1800,"sawtooth",n+0.3,0.2,0.12);break;
      case "penalty":if(this.pFile("penalty"))break;this._bend(520,300,"sine",n,0.22,0.09);[0,0.12,0.24,0.36].forEach((d,i)=>{this._fNoise(n+0.06+d,0.032,3000,1.3,"bandpass",0.3-i*0.02);this._fNoise(n+0.06+d,0.05,640,1.4,"lowpass",0.2);this._osc(160,"sine",n+0.06+d,0.04,0.11);});this._osc(88,"sine",n+0.44,0.24,0.09);break;
      case "skip":if(this.pFile("skip"))break;this._bend(1000,400,"sine",n,0.12,0.2);this._bend(800,300,"triangle",n+0.06,0.1,0.15);break;
      case "reverse":if(this.pFile("reverse"))break;this._bend(400,1200,"sine",n,0.12,0.18);this._bend(1200,400,"sine",n+0.12,0.12,0.18);this._shimmer(800,n+0.1,0.2,0.06);break;
      case "draw2":this._bend(320,880,"sine",n,0.12,0.13);this._fNoise(n+0.1,0.06,2600,2,"bandpass",0.32);this._osc(140,"sine",n+0.1,0.14,0.26);this._fNoise(n+0.22,0.055,2400,2,"bandpass",0.28);this._osc(120,"sine",n+0.22,0.13,0.22);this._shimmer(1400,n+0.32,0.22,0.05);break;
      case "draw4":this._bend(180,660,"sawtooth",n,0.2,0.11);this._shimmer(900,n+0.05,0.3,0.06);[0,0.11,0.22,0.33].forEach((d,i)=>{this._fNoise(n+0.14+d,0.05,2200+i*380,2.5,"bandpass",0.32-i*0.03);this._osc(150-i*10,"sine",n+0.14+d,0.13,0.24-i*0.03);});this._osc(58,"sine",n+0.14,0.5,0.18);this._chime([784,1047,1319],n+0.54,0.05,0.08);break;
      case "wild":this._bend(300,1800,"sine",n,0.3,0.15);this._shimmer(1200,n+0.1,0.4,0.07);this._chime([523,659,784,1047],n+0.05,0.06,0.12);break;
      case "playable":this._chime([659,880,1047],n,0.06,0.14);break;
      case "notPlayable":this._bend(500,250,"sine",n,0.2,0.15);break;
      case "gameOn":this._chime([523,659,784,1047,1319],n,0.08,0.2);this._bend(300,1500,"sine",n,0.5,0.08);break;
      case "catchUno":this._bend(800,1600,"square",n,0.1,0.18);this._bend(1200,2000,"sine",n+0.05,0.1,0.15);this._noise(n+0.08,0.06,0.2);break;
      case "sparkle":[2000,2400,2800,3200,3600].forEach((f,i)=>{this._osc(f,"sine",n+i*0.03,0.15,0.07);});break;
      case "cardSlide":this._noise(n,0.1,0.3);this._bend(200,400,"sine",n,0.08,0.08);break;
      case "stack":this._bend(240,780,"sawtooth",n,0.16,0.12);[0,0.1,0.2].forEach((d,i)=>{this._fNoise(n+0.12+d,0.05,2600+i*300,2.5,"bandpass",0.3-i*0.03);this._osc(150-i*12,"sine",n+0.12+d,0.12,0.22);});this._osc(60,"sine",n+0.12,0.4,0.16);this._shimmer(1200,n+0.32,0.25,0.06);break;
      case "discardAll":if(this.pFile("discardall"))break;this._chime([523,659,784,1047,1319,1568],n,0.05,0.16);this._shimmer(1500,n+0.2,0.5,0.08);this._bend(400,2000,"sine",n,0.4,0.1);this._noise(n+0.1,0.08,0.2);break;
      case "tick":this._fNoise(n,0.02,2600,4,"bandpass",0.5);this._osc(1500,"sine",n,0.016,0.26);this._osc(520,"sine",n+0.006,0.035,0.2);break;
      case "timeout":if(this.pFile("timeout"))break;this._bend(600,200,"sawtooth",n,0.25,0.2);this._bend(400,120,"square",n+0.12,0.2,0.15);break;
      case "shadow":if(this.pFile("shadow"))break;this._bend(300,90,"sine",n,0.4,0.14);this._shimmer(500,n+0.05,0.4,0.06);break;
      case "defeat":if(this.pFile("defeat"))break;this._bend(400,140,"sawtooth",n,0.5,0.16);this._bend(300,100,"sine",n+0.2,0.5,0.12);break;
      case "click":if(this.pFile("click"))break;this._fNoise(n,0.02,2400,3,"bandpass",0.3);this._osc(1200,"sine",n,0.02,0.14);break;
      case "clock5":if(this.pFile("clock5"))break;this._fNoise(n,0.02,2600,4,"bandpass",0.5);break;
      case "carddist":if(this.pFile("carddist"))break;this._fNoise(n,0.09,1700,2.6,"bandpass",0.3);break;
    }
  }catch(e){}}
}
const sfx=new AnimeSFX();
function ua(){sfx.init();}

/* ── helpers ── */
function gid(){return Math.random().toString(36).substring(2,10);}
function grc(){const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)];return s;}
function mkD(){const d=[];let id=0;for(const c of COLORS){d.push({id:id++,color:c,value:"0",type:"number"});
  for(let i=0;i<2;i++)for(const v of VALS.slice(1))d.push({id:id++,color:c,value:v,type:["skip","reverse","draw2"].includes(v)?"action":"number"});
  d.push({id:id++,color:c,value:"discardAll",type:"action"});
  d.push({id:id++,color:c,value:"shadow",type:"action"});
  d.push({id:id++,color:c,value:"snatch",type:"action"});}
  for(let i=0;i<4;i++){d.push({id:id++,color:"wild",value:"wild",type:"wild"});d.push({id:id++,color:"wild",value:"wild4",type:"wild"});}return d;}
function sh(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function gs(v){return{skip:"⦸",reverse:"⇄",draw2:"+2",wild:"W",wild4:"+4",discardAll:"✕",shadow:"👤",snatch:"🫳"}[v]||v;}
function gl(v){return{skip:"SKIP",reverse:"REVERSE",draw2:"DRAW TWO",wild:"WILD",wild4:"WILD DRAW FOUR",discardAll:"DISCARD ALL",shadow:"SHADOW",snatch:"SNATCH"}[v]||v;}
function canPlay(c,top,curCol){if(c.type==="wild")return true;if(c.value==="shadow")return true;if(c.color===curCol)return true;if(c.value===top.value)return true;return false;}
const BOT_NAMES=["Marco","Jenny","Kyle23","Riza","Andrei","Sofia_M","Miguel","Hana","Leo","Grace","Tomas","Aria","Noah","Bea","Dexter","Luna","Rafael","Mika","Owen","Cielo","Jash","Nadia","Paolo","Yuki","Ivan","Trish","Cara","Enzo","Maya","Bryan"];
const randBotName=(used=[])=>{const avail=BOT_NAMES.filter(n=>!used.includes(n));const pool=avail.length?avail:BOT_NAMES;return pool[Math.floor(Math.random()*pool.length)];};
const isBot=id=>id?.startsWith("bot_");

/* ═══ TOP-5 CROWNS — premium rank emblems (crown1..5.png) for global top 5 ═══ */
const CROWN_IMG_URL=import.meta.env.BASE_URL+"crowns/";
const CROWN_FX_URL=import.meta.env.BASE_URL+"crowns/fx/";
/* Per-rank glow + glitter tint (matched to each crown's palette) + which animated effect
   sits behind it (public/crowns/fx/fx<efx>.webp, bg keyed to transparent). Effect assets:
   fx1=gold lightning, fx2=purple energy, fx3=snow, fx4=fire ring, fx5=magenta aura.
   efx = effect file for this rank (1&2 swapped per request); eop = effect opacity;
   esc = effect size multiplier vs the crown (rank 3 narrowed). */
const CROWN_FX={
  1:{glow:"rgba(255,120,110,0.45)",glit:"#FFE6C4",efx:2,eop:0.9, esc:1.7},
  2:{glow:"rgba(180,110,255,0.45)",glit:"#FFDD96",efx:1,eop:1.0, esc:1.9},
  3:{glow:"rgba(110,175,255,0.50)",glit:"#D2EAFF",efx:3,eop:0.5, esc:1.3},
  4:{glow:"rgba(255,110,80,0.45)", glit:"#FFD08C",efx:4,eop:0.6, esc:1.7},
  5:{glow:"rgba(170,110,255,0.50)",glit:"#E6C8FF",efx:5,eop:0.9, esc:1.7},
};
/* Glittering sparkles that drift upward off the crown. */
const GLIT_PARTS=[{l:20,d:0,u:2.2},{l:35,d:0.7,u:2.7},{l:50,d:1.2,u:2.1},{l:64,d:0.35,u:2.9},{l:78,d:0.95,u:2.4},{l:44,d:1.7,u:2.5}];
const RisingGlitter=({size,color})=>{const dot=Math.max(1.4,size*0.09),rise=(size*0.8)+"px";
  return(<span aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"visible"}}>
    {GLIT_PARTS.map((p,i)=>(<span key={i} style={{position:"absolute",left:p.l+"%",bottom:"20%",width:dot,height:dot,borderRadius:"50%",
      background:`radial-gradient(circle,${color},${color}00 70%)`,boxShadow:`0 0 ${dot*1.7}px ${color}`,
      "--rise":rise,animation:`glitterRise ${p.u}s ease-in ${p.d}s infinite`}}/>))}
  </span>);};
const Crown=({rank,size=24})=>{if(!rank||rank>5)return null;const fx=CROWN_FX[rank]||CROWN_FX[5];const fxpx=Math.round(size*(fx.esc||1.7));
  return(<span style={{position:"relative",display:"inline-block",width:size,height:size,lineHeight:0}}>
    <span aria-hidden style={{position:"absolute",inset:"-22%",borderRadius:"50%",pointerEvents:"none",
      background:`radial-gradient(circle,${fx.glow},transparent 62%)`,animation:"shimmerGlow 2.4s ease-in-out infinite"}}/>
    <img src={CROWN_FX_URL+"fx"+(fx.efx||rank)+".webp"} alt="" aria-hidden onError={e=>{e.currentTarget.style.display="none";}}
      style={{position:"absolute",left:"50%",top:"50%",width:fxpx,height:fxpx,transform:"translate(-50%,-52%)",
        objectFit:"contain",pointerEvents:"none",opacity:fx.eop??0.9}}/>
    <img src={CROWN_IMG_URL+"crown"+rank+".png"} width={size} height={size} alt={"#"+rank}
      style={{display:"block",objectFit:"contain",position:"relative",
        filter:"drop-shadow(0 1px 1.5px rgba(0,0,0,0.75))",
        animation:"crownFloat 2.4s ease-in-out infinite"}}/>
    <RisingGlitter size={size} color={fx.glit}/>
  </span>);};
/* In-game head marker: a crown for the global top 5, a small "#N" pill for everyone
   else who is ranked. Rendered floating just above a player's avatar. */
const RankMark=({rank,size=15})=>{
  if(!rank)return null;
  if(rank<=5)return <Crown rank={rank} size={size+9}/>;
  return(<span style={{display:"inline-block",fontSize:8,fontWeight:900,color:"#E8EEF6",lineHeight:1,
    background:"linear-gradient(180deg,rgba(40,48,64,0.96),rgba(18,22,32,0.96))",
    border:"1px solid rgba(255,255,255,0.22)",borderRadius:7,padding:"2px 5px",whiteSpace:"nowrap",
    boxShadow:"0 1px 4px rgba(0,0,0,0.55)",textShadow:"0 1px 2px rgba(0,0,0,0.7)"}}>#{rank}</span>);
};
function botPickColor(hand){const cnt={red:0,blue:0,green:0,yellow:0};hand.forEach(c=>{if(c.color!=="wild"&&cnt[c.color]!==undefined)cnt[c.color]++;});const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);return best[0][1]>0?best[0][0]:COLORS[Math.floor(Math.random()*4)];}
function botChooseCard(playable,hand,curColor,intel,nextOppHL){if(intel===0)return playable[Math.floor(Math.random()*playable.length)];const scored=playable.map(c=>{let s=0;if(c.type!=="wild")s+=3;if(c.value==="discardAll")s+=8;if(c.value==="draw2")s+=5;if(c.value==="skip"||c.value==="reverse")s+=4;if(c.value==="snatch")s+=2;if(c.color===curColor)s+=2;if(intel>=2&&nextOppHL<=2){if(c.value==="draw2"||c.value==="wild4")s+=10;if(c.value==="skip")s+=6;}if(c.value==="wild4")s-=2;return{card:c,s};});scored.sort((a,b)=>b.s-a.s);if(intel<=1&&scored.length>1&&Math.random()>0.6)return scored[Math.min(1,scored.length-1)].card;return scored[0].card;}
function gpid(){let i=localStorage.getItem("uno_pid");if(!i){i=gid();localStorage.setItem("uno_pid",i);}return i;}
/* Multi-account (up to 3 per device) */
function getAccounts(){try{const a=JSON.parse(localStorage.getItem("uno_accounts")||"[]");return Array.isArray(a)?a:[];}catch(e){return[];}}
function saveAccounts(a){localStorage.setItem("uno_accounts",JSON.stringify(a.slice(0,3)));}
function registerAccount(pid,name){const a=getAccounts();const ex=a.find(x=>x.pid===pid);if(ex){if(name)ex.name=name;}else if(a.length<3)a.push({pid,name:name||""});saveAccounts(a);}
function switchToAccount(pid,name){localStorage.setItem("uno_pid",pid);if(name!=null)localStorage.setItem("uno_name",name);window.location.reload();}
/* Unique player names — server-side reservation registry at names/{key} = pid */
function normName(n){return(n||"").trim().toLowerCase().replace(/\s+/g," ");}
function nameKey(n){return encodeURIComponent(normName(n)).replace(/\./g,"%2E");}
async function claimName(name,pid){
  const norm=normName(name);if(!norm)return{ok:false,msg:"Enter a name"};
  try{
    const snap=await get(ref(db,"names/"+nameKey(norm)));
    if(snap.exists()&&snap.val()!==pid){
      const holder=snap.val();
      const[holderLb,myLb]=await Promise.all([get(ref(db,"leaderboard/"+holder)),get(ref(db,"leaderboard/"+pid))]);
      const mineHasName=myLb.exists()&&normName((myLb.val()||{}).name)===norm; // my own account already carries this name
      const holderGone=!holderLb.exists();                                     // reservation is orphaned (holder has no account)
      if(!mineHasName&&!holderGone)return{ok:false,msg:"Name already taken"};
    }
    await set(ref(db,"names/"+nameKey(norm)),pid);
    const prev=localStorage.getItem("uno_cname");
    if(prev&&prev!==norm){try{await remove(ref(db,"names/"+nameKey(prev)));}catch(e){}}
    localStorage.setItem("uno_cname",norm);
    return{ok:true};
  }catch(e){return{ok:true};}
}
async function releaseName(name){try{if(normName(name))await remove(ref(db,"names/"+nameKey(name)));}catch(e){}}
function getTag(id){return"#"+id.slice(0,4).toUpperCase();}
function goFS(){try{const d=document.documentElement;(d.requestFullscreen||d.webkitRequestFullscreen||d.msRequestFullscreen)?.call(d);}catch(e){}}
function goLand(){try{screen.orientation?.lock?.("landscape").catch(()=>{});}catch(e){}}
/* Reactive orientation. Suppresses position transitions during a rotation so cards
   don't slide/stutter to their new layout when width/height swap. */
function useLandscape(){
  const[l,setL]=useState(()=>typeof window!=="undefined"&&window.innerWidth>window.innerHeight);
  useEffect(()=>{
    let t;const f=()=>{
      setL(window.innerWidth>window.innerHeight);
      const el=document.documentElement;el.classList.add("uno-rotating");
      clearTimeout(t);t=setTimeout(()=>el.classList.remove("uno-rotating"),450);
    };
    window.addEventListener("resize",f);window.addEventListener("orientationchange",f);
    return()=>{window.removeEventListener("resize",f);window.removeEventListener("orientationchange",f);clearTimeout(t);};
  },[]);
  return l;
}

const RANK_TIERS=[
  {name:"Bronze",min:0,starGap:100,color:"#CD7F32",bg:"linear-gradient(135deg,#CD7F32,#8B5A2B)",icon:"🥉",idx:0},
  {name:"Silver",min:500,starGap:200,color:"#C0C0C0",bg:"linear-gradient(135deg,#C0C0C0,#808080)",icon:"🥈",idx:1},
  {name:"Gold",min:1500,starGap:300,color:"#FFD700",bg:"linear-gradient(135deg,#FFD700,#DAA520)",icon:"🥇",idx:2},
  {name:"Platinum",min:3000,starGap:600,color:"#E5E4E2",bg:"linear-gradient(135deg,#E5E4E2,#A0C4FF,#E5E4E2)",icon:"💎",idx:3},
  {name:"Diamond",min:6000,starGap:800,color:"#B9F2FF",bg:"linear-gradient(135deg,#B9F2FF,#00BCD4,#E1F5FE)",icon:"💠",idx:4},
  {name:"Master",min:10000,starGap:1500,color:"#00E5FF",bg:"linear-gradient(135deg,#00E5FF,#0091EA,#00E5FF)",icon:"⚔️",idx:5},
  {name:"Grandmaster",min:15000,starGap:2000,color:"#FF6D00",bg:"linear-gradient(135deg,#FF6D00,#FFD700,#FF6D00)",icon:"👑",idx:6},
  {name:"Legend",min:22000,starGap:2500,color:"#B388FF",bg:"linear-gradient(135deg,#B388FF,#7C4DFF,#B388FF)",icon:"🏆",idx:7},
  {name:"Mythic",min:32000,starGap:3500,color:"#FF4EC7",bg:"linear-gradient(135deg,#FF4EC7,#C724B1,#FF4EC7)",icon:"🔮",idx:8},
  {name:"Monarch",min:45000,starGap:5000,color:"#FFE55C",bg:"linear-gradient(135deg,#FFD700,#FF6EC7,#7C4DFF,#00E5FF,#FFD700)",icon:"🐉",idx:9},
];
const UNRANKED={name:"Unranked",stars:0,color:"#666",bg:"linear-gradient(135deg,#444,#333)",icon:"—",idx:-1,starProgress:0};
function getRank(pts,games){
  pts=+pts||0;games=+games||0;
  if(games<10)return{...UNRANKED,totalStarPts:0};
  let tier=RANK_TIERS[0];for(const t of RANK_TIERS){if(pts>=t.min)tier=t;}
  const inTier=pts-tier.min;const stars=Math.min(5,Math.floor(inTier/tier.starGap)+1);
  const curStarBase=tier.min+(stars-1)*tier.starGap;const nextStarAt=tier.min+stars*tier.starGap;
  const starProgress=stars>=5?1:(pts-curStarBase)/(nextStarAt-curStarBase);
  return{...tier,stars,starProgress};}
function getNextRank(pts,games){
  pts=+pts||0;games=+games||0;
  if(games<10)return{type:"games",need:10-games,name:"Bronze"};
  const r=getRank(pts,games);
  if(r.stars<5){const nextStarAt=r.min+(r.stars)*r.starGap;return{type:"star",need:nextStarAt-pts,name:r.name,nextStar:r.stars+1};}
  const ni=r.idx+1;if(ni>=RANK_TIERS.length)return null;
  return{type:"rank",need:RANK_TIERS[ni].min-pts,name:RANK_TIERS[ni].name};}
function calcElo(winnerTier,loserTier,baseScore){
  const diff=loserTier-winnerTier;
  const winMult=Math.max(0.5,Math.min(2.5,1+diff*0.3));
  const losePct=Math.max(0.08,Math.min(0.5,0.2+diff*0.08));
  return{winPts:Math.round(baseScore*winMult),losePts:Math.max(5,Math.round(baseScore*losePct))};}

/* ═══ ACHIEVEMENTS ═══ */
const ACHIEVEMENTS=[
  {id:"first_win",icon:"🎉",name:"First Win",desc:"Win your first game"},
  {id:"wins_10",icon:"🔥",name:"On Fire",desc:"Win 10 games"},
  {id:"wins_50",icon:"⭐",name:"Star Player",desc:"Win 50 games"},
  {id:"wins_100",icon:"👑",name:"Centurion",desc:"Win 100 games"},
  {id:"games_10",icon:"🎮",name:"Rookie",desc:"Play 10 games"},
  {id:"games_100",icon:"🏅",name:"Veteran",desc:"Play 100 games"},
  {id:"silver",icon:"🥈",name:"Silver",desc:"Reach Silver tier"},
  {id:"gold",icon:"🥇",name:"Gold",desc:"Reach Gold tier"},
  {id:"diamond",icon:"💠",name:"Diamond",desc:"Reach Diamond tier"},
  {id:"gm",icon:"🌟",name:"Grandmaster",desc:"Reach Grandmaster"},
  {id:"sharp",icon:"📈",name:"Sharpshooter",desc:"60%+ win rate (20+ games)"},
];
function earnedAch(s){const g=s.gamesPlayed||0,w=s.wins||0,ri=getRank(s.totalPoints||0,g).idx,wr=g?w/g:0;
  return{first_win:w>=1,wins_10:w>=10,wins_50:w>=50,wins_100:w>=100,games_10:g>=10,games_100:g>=100,
    silver:ri>=1,gold:ri>=2,diamond:ri>=4,gm:ri>=6,sharp:g>=20&&wr>=0.6};}
function fmtSince(ts){if(!ts)return"—";return new Date(ts).toLocaleString("en-US",{month:"short",year:"numeric"});}
function fmtLast(ts){if(!ts)return"—";const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";
  const d=Math.floor(s/86400);if(d<30)return d+"d ago";const mo=Math.floor(d/30);if(mo<12)return mo+"mo ago";return Math.floor(mo/12)+"y ago";}

/* ═══ AVATARS (chibi SVG characters — states: idle / hit / celebrate / uno) ═══ */
const AVATARS=[
  {id:"rookie", name:"Rookie",  price:0,  ring:"#F5A623",skin:["#FFE0B2","#F0B27A"],hair:"spiky",  hairC:"#7B4B2A",eye:"round", eyeC:"#5B3A1E",outfit:"#4CAF50",outfit2:"#2E7D32",blush:"#FF8A65"},
  {id:"sunny",  name:"Sunny",   price:0,  ring:"#FFB300",skin:["#FFE0B2","#F0B27A"],hair:"bob",    hairC:"#FFC107",eye:"round", eyeC:"#8D6E00",outfit:"#FFEB3B",outfit2:"#FBC02D",blush:"#FF8A65",mood:"happy"},
  {id:"golem",  name:"Golem",   price:0,  ring:"#90A4AE",skin:["#B0BEC5","#607D8B"],hair:"rock",   hairC:"#546E7A",eye:"dot",   eyeC:"#1b2327",outfit:"#78909C",outfit2:"#455A64",rocky:true},
  {id:"ninja",  name:"Shadow",  price:100,ring:"#EF5350",skin:["#D7CCC8","#A1887F"],hair:"hood",   hairC:"#37474F",eye:"sharp", eyeC:"#EF5350",outfit:"#263238",outfit2:"#B71C1C",acc:"mask"},
  {id:"robo",   name:"Robo",    price:150,ring:"#26C6DA",skin:["#ECEFF1","#B0BEC5"],hair:"none",   hairC:"#B0BEC5",eye:"visor", eyeC:"#2CE0F0",outfit:"#90A4AE",outfit2:"#546E7A",acc:"antenna"},
  {id:"alien",  name:"Zorp",    price:200,ring:"#66BB6A",skin:["#C6FF6E","#7CB342"],hair:"none",   hairC:"#7CB342",eye:"alien", eyeC:"#B2FF59",outfit:"#43A047",outfit2:"#2E7D32",acc:"antennae"},
  {id:"kitty",  name:"Whiskers",price:250,ring:"#F48FB1",skin:["#FFF7FA","#F3D3DC"],hair:"cathair",hairC:"#FFFFFF",eye:"big",   eyeC:"#7E57C2",outfit:"#F06292",outfit2:"#EC407A",acc:"catears",earC:"#F06292",blush:"#F8BBD0",whisk:true},
  {id:"imp",    name:"Imp",     price:300,ring:"#E53935",skin:["#FF8A65","#E53935"],hair:"short",  hairC:"#4A0E0E",eye:"sharp", eyeC:"#FFEB3B",outfit:"#B71C1C",outfit2:"#7F0000",acc:"horns", mood:"smirk"},
  {id:"wizard", name:"Merlin",  price:400,ring:"#7E57C2",skin:["#FFE0B2","#E0A878"],hair:"none",   hairC:"#ECEFF1",eye:"round", eyeC:"#5E35B1",outfit:"#5E35B1",outfit2:"#4527A0",acc:"wizhat",beard:true},
  {id:"royal",  name:"Monarch", price:500,ring:"#FFD54F",skin:["#FFE0B2","#E0A878"],hair:"long",   hairC:"#3E2723",eye:"round", eyeC:"#4E342E",outfit:"#8E24AA",outfit2:"#FFD54F",acc:"crown", mood:"regal"},
  /* ── Chibi image avatars (art from CHARAT). Square PNGs in public/avatars/. ── */
  {id:"rex",     name:"Rex",     price:1000,ring:"#66BB6A",img:"dino.png"},
  {id:"kaito",   name:"Kaito",   price:1100,ring:"#5C6BC0",img:"kaito.png"},
  {id:"mina",    name:"Mina",    price:1200,ring:"#E6C88A",img:"mina.png"},
  {id:"sakura",  name:"Sakura",  price:1300,ring:"#F48FB1",img:"sakura.png"},
  {id:"yuki",    name:"Yuki",    price:1350,ring:"#8D6E63",img:"yuki.png"},
  {id:"celeste", name:"Celeste", price:1500,ring:"#29B6F6",img:"celeste.png"},
  {id:"riko",    name:"Riko",    price:1650,ring:"#FFB74D",img:"riko.png"},
  {id:"akane",   name:"Akane",   price:1800,ring:"#FB8C00",img:"akane.png"},
  {id:"ruby",    name:"Ruby",    price:1950,ring:"#EF5350",img:"ruby.png"},
  {id:"sylvie",  name:"Sylvie",  price:2100,ring:"#9CCC65",img:"sylvie.png"},
  {id:"kuro",    name:"Kuro",    price:2250,ring:"#78909C",img:"kuro.png"},
  {id:"raven",   name:"Raven",   price:2450,ring:"#7E57C2",img:"raven.png"},
  {id:"valkyrie",name:"Valkyrie",price:2650,ring:"#FF7043",img:"valkyrie.png"},
  {id:"okami",   name:"Okami",   price:2900,ring:"#455A64",img:"okami.png"},
];
const AV_MAP=Object.fromEntries(AVATARS.map(a=>[a.id,a]));
const avatarOf=id=>AV_MAP[id]||AVATARS[0];
const AV_FREE=AVATARS.filter(a=>a.price===0).map(a=>a.id);
const randAvatar=()=>AVATARS[Math.floor(Math.random()*AVATARS.length)].id;

/* ═══ THROWABLES (tap an opponent in-game to fling one) ═══
   Each item can carry a splat GIF + impact sound. Drop matching files into
   public/throwables/  (<id>.gif) and public/sfx/throw/  (<id>.mp3) and set
   gif:true / sfx:true below. Missing assets fall back to the emoji + synth
   splat automatically, so items work with or without art. */
const THROW_GIF_URL=import.meta.env.BASE_URL+"throwables/";
const THROW_SFX_URL=import.meta.env.BASE_URL+"sfx/throw/";
/* Custom image avatars: drop a square PNG in public/avatars/ and add an AVATARS
   entry with `img:"<file>.png"`. The image fills the circle and inherits every
   animation state (idle bob / hit shake+stars / celebrate bounce+sparkles / uno pulse). */
const AVATAR_IMG_URL=import.meta.env.BASE_URL+"avatars/";
/* Random cartoon game backgrounds (public/backgrounds/bg1..N.jpg). One is picked
   per room (hashed from the room code) so every player in a match sees the same. */
const GAME_BGS=["bg1.jpg","bg2.jpg","bg3.jpg"];
const bgForRoom=rc=>{if(!rc)return GAME_BGS[0];let h=0;for(let i=0;i<rc.length;i++)h=(h*31+rc.charCodeAt(i))>>>0;
  return GAME_BGS[h%GAME_BGS.length];};
const GAME_BG_URL=import.meta.env.BASE_URL+"backgrounds/";

/* Grace window (ms) a player gets to tap UNO after playing down to one card before
   the system auto-penalizes them. Opponents can catch them during this window too. */
const UNO_GRACE_MS=2000;

/* ── Country flags (players show up to 2 — dual citizens) ── */
const flagEmoji=cc=>(cc||"").toUpperCase().replace(/[A-Z]/g,c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65));
const COUNTRIES=[["PH","Philippines"],["US","United States"],["CA","Canada"],["GB","United Kingdom"],["AU","Australia"],
["JP","Japan"],["KR","South Korea"],["CN","China"],["IN","India"],["ID","Indonesia"],["MY","Malaysia"],["SG","Singapore"],
["TH","Thailand"],["VN","Vietnam"],["MX","Mexico"],["BR","Brazil"],["AR","Argentina"],["FR","France"],["DE","Germany"],
["ES","Spain"],["IT","Italy"],["PT","Portugal"],["NL","Netherlands"],["RU","Russia"],["UA","Ukraine"],["PL","Poland"],
["SE","Sweden"],["NO","Norway"],["FI","Finland"],["DK","Denmark"],["IE","Ireland"],["CH","Switzerland"],["AT","Austria"],
["BE","Belgium"],["GR","Greece"],["TR","Turkey"],["SA","Saudi Arabia"],["AE","UAE"],["IL","Israel"],["EG","Egypt"],
["ZA","South Africa"],["NG","Nigeria"],["KE","Kenya"],["NZ","New Zealand"],["CL","Chile"],["CO","Colombia"],["PE","Peru"],
["PK","Pakistan"],["BD","Bangladesh"],["LK","Sri Lanka"],["NP","Nepal"],["TW","Taiwan"],["HK","Hong Kong"],["CZ","Czechia"],
["HU","Hungary"],["RO","Romania"],["IS","Iceland"],["MA","Morocco"],["QA","Qatar"],["KW","Kuwait"]];

/* Turn a picked image file into a small square avatar data-URL (center-cropped,
   200px, JPEG) — small enough to store on the player's profile node. */
function fileToAvatarDataUrl(file,cb){
  const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{const S=200,c=document.createElement("canvas");c.width=S;c.height=S;
    const ctx=c.getContext("2d");const m=Math.min(img.width,img.height);
    ctx.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S,S);
    URL.revokeObjectURL(url);try{cb(c.toDataURL("image/jpeg",0.72));}catch(e){cb(null);}};
  img.onerror=()=>{URL.revokeObjectURL(url);cb(null);};
  img.src=url;
}
function getMyPhoto(){return localStorage.getItem("uno_photo")||"";}
function getMyFlags(){try{const a=JSON.parse(localStorage.getItem("uno_flags")||"[]");return Array.isArray(a)?a.slice(0,2):[];}catch(e){return[];}}

const THROWABLES=[
  {id:"tomato",name:"Tomato",     price:0,  emoji:"🍅",splat:"#E53935",label:"SPLAT!", gif:true, sfx:true, vol:1.0},
  {id:"egg",   name:"Egg",        price:0,  emoji:"🥚",splat:"#FFC107",label:"CRACK!", gif:true, sfx:true, vol:1.0},
  {id:"snow",  name:"Snowball",   price:60, emoji:"⚪",splat:"#81D4FA",label:"BRR!",   sfx:true, vol:1.0},
  {id:"pie",   name:"Cream Pie",  price:120,emoji:"🥧",splat:"#FFECB3",label:"SPLAT!", gif:true, sfx:true, vol:1.0},
  {id:"water", name:"Water Balloon",price:150,emoji:"💧",splat:"#4FC3F7",label:"SPLASH!",gif:true, sfx:true, vol:1.0},
  {id:"boot",  name:"Old Boot",   price:220,emoji:"🥾",splat:"#FFCA28",label:"BONK!",  sfx:true, vol:1.0},
  {id:"poop",  name:"Stinker",    price:300,emoji:"💩",splat:"#8D6E63",label:"EWW!",   gif:true, sfx:true, vol:1.0},
  {id:"bomb",  name:"Bomb",       price:450,emoji:"💣",splat:"#FF7043",label:"BOOM!",  gif:true, sfx:true, vol:1.0},
];
const THROW_MAP=Object.fromEntries(THROWABLES.map(t=>[t.id,t]));
const throwOf=id=>THROW_MAP[id]||THROWABLES[0];
const THROW_FREE=THROWABLES.filter(t=>t.price===0).map(t=>t.id);
const DEFAULT_OWNED=[...AV_FREE,...THROW_FREE];

/* Cosmetics persistence — coins/avatar/owned live on the account (leaderboard node)
   with a localStorage mirror for instant load. */
function getCoins(){return parseInt(localStorage.getItem("uno_coins")||"0",10)||0;}
function getMyAvatar(){return localStorage.getItem("uno_avatar")||"rookie";}
function getMyThrow(){return localStorage.getItem("uno_throw")||"tomato";}
function getOwned(){try{const a=JSON.parse(localStorage.getItem("uno_owned")||"[]");
  return[...new Set([...DEFAULT_OWNED,...(Array.isArray(a)?a:[])])];}catch(e){return[...DEFAULT_OWNED];}}

const Avatar=memo(({id,state="idle",size=44,anim=true,photo})=>{
  const a=avatarOf(id);
  const uid=useMemo(()=>Math.random().toString(36).slice(2,8),[]);
  const gid=n=>uid+n;
  /* ── custom image avatar OR the player's own uploaded photo (id==="photo") ── */
  const usePhoto=id==="photo"&&photo;
  if(a.img||usePhoto){
    const imgSrc=usePhoto?photo:AVATAR_IMG_URL+a.img;
    const ring=usePhoto?"#8AA0C0":a.ring;
    const wa=!anim?"none":
      state==="hit"?"avHit 0.26s ease-in-out infinite":
      state==="celebrate"?"avCele 0.6s ease-in-out infinite":
      state==="uno"?"avUno 0.5s ease-in-out infinite":
      "avBob 3.6s ease-in-out infinite";
    return(<svg width={size} height={size} viewBox="0 0 100 100" style={{display:"block",overflow:"visible"}}>
      <defs>
        <radialGradient id={gid("bg")} cx="50%" cy="34%" r="74%"><stop offset="0%" stopColor="#26324c"/><stop offset="100%" stopColor="#0d1420"/></radialGradient>
        <clipPath id={gid("cl")}><circle cx="50" cy="50" r="47"/></clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${gid("bg")})`}/>
      <g clipPath={`url(#${gid("cl")})`}>
        <g style={{transformBox:"view-box",transformOrigin:"50px 54px",animation:wa}}>
          <image href={imgSrc} x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid slice"/>
        </g>
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke={ring} strokeWidth="2.5" opacity="0.55"/>
      {state==="hit"&&anim&&<g style={{transformBox:"view-box",transformOrigin:"50px 14px",animation:"avDizzy 1.1s linear infinite"}}>
        {[0,120,240].map((d,i)=><g key={i} transform={`rotate(${d} 50 14)`}>
          <path d="M50 2 l1.5 3.2 3.4 0.4 -2.5 2.3 0.6 3.4 -3-1.7 -3 1.7 0.6-3.4 -2.5-2.3 3.4-0.4 Z" fill="#FFD54F"/></g>)}</g>}
      {state==="celebrate"&&anim&&[[14,20],[86,22],[18,60],[82,58]].map(([x,y],i)=>
        <path key={i} d={`M${x} ${y-5} l1.4 3 3 0.4 -2.2 2.1 0.6 3 -2.8-1.5 -2.8 1.5 0.6-3 -2.2-2.1 3-0.4 Z`}
          fill="#FFE082" style={{transformBox:"view-box",transformOrigin:`${x}px ${y}px`,animation:`avSpark 0.9s ease-in-out ${i*0.18}s infinite`}}/>)}
      {state==="uno"&&<circle cx="50" cy="50" r="46" fill="none" stroke={ring} strokeWidth="3" opacity="0.9" style={{filter:`drop-shadow(0 0 5px ${ring})`}}/>}
    </svg>);
  }
  const[sk1,sk2]=a.skin;
  const oc=a.outfit,oc2=a.outfit2||a.outfit;
  const ey=43,eL=41,eR=59;            // big chibi eyes, set low on the face
  const skStroke="rgba(0,0,0,0.16)";
  const armUp=state==="celebrate";
  const wrapAnim=!anim?"none":
    state==="hit"?"avHit 0.26s ease-in-out infinite":
    state==="celebrate"?"avCele 0.6s ease-in-out infinite":
    state==="uno"?"avUno 0.5s ease-in-out infinite":
    "avBob 3.6s ease-in-out infinite";
  /* ── eyes ── */
  const eyes=(()=>{
    if(state==="hit")return[eL,eR].map((x,i)=>(
      <g key={i} stroke="#3A2A1A" strokeWidth="3" strokeLinecap="round">
        <line x1={x-4.5} y1={ey-4.5} x2={x+4.5} y2={ey+4.5}/><line x1={x+4.5} y1={ey-4.5} x2={x-4.5} y2={ey+4.5}/></g>));
    if(state==="celebrate")return[eL,eR].map((x,i)=>(
      <path key={i} d={`M${x-5} ${ey+3} Q${x} ${ey-6} ${x+5} ${ey+3}`} fill="none" stroke="#3A2A1A" strokeWidth="3.2" strokeLinecap="round"/>));
    const big=state==="uno";
    if(a.eye==="visor")return(<g>
      <rect x="33" y={ey-6} width="34" height="12" rx="6" fill="#0d1b1e" stroke="#78909C" strokeWidth="1.2"/>
      <rect x="36" y={ey-1.4} width="28" height="2.8" rx="1.4" fill={a.eyeC}/>
      <circle cx={eL} cy={ey} r="1.8" fill={a.eyeC}/><circle cx={eR} cy={ey} r="1.8" fill={a.eyeC}/></g>);
    if(a.eye==="alien")return[eL,eR].map((x,i)=>(
      <g key={i} transform={`rotate(${i?20:-20} ${x} ${ey})`}>
        <ellipse cx={x} cy={ey} rx="5" ry={big?9.5:8.4} fill="#0b0f0b"/>
        <circle cx={x-1.4} cy={ey-3} r="2" fill={a.eyeC}/></g>));
    if(a.eye==="dot")return[eL,eR].map((x,i)=>(
      <g key={i}><circle cx={x} cy={ey} r={big?4.4:3.6} fill={a.eyeC}/><circle cx={x-1.1} cy={ey-1.2} r="1" fill="#fff" opacity="0.7"/></g>));
    if(a.eye==="sharp")return[eL,eR].map((x,i)=>(
      <g key={i}><path d={`M${x-6} ${ey-1.5} Q${x} ${ey-6} ${x+6} ${ey} Q${x} ${ey+5} ${x-6} ${ey-1.5} Z`} fill="#fff"/>
        <ellipse cx={x} cy={ey} rx="3.6" ry="5.2" fill={a.eyeC}/>
        <circle cx={x} cy={ey+0.8} r="1.8" fill="#141414"/><circle cx={x-1.2} cy={ey-2} r="1.1" fill="#fff"/></g>));
    const R=a.eye==="big"?{rx:6.6,ry:big?9.4:8.6,ir:5.4,pu:2.6}:{rx:5.6,ry:big?8.2:7.4,ir:4.4,pu:2.4};
    return[eL,eR].map((x,i)=>(
      <g key={i}><ellipse cx={x} cy={ey} rx={R.rx} ry={R.ry} fill="#fff"/>
        <ellipse cx={x} cy={ey+0.6} rx={R.ir} ry={R.ry-1.2} fill={a.eyeC}/>
        <circle cx={x} cy={ey+1.4} r={R.pu} fill="#161616"/>
        <circle cx={x-1.6} cy={ey-2.4} r={a.eye==="big"?2.2:1.8} fill="#fff"/>
        <circle cx={x+1.4} cy={ey+3} r="0.9" fill="#fff" opacity="0.7"/></g>));
  })();
  /* ── mouth ── */
  const my=53;
  const mouth=(()=>{
    if(a.acc==="mask")return null;
    if(state==="hit")return<path d={`M45 ${my+2} Q47.5 ${my-1} 50 ${my+2} Q52.5 ${my+5} 55 ${my+2}`} fill="none" stroke="#7A3B2E" strokeWidth="2.4" strokeLinecap="round"/>;
    if(state==="celebrate")return(<g><path d={`M43 ${my-1} Q50 ${my+9} 57 ${my-1} Q50 ${my+3} 43 ${my-1} Z`} fill="#5A2A22"/>
      <path d={`M47 ${my+4} Q50 ${my+7} 53 ${my+4} Q50 ${my+5} 47 ${my+4} Z`} fill="#FF6B6B"/></g>);
    if(state==="uno")return<ellipse cx="50" cy={my+2} rx="5.5" ry="7" fill="#5A2A22"/>;
    if(a.mood==="happy")return(<path d={`M44 ${my} Q50 ${my+7} 56 ${my} Q50 ${my+4} 44 ${my} Z`} fill="#7A3B2E"/>);
    if(a.mood==="smirk")return<path d={`M44 ${my} Q52 ${my+5} 58 ${my-1}`} fill="none" stroke="#7A3B2E" strokeWidth="2.6" strokeLinecap="round"/>;
    if(a.mood==="regal")return<path d={`M46 ${my} Q50 ${my+2} 54 ${my}`} fill="none" stroke="#7A3B2E" strokeWidth="2.6" strokeLinecap="round"/>;
    return<path d={`M45 ${my} Q50 ${my+5} 55 ${my}`} fill="none" stroke="#7A3B2E" strokeWidth="2.6" strokeLinecap="round"/>;
  })();
  /* ── hair behind the head ── */
  const hairBack=(()=>{
    if(a.hair==="long")return(<g fill={a.hairC} stroke="rgba(0,0,0,0.12)" strokeWidth="0.6">
      <path d="M27 30 Q20 66 28 88 L37 86 Q31 56 33 34 Z"/><path d="M73 30 Q80 66 72 88 L63 86 Q69 56 67 34 Z"/></g>);
    if(a.hair==="bob")return(<g fill={a.hairC}>
      <path d="M26 32 Q24 54 33 60 L36 38 Z"/><path d="M74 32 Q76 54 67 60 L64 38 Z"/></g>);
    if(a.hair==="cathair")return<ellipse cx="50" cy="30" rx="25" ry="17" fill={a.hairC}/>;
    return null;
  })();
  /* ── hair / hood over the forehead ── */
  const hairFront=(()=>{
    switch(a.hair){
      case"spiky":return<path d="M29 30 L34 17 L41 28 L47 16 L53 28 L59 17 L65 28 L71 30 Q50 23 29 30 Z" fill={a.hairC} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6"/>;
      case"short":return<path d="M28 31 Q50 13 72 31 Q65 22 50 22 Q35 22 28 31 Z" fill={a.hairC} stroke="rgba(0,0,0,0.15)" strokeWidth="0.6"/>;
      case"bob":return(<g fill={a.hairC} stroke="rgba(0,0,0,0.12)" strokeWidth="0.6">
        <path d="M28 31 Q29 15 50 14 Q71 15 72 31 Q64 21 50 21 Q36 21 28 31 Z"/>
        <path d="M28 30 Q26 44 30 50 L34 30 Z"/><path d="M72 30 Q74 44 70 50 L66 30 Z"/></g>);
      case"long":return<path d="M50 14 Q29 16 27 34 Q33 23 44 22 L50 18 L56 22 Q67 23 73 34 Q71 16 50 14 Z" fill={a.hairC} stroke="rgba(0,0,0,0.15)" strokeWidth="0.6"/>;
      case"rock":return<path d="M26 32 L32 16 L40 27 L46 14 L52 27 L58 15 L64 27 L74 32 Q50 24 26 32 Z" fill={a.hairC} stroke="#37474F" strokeWidth="1" strokeLinejoin="round"/>;
      case"cathair":return<path d="M30 30 Q32 16 50 15 Q68 16 70 30 Q60 22 50 22 Q40 22 30 30 Z" fill={a.hairC} stroke="rgba(0,0,0,0.08)" strokeWidth="0.6"/>;
      case"hood":return<path d="M23 42 Q20 12 50 9 Q80 12 77 42 Q69 25 50 25 Q31 25 23 42 Z" fill={a.outfit} stroke={a.outfit2} strokeWidth="1.2"/>;
      default:return null;
    }
  })();
  /* ── headgear / accessory on top ── */
  const acc=(()=>{
    switch(a.acc){
      case"crown":return(<g><path d="M32 22 L36 8 L44 18 L50 3 L56 18 L64 8 L68 22 Z" fill={`url(#${gid("cr")})`} stroke="#B8860B" strokeWidth="1" strokeLinejoin="round"/>
        <rect x="32" y="20" width="36" height="5" rx="2" fill={`url(#${gid("cr")})`} stroke="#B8860B" strokeWidth="0.8"/>
        <circle cx="50" cy="4" r="2.4" fill="#FF4D6D"/><circle cx="36" cy="9" r="1.8" fill="#7EC8E3"/><circle cx="64" cy="9" r="1.8" fill="#7EC8E3"/></g>);
      case"wizhat":return(<g><path d="M50 -8 Q56 12 66 30 Q50 23 34 30 Q44 12 50 -8 Z" fill={a.outfit} stroke={a.outfit2} strokeWidth="1.2" strokeLinejoin="round"/>
        <path d="M24 30 Q50 20 76 30 Q50 40 24 30 Z" fill={a.outfit2}/>
        <path d="M50 6 l2 4.2 4.4 0.5 -3.2 3 0.8 4.4 -4-2.2 -4 2.2 0.8-4.4 -3.2-3 4.4-0.5 Z" fill="#FFD54F"/></g>);
      case"antenna":return(<g><rect x="48.5" y="6" width="3" height="12" rx="1.5" fill="#6B7C86"/>
        <circle cx="50" cy="5" r="4" fill="#FF5252"/><circle cx="48.5" cy="3.6" r="1.3" fill="#fff" opacity="0.8"/></g>);
      case"antennae":return(<g stroke={a.outfit2} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M42 24 Q36 12 32 5"/><path d="M58 24 Q64 12 68 5"/>
        <circle cx="32" cy="4" r="3.6" fill={a.eyeC} stroke="none"/><circle cx="68" cy="4" r="3.6" fill={a.eyeC} stroke="none"/></g>);
      case"horns":return(<g fill="#7F0000" stroke="#4A0000" strokeWidth="0.8">
        <path d="M34 24 Q27 10 35 5 Q35 17 42 23 Z"/><path d="M66 24 Q73 10 65 5 Q65 17 58 23 Z"/></g>);
      case"catears":return(<g stroke="rgba(0,0,0,0.12)" strokeWidth="0.8">
        <path d="M31 26 L27 6 L47 20 Z" fill={a.hairC}/><path d="M33 23 L31 11 L43 20 Z" fill={a.earC||"#F06292"} stroke="none"/>
        <path d="M69 26 L73 6 L53 20 Z" fill={a.hairC}/><path d="M67 23 L69 11 L57 20 Z" fill={a.earC||"#F06292"} stroke="none"/></g>);
      default:return null;
    }
  })();
  /* ── body: outfit + arms + legs ── */
  const body=(<g>
    {/* legs + shoes */}
    <g fill={sk2}><rect x="43" y="83" width="5.5" height="9" rx="2.6"/><rect x="51.5" y="83" width="5.5" height="9" rx="2.6"/></g>
    <g fill="#2b2b33"><ellipse cx="45.7" cy="92" rx="4" ry="2.3"/><ellipse cx="54.3" cy="92" rx="4" ry="2.3"/></g>
    {/* torso */}
    <path d="M35 63 Q50 59 65 63 L69 85 Q50 90 31 85 Z" fill={oc} stroke="rgba(0,0,0,0.14)" strokeWidth="1"/>
    <path d="M40 62 Q50 69 60 62 L57 71 Q50 75 43 71 Z" fill={oc2}/>
    {a.beard&&<path d="M34 55 Q36 84 50 88 Q64 84 66 55 Q50 66 34 55 Z" fill="#ECEFF1" stroke="#B0BEC5" strokeWidth="0.8"/>}
    {/* arms */}
    {armUp?(<g>
      <g transform="rotate(-38 33 64)"><rect x="25" y="49" width="8" height="17" rx="4" fill={oc}/><circle cx="29" cy="47" r="4.4" fill={sk1}/></g>
      <g transform="rotate(38 67 64)"><rect x="67" y="49" width="8" height="17" rx="4" fill={oc}/><circle cx="71" cy="47" r="4.4" fill={sk1}/></g></g>
    ):(<g>
      <g><rect x="27" y="64" width="8" height="15" rx="4" fill={oc}/><circle cx="31" cy="80" r="4.2" fill={sk1}/></g>
      <g><rect x="65" y="64" width="8" height="15" rx="4" fill={oc}/><circle cx="69" cy="80" r="4.2" fill={sk1}/></g></g>)}
  </g>);
  return(<svg width={size} height={size} viewBox="0 0 100 100" style={{display:"block",overflow:"visible"}}>
    <defs>
      <linearGradient id={gid("s")} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sk1}/><stop offset="100%" stopColor={sk2}/></linearGradient>
      <radialGradient id={gid("bg")} cx="50%" cy="34%" r="74%"><stop offset="0%" stopColor="#26324c"/><stop offset="100%" stopColor="#0d1420"/></radialGradient>
      <linearGradient id={gid("cr")} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFF6B0"/><stop offset="55%" stopColor="#FFCF2E"/><stop offset="100%" stopColor="#B8860B"/></linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill={`url(#${gid("bg")})`}/>
    <circle cx="50" cy="50" r="47" fill="none" stroke={a.ring} strokeWidth="2.5" opacity="0.55"/>
    <clipPath id={gid("cl")}><circle cx="50" cy="50" r="47"/></clipPath>
    <g clipPath={`url(#${gid("cl")})`}>
    <g style={{transformBox:"view-box",transformOrigin:"50px 90px",animation:wrapAnim}}>
      {hairBack}
      {body}
      {/* neck */}
      <rect x="46.5" y="55" width="7" height="8" rx="3" fill={sk2}/>
      {/* head */}
      <ellipse cx="50" cy="38" rx="23" ry="22" fill={`url(#${gid("s")})`} stroke={skStroke} strokeWidth="1.2"/>
      {a.rocky&&<g stroke="#4A5B64" strokeWidth="1" fill="none" opacity="0.6"><path d="M40 24 L44 30 L41 34"/><path d="M62 30 L58 35"/></g>}
      {hairFront}
      {a.blush&&<g fill={a.blush} opacity="0.5"><ellipse cx="34" cy="48" rx="5" ry="3.2"/><ellipse cx="66" cy="48" rx="5" ry="3.2"/></g>}
      {state==="idle"?<g style={{transformBox:"view-box",transformOrigin:"50px 43px",animation:anim?"avBlink 4.2s ease-in-out infinite":"none"}}>{eyes}</g>:eyes}
      {a.eye!=="visor"&&a.eye!=="alien"&&state!=="hit"&&state!=="celebrate"&&<ellipse cx="50" cy="49.5" rx="1.5" ry="1" fill="rgba(0,0,0,0.16)"/>}
      {mouth}
      {a.acc==="mask"&&<path d="M27 46 Q50 42 73 46 L72 60 Q50 67 28 60 Z" fill={oc} stroke={oc2} strokeWidth="1"/>}
      {a.whisk&&<g stroke="#C39BA6" strokeWidth="1.2" strokeLinecap="round">
        <path d="M32 49 L18 46"/><path d="M32 52 L18 53"/><path d="M68 49 L82 46"/><path d="M68 52 L82 53"/></g>}
      {acc}
    </g>
    </g>
    {state==="hit"&&anim&&<g style={{transformBox:"view-box",transformOrigin:"50px 14px",animation:"avDizzy 1.1s linear infinite"}}>
      {[0,120,240].map((d,i)=><g key={i} transform={`rotate(${d} 50 14)`}>
        <path d="M50 2 l1.5 3.2 3.4 0.4 -2.5 2.3 0.6 3.4 -3-1.7 -3 1.7 0.6-3.4 -2.5-2.3 3.4-0.4 Z" fill="#FFD54F"/></g>)}</g>}
    {state==="celebrate"&&anim&&[[14,20],[86,22],[18,60],[82,58]].map(([x,y],i)=>
      <path key={i} d={`M${x} ${y-5} l1.4 3 3 0.4 -2.2 2.1 0.6 3 -2.8-1.5 -2.8 1.5 0.6-3 -2.2-2.1 3-0.4 Z`}
        fill="#FFE082" style={{transformBox:"view-box",transformOrigin:`${x}px ${y}px`,animation:`avSpark 0.9s ease-in-out ${i*0.18}s infinite`}}/>)}
  </svg>);
});

/* ═══ STORE ═══ */
const STORE_CATS=[
  {id:"avatar",name:"Avatars",icon:"🧑",subs:null},
  {id:"throw",name:"Throwables",icon:"🍅",subs:null},
];

/* ── Procedural splat art (viewBox 0 0 120 120). Each throwable gets its own
   themed impact so items without a hand-made GIF still land with a juicy splat.
   A blobby splatter silhouette + a spiky impact star are shared building blocks. */
const SPLAT_BLOB="M60 12 C74 24 94 18 99 35 C116 41 111 67 97 75 C106 96 82 104 69 95 C61 116 42 111 39 95 C19 103 9 81 23 71 C6 61 14 38 32 36 C33 18 48 22 60 12 Z";
const SPLAT_STAR="M60 6 L68 38 L92 24 L80 52 L114 52 L84 64 L106 92 L74 78 L60 114 L46 78 L14 92 L36 64 L6 52 L40 52 L28 24 L52 38 Z";
const ctr=s=>`translate(60 60) scale(${s}) translate(-60 -60)`;   // scale about center
const splatArt=(item)=>{
  const c=item.splat;
  switch(item.id){
    case"egg":return(<>
      <ellipse cx="60" cy="62" rx="52" ry="46" fill="#FFF3C4" opacity="0.5"/>
      <path d={SPLAT_BLOB} fill="#FFFDF3"/>
      <circle cx="60" cy="60" r="21" fill="#FFC107"/>
      <ellipse cx="53" cy="53" rx="7" ry="4.2" fill="#FFE082"/>
      <path d="M18 42 l11 -7 3 11 z" fill="#FFFEFC" stroke="#E4DBC8" strokeWidth="1"/>
      <path d="M99 46 l-11 -5 -1 11 z" fill="#FFFEFC" stroke="#E4DBC8" strokeWidth="1"/>
      {[[24,88,5],[92,86,5],[60,101,4]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill="#FFE082"/>)}
    </>);
    case"snow":return(<>
      <ellipse cx="60" cy="62" rx="52" ry="46" fill="#B3E5FC" opacity="0.4"/>
      <path d={SPLAT_BLOB} fill="#FFFFFF"/>
      <path d={SPLAT_BLOB} fill="#E1F5FE" opacity="0.55" transform={ctr(0.64)}/>
      {[[60,60,10,0],[30,36,7,0.2],[92,40,7,0.4],[34,86,6,0.1],[88,84,6,0.3]].map(([x,y,s,d],i)=>(
        <g key={i} stroke="#4FC3F7" strokeWidth="2.4" strokeLinecap="round" style={{animation:`twk 1s ${d}s ease-in-out infinite`}}>
          <line x1={x-s} y1={y} x2={x+s} y2={y}/><line x1={x} y1={y-s} x2={x} y2={y+s}/>
          <line x1={x-s*0.7} y1={y-s*0.7} x2={x+s*0.7} y2={y+s*0.7}/><line x1={x-s*0.7} y1={y+s*0.7} x2={x+s*0.7} y2={y-s*0.7}/>
        </g>))}
      {[[18,64],[104,64],[60,105]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.6" fill="#81D4FA" style={{animation:`twk 1s ${i*0.25}s infinite`}}/>)}
    </>);
    case"pie":return(<>
      <ellipse cx="60" cy="62" rx="52" ry="46" fill="#FFE0B2" opacity="0.45"/>
      <path d={SPLAT_BLOB} fill="#FFF8E1"/>
      <circle cx="44" cy="50" r="12" fill="#FFFDE7"/><circle cx="76" cy="46" r="10" fill="#FFFDE7"/>
      <circle cx="62" cy="64" r="14" fill="#FFF9C4"/>
      <circle cx="60" cy="50" r="5.5" fill="#E53935"/>
      <path d="M22 82 Q60 106 98 82" fill="none" stroke="#C69C6D" strokeWidth="8" strokeLinecap="round"/>
      <path d="M27 86 Q60 103 93 86" fill="none" stroke="#A9794C" strokeWidth="4" strokeLinecap="round"/>
      {[[20,54,5],[100,52,5],[60,101,5]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill="#FFFDE7"/>)}
    </>);
    case"water":return(<>
      <ellipse cx="60" cy="74" rx="48" ry="20" fill="#4FC3F7" opacity="0.3"/>
      <path d="M28 80 Q33 48 44 66 Q49 38 58 62 Q64 34 72 60 Q79 44 86 66 Q92 50 93 80 Q60 94 28 80 Z" fill="#4FC3F7"/>
      <path d="M28 80 Q60 92 93 80 Q60 86 28 80 Z" fill="#29B6F6"/>
      <ellipse cx="60" cy="86" rx="42" ry="9" fill="none" stroke="#81D4FA" strokeWidth="3" opacity="0.7"/>
      <ellipse cx="48" cy="60" rx="6" ry="4" fill="#E1F5FE" opacity="0.7"/>
      {[[30,30,0],[60,18,0.15],[90,32,0.3]].map(([x,y,d],i)=>(
        <path key={i} d={`M${x} ${y-9} q5 7 0 12 q-5 -5 0 -12 z`} fill="#29B6F6" style={{animation:`twk 0.9s ${d}s infinite`}}/>))}
    </>);
    case"boot":return(<>
      <ellipse cx="60" cy="62" rx="50" ry="44" fill="#FFCA28" opacity="0.3"/>
      <path d={SPLAT_STAR} fill="#FFCA28" stroke="#8D6E63" strokeWidth="3" strokeLinejoin="round"/>
      <path d={SPLAT_STAR} fill="#FFE082" transform={ctr(0.6)}/>
      <circle cx="26" cy="60" r="12" fill="#BCAAA4" opacity="0.5" style={{transformBox:"fill-box",transformOrigin:"center",animation:"smokePuff 1s ease-out forwards"}}/>
      <circle cx="94" cy="62" r="12" fill="#BCAAA4" opacity="0.5" style={{transformBox:"fill-box",transformOrigin:"center",animation:"smokePuff 1s 0.1s ease-out forwards"}}/>
      {[[14,26],[104,22],[100,98],[20,100]].map(([x,y],i)=>(
        <path key={i} d={`M${x} ${y-6} l1.6 3.4 3.8 .4 -2.8 2.6 .8 3.8 -3.4 -1.9 -3.4 1.9 .8 -3.8 -2.8 -2.6 3.8 -.4 z`} fill="#FFF59D" style={{animation:`twk 0.8s ${i*0.15}s infinite`}}/>))}
    </>);
    case"poop":return(<>
      <ellipse cx="60" cy="64" rx="50" ry="42" fill="#795548" opacity="0.35"/>
      <path d={SPLAT_BLOB} fill="#6D4C41"/>
      <ellipse cx="48" cy="50" rx="12" ry="7" fill="#8D6E63" opacity="0.7"/>
      {[[42,0],[60,0.2],[78,0.4]].map(([x,d],i)=>(
        <path key={i} d={`M${x} 46 q-7 -7 0 -14 q7 -7 0 -14`} fill="none" stroke="#AED581" strokeWidth="3" strokeLinecap="round"
          style={{transformBox:"view-box",animation:`stinkRise 1.3s ${d}s ease-out infinite`}}/>))}
      {[[30,42,0],[92,54,0.3]].map(([x,y,d],i)=>(
        <g key={i} style={{transformBox:"view-box",animation:`twk 0.5s ${d}s infinite`}}>
          <circle cx={x} cy={y} r="3" fill="#212121"/>
          <ellipse cx={x-4} cy={y-3} rx="3" ry="1.6" fill="#CFD8DC" opacity="0.8"/>
          <ellipse cx={x+4} cy={y-3} rx="3" ry="1.6" fill="#CFD8DC" opacity="0.8"/>
        </g>))}
    </>);
    case"bomb":return(<>
      <circle cx="30" cy="52" r="15" fill="#9E9E9E" opacity="0.5" style={{transformBox:"fill-box",transformOrigin:"center",animation:"smokePuff 1.1s ease-out forwards"}}/>
      <circle cx="92" cy="56" r="17" fill="#757575" opacity="0.5" style={{transformBox:"fill-box",transformOrigin:"center",animation:"smokePuff 1.1s 0.08s ease-out forwards"}}/>
      <circle cx="60" cy="88" r="15" fill="#BDBDBD" opacity="0.45" style={{transformBox:"fill-box",transformOrigin:"center",animation:"smokePuff 1.1s 0.16s ease-out forwards"}}/>
      <path d={SPLAT_STAR} fill="#E53935"/>
      <path d={SPLAT_STAR} fill="#FB8C00" transform={ctr(0.74)}/>
      <path d={SPLAT_STAR} fill="#FFEE58" transform={ctr(0.46)}/>
      <circle cx="60" cy="60" r="9" fill="#FFF9C4"/>
      {[[16,20],[104,18],[108,100],[14,98]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3.5" fill="#FFCA28" style={{animation:`twk 0.6s ${i*0.1}s infinite`}}/>)}
    </>);
    default:return(<>
      <ellipse cx="60" cy="62" rx="52" ry="46" fill={c} opacity="0.28"/>
      <path d={SPLAT_BLOB} fill={c}/>
      <ellipse cx="46" cy="44" rx="13" ry="8" fill="#fff" opacity="0.22"/>
      {[[16,32,5],[102,28,4],[106,84,6],[22,94,5],[58,7,4],[98,60,5]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill={c}/>)}
    </>);
  }
};
/* Impact overlay: a hand-made GIF (public/throwables/<id>.gif) if the item declares
   one, otherwise the procedural splat above. A GIF that fails to load falls back to
   the art and is cached so we never flash a broken image twice. */
const throwGifCache={};
const ThrowSplat=({item})=>{
  const[mode,setMode]=useState(item.gif&&throwGifCache[item.id]!==false?"gif":"art");
  const label=<span style={{position:"relative",marginTop:-6,fontSize:12,fontWeight:900,color:item.splat,letterSpacing:1,
    textShadow:`0 1px 4px #000,0 0 10px ${item.splat}`}}>{item.label}</span>;
  // GIF items: the gif IS the whole effect — no procedural halo/label on top of it.
  if(mode==="gif")return(
    <img src={THROW_GIF_URL+item.id+".gif"} alt="" onError={()=>{throwGifCache[item.id]=false;setMode("art");}}
      style={{width:140,height:140,objectFit:"contain",position:"relative",filter:"drop-shadow(0 3px 8px rgba(0,0,0,0.6))"}}/>);
  return(<>
    <svg width="86" height="86" viewBox="0 0 120 120" style={{position:"relative",overflow:"visible",filter:"drop-shadow(0 3px 7px rgba(0,0,0,0.4))"}}>{splatArt(item)}</svg>
    {label}
  </>);
};
const StoreModal=({onClose,coins,owned,myAvatar,myThrow,onBuy,onEquipAvatar,onEquipThrow,isAdm,myPhoto,onPhoto})=>{
  const[catId,setCatId]=useState("avatar");
  const[preview,setPreview]=useState("celebrate");
  const[msg,setMsg]=useState("");
  const[detail,setDetail]=useState(null);   // avatar opened for preview/buy
  const fileRef=useRef(null);
  const onFile=e=>{const f=e.target.files?.[0];if(f)fileToAvatarDataUrl(f,url=>{if(url){onPhoto(url);flash("Photo set — you're using it now!");}else flash("Couldn't read that image.");});if(e.target)e.target.value="";};
  const landscape=useLandscape();
  const cols=landscape?5:3;
  const items=catId==="avatar"?AVATARS:THROWABLES;
  const tabS=on=>({flex:1,padding:"9px 4px",borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:800,letterSpacing:1,
    background:on?"linear-gradient(135deg,#FFD700,#DAA520)":"rgba(255,255,255,0.05)",color:on?"#1a1200":"#99a",transition:"all 0.2s"});
  const flash=m=>{setMsg(m);setTimeout(()=>setMsg(""),1600);};
  const handleTile=(it)=>{
    // Avatars open a preview card first (check it out, then buy/equip or close).
    if(catId==="avatar"){setPreview("celebrate");setDetail(it);return;}
    const own=owned.includes(it.id);
    if(own){onEquipThrow(it.id);flash(it.name+" selected!");return;}
    if(!isAdm&&coins<it.price){flash("Not enough coins — win games to earn more!");return;}
    onBuy(it);flash("Unlocked "+it.name+"!");
  };
  const equippedId=catId==="avatar"?myAvatar:myThrow;
  const storeBg=GAME_BG_URL+GAME_BGS[1];
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(3,6,12,0.55)",zIndex:300,
    display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",animation:"fadeIn 0.2s ease-out",
    padding:"calc(12px + env(safe-area-inset-top,0px)) 12px calc(12px + env(safe-area-inset-bottom,0px))"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:landscape?"96vw":420,height:landscape?"94vh":"90vh",maxHeight:"100%",display:"flex",flexDirection:"column",
      background:`linear-gradient(160deg,rgba(24,33,54,0.9),rgba(9,14,28,0.95)),url(${storeBg})`,backgroundSize:"cover",backgroundPosition:"center",
      borderRadius:18,padding:16,position:"relative",
      border:"1px solid rgba(255,215,0,0.2)",boxShadow:"0 20px 60px rgba(0,0,0,0.7)"}}>
      <button onClick={onClose} style={{position:"absolute",top:6,right:6,width:40,height:40,zIndex:5,background:"none",border:"none",color:"#889",fontSize:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,paddingRight:36}}>
        <div style={{fontSize:18,fontWeight:900,color:"#FFD700",letterSpacing:4}}>🛒 STORE</div>
        <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",
          borderRadius:20,padding:"4px 12px"}}>
          <span style={{fontSize:14}}>🪙</span>
          <span style={{fontSize:14,fontWeight:900,color:"#FFD700",fontFamily:"monospace"}}>{coins}</span></div>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {STORE_CATS.map(c=><button key={c.id} onClick={()=>setCatId(c.id)} style={tabS(c.id===catId)}>{c.icon} {c.name}</button>)}
      </div>
      {/* Preview of equipped avatar */}
      {catId==="avatar"&&<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,padding:"10px 12px",
        background:"rgba(255,255,255,0.03)",borderRadius:14,border:"1px solid rgba(255,255,255,0.06)"}}>
        <Avatar id={myAvatar} state={preview} size={64} photo={myPhoto}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,color:"#889",letterSpacing:2,marginBottom:2}}>EQUIPPED</div>
          <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>{myAvatar==="photo"?"Your Photo":avatarOf(myAvatar).name}</div>
          <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
            {[["idle","Idle"],["celebrate","Win"],["hit","Hit"],["uno","UNO"]].map(([s,l])=>
              <button key={s} onClick={()=>setPreview(s)} style={{padding:"3px 9px",borderRadius:7,border:"none",cursor:"pointer",fontSize:8,fontWeight:800,letterSpacing:1,
                background:preview===s?"rgba(255,215,0,0.25)":"rgba(255,255,255,0.05)",color:preview===s?"#FFD700":"#889"}}>{l}</button>)}
          </div>
        </div>
      </div>}
      {msg&&<div style={{textAlign:"center",fontSize:10,fontWeight:800,color:/not enough/i.test(msg)?"#FF9800":"#4CAF50",
        marginBottom:8,padding:"5px 10px",borderRadius:8,background:/not enough/i.test(msg)?"rgba(255,152,0,0.1)":"rgba(76,175,80,0.1)"}}>{msg}</div>}
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{display:"none"}}/>
      <div style={{flex:1,overflowY:"auto",display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gridAutoRows:landscape?150:164,gap:8,alignContent:"start"}}>
        {/* Your own photo — free custom avatar */}
        {catId==="avatar"&&(()=>{const has=!!myPhoto;const eq=myAvatar==="photo";
          return(<div onClick={()=>{if(has)setDetail({id:"photo",name:"Your Photo",_photo:true});else fileRef.current&&fileRef.current.click();}}
            style={{borderRadius:12,cursor:"pointer",position:"relative",
              background:eq?"rgba(255,215,0,0.12)":"rgba(255,255,255,0.03)",
              border:eq?"2px solid #FFD700":"1px dashed rgba(126,200,227,0.4)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:4,overflow:"hidden"}}>
            {has?<Avatar id="photo" photo={myPhoto} state={eq?"celebrate":"idle"} size={landscape?52:58} anim={eq}/>
              :<div style={{width:landscape?52:58,height:landscape?52:58,borderRadius:"50%",background:"rgba(126,200,227,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>📷</div>}
            <span style={{fontSize:9,fontWeight:800,color:"#cfe",whiteSpace:"nowrap"}}>Your Photo</span>
            {eq?<span style={{fontSize:7,fontWeight:900,color:"#1a1200",background:"#FFD700",borderRadius:5,padding:"1px 6px",letterSpacing:1}}>EQUIPPED</span>
              :has?<span style={{fontSize:7,fontWeight:800,color:"#4CAF50",letterSpacing:1}}>TAP TO USE</span>
              :<span style={{fontSize:7,fontWeight:900,color:"#7EC8E3",letterSpacing:1}}>FREE · UPLOAD</span>}
          </div>);})()}
        {items.map(it=>{const own=owned.includes(it.id);const eq=it.id===equippedId;
          return(<div key={it.id} onClick={()=>handleTile(it)} style={{borderRadius:12,cursor:"pointer",position:"relative",
            background:eq?"rgba(255,215,0,0.12)":"rgba(255,255,255,0.03)",
            border:eq?"2px solid #FFD700":own?"1px solid rgba(255,255,255,0.12)":"1px solid rgba(255,255,255,0.06)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:4,transition:"all 0.15s",overflow:"hidden"}}>
            {catId==="avatar"?<Avatar id={it.id} state={eq?"celebrate":"idle"} size={landscape?52:58} anim={eq}/>
              :<span style={{fontSize:landscape?30:36,filter:own?"none":"grayscale(0.6)",opacity:own?1:0.7}}>{it.emoji}</span>}
            <span style={{fontSize:9,fontWeight:800,color:own?"#ddd":"#889",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{it.name}</span>
            {eq?<span style={{fontSize:7,fontWeight:900,color:"#1a1200",background:"#FFD700",borderRadius:5,padding:"1px 6px",letterSpacing:1}}>EQUIPPED</span>
              :own?<span style={{fontSize:7,fontWeight:800,color:"#4CAF50",letterSpacing:1}}>TAP TO USE</span>
              :isAdm?<span style={{fontSize:7,fontWeight:900,color:"#4CAF50",letterSpacing:1}}>FREE</span>
              :<span style={{fontSize:9,fontWeight:900,color:"#FFD700",display:"flex",alignItems:"center",gap:2}}>🪙{it.price}</span>}
          </div>);})}
      </div>
      <div style={{textAlign:"center",color:"#667",fontSize:8,letterSpacing:1,marginTop:10}}>
        {catId==="avatar"?"🪙 Earn coins by winning games. Tap an avatar to preview it.":"🍅 In a game, tap an opponent to throw your selected item at them!"}</div>

      {/* Avatar preview / buy card */}
      {detail&&(()=>{const own=owned.includes(detail.id);const eq=detail.id===myAvatar;const afford=isAdm||coins>=detail.price;
        const closeD=()=>setDetail(null);
        return(<div onClick={closeD} style={{position:"absolute",inset:0,zIndex:20,background:"rgba(4,8,16,0.8)",
          backdropFilter:"blur(6px)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn 0.15s ease-out"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:300,background:"linear-gradient(160deg,#1c2740,#0c1322)",
            borderRadius:18,padding:"22px 20px 20px",position:"relative",border:`1px solid ${detail.ring||"#FFD700"}66`,
            boxShadow:`0 20px 60px rgba(0,0,0,0.7),0 0 40px ${detail.ring||"#FFD700"}22`,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <button onClick={closeD} style={{position:"absolute",top:6,right:8,width:34,height:34,background:"none",border:"none",color:"#889",fontSize:24,cursor:"pointer"}}>×</button>
            <Avatar id={detail.id} state={preview} size={116} photo={detail._photo?myPhoto:undefined}/>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center"}}>
              {[["idle","Idle"],["celebrate","Win"],["hit","Hit"],["uno","UNO"]].map(([s,l])=>
                <button key={s} onClick={()=>setPreview(s)} style={{padding:"3px 10px",borderRadius:7,border:"none",cursor:"pointer",fontSize:8,fontWeight:800,letterSpacing:1,
                  background:preview===s?"rgba(255,215,0,0.25)":"rgba(255,255,255,0.05)",color:preview===s?"#FFD700":"#889"}}>{l}</button>)}
            </div>
            <div style={{fontSize:19,fontWeight:900,color:"#fff",letterSpacing:1}}>{detail.name}</div>
            {detail._photo?<div style={{width:"100%",display:"flex",flexDirection:"column",gap:8}}>
              {eq?<div style={{fontSize:11,fontWeight:900,color:"#1a1200",background:"#FFD700",borderRadius:9,padding:"9px 0",textAlign:"center",letterSpacing:1}}>✓ EQUIPPED</div>
                :<button onClick={()=>{onEquipAvatar("photo");closeD();}} style={{padding:"10px 0",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#4CAF50,#2E7D32)",color:"#fff",fontSize:13,fontWeight:900,letterSpacing:1}}>USE PHOTO</button>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1px solid rgba(126,200,227,0.4)",cursor:"pointer",background:"rgba(126,200,227,0.1)",color:"#7EC8E3",fontSize:11,fontWeight:800,letterSpacing:1}}>CHANGE</button>
                <button onClick={()=>{onPhoto("");closeD();flash("Photo removed.");}} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1px solid rgba(244,67,54,0.3)",cursor:"pointer",background:"rgba(244,67,54,0.08)",color:"#EF5350",fontSize:11,fontWeight:800,letterSpacing:1}}>REMOVE</button>
              </div>
            </div>
            :eq?<div style={{fontSize:11,fontWeight:900,color:"#1a1200",background:"#FFD700",borderRadius:9,padding:"9px 0",width:"100%",textAlign:"center",letterSpacing:1}}>✓ EQUIPPED</div>
              :own?<button onClick={()=>{onEquipAvatar(detail.id);closeD();}} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"none",cursor:"pointer",
                background:"linear-gradient(135deg,#4CAF50,#2E7D32)",color:"#fff",fontSize:13,fontWeight:900,letterSpacing:1}}>EQUIP</button>
              :<button onClick={()=>{if(!afford){flash("Not enough coins — win games to earn more!");return;}onBuy(detail);}}
                disabled={!afford} style={{width:"100%",padding:"10px 0",borderRadius:10,border:"none",cursor:afford?"pointer":"not-allowed",
                background:afford?"linear-gradient(135deg,#FFD700,#DAA520)":"rgba(255,255,255,0.08)",color:afford?"#1a1200":"#667",fontSize:13,fontWeight:900,letterSpacing:1,
                display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{isAdm?"UNLOCK (FREE)":<>🪙 {detail.price}{!afford&&" — need more"}</>}</button>}
            <button onClick={closeD} style={{background:"none",border:"none",color:"#889",fontSize:11,fontWeight:700,letterSpacing:1,cursor:"pointer",padding:2}}>CLOSE</button>
          </div>
        </div>);})()}
    </div>
  </div>);
};

/* ═══ PLAYER STATS MODAL (click a leaderboard row) ═══ */
const PlayerStatsModal=({stats,isOwner,onClose})=>{
  const r=getRank(stats.totalPoints||0,stats.gamesPlayed||0);
  const ach=earnedAch(stats);const g=stats.gamesPlayed||0,w=stats.wins||0,wr=g?Math.round(w/g*100):0;
  const cellS={background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"8px 6px",textAlign:"center",border:"1px solid rgba(255,255,255,0.06)"};
  const lblS={fontSize:8,color:"#889",letterSpacing:1,fontWeight:700,marginBottom:3};
  const valS={fontSize:16,fontWeight:900,color:"#fff",fontFamily:"monospace"};
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,
    display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",animation:"fadeIn 0.2s ease-out",
    padding:"calc(14px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px))"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:360,maxHeight:"100%",overflowY:"auto",
      background:"linear-gradient(160deg,#182235,#0c1320)",borderRadius:18,padding:18,position:"relative",
      border:`1px solid ${r.color}44`,boxShadow:`0 20px 60px rgba(0,0,0,0.7),0 0 40px ${r.color}22`}}>
      <button onClick={onClose} style={{position:"absolute",top:6,right:6,width:40,height:40,zIndex:5,background:"none",border:"none",color:"#889",fontSize:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <div style={{flexShrink:0}}><Avatar id={stats.avatar} state="idle" size={58} photo={stats.photo}/></div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:18,fontWeight:900,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"flex",alignItems:"center",gap:6}}>
            <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{stats.name||"Player"}</span>
            {Array.isArray(stats.flags)&&stats.flags.map(f=><span key={f} style={{fontSize:16}}>{flagEmoji(f)}</span>)}</div>
          <div style={{fontSize:11,fontWeight:800,color:r.color,letterSpacing:1}}>{r.icon} {r.name}{r.idx>=0?" • "+(stats.totalPoints||0)+" pts":""}</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
        <div style={cellS}><div style={lblS}>PLAYED</div><div style={valS}>{g}</div></div>
        <div style={cellS}><div style={lblS}>WINS</div><div style={{...valS,color:"#4CAF50"}}>{w}</div></div>
        <div style={cellS}><div style={lblS}>WIN RATE</div><div style={valS}>{wr}%</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isOwner?"1fr 1fr 1fr":"1fr 1fr",gap:6,marginBottom:14}}>
        {isOwner&&<div style={cellS}><div style={lblS}>LOSSES</div><div style={{...valS,color:"#FF5252"}}>{stats.losses||0}</div></div>}
        <div style={cellS}><div style={lblS}>SINCE</div><div style={{...valS,fontSize:12}}>{fmtSince(stats.since)}</div></div>
        <div style={cellS}><div style={lblS}>LAST ONLINE</div><div style={{...valS,fontSize:12}}>{fmtLast(stats.lastPlayed)}</div></div>
      </div>
      <div style={{fontSize:10,fontWeight:800,color:"#FFD700",letterSpacing:2,marginBottom:8}}>🏆 ACHIEVEMENTS ({Object.values(ach).filter(Boolean).length}/{ACHIEVEMENTS.length})</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {ACHIEVEMENTS.map(a=>{const got=ach[a.id];return(
          <div key={a.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",borderRadius:9,
            background:got?"rgba(255,215,0,0.08)":"rgba(255,255,255,0.03)",
            border:got?"1px solid rgba(255,215,0,0.3)":"1px solid rgba(255,255,255,0.05)",opacity:got?1:0.4}}>
            <span style={{fontSize:18,filter:got?"none":"grayscale(1)"}}>{got?a.icon:"🔒"}</span>
            <div style={{minWidth:0}}><div style={{fontSize:10,fontWeight:800,color:got?"#fff":"#778"}}>{a.name}</div>
              <div style={{fontSize:7.5,color:"#667",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.desc}</div></div>
          </div>);})}
      </div>
    </div>
  </div>);
};

/* ═══ ANIMATED BACKGROUND ═══ */
const CanvasBG=({screen:scr,currentColor})=>{
  const canvasRef=useRef(null);const raf=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    let W=canvas.width=canvas.offsetWidth;let H=canvas.height=canvas.offsetHeight;
    const resize=()=>{W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;};
    window.addEventListener("resize",resize);

    const dustMotes=[];
    for(let i=0;i<55;i++)dustMotes.push({x:Math.random()*W,y:Math.random()*H,
      vx:(Math.random()-0.5)*0.2,vy:(Math.random()-0.5)*0.15,
      sz:0.4+Math.random()*2,op:0.06+Math.random()*0.2,
      ph:Math.random()*Math.PI*2,ps:0.003+Math.random()*0.008});

    const lightRays=[];
    for(let i=0;i<8;i++)lightRays.push({
      angle:(-0.4+i*0.1)*Math.PI,width:0.03+Math.random()*0.07,
      op:0.012+Math.random()*0.018,speed:0.0003+Math.random()*0.0005,
      phase:Math.random()*Math.PI*2});

    const orbs=[];
    if(scr==="menu"){
      for(let i=0;i<5;i++)orbs.push({x:Math.random()*W,y:Math.random()*H,
        vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.25,
        sz:30+Math.random()*60,op:0.02+Math.random()*0.03,
        hue:Math.random()*360,ph:Math.random()*Math.PI*2});
    }

    const floatingCards=[];
    if(scr==="menu"){
      const cardColors=["#ED1C24","#0956BF","#00A651","#FFDE00"];
      for(let i=0;i<12;i++)floatingCards.push({
        x:Math.random()*W,y:Math.random()*H,
        vx:(Math.random()-0.5)*0.4,vy:-0.2-Math.random()*0.3,
        rot:Math.random()*Math.PI*2,rotV:(Math.random()-0.5)*0.008,
        sz:12+Math.random()*18,op:0.04+Math.random()*0.06,
        color:cardColors[i%4],ph:Math.random()*Math.PI*2});
    }

    const nebulae=[];
    if(scr==="game"){
      for(let i=0;i<3;i++)nebulae.push({
        x:W*(0.2+Math.random()*0.6),y:H*(0.2+Math.random()*0.6),
        sz:80+Math.random()*120,ph:Math.random()*Math.PI*2,
        speed:0.001+Math.random()*0.002});
    }

    let t=0;
    const draw=()=>{
      ctx.clearRect(0,0,W,H);t+=0.016;

      if(scr==="menu"){
        orbs.forEach(o=>{
          o.x+=o.vx+Math.sin(t*0.3+o.ph)*0.15;o.y+=o.vy+Math.cos(t*0.2+o.ph)*0.12;o.ph+=0.005;
          if(o.x<-o.sz)o.x=W+o.sz;if(o.x>W+o.sz)o.x=-o.sz;
          if(o.y<-o.sz)o.y=H+o.sz;if(o.y>H+o.sz)o.y=-o.sz;
          const g=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.sz);
          g.addColorStop(0,`hsla(${o.hue+t*8},70%,50%,${o.op})`);
          g.addColorStop(0.5,`hsla(${o.hue+t*8},60%,40%,${o.op*0.4})`);
          g.addColorStop(1,"transparent");
          ctx.fillStyle=g;ctx.fillRect(o.x-o.sz,o.y-o.sz,o.sz*2,o.sz*2);
        });

        floatingCards.forEach(fc=>{
          fc.x+=fc.vx+Math.sin(t*0.4+fc.ph)*0.1;fc.y+=fc.vy;fc.rot+=fc.rotV;fc.ph+=0.003;
          if(fc.y<-30){fc.y=H+30;fc.x=Math.random()*W;}
          if(fc.x<-20)fc.x=W+20;if(fc.x>W+20)fc.x=-20;
          ctx.save();ctx.translate(fc.x,fc.y);ctx.rotate(fc.rot);
          ctx.globalAlpha=fc.op*(0.5+Math.sin(fc.ph)*0.5);
          const cw=fc.sz*0.7,ch=fc.sz;
          ctx.fillStyle=fc.color;
          ctx.beginPath();
          const r=3;ctx.moveTo(-cw/2+r,-ch/2);ctx.lineTo(cw/2-r,-ch/2);ctx.quadraticCurveTo(cw/2,-ch/2,cw/2,-ch/2+r);
          ctx.lineTo(cw/2,ch/2-r);ctx.quadraticCurveTo(cw/2,ch/2,cw/2-r,ch/2);
          ctx.lineTo(-cw/2+r,ch/2);ctx.quadraticCurveTo(-cw/2,ch/2,-cw/2,ch/2-r);
          ctx.lineTo(-cw/2,-ch/2+r);ctx.quadraticCurveTo(-cw/2,-ch/2,-cw/2+r,-ch/2);ctx.closePath();ctx.fill();
          ctx.strokeStyle="rgba(255,255,255,0.15)";ctx.lineWidth=0.5;ctx.stroke();
          ctx.fillStyle="rgba(255,255,255,0.3)";
          ctx.beginPath();ctx.ellipse(0,0,cw*0.25,ch*0.2,0,0,Math.PI*2);ctx.fill();
          ctx.globalAlpha=1;ctx.restore();
        });
      }

      const cg=ctx.createRadialGradient(W*0.5,H*0.38,0,W*0.5,H*0.38,Math.max(W,H)*0.6);
      if(scr==="game"&&currentColor){
        const rgb=CHR[currentColor]||[255,165,0];
        cg.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.08)`);
        cg.addColorStop(0.15,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.04)`);
        cg.addColorStop(0.4,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.015)`);
      }else if(scr==="menu"){
        cg.addColorStop(0,"rgba(229,57,53,0.06)");
        cg.addColorStop(0.15,"rgba(255,215,0,0.03)");
        cg.addColorStop(0.4,"rgba(9,86,191,0.02)");
      }else{
        cg.addColorStop(0,"rgba(40,70,60,0.08)");
        cg.addColorStop(0.2,"rgba(20,50,45,0.04)");
      }
      cg.addColorStop(0.5,"rgba(0,0,0,0)");cg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=cg;ctx.fillRect(0,0,W,H);

      if(scr==="game"){
        nebulae.forEach(n=>{
          n.ph+=n.speed;
          const nx=n.x+Math.sin(n.ph)*30;const ny=n.y+Math.cos(n.ph*0.7)*20;
          const rgb=currentColor?CHR[currentColor]:[255,200,100];
          const g=ctx.createRadialGradient(nx,ny,0,nx,ny,n.sz);
          g.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.03)`);
          g.addColorStop(0.5,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.01)`);
          g.addColorStop(1,"transparent");
          ctx.fillStyle=g;ctx.fillRect(nx-n.sz,ny-n.sz,n.sz*2,n.sz*2);
        });
      }

      lightRays.forEach(r=>{
        r.phase+=r.speed;
        const a=r.angle+Math.sin(t*0.2+r.phase)*0.04;
        ctx.save();ctx.translate(W*0.5,H*-0.1);ctx.rotate(a);
        const rg=ctx.createLinearGradient(0,0,0,H*1.5);
        const rayOp=r.op+Math.sin(t*0.5+r.phase)*0.008;
        rg.addColorStop(0,`rgba(255,240,200,${rayOp})`);
        rg.addColorStop(0.35,`rgba(255,240,200,${rayOp*0.35})`);
        rg.addColorStop(0.7,`rgba(255,240,200,${rayOp*0.08})`);
        rg.addColorStop(1,"transparent");
        ctx.fillStyle=rg;
        ctx.beginPath();ctx.moveTo(-W*r.width,0);ctx.lineTo(W*r.width,0);
        ctx.lineTo(W*r.width*3,H*1.5);ctx.lineTo(-W*r.width*3,H*1.5);
        ctx.closePath();ctx.fill();ctx.restore();});

      const tg=ctx.createRadialGradient(W*0.5,H*0.42,20,W*0.5,H*0.42,Math.min(W,H)*0.35);
      tg.addColorStop(0,"rgba(255,250,230,0.025)");tg.addColorStop(0.6,"rgba(255,245,210,0.01)");
      tg.addColorStop(1,"transparent");
      ctx.fillStyle=tg;ctx.fillRect(0,0,W,H);

      dustMotes.forEach(d=>{
        d.x+=d.vx+Math.sin(t*0.5+d.ph)*0.1;d.y+=d.vy+Math.cos(t*0.3+d.ph)*0.08;d.ph+=d.ps;
        if(d.x<-5)d.x=W+5;if(d.x>W+5)d.x=-5;
        if(d.y<-5)d.y=H+5;if(d.y>H+5)d.y=-5;
        const a=d.op*(0.3+Math.sin(d.ph)*0.7);
        ctx.globalAlpha=a;
        if(scr==="menu"){
          const hue=(t*20+d.ph*57)%360;
          ctx.fillStyle=`hsla(${hue},60%,75%,0.9)`;
        }else{
          ctx.fillStyle="rgba(255,250,230,0.8)";
        }
        ctx.beginPath();ctx.arc(d.x,d.y,d.sz,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});

      raf.current=requestAnimationFrame(draw);};
    draw();
    return()=>{window.removeEventListener("resize",resize);cancelAnimationFrame(raf.current);};
  },[scr,currentColor]);
  return <canvas ref={canvasRef} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:1}}/>;
};

/* ═══ LIGHTNING EFFECT (for +2/+4 plays) ═══ */
const LightningFX=({color,onDone})=>{
  const canvasRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width=window.innerWidth;const H=canvas.height=window.innerHeight;
    const rgb=CHR[color]||[255,200,0];
    const bolts=[];
    const mkBolt=(sx,sy,ex,ey,w,br)=>{
      const pts=[{x:sx,y:sy}];const dx=ex-sx;const dy=ey-sy;const segs=8+Math.floor(Math.random()*8);
      for(let i=1;i<segs;i++){const t=i/segs;
        pts.push({x:sx+dx*t+(Math.random()-0.5)*80*w,y:sy+dy*t+(Math.random()-0.5)*40*w});}
      pts.push({x:ex,y:ey});
      const bolt={pts,width:w,life:1,dc:0.025+Math.random()*0.02,branches:[]};
      if(br>0){const bc=1+Math.floor(Math.random()*3);
        for(let b=0;b<bc;b++){const bi=2+Math.floor(Math.random()*(pts.length-3));
          const bp=pts[bi];const ba=Math.atan2(dy,dx)+(Math.random()-0.5)*1.2;
          const bl=40+Math.random()*80;
          bolt.branches.push(mkBolt(bp.x,bp.y,bp.x+Math.cos(ba)*bl,bp.y+Math.sin(ba)*bl,w*0.5,br-1));}}
      return bolt;};
    for(let i=0;i<4;i++){
      const sx=W*0.2+Math.random()*W*0.6;const sy=-10;
      const ex=W*0.15+Math.random()*W*0.7;const ey=H*0.3+Math.random()*H*0.4;
      bolts.push(mkBolt(sx,sy,ex,ey,3+Math.random()*2,2));}
    for(let i=0;i<2;i++){
      const sx=Math.random()<0.5?-10:W+10;const sy=H*0.1+Math.random()*H*0.3;
      const ex=W*0.3+Math.random()*W*0.4;const ey=H*0.2+Math.random()*H*0.4;
      bolts.push(mkBolt(sx,sy,ex,ey,2+Math.random()*2,1));}
    let f=0;
    const drawBolt=(b)=>{
      if(b.life<=0)return;
      ctx.globalAlpha=b.life;ctx.lineWidth=b.width*b.life;ctx.lineCap="round";
      ctx.shadowColor=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.shadowBlur=20*b.life;
      ctx.strokeStyle="#fff";ctx.beginPath();ctx.moveTo(b.pts[0].x,b.pts[0].y);
      b.pts.forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
      ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`;ctx.lineWidth=b.width*b.life*3;
      ctx.beginPath();ctx.moveTo(b.pts[0].x,b.pts[0].y);
      b.pts.forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();
      ctx.shadowBlur=0;
      b.branches.forEach(br=>drawBolt(br));b.life-=b.dc;};
    const anim=()=>{
      ctx.clearRect(0,0,W,H);
      if(f<3){ctx.globalAlpha=0.5*(1-f/3);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
      let alive=false;bolts.forEach(b=>{drawBolt(b);if(b.life>0)alive=true;});
      f++;if(alive&&f<80)requestAnimationFrame(anim);else onDone();};
    anim();
  },[color,onDone]);
  return <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:97}}/>;
};

/* jagged fractal lightning bolt (midpoint displacement + forks) */
function makeBolt(x1,y1,x2,y2,disp,detail){
  const branches=[];
  const sub=(ax,ay,bx,by,d,out)=>{
    if(d<detail){out.push({x1:ax,y1:ay,x2:bx,y2:by});return;}
    let mx=(ax+bx)/2,my=(ay+by)/2;
    const nx=-(by-ay),ny=(bx-ax),len=Math.hypot(nx,ny)||1,off=(Math.random()-0.5)*d;
    mx+=nx/len*off;my+=ny/len*off;
    sub(ax,ay,mx,my,d/2,out);sub(mx,my,bx,by,d/2,out);
    if(Math.random()<0.3&&d>detail*3){
      const ex=mx+(mx-ax)*(0.7+Math.random()*0.7),ey=my+(my-ay)*(0.7+Math.random()*0.7),b=[];
      sub(mx,my,ex,ey,d/2,b);branches.push(b);}
  };
  const main=[];sub(x1,y1,x2,y2,disp,main);return{main,branches};
}
/* ═══ LIGHTNING STRIKE — jagged forking bolts + impact burst (for +4 penalty) ═══ */
const PlasmaBolt=({color})=>{
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current;if(!cv)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const W=cv.width=Math.round(window.innerWidth*dpr),H=cv.height=Math.round(window.innerHeight*dpr);
    const ctx=cv.getContext("2d");
    const rgb=CHR[color]||[255,210,26];
    const glow=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const mid=`rgb(${Math.min(255,rgb[0]+40)},${Math.min(255,rgb[1]+40)},${Math.min(255,rgb[2]+40)})`;
    const ga=o=>`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${o})`;
    const ix=W*0.5,iy=H*0.6,top=-20*dpr;
    let raf,f=0;const totalF=66,strikeF=[0,15,33];
    let bolt=null,boltAge=99,flash=0,ring=0,ringOn=false;const sparks=[];
    const segStroke=(segs,w,style,blur)=>{
      ctx.strokeStyle=style;ctx.lineWidth=w;ctx.lineCap="round";ctx.lineJoin="round";
      ctx.shadowColor=glow;ctx.shadowBlur=blur;ctx.beginPath();
      segs.forEach(s=>{ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);});ctx.stroke();ctx.shadowBlur=0;
    };
    const strike=()=>{
      bolt=makeBolt(ix+(Math.random()-0.5)*46*dpr,top,ix+(Math.random()-0.5)*20*dpr,iy,130*dpr,4*dpr);
      boltAge=0;flash=1;ringOn=true;ring=0;
      for(let i=0;i<20;i++){const a=-Math.PI/2+(Math.random()-0.5)*Math.PI*1.5,sp=(4+Math.random()*9)*dpr;
        sparks.push({x:ix,y:iy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3*dpr,life:1});}
    };
    const anim=()=>{
      ctx.clearRect(0,0,W,H);
      if(strikeF.includes(f))strike();
      if(flash>0){ctx.globalAlpha=flash*0.5;ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;flash-=0.14;}
      const ig=Math.max(0,1-boltAge*0.09);
      if(ig>0){const g=ctx.createRadialGradient(ix,iy,0,ix,iy,120*dpr);
        g.addColorStop(0,ga(0.5*ig));g.addColorStop(0.5,ga(0.18*ig));g.addColorStop(1,"transparent");
        ctx.fillStyle=g;ctx.fillRect(ix-140*dpr,iy-140*dpr,280*dpr,280*dpr);}
      if(bolt){const ba=Math.max(0,1-boltAge*0.16);
        if(ba>0){ctx.globalAlpha=ba;
          segStroke(bolt.main,19*dpr,ga(0.32),34*dpr);
          segStroke(bolt.main,7*dpr,mid,18*dpr);
          segStroke(bolt.main,3*dpr,"#fff",10*dpr);
          segStroke(bolt.main,1.3*dpr,"#fff",3*dpr);
          bolt.branches.forEach(b=>{segStroke(b,7*dpr,ga(0.3),15*dpr);segStroke(b,2*dpr,"#fff",6*dpr);});
          ctx.globalAlpha=1;}
        boltAge++;}
      if(ringOn){ring+=10*dpr;const ra=Math.max(0,1-ring/(160*dpr))*0.8;
        ctx.globalAlpha=ra;ctx.strokeStyle=glow;ctx.lineWidth=3*dpr;ctx.shadowColor=glow;ctx.shadowBlur=14*dpr;
        ctx.beginPath();ctx.arc(ix,iy,ring,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;
        if(ring>160*dpr)ringOn=false;}
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx;s.y+=s.vy;s.vy+=0.55*dpr;s.vx*=0.96;s.life-=0.035;
        if(s.life<=0){sparks.splice(i,1);continue;}
        ctx.globalAlpha=s.life;ctx.fillStyle=s.life>0.5?"#fff":glow;ctx.shadowColor=glow;ctx.shadowBlur=8*dpr;
        ctx.beginPath();ctx.arc(s.x,s.y,2.6*dpr*s.life,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
      ctx.globalAlpha=1;
      f++;if(f<totalF||sparks.length)raf=requestAnimationFrame(anim);
    };
    anim();
    return()=>{if(raf)cancelAnimationFrame(raf);};
  },[color]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:3}}/>;
};

/* ═══ ANIME IMPACT (speed lines + flash on card play) ═══ */
const AnimeImpact=({color,onDone})=>{
  const canvasRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width=window.innerWidth;const H=canvas.height=window.innerHeight;
    const cx=W/2,cy=H*0.38;const rgb=CHR[color]||[255,200,0];
    const lines=[];
    for(let i=0;i<55;i++)lines.push({
      angle:(i/55)*Math.PI*2+(Math.random()-0.5)*0.08,
      width:1.5+Math.random()*4,speed:8+Math.random()*14,
      length:50+Math.random()*200,delay:Math.random()*4,
      isColored:Math.random()>0.55});
    let f=0;
    const anim=()=>{
      ctx.clearRect(0,0,W,H);f++;
      if(f<6){ctx.globalAlpha=0.35*(1-f/6);
        ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.fillRect(0,0,W,H);
        ctx.globalAlpha=0.5*(1-f/6);
        const g=ctx.createRadialGradient(cx,cy,0,cx,cy,150);
        g.addColorStop(0,"rgba(255,255,255,0.8)");g.addColorStop(1,"transparent");
        ctx.fillStyle=g;ctx.fillRect(cx-150,cy-150,300,300);}
      lines.forEach(l=>{if(f<l.delay)return;const pr=(f-l.delay)/18;if(pr>1)return;
        const sR=l.length*0.15+pr*l.speed*12;const eR=sR+l.length*(1-pr*0.4);
        const sx=cx+Math.cos(l.angle)*sR,sy=cy+Math.sin(l.angle)*sR;
        const ex=cx+Math.cos(l.angle)*eR,ey=cy+Math.sin(l.angle)*eR;
        ctx.globalAlpha=(1-pr)*0.7;
        ctx.strokeStyle=l.isColored?`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`:"#fff";
        ctx.lineWidth=l.width*(1-pr*0.5);ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();});
      ctx.globalAlpha=1;
      if(f<28)requestAnimationFrame(anim);else onDone();};
    anim();
  },[color,onDone]);
  return <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:96}}/>;
};

/* ═══ BURST PARTICLES ═══ */
const BurstFX=({color,onDone})=>{
  const canvasRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width=window.innerWidth;const H=canvas.height=window.innerHeight;
    const cx=W/2,cy=H*0.38;const rgb=CHR[color]||[255,165,0];
    const parts=[];const rings=[];
    for(let i=0;i<55;i++){const a=Math.random()*Math.PI*2;const sp=3+Math.random()*10;
      parts.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,
        sz:2+Math.random()*5,life:1,dc:0.012+Math.random()*0.02,
        r:rgb[0]+Math.random()*40-20,g:rgb[1]+Math.random()*40-20,b:rgb[2]+Math.random()*40-20,trail:[]});}
    for(let i=0;i<22;i++){const a=Math.random()*Math.PI*2;const sp=5+Math.random()*12;
      parts.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,
        sz:1+Math.random()*2.5,life:1,dc:0.02+Math.random()*0.03,r:255,g:255,b:255,trail:[]});}
    for(let i=0;i<3;i++)rings.push({x:cx,y:cy,r:0,life:1,speed:7+i*2.5,delay:i*3});
    let frame=0;
    const anim=()=>{
      ctx.clearRect(0,0,W,H);let alive=false;
      if(frame<4){ctx.globalAlpha=0.2*(4-frame)/4;
        const fg=ctx.createRadialGradient(cx,cy,0,cx,cy,140);
        fg.addColorStop(0,"rgba(255,255,255,0.5)");fg.addColorStop(0.3,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.3)`);
        fg.addColorStop(1,"transparent");ctx.fillStyle=fg;ctx.fillRect(cx-140,cy-140,280,280);ctx.globalAlpha=1;}
      rings.forEach(ri=>{if(ri.delay>0){ri.delay--;return;}ri.r+=ri.speed;ri.life-=0.02;
        if(ri.life<=0)return;alive=true;ctx.globalAlpha=ri.life*0.3;
        ctx.strokeStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.lineWidth=2.5;
        ctx.beginPath();ctx.arc(ri.x,ri.y,ri.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;});
      parts.forEach(p=>{if(p.life<=0)return;alive=true;
        p.trail.push({x:p.x,y:p.y,l:p.life});if(p.trail.length>6)p.trail.shift();
        p.x+=p.vx;p.y+=p.vy;p.vy+=0.13;p.vx*=0.99;p.life-=p.dc;
        const col=`rgb(${Math.floor(p.r)},${Math.floor(p.g)},${Math.floor(p.b)})`;
        p.trail.forEach((tr,ti)=>{ctx.globalAlpha=Math.max(0,tr.l)*0.12*(ti/p.trail.length);
          ctx.fillStyle=col;ctx.beginPath();ctx.arc(tr.x,tr.y,Math.max(0,p.sz*tr.l*0.5),0,Math.PI*2);ctx.fill();});
        ctx.globalAlpha=Math.max(0,p.life)*0.35;ctx.fillStyle=col;
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0,p.sz*p.life*2.2),0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=Math.max(0,p.life);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0,p.sz*p.life),0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;});
      frame++;if(alive&&frame<120)requestAnimationFrame(anim);else onDone();};
    anim();
  },[color,onDone]);
  return <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:99}}/>;
};

/* ═══ CARD (Canvas-rendered) ═══ */
const Card=({card,onClick,sz="md",faceDown,highlighted,lifted,style,animate})=>{
  const canvasRef=useRef(null);
  const isW=card.type==="wild";
  const dm={xs:{w:48,h:72,r:8,f:7,fs:16,cf:7},sm:{w:44,h:66,r:7,f:6,fs:15,cf:6},
    md:{w:70,h:105,r:12,f:10,fs:26,cf:9},
    lg:{w:88,h:132,r:14,f:13,fs:32,cf:11}}[sz];
  const gc=CH[card.color]||"#FFD700";
  const isLg=sz==="lg";

  useEffect(()=>{
    const c=canvasRef.current;if(!c)return;
    const dpr=window.devicePixelRatio||1;
    c.width=dm.w*dpr;c.height=dm.h*dpr;
    const ctx=c.getContext("2d");ctx.scale(dpr,dpr);
    const W=dm.w,H=dm.h,R=dm.r;

    const roundRect=(x,y,w,h,r)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();};
    const ellipse=(cx,cy,rx,ry)=>{ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);};

    ctx.clearRect(0,0,W,H);

    if(faceDown){
      roundRect(0,0,W,H,R);
      const bg=ctx.createLinearGradient(0,0,W,H);
      bg.addColorStop(0,"#232838");bg.addColorStop(0.5,"#151a26");bg.addColorStop(1,"#090c12");
      ctx.fillStyle=bg;ctx.fill();
      ctx.save();roundRect(0,0,W,H,R);ctx.clip();
      ctx.strokeStyle="rgba(255,215,0,0.05)";ctx.lineWidth=2;
      for(let i=-H;i<W+H;i+=9){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+H*0.55,H);ctx.stroke();}
      const sg=ctx.createRadialGradient(W*0.5,H*0.46,0,W*0.5,H*0.46,W*0.78);
      sg.addColorStop(0,"rgba(255,215,0,0.10)");sg.addColorStop(1,"transparent");
      ctx.fillStyle=sg;ctx.fillRect(0,0,W,H);
      ctx.restore();
      roundRect(1.5,1.5,W-3,H-3,Math.max(2,R-1));ctx.strokeStyle="rgba(255,215,0,0.42)";ctx.lineWidth=1.5;ctx.stroke();
      ctx.save();ctx.translate(W/2,H/2);ctx.rotate(Math.PI/4);
      const ds=Math.min(W,H)*0.24;
      roundRect(-ds,-ds,ds*2,ds*2,ds*0.32);
      const dg=ctx.createLinearGradient(-ds,-ds,ds,ds);
      dg.addColorStop(0,"#2c3244");dg.addColorStop(1,"#11141d");
      ctx.fillStyle=dg;ctx.shadowColor="rgba(255,215,0,0.38)";ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle="rgba(255,215,0,0.7)";ctx.lineWidth=1.5;ctx.stroke();
      ctx.restore();
      ctx.font=`900 ${dm.f*1.15}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="#FFD700";ctx.shadowColor="rgba(255,215,0,0.5)";ctx.shadowBlur=8;
      ctx.fillText("RD",W/2,H/2+0.5);ctx.shadowBlur=0;
    } else if(isW){
      roundRect(0,0,W,H,R);ctx.save();ctx.clip();
      const hw=W/2,hh=H/2;
      const qc=[{x:0,y:0,c1:CH.red,c2:"#C41E1E"},{x:hw,y:0,c1:CH.blue,c2:"#0747A6"},
        {x:0,y:hh,c1:CH.yellow,c2:"#F9C800"},{x:hw,y:hh,c1:CH.green,c2:"#00873E"}];
      qc.forEach(q=>{const g=ctx.createLinearGradient(q.x,q.y,q.x+hw,q.y+hh);
        g.addColorStop(0,q.c1);g.addColorStop(1,q.c2);ctx.fillStyle=g;ctx.fillRect(q.x,q.y,hw,hh);});
      const shineW=ctx.createLinearGradient(0,0,0,H*0.5);
      shineW.addColorStop(0,"rgba(255,255,255,0.22)");shineW.addColorStop(1,"transparent");
      ctx.fillStyle=shineW;ctx.fillRect(0,0,W,H*0.5);
      ctx.restore();
      roundRect(0,0,W,H,R);ctx.strokeStyle="rgba(255,255,255,0.6)";ctx.lineWidth=2;ctx.stroke();
      roundRect(3,3,W-6,H-6,Math.max(2,R-2));ctx.strokeStyle="rgba(255,255,255,0.18)";ctx.lineWidth=1;ctx.stroke();
      ctx.save();ctx.translate(W*0.5,H*0.5);ctx.rotate(Math.PI/4);
      const gszW=Math.min(W,H)*0.27;
      roundRect(-gszW,-gszW,gszW*2,gszW*2,gszW*0.35);
      ctx.fillStyle="rgba(12,14,20,0.94)";ctx.shadowColor="rgba(255,255,255,0.3)";ctx.shadowBlur=8;ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle="rgba(255,255,255,0.5)";ctx.lineWidth=1.5;ctx.stroke();
      ctx.restore();
      const sym2=gs(card.value);
      ctx.font=`900 ${dm.fs*0.62}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="#fff";ctx.shadowColor="rgba(255,255,255,0.55)";ctx.shadowBlur=10;
      ctx.fillText(sym2,W*0.5,H*0.5+1);ctx.shadowBlur=0;
      ctx.font=`800 ${dm.cf}px sans-serif`;ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,0.8)";ctx.shadowBlur=3;
      ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(gs(card.value),4,3);
      ctx.save();ctx.translate(W-4,H-3);ctx.rotate(Math.PI);ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillText(gs(card.value),0,0);ctx.restore();ctx.shadowBlur=0;
    } else {
      const isShadow=card.value==="shadow";
      const rgb=CHR[card.color]||[255,165,0];
      roundRect(0,0,W,H,R);ctx.save();ctx.clip();
      const bg2=ctx.createLinearGradient(0,0,W,H);
      if(isShadow){
        bg2.addColorStop(0,`rgba(${Math.floor(rgb[0]*0.32)},${Math.floor(rgb[1]*0.32)},${Math.floor(rgb[2]*0.32)},1)`);
        bg2.addColorStop(0.5,"#12141a");bg2.addColorStop(1,"#05060a");
      } else {
        bg2.addColorStop(0,`rgb(${Math.min(255,rgb[0]+55)},${Math.min(255,rgb[1]+55)},${Math.min(255,rgb[2]+55)})`);
        bg2.addColorStop(0.55,CH[card.color]);
        bg2.addColorStop(1,`rgb(${Math.max(0,rgb[0]-72)},${Math.max(0,rgb[1]-72)},${Math.max(0,rgb[2]-72)})`);
      }
      ctx.fillStyle=bg2;ctx.fillRect(0,0,W,H);
      // faceted panels for a cut-gem texture
      ctx.fillStyle=isShadow?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.08)";
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W,0);ctx.lineTo(0,H*0.62);ctx.closePath();ctx.fill();
      ctx.fillStyle="rgba(0,0,0,0.13)";
      ctx.beginPath();ctx.moveTo(W,H);ctx.lineTo(0,H);ctx.lineTo(W,H*0.4);ctx.closePath();ctx.fill();
      const shine=ctx.createLinearGradient(0,0,0,H*0.5);
      shine.addColorStop(0,isShadow?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.2)");shine.addColorStop(1,"transparent");
      ctx.fillStyle=shine;ctx.fillRect(0,0,W,H*0.5);
      ctx.restore();
      roundRect(0,0,W,H,R);ctx.strokeStyle=isShadow?`${CH[card.color]}99`:"rgba(255,255,255,0.6)";ctx.lineWidth=2;ctx.stroke();
      roundRect(3,3,W-6,H-6,Math.max(2,R-2));ctx.strokeStyle=isShadow?`${CH[card.color]}33`:"rgba(255,255,255,0.16)";ctx.lineWidth=1;ctx.stroke();
      const sym3=gs(card.value);
      // center gem (rounded diamond)
      ctx.save();ctx.translate(W*0.5,H*0.5);ctx.rotate(Math.PI/4);
      const gsz=Math.min(W,H)*0.28;
      roundRect(-gsz,-gsz,gsz*2,gsz*2,gsz*0.35);
      const gemg=ctx.createLinearGradient(-gsz,-gsz,gsz,gsz);
      gemg.addColorStop(0,"rgba(30,34,46,0.95)");gemg.addColorStop(1,"rgba(9,11,16,0.96)");
      ctx.fillStyle=gemg;ctx.shadowColor=`${CH[card.color]}77`;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle=isShadow?`${CH[card.color]}99`:"rgba(255,255,255,0.5)";ctx.lineWidth=1.5;ctx.stroke();
      ctx.restore();
      // symbol/number upright, white with color glow
      const ink=isShadow?CH[card.color]:"#fff";const er=Math.min(W,H)*0.28;
      ctx.save();ctx.translate(W*0.5,H*0.5);
      if(card.value==="shadow"){
        ctx.font=`${dm.fs*0.8}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("👤",0,1);
      } else if(card.value==="snatch"){
        ctx.font=`${dm.fs*0.75}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("🫳",0,1);
      } else if(card.value==="discardAll"){
        ctx.strokeStyle=ink;ctx.lineWidth=2.2;
        ctx.beginPath();ctx.arc(0,0,er*0.4,0.3,Math.PI*1.3);ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,er*0.4,Math.PI+0.3,Math.PI*2.3);ctx.stroke();
        ctx.fillStyle=ink;
        ctx.beginPath();ctx.moveTo(er*0.32,-er*0.22);ctx.lineTo(er*0.46,-er*0.04);ctx.lineTo(er*0.22,-er*0.04);ctx.fill();
        ctx.beginPath();ctx.moveTo(-er*0.32,er*0.22);ctx.lineTo(-er*0.46,er*0.04);ctx.lineTo(-er*0.22,er*0.04);ctx.fill();
      } else if(card.value==="skip"){
        ctx.strokeStyle=ink;ctx.lineWidth=2.6;
        ctx.beginPath();ctx.arc(0,0,er*0.38,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(-er*0.3,er*0.3);ctx.lineTo(er*0.3,-er*0.3);ctx.stroke();
      } else if(card.value==="reverse"){
        ctx.fillStyle=ink;ctx.font=`900 ${dm.fs*0.72}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.shadowColor=`${CH[card.color]}aa`;ctx.shadowBlur=6;ctx.fillText("⇄",0,1);ctx.shadowBlur=0;
      } else if(card.value==="draw2"){
        ctx.fillStyle=ink;ctx.font=`900 ${dm.fs*0.6}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.shadowColor=`${CH[card.color]}aa`;ctx.shadowBlur=6;ctx.fillText("+2",0,2);ctx.shadowBlur=0;
      } else {
        ctx.font=`900 ${dm.fs}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillStyle=ink;ctx.shadowColor=`${CH[card.color]}cc`;ctx.shadowBlur=8;
        ctx.fillText(sym3,0,2);ctx.shadowBlur=0;
      }
      ctx.restore();
      // corner pips (poker-style)
      const cornerSym=card.value==="shadow"?"S":card.value==="snatch"?"SN":card.value==="discardAll"?"ALL":sym3;
      const cfs=card.value==="discardAll"||card.value==="snatch"?dm.cf*0.75:card.value==="shadow"?dm.cf*0.7:dm.cf;
      ctx.font=`800 ${cfs}px sans-serif`;ctx.fillStyle=isShadow?CH[card.color]:"rgba(255,255,255,0.95)";
      ctx.shadowColor="rgba(0,0,0,0.55)";ctx.shadowBlur=3;
      ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(cornerSym,4,3);
      ctx.save();ctx.translate(W-4,H-3);ctx.rotate(Math.PI);ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillText(cornerSym,0,0);ctx.restore();ctx.shadowBlur=0;
    }
  },[card.color,card.value,card.type,faceDown,sz]);

  return(
    <div onClick={onClick} style={{width:dm.w,height:dm.h,borderRadius:dm.r,position:"relative",flexShrink:0,
      cursor:onClick?"pointer":"default",
      transition:"transform 0.35s cubic-bezier(.34,1.56,.64,1),box-shadow 0.35s ease",
      boxShadow:lifted?`0 20px 50px rgba(0,0,0,0.95),0 0 0 2.5px rgba(0,0,0,0.75),0 0 0 4.5px ${gc},0 0 40px ${gc}88`
        :highlighted?`0 0 0 2.5px rgba(0,0,0,0.7),0 0 0 4.5px ${gc},0 4px 20px ${gc}99,0 0 16px ${gc}66`
        :"0 0 0 2.6px rgba(0,0,0,0.72),0 4px 14px rgba(0,0,0,0.72),0 1px 4px rgba(0,0,0,0.45)",
      animation:animate||"none",...style}}
      onPointerEnter={e=>{if(onClick&&isLg){e.currentTarget.style.transform=(style?.transform||"")+" translateY(-24px) scale(1.14)";sfx.p("cardSlide");}}}
      onPointerLeave={e=>{if(!lifted)e.currentTarget.style.transform=style?.transform||"none";}}>
      <canvas ref={canvasRef} style={{width:dm.w,height:dm.h,borderRadius:dm.r,display:"block"}}/>
    </div>);
};

/* ═══ ACTION OVERLAY (anime-style) ═══ */
const ActFX=({type,onDone})=>{
  useEffect(()=>{const t=setTimeout(onDone,2800);return()=>clearTimeout(t);},[onDone]);
  const c={
    wild:{i:"W",t:"WILD!",c:"#FFD700",g:"#FFAB00"},
    challenge:{i:"?!",t:"CHALLENGE!",c:"#FF6F00",g:"#FF9100"},
    stack:{i:"⚡++",t:"STACKED!",c:"#FF6F00",g:"#FF3D00"},
    discardAll:{i:"✕",t:"DISCARD ALL!",c:"#9C27B0",g:"#E040FB"},
    shadow:{i:"👤",t:"SHADOW!",c:"#37474F",g:"#546E7A"},
    snatch:{i:"🫳",t:"SNATCH!",c:"#FF6F00",g:"#FF9100"}}[type]||{i:"",t:"",c:"#fff",g:"#fff"};
  const sparks=useMemo(()=>Array.from({length:24},(_,i)=>({
    id:i,angle:(i/24)*360,dist:90+Math.random()*150,size:2+Math.random()*7,delay:Math.random()*0.4})),[]);
  const rings=useMemo(()=>Array.from({length:3},(_,i)=>({id:i,delay:i*0.12,size:40+i*55})),[]);
  return(<div style={{position:"fixed",inset:0,zIndex:100,pointerEvents:"none",
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    animation:"af 2.8s forwards"}}>
    <div style={{position:"absolute",inset:0,
      background:`radial-gradient(circle at 50% 50%,${c.c}66,${c.c}20 35%,transparent 55%)`,
      animation:"bgPulse 0.8s ease-out"}}/>
    {rings.map(r=><div key={r.id} style={{position:"absolute",width:r.size,height:r.size,borderRadius:"50%",
      border:`3px solid ${c.g}`,opacity:0,animation:`ringExpand 0.9s ease-out ${r.delay}s forwards`}}/>)}
    {sparks.map(s=><div key={s.id} style={{position:"absolute",width:s.size,height:s.size,borderRadius:"50%",
      background:c.g,left:"50%",top:"50%",opacity:0,
      animation:`spark 1s ease-out ${s.delay}s forwards`,
      "--sx":`${Math.cos(s.angle*Math.PI/180)*s.dist}px`,"--sy":`${Math.sin(s.angle*Math.PI/180)*s.dist}px`}}/>)}
    <div style={{fontSize:90,fontWeight:900,color:c.c,fontFamily:"Arial Black",position:"relative",zIndex:2,
      textShadow:`0 0 60px ${c.g},0 0 120px ${c.g}66`,
      animation:"apop 0.5s cubic-bezier(.34,1.56,.64,1)",
      filter:`drop-shadow(0 0 35px ${c.c})`}}>{c.i}</div>
    <div style={{fontSize:32,fontWeight:900,color:"#fff",letterSpacing:12,marginTop:8,position:"relative",zIndex:2,
      animation:"aslide 0.5s ease-out 0.2s both",
      textShadow:`0 0 25px ${c.g},0 2px 4px rgba(0,0,0,0.9)`,
      background:`linear-gradient(180deg,#fff,${c.c})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
      backgroundClip:"text"}}>{c.t}</div>
  </div>);
};

/* ═══ ELEMENTAL WILD DRAW 4 EFFECT ═══ */
const ElementalW4FX=({color,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),3000);return()=>clearTimeout(t);},[]);
  const em=EM(color);
  const parts=useMemo(()=>Array.from({length:20},(_,i)=>({
    id:i,angle:(i/20)*360,r:50+Math.random()*90,sz:12+Math.random()*14,
    spd:1+Math.random()*1,del:Math.random()*0.4})),[color]);
  return(<div style={{position:"fixed",inset:0,zIndex:100,pointerEvents:"none",
    display:"flex",alignItems:"center",justifyContent:"center",animation:"af 3s forwards"}}>
    <div style={{position:"absolute",inset:0,background:`radial-gradient(circle,${em.glow}33 0%,${em.c3}33 40%,transparent 70%)`,
      animation:"w4bg 1s ease-out"}}/>
    {[0,1,2].map(i=><div key={i} style={{position:"absolute",width:100+i*80,height:100+i*80,borderRadius:"50%",
      border:`2px solid ${em.glow}66`,opacity:0,
      animation:`w4ring 2s linear infinite ${i*0.2}s`,animationFillMode:"forwards",
      boxShadow:`0 0 15px ${em.glow}44`}}/>)}
    {parts.map(p=><div key={p.id} style={{position:"absolute",fontSize:p.sz,opacity:0,
      animation:`w4orb ${p.spd}s ease-in-out infinite ${p.del}s`,
      "--w4r":`${p.r}px`,"--w4a":`${p.angle}deg`,
      filter:`drop-shadow(0 0 6px ${em.glow})`}}>{em.emoji}</div>)}
    {[0,1,2,3].map(i=><div key={i} style={{position:"absolute",
      width:40,height:60,borderRadius:8,background:em.grad,
      border:"2px solid rgba(255,255,255,0.7)",opacity:0,
      boxShadow:`0 0 20px ${em.glow}88,0 0 40px ${em.glow}44`,
      display:"flex",alignItems:"center",justifyContent:"center",
      animation:`w4card 1s cubic-bezier(.34,1.56,.64,1) ${0.1+i*0.12}s forwards`,
      "--w4ca":`${-45+i*90}deg`,"--w4cd":`${70+i*10}px`}}>
      <span style={{fontSize:14,fontWeight:900,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.6)",
        fontFamily:"Arial Black"}}>+4</span></div>)}
    <div style={{fontSize:56,fontWeight:900,position:"relative",zIndex:2,display:"flex",alignItems:"center",gap:10,
      animation:"apop 0.6s cubic-bezier(.34,1.56,.64,1)",
      filter:`drop-shadow(0 0 30px ${em.glow})`}}>
      <span style={{fontSize:44}}>{em.emoji}</span>
      <span style={{background:em.grad,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
        fontFamily:"Arial Black"}}>+4</span></div>
    <div style={{position:"absolute",marginTop:100,fontSize:22,fontWeight:900,letterSpacing:6,
      animation:"aslide 0.5s ease-out 0.3s both",zIndex:2,
      background:`linear-gradient(180deg,#fff,${em.glow})`,WebkitBackgroundClip:"text",
      WebkitTextFillColor:"transparent",backgroundClip:"text",
      textShadow:"none",filter:`drop-shadow(0 2px 8px ${em.glow}99)`}}>{em.name} DRAW FOUR!</div>
  </div>);
};

/* ═══ ELEMENT EFFECT COLORS (fire / lightning / water / wind) ═══ */
const ART_GLOW={red:"#FF7A18",yellow:"#FFD21A",blue:"#29B6F6",green:"#66BB6A"};
const ART_DARK={red:"#BF360C",yellow:"#F57F17",blue:"#01579B",green:"#1B5E20"};

/* ═══ +2 PENALTY — cards fan in the air then fly to the penalized player ═══ */
const FLY_DIR={
  down:{fy:305,fex:0,fl:"50%",ft:"87%"},
  up:{fy:-250,fex:0,fl:"50%",ft:"15%"},
  left:{fy:-60,fex:-340,fl:"12%",ft:"46%"},
  right:{fy:-60,fex:340,fl:"88%",ft:"46%"}};
const CardFlyFX=({element,count,toSelf,dir,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),2050);return()=>clearTimeout(t);},[]);
  const em=EM(element);const n=Math.min(count,8);
  const D=FLY_DIR[dir]||(toSelf?FLY_DIR.down:FLY_DIR.up);
  const cards=useMemo(()=>Array.from({length:n},(_,i)=>({id:i,
    sx:n<=1?0:-84+i*(168/(n-1)),del:i*0.28,rot:-18+Math.random()*36})),[n]);
  return(<div style={{position:"fixed",inset:0,zIndex:96,pointerEvents:"none",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
    {/* count badge rising from center */}
    <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:2,
      fontFamily:"Arial Black",fontWeight:900,fontSize:38,color:"#fff",WebkitTextStroke:`2px ${em.glow}`,
      textShadow:`0 0 18px ${em.glow},0 3px 6px rgba(0,0,0,0.6)`,opacity:0,
      animation:"apop 0.5s cubic-bezier(.34,1.56,.64,1) both"}}>+{count}</div>
    {/* landing flash where the cards enter the hand */}
    <div style={{position:"absolute",left:D.fl,top:D.ft,transform:"translate(-50%,-50%)",width:170,height:64,borderRadius:"50%",
      background:`radial-gradient(ellipse,${em.glow}dd,transparent 70%)`,mixBlendMode:"screen",opacity:0,
      filter:`blur(1px) drop-shadow(0 0 16px ${em.glow})`,animation:"landFlash 0.6s ease-out 1s both"}}/>
    {cards.map(c=><div key={c.id} style={{position:"absolute",
      "--fx":`${c.sx}px`,"--fy":`${D.fy}px`,"--fex":`${D.fex}px`,"--fr":`${c.rot}deg`,
      animation:`cardLand 1.4s cubic-bezier(.5,0,.32,1) ${c.del}s forwards`}}>
      <div style={{width:42,height:60,borderRadius:7,background:"linear-gradient(150deg,#232838,#0b0f18)",
        border:"1.5px solid rgba(255,215,0,0.5)",boxShadow:`0 6px 18px rgba(0,0,0,0.55),0 0 16px ${em.glow}66`,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:20,height:20,transform:"rotate(45deg)",borderRadius:5,border:"1.5px solid #FFD700",boxShadow:"0 0 8px rgba(255,215,0,0.4)"}}/></div>
    </div>)}
  </div>);
};

/* ═══ +4 PENALTY CINEMATIC — character card → element skill whirls the cards ═══ */
const CHIBI_DIR={
  down:{fy:330,fex:0,fl:"50%",ft:"88%"},
  up:{fy:-290,fex:0,fl:"50%",ft:"14%"},
  left:{fy:-70,fex:-360,fl:"12%",ft:"46%"},
  right:{fy:-70,fex:360,fl:"88%",ft:"46%"}};
const ChibiAttackFX=({element,victimName,count,toSelf,dir,onDone})=>{
  const[phase,setPhase]=useState(0);
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{
    const t1=setTimeout(()=>setPhase(1),750);
    const t2=setTimeout(()=>doneRef.current(),3450);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  const em0=EM(element);const em={...em0,glow:ART_GLOW[element]||em0.glow,c3:ART_DARK[element]||em0.c3};
  const rays=useMemo(()=>Array.from({length:22},(_,i)=>({id:i,a:(i/22)*360})),[element]);
  const vlines=useMemo(()=>Array.from({length:26},(_,i)=>({id:i,x:(i/26)*100,d:Math.random()*0.3,w:1+Math.random()*2})),[element]);
  const dust=useMemo(()=>Array.from({length:16},(_,i)=>({id:i,a:Math.random()*Math.PI*2,r:60+Math.random()*140,d:Math.random()*0.25,s:7+Math.random()*15})),[element]);
  const splashes=useMemo(()=>Array.from({length:11},(_,i)=>({id:i,a:Math.random()*Math.PI*2,r:95+Math.random()*115,rot:Math.random()*360,w:14+Math.random()*32,h:5+Math.random()*7,d:Math.random()*0.4})),[element]);
  const cardSplash=useMemo(()=>Array.from({length:9},(_,i)=>({id:i,a:Math.random()*Math.PI*2,r:34+Math.random()*74,rot:Math.random()*360,w:10+Math.random()*20,h:4+Math.random()*5,d:Math.random()*0.4})),[element]);
  const FXN=element==="green"?32:38;
  const fx=useMemo(()=>Array.from({length:FXN},(_,i)=>({id:i,
    x:-175+Math.random()*350,y:-140+Math.random()*280,d:Math.random()*1.2,dur:0.9+Math.random()*0.8,
    sz:12+Math.random()*20,drift:-60+Math.random()*120,rot:Math.random()*360,a:(i/FXN)*360,r:95+Math.random()*185})),[element]);
  const Splashes=()=>splashes.map(s=><div key={s.id} style={{position:"absolute",
    left:`calc(50% + ${Math.round(Math.cos(s.a)*s.r)}px)`,top:`calc(50% + ${Math.round(Math.sin(s.a)*s.r)}px)`,
    width:s.w,height:s.h,borderRadius:s.h,background:em.glow,opacity:0,transform:`rotate(${s.rot}deg)`,zIndex:2,
    filter:`drop-shadow(0 0 6px ${em.glow})`,animation:`splashPop 0.6s ease-out ${s.d}s both`}}/>);

  if(phase===0){
    /* ── PHASE 1: element energy gathers (buildup) ── */
    return(<div style={{position:"fixed",inset:0,zIndex:98,pointerEvents:"none",overflow:"hidden",
      background:"radial-gradient(circle at 50% 48%,rgba(10,14,24,0.16),rgba(0,0,0,0.34) 88%)",
      display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.2s ease-out"}}>
      {/* charging energy core */}
      <div style={{position:"absolute",width:"46vmin",height:"46vmin",borderRadius:"50%",
        background:`radial-gradient(circle,${em.glow}77,${em.glow}22 44%,transparent 70%)`,
        mixBlendMode:"screen",animation:"chargePulse 0.75s ease-out both"}}/>
      {/* converging sparks */}
      {fx.slice(0,14).map(p=><div key={p.id} style={{position:"absolute",left:"50%",top:"48%",
        width:6+p.sz%7,height:6+p.sz%7,borderRadius:"50%",background:em.glow,opacity:0,zIndex:3,
        boxShadow:`0 0 10px ${em.glow}`,
        "--sx":`${Math.round(Math.cos(p.a)*p.r*1.35)}px`,"--sy":`${Math.round(Math.sin(p.a)*p.r*1.35)}px`,
        animation:`convergeIn 0.68s ease-in ${(p.d*0.4).toFixed(2)}s forwards`}}/>)}
      {/* SHING */}
      <div style={{position:"absolute",top:"22%",zIndex:4,fontFamily:"Arial Black",fontStyle:"italic",
        fontSize:"min(34px,8vw)",fontWeight:900,color:"#fff",transform:"rotate(-6deg)",letterSpacing:2,
        WebkitTextStroke:`2px ${em.c3}`,textShadow:`0 0 16px ${em.glow},2px 2px 0 rgba(0,0,0,0.5)`,
        animation:"apop 0.4s cubic-bezier(.34,1.56,.64,1) 0.2s both"}}>SHING</div>
    </div>);
  }

  /* ── PHASE 2: element effect (particles + cards, no skill image) ── */
  return(<div style={{position:"fixed",inset:0,zIndex:98,pointerEvents:"none",overflow:"hidden",
    display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"absolute",inset:0,background:element==="yellow"?"#FFFBE6":"#fff",animation:"slashFlash 0.4s ease-out forwards"}}/>
    <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 50%,${em.glow}22,rgba(0,0,0,0.62) 76%)`,
      animation:"bgPulse 0.6s ease-out"}}/>
    {/* lightning strobe */}
    {element==="yellow"&&<div style={{position:"absolute",inset:0,background:`${em.glow}55`,mixBlendMode:"screen",
      animation:"strobeFlash 0.85s steps(1,end) forwards"}}/>}
    {/* LIGHTNING — living writhing plasma bolt */}
    {element==="yellow"&&<PlasmaBolt color={element}/>}
    {/* lightning impact flash */}
    {element==="yellow"&&<div style={{position:"absolute",left:"50%",top:"61%",transform:"translate(-50%,-50%)",zIndex:4,
      width:190,height:66,borderRadius:"50%",background:`radial-gradient(ellipse,#fff,${em.glow}cc 42%,transparent 72%)`,
      mixBlendMode:"screen",filter:`blur(1px) drop-shadow(0 0 22px ${em.glow})`,opacity:0,
      animation:"impactFlash 0.75s ease-out 0.14s both"}}/>}
    {/* FIRE — rising embers + flame licks */}
    {element==="red"&&fx.map(p=><div key={p.id} style={{position:"absolute",left:`calc(50% + ${p.x}px)`,bottom:"12%",
      width:p.sz,height:p.sz*(p.id%3?1:1.7),borderRadius:p.id%3?"50%":"50% 50% 50% 50% / 60% 60% 40% 40%",
      background:"radial-gradient(circle,#FFF3C4,#FF7A18 70%)",
      boxShadow:`0 0 16px #FF7A18`,opacity:0,"--ex":`${p.drift}px`,zIndex:3,
      animation:`emberRise ${p.dur}s ease-out ${p.d}s forwards`}}/>)}
    {/* WATER — rising bubbles + droplets */}
    {element==="blue"&&fx.map(p=><div key={p.id} style={{position:"absolute",left:`calc(50% + ${p.x}px)`,bottom:"10%",
      width:p.sz,height:p.sz,borderRadius:"50%",border:`2px solid ${em.glow}`,
      background:`radial-gradient(circle at 35% 30%,rgba(255,255,255,0.85),${em.glow}44)`,
      boxShadow:`0 0 12px ${em.glow}`,opacity:0,"--bx":`${p.drift}px`,zIndex:3,
      animation:`bubbleRise ${p.dur+0.3}s ease-in-out ${p.d}s forwards`}}/>)}
    {/* WIND — spiralling leaves */}
    {element==="green"&&fx.map(p=><div key={p.id} style={{position:"absolute",left:"50%",top:"48%",
      width:p.sz+7,height:(p.sz+7)*0.5,borderRadius:"0 50% 0 50%",background:`linear-gradient(120deg,#C5F5A8,${em.glow})`,opacity:0,
      transformOrigin:"0 0",filter:`drop-shadow(0 0 9px ${em.glow})`,"--la":`${p.a}deg`,"--lr":`${p.r}px`,zIndex:3,
      animation:`leafSpiral 1.05s ease-out ${p.d}s forwards`}}/>)}
    {/* the penalty cards — gather in the element, then fly one-by-one into the victim's hand */}
    {(()=>{const nC=Math.max(2,Math.min(count||4,8));
      const D=CHIBI_DIR[dir]||(toSelf?CHIBI_DIR.down:CHIBI_DIR.up);
      const flashDel=(0.2+(nC-1)*0.28+1.0).toFixed(2);
      return(<>
        {Array.from({length:nC}).map((_,i)=>{const ang=(i/nC)*Math.PI*2;
          return(<div key={i} style={{position:"absolute",left:"50%",top:"45%",zIndex:4,
            "--rx":`${Math.round(Math.cos(ang)*50)}px`,"--ry":`${Math.round(Math.sin(ang)*34)}px`,"--fy":`${D.fy}px`,"--fex":`${D.fex}px`,"--fr":`${-20+Math.round(Math.random()*40)}deg`,
            animation:`penaltyFling 1.9s cubic-bezier(.5,0,.32,1) ${(0.2+i*0.28).toFixed(2)}s both`}}>
            <div style={{width:36,height:52,borderRadius:6,background:CG[element]||em.grad,
              border:"2px solid rgba(255,255,255,0.9)",boxShadow:`0 4px 14px rgba(0,0,0,0.55),0 0 15px ${em.glow}aa`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:13,fontWeight:900,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.6)"}}>+4</span></div>
          </div>);})}
        <div style={{position:"absolute",left:D.fl,top:D.ft,transform:"translate(-50%,-50%)",width:180,height:66,borderRadius:"50%",
          background:`radial-gradient(ellipse,${em.glow}dd,transparent 70%)`,mixBlendMode:"screen",opacity:0,zIndex:4,
          filter:`blur(1px) drop-shadow(0 0 18px ${em.glow})`,animation:`landFlash 0.6s ease-out ${flashDel}s both`}}/>
      </>);})()}
    {victimName&&<div style={{position:"absolute",bottom:"15%",zIndex:5,
      animation:"apop 0.4s cubic-bezier(.34,1.56,.64,1) 0.28s both"}}>
      <span style={{fontSize:"min(30px,7vw)",fontWeight:900,color:"#fff",fontFamily:"Arial Black",fontStyle:"italic",letterSpacing:1,
        WebkitTextStroke:`2.5px ${em.c3}`,textShadow:`0 0 20px ${em.glow},4px 4px 0 rgba(0,0,0,0.6)`}}>💥 {victimName} +4!</span></div>}
  </div>);
};

/* ═══ DRAW 2 — MINOR ELEMENTAL ATTACK (chibi throws projectiles) ═══ */
const Draw2FX=({color,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),1300);return()=>clearTimeout(t);},[]);
  const em=EM(color);const hex=CH[color]||em.glow;
  return(<div style={{position:"fixed",inset:0,zIndex:97,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {/* two small cards tossing outward */}
      {[-1,1].map(d=><div key={d} style={{position:"absolute",width:28,height:42,borderRadius:5,
        background:CG[color]||em.grad,border:"2px solid rgba(255,255,255,0.85)",
        boxShadow:"0 3px 12px rgba(0,0,0,0.5)",
        display:"flex",alignItems:"center",justifyContent:"center",
        animation:`draw2Card${d>0?"R":"L"} 1.1s cubic-bezier(.22,1,.36,1) forwards`}}>
        <span style={{fontSize:10,fontWeight:900,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.6)"}}>+2</span></div>)}
      {/* compact +2 badge */}
      <div style={{fontSize:"min(44px,11vw)",fontWeight:900,fontFamily:"Arial Black",fontStyle:"italic",color:"#fff",
        WebkitTextStroke:`2.5px ${hex}`,textShadow:`0 0 16px ${em.glow},0 3px 8px rgba(0,0,0,0.6)`,
        animation:"draw2Pop 1.1s cubic-bezier(.34,1.56,.64,1) forwards",zIndex:2}}>+2</div>
    </div>
  </div>);
};

const DiscardAllFX=({color,count,cards:realCards,onDone})=>{
  const nCards=Math.min(realCards?.length||Math.max(count,3),12);
  const total=1100+nCards*340+1000;
  useEffect(()=>{const t=setTimeout(onDone,total);return()=>clearTimeout(t);},[onDone,total]);
  const gc=CH[color]||"#E040FB";
  // Cards start down at the player's hand and sweep up into the discard pile (screen center).
  const anim=useMemo(()=>Array.from({length:nCards},(_,i)=>({
    id:i,startX:-100+Math.random()*200,startY:250+Math.random()*90,
    rot:-30+Math.random()*60,delay:i*0.28,arc:(Math.random()<0.5?-1:1)*(70+Math.random()*70)})),[nCards]);
  return(<div style={{position:"fixed",inset:0,zIndex:95,pointerEvents:"none",
    display:"flex",alignItems:"center",justifyContent:"center",animation:`discardFade ${(total/1000).toFixed(2)}s forwards`}}>
    <div style={{position:"absolute",inset:0,
      background:`radial-gradient(circle at 50% 55%,${gc}44,transparent 60%)`,
      animation:"bgPulse 1s ease-out"}}/>
    {anim.map(c=>{const rc=realCards&&realCards[c.id];return(
      <div key={c.id} style={{position:"absolute",
        "--sx":`${c.startX}px`,"--sy":`${c.startY}px`,"--sr":`${c.rot}deg`,"--ax":`${c.arc}px`,
        filter:`drop-shadow(0 4px 16px ${gc}aa)`,
        animation:`discardArc 1.4s cubic-bezier(.45,0,.35,1) ${c.delay}s forwards`}}>
        {rc?<Card card={rc} sz="sm"/>
          :<div style={{width:44,height:66,borderRadius:7,background:CG[color],border:"2px solid rgba(255,255,255,0.6)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:20,height:20,transform:"rotate(45deg)",borderRadius:5,background:"rgba(255,255,255,0.9)"}}/></div>}
      </div>);})}
    <div style={{position:"absolute",fontSize:28,fontWeight:900,color:"#fff",letterSpacing:8,
      textShadow:`0 0 30px ${gc},0 0 60px ${gc}88,0 2px 4px rgba(0,0,0,0.9)`,
      animation:"aslide 0.5s ease-out 0.6s both",zIndex:2,
      background:`linear-gradient(180deg,#fff,${gc})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
      backgroundClip:"text"}}>DISCARD ALL!</div>
  </div>);
};

/* ═══ UNO CALL — POWER-UP AURA ═══ */
const UnoCallFX=({color,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),1500);return()=>clearTimeout(t);},[]);
  const gc=CH[color]||"#E53935";
  const rays=useMemo(()=>Array.from({length:16},(_,i)=>({id:i,a:(i/16)*360})),[]);
  return(<div style={{position:"fixed",inset:0,zIndex:99,pointerEvents:"none",
    display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"absolute",inset:0,background:`radial-gradient(circle,${gc}55 0%,${gc}22 35%,transparent 70%)`,
      animation:"unoAura 1.3s ease-out forwards"}}/>
    {[0,1,2].map(i=><div key={i} style={{position:"absolute",width:60,height:60,borderRadius:"50%",
      border:`3px solid ${gc}`,boxShadow:`0 0 25px ${gc}`,opacity:0,
      animation:`unoRing 1s ease-out ${i*0.15}s forwards`}}/>)}
    {rays.map(r=><div key={r.id} style={{position:"absolute",width:3,height:120,background:`linear-gradient(${gc},transparent)`,
      opacity:0,"--a":`${r.a}deg`,animation:`unoRayShoot 0.9s ease-out ${r.a/1500}s forwards`}}/>)}
    <div style={{position:"relative",zIndex:2,fontSize:80,fontWeight:900,fontFamily:"Arial Black",
      color:"#fff",textShadow:`0 0 40px ${gc},0 0 90px ${gc}aa`,
      animation:"unoZoomText 1.4s cubic-bezier(.34,1.56,.64,1) forwards"}}>UNO!</div>
  </div>);
};

/* ═══ UNO CALL PENALTY — CAUGHT OFF GUARD ═══ */
const UnoPenaltyFX=({victimName,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),2000);return()=>clearTimeout(t);},[]);
  const rings=useMemo(()=>Array.from({length:14},(_,i)=>({id:i,a:(i/14)*360,d:i*0.02})),[]);
  return(<div style={{position:"fixed",inset:0,zIndex:98,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 45%,rgba(255,82,82,0.2),transparent 60%)",animation:"bgPulse 0.6s ease-out"}}/>
    {/* red impact spikes */}
    <div style={{position:"absolute",left:"50%",top:"45%",width:0,height:0}}>
      {rings.map(r=><div key={r.id} style={{position:"absolute",left:0,top:0,width:"34vmax",height:r.id%2?2:4,
        background:"linear-gradient(90deg,#FF5252,transparent 75%)",transformOrigin:"0 50%","--a":`${r.a}deg`,opacity:0,
        animation:`mangaBurst 0.5s ease-out ${r.d}s forwards`}}/>)}
    </div>
    {/* PENALTY stamp */}
    <div style={{position:"relative",transform:"rotate(-9deg)",zIndex:3,
      animation:"stampSlam 0.45s cubic-bezier(.34,1.56,.64,1) both"}}>
      <div style={{border:"5px solid #FF5252",borderRadius:14,padding:"4px 26px",background:"rgba(120,0,0,0.35)",
        boxShadow:"0 0 34px rgba(255,82,82,0.55),inset 0 0 14px rgba(255,82,82,0.25)"}}>
        <div style={{fontSize:"min(42px,9.5vw)",fontWeight:900,fontFamily:"Arial Black",color:"#fff",letterSpacing:3,
          textShadow:"0 0 18px rgba(255,82,82,0.9),0 3px 6px rgba(0,0,0,0.7)"}}>PENALTY!</div>
      </div>
    </div>
    {/* two penalty cards dropping onto the victim */}
    {[-1,1].map(d=><div key={d} style={{position:"absolute",top:"18%",left:`calc(50% + ${d*34}px)`,
      width:36,height:52,borderRadius:6,background:"linear-gradient(145deg,#E53935,#B71C1C)",border:"2px solid #fff",
      boxShadow:"0 4px 14px rgba(0,0,0,0.5)",opacity:0,zIndex:2,
      display:"flex",alignItems:"center",justifyContent:"center",
      animation:`penaltyDrop 0.8s ease-in ${0.15+(d>0?0.12:0)}s forwards`}}>
      <span style={{fontSize:13,fontWeight:900,color:"#fff"}}>+2</span></div>)}
    {victimName&&<div style={{position:"absolute",bottom:"30%",zIndex:3,
      animation:"apop 0.4s cubic-bezier(.34,1.56,.64,1) 0.3s both"}}>
      <span style={{fontSize:"min(24px,6vw)",fontWeight:900,color:"#FFD54F",fontFamily:"Arial Black",fontStyle:"italic",letterSpacing:1,
        WebkitTextStroke:"2px #7a1010",textShadow:"0 0 16px rgba(255,82,82,0.8),0 3px 6px rgba(0,0,0,0.7)"}}>😵 {victimName} +2</span></div>}
  </div>);
};

/* ═══ REVERSE — TIME REWIND ═══ */
const ReverseFX=({color,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),1600);return()=>clearTimeout(t);},[]);
  const gc=CH[color]||"#1E88E5";
  const lines=useMemo(()=>Array.from({length:18},(_,i)=>({id:i,a:(i/18)*360,del:Math.random()*0.2})),[]);
  return(<div style={{position:"fixed",inset:0,zIndex:97,pointerEvents:"none",
    display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"absolute",inset:0,background:`radial-gradient(circle,${gc}33,transparent 65%)`,animation:"bgPulse 0.6s ease-out"}}/>
    {lines.map(l=><div key={l.id} style={{position:"absolute",width:2,height:"60%",background:`linear-gradient(${gc},transparent)`,
      opacity:0,"--a":`${l.a}deg`,animation:`speedLine 0.7s ease-out ${l.del}s forwards`}}/>)}
    <div style={{position:"relative",width:90,height:90,borderRadius:"50%",border:`4px solid ${gc}`,
      boxShadow:`0 0 30px ${gc}88`,background:"rgba(10,15,20,0.8)",
      animation:"clockSpinBack 1.1s cubic-bezier(.36,0,.66,1) forwards"}}>
      <div style={{position:"absolute",left:"50%",top:"50%",width:3,height:30,background:"#fff",
        transformOrigin:"bottom",transform:"translate(-50%,-100%) rotate(0deg)",borderRadius:2}}/>
      <div style={{position:"absolute",left:"50%",top:"50%",width:3,height:22,background:gc,
        transformOrigin:"bottom",transform:"translate(-50%,-100%) rotate(90deg)",borderRadius:2}}/>
    </div>
    <div style={{position:"absolute",fontSize:44,fontWeight:900,color:"#fff",zIndex:2,
      textShadow:`0 0 20px ${gc}`,animation:"arrowFlip 0.8s ease-in-out 0.2s both"}}>⇄</div>
    <div style={{position:"absolute",marginTop:110,fontSize:22,fontWeight:900,letterSpacing:6,zIndex:2,
      background:`linear-gradient(180deg,#fff,${gc})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
      backgroundClip:"text",animation:"aslide 0.4s ease-out 0.3s both"}}>REVERSE!</div>
  </div>);
};

/* ═══ SKIP — DODGE / VANISH ═══ */
const SkipFX=({color,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),1500);return()=>clearTimeout(t);},[]);
  const gc=CH[color]||"#E53935";
  return(<div style={{position:"fixed",inset:0,zIndex:97,pointerEvents:"none",
    display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"absolute",width:160,height:160,borderRadius:"50%",border:`6px solid ${gc}`,
      opacity:0,animation:"sealedPulse 1s ease-out forwards",boxShadow:`0 0 40px ${gc}aa inset,0 0 30px ${gc}88`}}/>
    <div style={{position:"absolute",width:170,height:8,background:gc,borderRadius:4,transform:"rotate(45deg)",
      opacity:0,animation:"sealedPulse 1s ease-out 0.05s forwards"}}/>
    <div style={{position:"absolute",fontSize:60,filter:`drop-shadow(0 0 20px ${gc})`,
      animation:"dodgeOut 0.6s ease-in forwards"}}>💨</div>
    <div style={{position:"absolute",marginTop:110,fontSize:22,fontWeight:900,letterSpacing:8,zIndex:2,
      color:"#fff",textShadow:`0 0 20px ${gc},0 2px 4px rgba(0,0,0,0.9)`,
      animation:"aslide 0.4s ease-out 0.15s both"}}>SEALED!</div>
  </div>);
};


const ChallengeModal=({playerName,onChallenge,onAccept})=>(
  <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:90,display:"flex",justifyContent:"center",
    padding:"0 8px 12px",pointerEvents:"none"}}>
    <div style={{pointerEvents:"auto",width:"100%",maxWidth:440,animation:"slideUp 0.25s ease-out",
      background:"linear-gradient(160deg,rgba(44,18,64,0.96),rgba(12,10,26,0.96))",borderRadius:16,padding:"12px 14px",
      border:"1px solid rgba(156,39,176,0.6)",boxShadow:"0 -8px 34px rgba(142,36,170,0.35),0 8px 30px rgba(0,0,0,0.5)"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
        <div style={{flexShrink:0,width:40,height:58,borderRadius:9,background:"conic-gradient(from 40deg,#ED1C24,#FFDE00,#00A651,#0956BF,#ED1C24)",
          display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #fff",boxShadow:"0 0 20px rgba(156,39,176,0.6)"}}>
          <div style={{background:"rgba(0,0,0,0.58)",borderRadius:6,padding:"4px 6px"}}>
            <span style={{fontSize:17,fontWeight:900,color:"#fff",fontFamily:"Arial Black,sans-serif"}}>+4</span></div></div>
        <div style={{minWidth:0}}>
          <div style={{color:"#fff",fontSize:14,fontWeight:800,lineHeight:1.25}}><span style={{color:"#E040FB"}}>{playerName}</span> hit you with a Wild +4!</div>
          <div style={{color:"#aab",fontSize:10,lineHeight:1.4,marginTop:2}}>Fair only if they held <b style={{color:"#eee"}}>no {""}current-color</b> card. Bluff? Call it.</div>
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onChallenge} style={{...MBTN,flex:1,padding:"10px 8px",background:"linear-gradient(135deg,#9C27B0,#5E1770)",
          boxShadow:"0 4px 18px rgba(142,36,170,0.45)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,animation:"pulse 1.4s infinite"}}>
          <span style={{fontSize:13,letterSpacing:1}}>⚖️ CHALLENGE</span>
          <span style={{fontSize:7.5,opacity:0.9,fontWeight:600,letterSpacing:0,textTransform:"none"}}>bluffed → they +4 · fair → you +6</span></button>
        <button onClick={onAccept} style={{...MBTN,flex:1,padding:"10px 8px",background:"rgba(255,255,255,0.07)",
          border:"1px solid rgba(255,255,255,0.14)",color:"#ccc",display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
          <span style={{fontSize:13,letterSpacing:1}}>🃏 ACCEPT</span>
          <span style={{fontSize:7.5,opacity:0.75,fontWeight:600,letterSpacing:0,textTransform:"none"}}>take the 4 cards</span></button>
      </div>
    </div>
  </div>);

const CWheel=({onPick,onCancel})=>{
  const[h,setH]=useState(null);
  return(<div style={{position:"fixed",inset:0,zIndex:200,
    background:"linear-gradient(180deg,rgba(4,8,10,0.9) 44%,rgba(4,8,10,0.55) 64%,transparent 80%)",
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",gap:14,
    paddingTop:"7vh",animation:"fadeIn 0.2s ease-out"}}>
    <div style={{color:"#fff",fontSize:22,fontWeight:800,letterSpacing:4,textShadow:"0 2px 10px #000"}}>Choose Color</div>
    <div style={{color:"#9fb",fontSize:10,letterSpacing:2,marginTop:-8}}>(your cards are shown below)</div>
    <div style={{position:"relative",width:220,height:220}}>
      {COLORS.map((c,i)=>{const a=(i*90-45)*Math.PI/180;const x=110+Math.cos(a)*64-40;const y=110+Math.sin(a)*64-40;
        return(<div key={c} onClick={()=>{sfx.p("sparkle");onPick(c);}}
          onPointerEnter={()=>setH(c)} onPointerLeave={()=>setH(null)}
          style={{position:"absolute",left:x,top:y,width:80,height:80,borderRadius:"50%",
            background:CG[c],cursor:"pointer",
            border:h===c?"3px solid #fff":"2px solid rgba(255,255,255,0.25)",
            display:"flex",alignItems:"center",justifyContent:"center",
            transform:h===c?"scale(1.2)":"scale(1)",transition:"all 0.3s cubic-bezier(.34,1.56,.64,1)",
            boxShadow:h===c?`0 0 40px ${CH[c]},0 0 80px ${CH[c]}55`:`0 5px 20px rgba(0,0,0,0.5)`}}>
          <span style={{fontSize:12,fontWeight:800,color:c==="yellow"?"#333":"#fff",textTransform:"uppercase",
            letterSpacing:1}}>{c}</span></div>);})}
    </div>
    {onCancel&&<button onClick={onCancel} style={{marginTop:4,padding:"8px 28px",borderRadius:12,border:"1px solid rgba(255,255,255,0.15)",
      background:"rgba(255,255,255,0.06)",color:"#999",fontSize:12,fontWeight:700,cursor:"pointer",
      letterSpacing:3,transition:"all 0.2s"}}
      onPointerEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.12)";e.currentTarget.style.color="#fff";}}
      onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="#999";}}>
      CANCEL</button>}
  </div>);
};

function calcScore(hands,winnerId){let total=0;
  for(const[pid,hand]of Object.entries(hands)){if(pid===winnerId)continue;
    for(const c of hand){if(c.type==="wild")total+=50;else if(c.value==="shadow")total+=40;else if(c.value==="snatch")total+=35;else if(c.value==="discardAll")total+=30;else if(c.type==="action")total+=20;else total+=parseInt(c.value)||0;}}
  return total;}

/* Original green loop spinner (two chasing arrows) — used on the connecting screen. */
const LoopSpinner=({size=78})=>(
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"
    style={{animation:"sCW 1.05s linear infinite",filter:"drop-shadow(0 0 9px rgba(62,230,140,0.5))"}}>
    <defs><linearGradient id="loopGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#6BF2B0"/><stop offset="100%" stopColor="#15B082"/></linearGradient></defs>
    <path d="M 80 30 A 37 37 0 0 1 72 80" fill="none" stroke="url(#loopGrad)" strokeWidth="9" strokeLinecap="round"/>
    <path d="M 72 80 l 14 -1 l -8 13 z" fill="url(#loopGrad)"/>
    <path d="M 20 70 A 37 37 0 0 1 28 20" fill="none" stroke="url(#loopGrad)" strokeWidth="9" strokeLinecap="round"/>
    <path d="M 28 20 l -14 1 l 8 -13 z" fill="url(#loopGrad)"/>
  </svg>
);

/* ═══ CONFETTI — victory celebration ═══ */
const ConfettiFX=()=>{
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current;if(!cv)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const W=cv.width=Math.round(window.innerWidth*dpr),H=cv.height=Math.round(window.innerHeight*dpr);
    const ctx=cv.getContext("2d");
    const cols=["#FFD700","#FF5252","#4CAF50","#29B6F6","#E040FB","#FFEB3B","#FF9800"];
    const P=Array.from({length:150},()=>({
      x:Math.random()*W,y:-Math.random()*H,vx:(Math.random()-0.5)*3*dpr,vy:(2+Math.random()*4)*dpr,
      w:(6+Math.random()*7)*dpr,h:(9+Math.random()*9)*dpr,rot:Math.random()*Math.PI*2,vr:(Math.random()-0.5)*0.3,
      col:cols[Math.floor(Math.random()*cols.length)],sway:Math.random()*Math.PI*2,flat:Math.random()<0.5}));
    let raf;
    const anim=()=>{
      ctx.clearRect(0,0,W,H);
      P.forEach(p=>{p.sway+=0.05;p.x+=p.vx+Math.sin(p.sway)*1.3*dpr;p.y+=p.vy;p.rot+=p.vr;
        if(p.y>H+30*dpr){p.y=-30*dpr;p.x=Math.random()*W;}
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
        ctx.fillStyle=p.col;ctx.globalAlpha=0.92;
        const sw=p.flat?p.w:p.w*Math.abs(Math.cos(p.sway));
        ctx.fillRect(-sw/2,-p.h/2,sw,p.h);ctx.restore();});
      raf=requestAnimationFrame(anim);
    };
    anim();return()=>cancelAnimationFrame(raf);
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:151}}/>;
};

/* ═══ MAIN GAME ═══ */
export default function UnoGame(){
  const pid=useRef(gpid()).current;
  const[scr,setScr]=useState("menu");
  const[pName,setPName]=useState(localStorage.getItem("uno_name")||"");
  const[rc,setRc]=useState("");const[jc,setJc]=useState("");const[err,setErr]=useState("");
  const[isAdm,setIsAdm]=useState(false);const[admP,setAdmP]=useState("");const[showAdm,setShowAdm]=useState(false);
  const[admTgt,setAdmTgt]=useState("");const[admPts,setAdmPts]=useState("100");const[admMsg,setAdmMsg]=useState("");
  const admTap=useRef({n:0,t:0});
  const logoTap=()=>{const now=Date.now();const s=admTap.current;s.n=(now-s.t<1500)?s.n+1:1;s.t=now;if(s.n>=5){s.n=0;setShowAdm(true);}};
  const[peek,setPeek]=useState(false);const[pickDr,setPickDr]=useState(false);
  const[throwPick,setThrowPick]=useState(null); // opponent id whose throwable-picker is open
  const menuBg=useMemo(()=>GAME_BGS[Math.floor(Math.random()*GAME_BGS.length)],[]); // vibrant menu backdrop, random each visit
  const[swap,setSwap]=useState(false);const[swpC,setSwpC]=useState(null);const[showDk,setShowDk]=useState(false);
  const isLandscape=useLandscape();
  const[rd,setRd]=useState(null);const[pickCol,setPickCol]=useState(false);const[pendW,setPendW]=useState(null);
  const[lMsg,setLMsg]=useState("");const[snd,setSnd]=useState(true);const[mus,setMus]=useState(false);
  const[musVol,setMusVol]=useState(()=>{const v=parseFloat(localStorage.getItem("uno_musvol"));return isNaN(v)?0.32:v;});
  const[sfxVol,setSfxVol]=useState(()=>{const v=parseFloat(localStorage.getItem("uno_sfxvol"));return isNaN(v)?1:v;});
  const[showAudio,setShowAudio]=useState(false);
  useEffect(()=>{bgm.setVol(musVol);localStorage.setItem("uno_musvol",String(musVol));},[musVol]);
  useEffect(()=>{sfx.setVol(sfxVol);localStorage.setItem("uno_sfxvol",String(sfxVol));},[sfxVol]);
  const[sel,setSel]=useState(-1);const[cAn,setCAn]=useState(null);const[actFx,setActFx]=useState(null);
  const[drawnCard,setDrawnCard]=useState(null);const[hasDrawn,setHasDrawn]=useState(false);
  const[challenge,setChallenge]=useState(null);
  const[burstColor,setBurstColor]=useState(null);
  const[impactColor,setImpactColor]=useState(null);
  const[lightningColor,setLightningColor]=useState(null);
  const[screenShake,setScreenShake]=useState(false);
  const[turnTimer,setTurnTimer]=useState(TURN_TIME);
  const[showLB,setShowLB]=useState(false);
  const[discardFx,setDiscardFx]=useState(null);
  const[globalLB,setGlobalLB]=useState([]);
  const[myStats,setMyStats]=useState(null);
  const[showGlobalLB,setShowGlobalLB]=useState(false);
  const[placed,setPlaced]=useState(null);const placedRef=useRef(null);
  const[statsView,setStatsView]=useState(null);
  const[storeOpen,setStoreOpen]=useState(false);
  const[coins,setCoins]=useState(getCoins);
  const[owned,setOwned]=useState(getOwned);
  const[myAvatar,setMyAvatar]=useState(getMyAvatar);
  const[myThrow,setMyThrow]=useState(getMyThrow);
  const[myPhoto,setMyPhotoState]=useState(getMyPhoto);   // uploaded profile photo (data URL)
  const[myFlags,setMyFlagsState]=useState(getMyFlags);   // up to 2 country codes
  const[flagEdit,setFlagEdit]=useState(false);const[flagSearch,setFlagSearch]=useState("");
  const[throwAnim,setThrowAnim]=useState(null);
  const[splatFx,setSplatFx]=useState(null);
  const[hitFx,setHitFx]=useState({});
  const oppRefs=useRef({});const throwCD=useRef(0);const prevThrow=useRef(0);
  const[snatchModal,setSnatchModal]=useState(null);
  const[wild4Fx,setWild4Fx]=useState(null);
  const[chibiAttackFx,setChibiAttackFx]=useState(null);
  const[cardFlyFx,setCardFlyFx]=useState(null);
  const[dealFx,setDealFx]=useState(null);
  const[draw2Fx,setDraw2Fx]=useState(null);
  const[reverseFx,setReverseFx]=useState(null);
  const[skipFx,setSkipFx]=useState(null);
  const[unoCallFx,setUnoCallFx]=useState(null);
  const[unoPenaltyFx,setUnoPenaltyFx]=useState(null);
  const[timeoutFx,setTimeoutFx]=useState(null);
  const[showWin,setShowWin]=useState(false);
  const[turnFx,setTurnFx]=useState(null);
  const[showAccount,setShowAccount]=useState(false);
  const[restoreId,setRestoreId]=useState("");
  const[restoreMsg,setRestoreMsg]=useState("");
  const[accounts,setAccounts]=useState(getAccounts());
  const[delAcc,setDelAcc]=useState(null);const[delText,setDelText]=useState("");
  const[emoteTray,setEmoteTray]=useState(false);const[emoteCD,setEmoteCD]=useState(false);const[activeEmote,setActiveEmote]=useState(null);
  const prevEmoteTs=useRef(0);
  const[friends,setFriends]=useState({});
  const[friendReqs,setFriendReqs]=useState({});
  const[gameInvites,setGameInvites]=useState({});
  const[showFriends,setShowFriends]=useState(false);
  const[friendIdInput,setFriendIdInput]=useState("");
  const[friendMsg,setFriendMsg]=useState("");
  const[delFriendId,setDelFriendId]=useState(null);
  const[showInvite,setShowInvite]=useState(false);
  const[inviteSel,setInviteSel]=useState({});
  const[settings,setSettings]=useState(DEF_SETTINGS);
  const[showSettings,setShowSettings]=useState(false);
  const[autoStart,setAutoStart]=useState(false);
  const[roundTimer,setRoundTimer]=useState(ROUND_TIME);
  const prevT=useRef(null);const prevM=useRef("");const lbUpdated=useRef(false);const unoSndRef=useRef(0);const discardFxRef=useRef(0);

  useEffect(()=>{
    if(pName)localStorage.setItem("uno_name",pName);
    registerAccount(pid,pName);setAccounts(getAccounts());
    const nm=pName.trim();if(!nm)return;
    // Keep the rankings/stats display name in sync after a rename (debounced).
    const t=setTimeout(()=>{get(ref(db,"leaderboard/"+pid)).then(s=>{if(s.exists())update(ref(db,"leaderboard/"+pid),{name:nm});}).catch(()=>{});},800);
    return()=>clearTimeout(t);
  },[pName,pid]);

  useEffect(()=>{
    const lbRef=ref(db,"leaderboard");
    const u=onValue(lbRef,s=>{const d=s.val();if(!d){setGlobalLB([]);setMyStats(null);return;}
      // Robust ordering: coerce to numbers (migrated/partial rows can lack totalPoints, and
      // undefined-undefined = NaN scrambles the sort). Ranked players (10+ games) rank above
      // players still in placement; then by points.
      const arr=Object.entries(d).map(([id,v])=>({id,...v})).sort((a,b)=>{
        const ra=(+a.gamesPlayed||0)>=10,rb=(+b.gamesPlayed||0)>=10;
        if(ra!==rb)return ra?-1:1;
        return (+b.totalPoints||0)-(+a.totalPoints||0);});
      setGlobalLB(arr);
      const me=d[pid];if(me){setMyStats(me);
        // Merge server-side cosmetics (authoritative across devices) into local state.
        if(typeof me.coins==="number"){setCoins(me.coins);localStorage.setItem("uno_coins",String(me.coins));}
        if(Array.isArray(me.owned)){const merged=[...new Set([...DEFAULT_OWNED,...me.owned])];setOwned(merged);localStorage.setItem("uno_owned",JSON.stringify(merged));}
        if(me.avatar&&(AV_MAP[me.avatar]||me.avatar==="photo")){setMyAvatar(me.avatar);localStorage.setItem("uno_avatar",me.avatar);}
        if(me.photo){setMyPhotoState(me.photo);localStorage.setItem("uno_photo",me.photo);}
        if(Array.isArray(me.flags)){setMyFlagsState(me.flags.slice(0,2));localStorage.setItem("uno_flags",JSON.stringify(me.flags.slice(0,2)));}
      }});
    return()=>off(lbRef);
  },[pid]);

  /* Calibration reveal: fire once when a player crosses their 10th game (placement done),
     showing the rank they've been calibrated into. Ignores the initial load. */
  useEffect(()=>{
    if(!myStats)return;const g=myStats.gamesPlayed||0;
    if(placedRef.current===null){placedRef.current=g;return;}
    if(placedRef.current<10&&g>=10){setPlaced(getRank(myStats.totalPoints||0,g));}
    placedRef.current=g;
  },[myStats?.gamesPlayed,myStats?.totalPoints]);

  /* Ensure this account has a leaderboard node carrying cosmetics (so avatar shows
     to others and coins/unlocks survive across devices). Runs once name is known. */
  const cosmSeeded=useRef(false);
  useEffect(()=>{if(cosmSeeded.current)return;cosmSeeded.current=true;
    get(ref(db,"leaderboard/"+pid)).then(s=>{const v=s.val()||{};const patch={};
      if(!Array.isArray(v.owned))patch.owned=owned;
      if(!v.avatar)patch.avatar=myAvatar;
      /* One-time coin grant (coinMig flag prevents re-granting). Everyone gets a
         100-coin welcome plus up to 400 more scaled off points already earned, so
         longtime players who racked up ranking points aren't stuck at zero coins. */
      if(!v.coinMig){
        const base=typeof v.coins==="number"?v.coins:coins;
        const grant=100+Math.min(400,Math.floor((v.totalPoints||0)/20));
        patch.coins=base+grant;patch.coinMig=1;
      }else if(typeof v.coins!=="number")patch.coins=coins;
      if(Object.keys(patch).length)update(ref(db,"leaderboard/"+pid),patch).catch(()=>{});
    }).catch(()=>{});
  },[pid]);

  const buyItem=useCallback((it)=>{if(owned.includes(it.id))return;
    if(!isAdm&&coins<it.price)return;
    const nc=isAdm?coins:coins-it.price,no=[...new Set([...owned,it.id])];
    setCoins(nc);setOwned(no);ps("win");
    localStorage.setItem("uno_coins",String(nc));localStorage.setItem("uno_owned",JSON.stringify(no));
    update(ref(db,"leaderboard/"+pid),{coins:nc,owned:no}).catch(()=>{});
  },[owned,coins,pid,isAdm]);

  const equipAvatar=useCallback((id)=>{if(id!=="photo"&&!owned.includes(id))return;setMyAvatar(id);
    localStorage.setItem("uno_avatar",id);
    update(ref(db,"leaderboard/"+pid),{avatar:id}).catch(()=>{});
    if(rc)update(ref(db,"rooms/"+rc+"/players/"+pid),{avatar:id}).catch(()=>{});
  },[owned,pid,rc]);

  /* Save an uploaded profile photo (also equips it as the avatar). Stored on the
     leaderboard/room node so it shows to others; free. */
  const setMyPhoto=useCallback((dataUrl)=>{setMyPhotoState(dataUrl||"");
    if(dataUrl){localStorage.setItem("uno_photo",dataUrl);setMyAvatar("photo");localStorage.setItem("uno_avatar","photo");}
    else localStorage.removeItem("uno_photo");
    const patch=dataUrl?{photo:dataUrl,avatar:"photo"}:{photo:null};
    update(ref(db,"leaderboard/"+pid),patch).catch(()=>{});
    if(rc)update(ref(db,"rooms/"+rc+"/players/"+pid),patch).catch(()=>{});
  },[pid,rc]);
  const setMyFlags=useCallback((flags)=>{const f=(flags||[]).slice(0,2);setMyFlagsState(f);
    localStorage.setItem("uno_flags",JSON.stringify(f));
    update(ref(db,"leaderboard/"+pid),{flags:f}).catch(()=>{});
    if(rc)update(ref(db,"rooms/"+rc+"/players/"+pid),{flags:f}).catch(()=>{});
  },[pid,rc]);

  const equipThrow=useCallback((id)=>{if(!owned.includes(id))return;setMyThrow(id);localStorage.setItem("uno_throw",id);},[owned]);

  /* ── THROW ITEMS: tap an opponent → fling your equipped item at them. Broadcast
     via the room game node so every client plays the same arc + hit reaction. ── */
  const throwAt=useCallback((targetId,itemId)=>{
    if(!targetId||targetId===pid)return;const now=Date.now();
    if(now<throwCD.current)return;throwCD.current=now+1400;ua();
    update(ref(db,"rooms/"+rc+"/game"),{throw:{from:pid,to:targetId,item:itemId||myThrow,ts:now}}).catch(()=>{});
  },[rc,pid,myThrow]);
  const runThrow=useCallback((t)=>{
    // Self has no opponent-card element; land the splat in the open zone above the
    // hand (not on top of the player's cards).
    const anchor=id=>{const el=oppRefs.current[id];if(el){const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2];}
      return[window.innerWidth/2,Math.round(window.innerHeight*0.66)];};
    const[sx,sy]=anchor(t.from);const[tx,ty]=anchor(t.to);const item=throwOf(t.item);
    setThrowAnim({item,sx,sy,tx,ty,key:t.ts});
    setTimeout(()=>{
      setThrowAnim(a=>a&&a.key===t.ts?null:a);
      setHitFx(h=>({...h,[t.to]:t.ts}));setSplatFx({item,tx,ty,key:t.ts});
      if(snd){if(!sfx.playThrow(item.id))sfx.p("action");}
      if(t.to===pid){setScreenShake(true);setTimeout(()=>setScreenShake(false),480);}
      setTimeout(()=>{setHitFx(h=>{const n={...h};if(n[t.to]===t.ts)delete n[t.to];return n;});
        setSplatFx(s=>s&&s.key===t.ts?null:s);},1400);
    },900);
  },[pid,snd]);

  /* ── Friends / requests / game invites (all keyed by this player's id) ── */
  useEffect(()=>{
    const fRef=ref(db,"friends/"+pid),rRef=ref(db,"freq/"+pid),iRef=ref(db,"ginv/"+pid);
    const u1=onValue(fRef,s=>setFriends(s.val()||{}));
    const u2=onValue(rRef,s=>setFriendReqs(s.val()||{}));
    const u3=onValue(iRef,s=>{const d=s.val()||{};const now=Date.now();const fresh={};
      Object.entries(d).forEach(([k,v])=>{if(v&&now-(v.ts||0)<180000)fresh[k]=v;else remove(ref(db,"ginv/"+pid+"/"+k)).catch(()=>{});});
      setGameInvites(fresh);});
    return()=>{off(fRef);off(rRef);off(iRef);};
  },[pid]);
  const sendFriendReq=async()=>{const fid=friendIdInput.trim().toLowerCase();
    if(!fid){setFriendMsg("Enter a Player ID");return;}
    if(fid===pid){setFriendMsg("That's your own ID");return;}
    if(friends[fid]){setFriendMsg("Already friends");return;}
    try{const snap=await get(ref(db,"leaderboard/"+fid));
      if(!snap.exists()){setFriendMsg("No player with that ID");return;}
      await set(ref(db,"freq/"+fid+"/"+pid),{name:pName.trim()||"Player",ts:Date.now()});
      setFriendMsg("Request sent to "+(snap.val().name||"player")+"!");setFriendIdInput("");
    }catch(e){setFriendMsg("Failed — try again");}};
  const acceptFriendReq=async(fromId,name)=>{
    await set(ref(db,"friends/"+pid+"/"+fromId),{name:name||"Player",ts:Date.now()});
    await set(ref(db,"friends/"+fromId+"/"+pid),{name:pName.trim()||"Player",ts:Date.now()});
    await remove(ref(db,"freq/"+pid+"/"+fromId));};
  const declineFriendReq=async(fromId)=>{await remove(ref(db,"freq/"+pid+"/"+fromId));};
  const removeFriend=async(fid)=>{await remove(ref(db,"friends/"+pid+"/"+fid));await remove(ref(db,"friends/"+fid+"/"+pid));};
  const inviteFriend=async(fid)=>{if(!rc)return;
    await set(ref(db,"ginv/"+fid+"/"+pid),{name:pName.trim()||"Player",code:rc,ts:Date.now()});
    setFriendMsg("Invite sent!");setTimeout(()=>setFriendMsg(""),1500);};
  const acceptInvite=async(fromId,code)=>{await remove(ref(db,"ginv/"+pid+"/"+fromId));setShowFriends(false);joinRoom(code);};
  const ps=useCallback(t=>{if(snd)sfx.p(t);},[snd]);
  const psE=useCallback(c=>{if(snd)sfx.pEl(c);},[snd]);
  // Play a sound once per card, staggered — so penalty/draw sounds land WITH each card
  // instead of one blip. Returns the timers so callers can clear them on cleanup.
  const psSeq=useCallback((type,count,startMs,gapMs)=>{if(!snd)return[];const ts=[];
    for(let i=0;i<Math.max(1,count);i++)ts.push(setTimeout(()=>sfx.p(type),startMs+i*gapMs));return ts;},[snd]);
  /* ADMIN: grant/deduct leaderboard points or coins for any account. Writes straight
     to the leaderboard node; self-changes sync back through the leaderboard listener. */
  const adminGrant=useCallback(async(targetId,field,delta)=>{
    if(!isAdm||!targetId||!delta)return;
    try{
      const snap=await get(ref(db,"leaderboard/"+targetId));const v=snap.val()||{};
      const next=Math.max(0,(v[field]||0)+delta);
      await update(ref(db,"leaderboard/"+targetId),{[field]:next,name:v.name||rd?.players?.[targetId]?.name||"Player",since:v.since||Date.now()});
      ps(delta>=0?"win":"error");
      setAdmMsg(`${delta>=0?"+":""}${delta} ${field==="coins"?"coins":"pts"} → ${next}`);
      setTimeout(()=>setAdmMsg(""),2200);
    }catch(e){setAdmMsg("Failed");setTimeout(()=>setAdmMsg(""),2000);}
  },[isAdm,rd,ps]);
  const trigShake=useCallback(()=>{setScreenShake(true);setTimeout(()=>setScreenShake(false),400);},[]);
  const trigBurst=useCallback(c=>{setBurstColor(c);setTimeout(()=>setBurstColor(null),1500);},[]);
  const trigImpact=useCallback(c=>{setImpactColor(c);setTimeout(()=>setImpactColor(null),600);},[]);
  const trigLightning=useCallback(c=>{setLightningColor(c);setTimeout(()=>setLightningColor(null),1500);},[]);

  useEffect(()=>{bgm.preload();},[]);
  useEffect(()=>{if(sfx.c){sfx.loadEmotes();sfx.loadSfxFiles();sfx.loadThrowables();}});
  const sendEmote=useCallback(async(emoteId)=>{
    if(emoteCD||!rc)return;setEmoteTray(false);setEmoteCD(true);
    try{await update(ref(db,"rooms/"+rc+"/game"),{emote:{pid,id:emoteId,ts:Date.now()}});}catch(e){}
    setTimeout(()=>setEmoteCD(false),3000);
  },[rc,emoteCD,pid]);

  useEffect(()=>{if(!rc)return;const r=ref(db,"rooms/"+rc);
    const u=onValue(r,s=>{const d=s.val();if(d){setRd(d);if(d.settings)setSettings({...DEF_SETTINGS,...d.settings});}else{setRd(null);setScr("menu");setErr("Room closed");}});
    return()=>off(r);},[rc]);

  const pls=rd?.players?Object.entries(rd.players).sort((a,b)=>a[1].order-b[1].order):[];
  const po=pls.map(([id])=>id);const isHost=rd?.host===pid;
  const g=rd?.game||null;const myH=g?.hands?.[pid]||[];
  useEffect(()=>{const t=g?.throw;if(!t||!t.ts||t.ts<=prevThrow.current)return;
    if(Date.now()-t.ts>8000){prevThrow.current=t.ts;return;} // ignore stale on late join
    prevThrow.current=t.ts;runThrow(t);},[g?.throw,runThrow]);
  // Detect newly-arrived cards (draws/penalties) so they can slide in smoothly.
  const prevHandIds=useRef(new Set());
  const initialDeal=prevHandIds.current.size===0;
  const newOrder=useMemo(()=>{const m={};let k=0;
    myH.forEach(c=>{if(!prevHandIds.current.has(c.id))m[c.id]=k++;});return m;},[myH]);
  useEffect(()=>{prevHandIds.current=new Set(myH.map(c=>c.id));},[myH]);
  // Game-start deal: one card-sound per dealt card, paced to the cardDeal stagger (0.28s) so
  // the audio tracks the cards fanning out. Fires once per game; resets when the hand empties.
  const dealtRef=useRef(false);
  useEffect(()=>{
    if(initialDeal&&myH.length>1&&!dealtRef.current){dealtRef.current=true;const seq=psSeq("carddist",myH.length,300,280);return()=>seq.forEach(clearTimeout);}
    if(myH.length===0)dealtRef.current=false;
  },[initialDeal,myH.length,psSeq]);
  /* Game-start deal-around: fly card-backs from the table center out to each opponent
     seat, round-robin for `startCards` rounds (own hand fans in on its own). */
  const dealAnimRef=useRef(false);
  useEffect(()=>{
    if(!g||g.winner){if(myH.length===0)dealAnimRef.current=false;return;}
    if(!(initialDeal&&myH.length>1&&!dealAnimRef.current))return;
    dealAnimRef.current=true;
    const rounds=Math.max(1,Math.min(myH.length,10));
    const t=setTimeout(()=>{
      const W=window.innerWidth,H=window.innerHeight,ox=W/2,oy=Math.round(H*0.44);
      const mi=po.indexOf(pid);
      const opp=mi<0?po.filter(id=>id!==pid):[...po.slice(mi+1),...po.slice(0,mi)];
      // Deal to every seat INCLUDING yourself (cards visibly fly down to your hand too).
      const seats=[...opp,pid];
      if(!seats.length)return;
      const tgt=id=>{if(id===pid)return[W/2,Math.round(H*0.9)];
        const el=oppRefs.current[id];if(el){const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2];}return[W/2,H*0.2];};
      const GAP=0.055; // per-card stagger (s) — snappier sweep
      const cards=[];let k=0;
      for(let r=0;r<rounds;r++)for(const s of seats){const[tx,ty]=tgt(s);
        cards.push({key:k,dx:Math.round(tx-ox),dy:Math.round(ty-oy),self:s===pid,delay:(k*GAP).toFixed(3),rot:(-16+Math.random()*32)|0});k++;}
      setDealFx({ox:Math.round(ox),oy,cards});
      setTimeout(()=>setDealFx(null),cards.length*GAP*1000+650);
    },60);
    return()=>clearTimeout(t);
  },[initialDeal,myH.length,g?.winner,po,pid]);
  const topC=g?.discardPile?g.discardPile[g.discardPile.length-1]:null;
  const myTurn=g?.currentPlayer===pid;const msg=g?.message||lMsg;
  const drawStack=g?.drawStack||0;
  const drawStackType=g?.drawStackType||null;
  const lastStackTypeRef=useRef(null);
  useEffect(()=>{if(g?.drawStackType)lastStackTypeRef.current=g.drawStackType;},[g?.drawStackType]);

  useEffect(()=>{
    if(!g?.emote?.ts)return;const e=g.emote;
    if(e.ts<=prevEmoteTs.current||Date.now()-e.ts>5000)return;
    prevEmoteTs.current=e.ts;
    const em=EMOTES.find(x=>x.id===e.id);if(!em)return;
    const senderName=rd?.players?.[e.pid]?.name||"???";
    setActiveEmote({...em,senderName,senderId:e.pid,ts:e.ts});
    if(snd)sfx.playEmote(e.id);
    setTimeout(()=>setActiveEmote(a=>a?.ts===e.ts?null:a),3000);
  },[g?.emote,rd?.players,snd]);

  useEffect(()=>{
    const pc=g?.pendingChallenge;
    // Only keep the challenge modal up while there is genuinely a +4 challenge waiting
    // for ME on MY turn. Any other state (turn passed, timed out, resolved by the host,
    // I can stack) must clear it — otherwise a stuck `challenge` permanently blocks drawing.
    if(g&&!g.winner&&myTurn&&pc&&pc.target===pid){
      const canStack=myH.some(c=>c.value==="wild4"||c.value==="shadow");
      setChallenge(canStack?null:{playerId:pc.player,
        playerName:rd.players[pc.player]?.name||"Player",
        playerHadColor:pc.hadMatchingColor});
    }else setChallenge(null);
  },[g?.pendingChallenge,myTurn,g?.winner,pid,rd?.players,myH,g]);

  useEffect(()=>{const mkey=g?.message?g.message+"|"+g.turnTimestamp:null;if(!mkey||mkey===prevM.current)return;prevM.current=mkey;const m=g.message.toLowerCase();
    if(m.includes("challenge")&&m.includes("guilty")){setActFx("challenge");ps("challenge");trigShake();trigBurst("red");trigImpact("red");}
    else if(m.includes("challenge")&&m.includes("innocent")){setActFx("challenge");ps("challenge");trigBurst("blue");trigImpact("blue");}
    else if(m.includes("stack")){const stc=g?.currentColor||"yellow";setActFx("stack");ps("stack");psE(stc);trigShake();trigBurst(stc);}
    else if(m.includes("called uno")){setUnoCallFx(g?.currentColor||"red");if(Date.now()-unoSndRef.current>1500)ps("uno");trigShake();}
    else if(m.includes("forgot uno")||m.includes("caught!")){psSeq("carddist",2,650,170);trigShake(); // +2 penalty cards → carddist per card
      const fm=g.message.match(/^(.*?)\s+played\s/i);const cm=g.message.match(/^(.*?)\s+caught!/i);
      setUnoPenaltyFx((cm&&cm[1])||(fm&&fm[1])||"");}
    else if(/has no counter! draws|timed out! draws|accepts\. draws|draws \d+ cards!/i.test(m)){
      // sound handled by the pendingSlash carddist sequence (per card) — no extra blip here
      if(lastStackTypeRef.current!=="wild4")trigShake();
    }
    else if(m.includes("reverse")&&!m.includes("started")){const rc2=g?.currentColor||"blue";setReverseFx(rc2);ps("reverse");psE(rc2);trigBurst(rc2);}
    else if(m.includes("skip")&&!m.includes("started")){const sc=g?.currentColor||"red";setSkipFx(sc);ps("skip");psE(sc);trigBurst(sc);}
    else if(m.includes("+2")&&!m.includes("+4")&&!m.includes("stack")){const dc=g?.currentColor||"yellow";setDraw2Fx(dc);ps("draw2");psE(dc);}
    else if(m.includes("+4")){const wc=g?.currentColor||"green";ps("draw4");trigShake();trigBurst(wc);trigImpact(wc);}
    else if(m.includes("wild")&&!m.includes("+4")){setActFx("wild");ps("wild");trigBurst("yellow");}
    else if(m.includes("wins")){const wt=g?.teamMode?rd?.players?.[g.winner]?.team:null;const iWon=g?.winner===pid||(wt&&rd?.players?.[pid]?.team===wt);ps(iWon?"win":"defeat");trigBurst("yellow");trigImpact("yellow");}
    else if(m.includes("discard all")){
      if(Date.now()-discardFxRef.current>1500){const dac=g?.currentColor||"yellow";
        const cm=g.message.match(/\(-(\d+)\s*cards?\)/i);const cnt=cm?parseInt(cm[1]):1;
        psE(dac);psSeq("carddist",cnt,cnt>1?1150:0,280); // one card-sound per discarded card (replaces old discard-all sfx)
        if(cnt>1){setActFx("discardAll");trigBurst(dac);
          const real=(g.discardPile||[]).slice(-cnt); // the just-discarded cards are the last N of the pile
          setDiscardFx({color:dac,count:cnt,cards:real.length===cnt?real:undefined});}}}
    else if(m.includes("shadow")){const shc=g?.currentColor||"blue";setActFx("shadow");ps("shadow");psE(shc);trigBurst(shc);}
    else if(m.includes("snatch")){const snc=g?.currentColor||"yellow";setActFx("snatch");ps("draw2");psE(snc);trigShake();trigBurst(snc);}
    else if(m.includes("played")){}
    if(m.includes("timed out")){ps("timeout");const tm=g.message.match(/^(.*?)\s+timed out/i);setTimeoutFx(tm?tm[1]:"");}
  },[g?.message,g?.turnTimestamp,ps,psE,trigShake,trigBurst,trigImpact,trigLightning,g?.currentColor]);
  useEffect(()=>{if(timeoutFx!==null){const t=setTimeout(()=>setTimeoutFx(null),2000);return()=>clearTimeout(t);}},[timeoutFx]);

  useEffect(()=>{if(g?.currentPlayer&&g.currentPlayer!==prevT.current){
    if(prevT.current!==null){
      if(g.currentPlayer===pid){ps("turn");setTurnFx("YOUR TURN");}
      else setTurnFx((rd?.players?.[g.currentPlayer]?.name||"...")+"'s turn");
    }
    prevT.current=g.currentPlayer;setHasDrawn(false);setDrawnCard(null);setTurnTimer(settings.turnTime);}},[g?.currentPlayer,pid,ps,rd?.players]);
  useEffect(()=>{if(turnFx!==null){const t=setTimeout(()=>setTurnFx(null),1800);return()=>clearTimeout(t);}},[turnFx]);
  useEffect(()=>{setSel(-1);},[myH.length]);
  // Animate the discard pile whenever a NEW card lands on it (any player), so plays
  // don't look like the pile just "changed color".
  const prevTopRef=useRef();
  useEffect(()=>{const id=topC?.id;if(id&&id!==prevTopRef.current){prevTopRef.current=id;
    setCAn("cFly 0.5s cubic-bezier(.22,1,.36,1)");const t=setTimeout(()=>setCAn(null),520);return()=>clearTimeout(t);}},[topC?.id]);

  const np=useCallback((cur,dir,skip=false)=>{const i=po.indexOf(cur);const n=po.length;
    let x=(i+dir+n)%n;if(skip)x=(x+dir+n)%n;return po[x];},[po]);
  const wgs=useCallback(async u=>{try{await update(ref(db,"rooms/"+rc+"/game"),u);}catch(e){}},[rc]);

  /* Resolve a draw-stack penalty. Play an animation first, then deliver the
     penalty cards when it lands: +4 (wild4) → sword-draw cinematic (~850ms),
     +2 (draw2) → cards fly to the penalized player (~650ms). */
  const SLASH_DELAY=3350,DRAW2_DELAY=1650;
  const applyStackDraw=useCallback(async(victimId,victimHand,reasonBase,nextPlayer)=>{
    const cnt=g.drawStack||0;const type=g.drawStackType;const element=g.currentColor||"green";
    let ndp=[...(g.drawPile||[])];const nd=[...g.discardPile];
    if(ndp.length<cnt){const reshuf=sh(nd.slice(0,-1));ndp=[...ndp,...reshuf];nd.splice(0,nd.length-1);}
    const drawn=ndp.splice(0,Math.min(cnt,ndp.length));
    const nh={...g.hands};nh[victimId]=[...victimHand,...drawn];
    const drawWrite={hands:nh,drawPile:ndp,discardPile:nd,drawStack:0,drawStackType:null,pendingChallenge:null,
      currentPlayer:nextPlayer,message:reasonBase+" Draws "+cnt+"!",turnTimestamp:Date.now()};
    const delay=type==="wild4"?SLASH_DELAY:DRAW2_DELAY;
    await wgs({pendingSlash:{victim:victimId,name:rd.players[victimId]?.name||"Player",element,type:type||"draw2",count:cnt,ts:Date.now()}});
    setTimeout(()=>{wgs({...drawWrite,pendingSlash:null});},delay);
  },[g,wgs,rd]);

  /* Which screen direction do penalty cards fly toward, from THIS client's view?
     down=self (bottom hand), left/right=edge opponents, up=top opponents. */
  const victimDir=useCallback(vid=>{
    if(vid===pid)return "down";
    const mi=po.indexOf(pid);
    const o=mi<0?po.filter(id=>id!==pid):[...po.slice(mi+1),...po.slice(0,mi)];
    if(o.length>2){if(vid===o[0])return "left";if(vid===o[o.length-1])return "right";}
    return "up";
  },[po,pid]);

  /* Watch pendingSlash → +4 sword cinematic, or +2 card-fly to the victim */
  const slashRef=useRef(null);
  useEffect(()=>{
    const psl=g?.pendingSlash;
    if(psl&&psl.ts&&psl.ts!==slashRef.current){
      slashRef.current=psl.ts;
      if(psl.type==="wild4"){
        const el=psl.element||"green";psE(el); // element sound plays once, with the cinematic
        const nC=Math.max(2,Math.min(psl.count||4,8));
        setChibiAttackFx({element:el,victimName:psl.name,count:nC,toSelf:psl.victim===pid,dir:victimDir(psl.victim)});
        // one card-sound per card, timed to the exact LAND moment: penaltyFling reaches the
        // hand at 92% of 1.9s, and card i starts at 0.2 + i*0.28 → land ≈ 1.95s + i*0.28.
        const seq=psSeq("carddist",nC,1950,280);
        const t=setTimeout(()=>trigShake(),SLASH_DELAY);
        return()=>{seq.forEach(clearTimeout);clearTimeout(t);};
      }else{
        const nC=Math.max(1,Math.min(psl.count||2,8));
        setCardFlyFx({element:psl.element||"yellow",count:nC,toSelf:psl.victim===pid,dir:victimDir(psl.victim)});
        // +2 cardLand reaches the hand at 90% of 1.4s, card i starts at i*0.28 → land ≈ 1.26s + i*0.28.
        const seq=psSeq("carddist",nC,1260,280);
        return()=>{seq.forEach(clearTimeout);};
      }
    }
  },[g?.pendingSlash,ps,psE,psSeq,trigShake,pid]);

  useEffect(()=>{if(!g||g.winner||!g.currentPlayer)return;
    setTurnTimer(settings.turnTime);
    const iv=setInterval(()=>{setTurnTimer(prev=>{
      if(prev<=1){clearInterval(iv);return 0;}
      if(prev===6&&snd)sfx.playClock(); // stoppable ticking clip for the final 5 seconds
      return prev-1;});},1000);
    return()=>{clearInterval(iv);sfx.stopClock();}; // turn ended (drew/played/timeout) → stop ticking
  },[g?.currentPlayer,g?.turnTimestamp,g?.winner]);

  const gameActive=!!g&&!g.winner;
  useEffect(()=>{if(!gameActive)return;
    if(settings.roundTime<=0){setRoundTimer(9999);return;}
    setRoundTimer(settings.roundTime);
    const iv=setInterval(()=>{setRoundTimer(prev=>{if(prev<=1){clearInterval(iv);return 0;}return prev-1;});},1000);
    return()=>clearInterval(iv);
  },[gameActive,settings.roundTime]);

  useEffect(()=>{
    if(roundTimer===0&&g&&!g.winner&&isHost){
      const hands=g.hands||{};let minCards=Infinity;let winnerId=null;
      for(const[id,h]of Object.entries(hands)){if(h.length<minCards){minCards=h.length;winnerId=id;}}
      if(winnerId){const mn=rd.players[winnerId]?.name||"Player";
        wgs({winner:winnerId,message:"⏰ Time's up! "+mn+" wins with fewest cards!"});}
    }
  },[roundTimer,g,isHost,rc,wgs,rd]);

  /* Central scoring — host applies leaderboard changes once per round using the
     real winner. Zero-sum: each loser loses exactly what the winner gains. */
  const scoredRef=useRef(null);
  useEffect(()=>{
    if(!isHost||!g||!g.winner||g.scored)return;
    const key=g.winner+"_"+g.turnTimestamp;if(scoredRef.current===key)return;scoredRef.current=key;
    (async()=>{
      const winnerId=g.winner;const winnerBot=isBot(winnerId);const LOSE_COINS=8;
      /* Team mode: the winner's whole team wins. Teammates are NOT penalized, and the
         human winners split the point pool the losers give up (still zero-sum). */
      const teamMode=!!g.teamMode;const winTeam=teamMode?rd.players?.[winnerId]?.team:null;
      const onWinSide=(id)=>teamMode?(rd.players?.[id]?.team===winTeam):(id===winnerId);
      /* CALIBRATION — a per-game performance score (0-100): fewer cards left = better play,
         winning is best. It nudges points on TOP of the win/loss delta so good play matters
         even in a loss. The nudge is AMPLIFIED during a player's first 10 (placement) games so
         those "calibration" games seed skilled players into a higher starting rank, then it
         shrinks to a small ongoing skill reward. Bounded so it never distorts the ladder. */
      const perfScore=(id)=>{const h=(g.hands&&g.hands[id])||[];const cards=Array.isArray(h)?h.length:0;
        return Math.max(0,Math.min(100,100-cards*8+(onWinSide(id)?15:0)));};
      const perfBonus=(id,gamesBefore)=>{const B=(gamesBefore<10)?45:12;
        return Math.round((perfScore(id)-50)/50*B);};
      try{await update(ref(db,"rooms/"+rc+"/game"),{scored:true});}catch(e){}
      const baseScore=Math.max(20,calcScore(g.hands||{},winnerId));
      const coinGain=Math.min(60,20+Math.round(baseScore*0.4));
      let totalWin=0;const deltas={};const now=Date.now();const H2H_WIN=24*3600*1000;
      /* Winner context — humans only (bots have no leaderboard node). */
      let prev=null,wRank=null,beat=null;
      if(!winnerBot){
        prev=(await get(ref(db,"leaderboard/"+winnerId))).val()||{totalPoints:0,gamesPlayed:0,wins:0};
        wRank=getRank(prev.totalPoints,prev.gamesPlayed);
        beat={...(prev.beat||{})};
      }
      /* Every HUMAN loser loses points + earns consolation coins, whether a human
         OR a bot won. Recording their delta is what lets the defeat banner show the
         points lost even in a bot game (previously bot wins recorded nothing). */
      for(const[oppId]of pls){
        if(onWinSide(oppId)||isBot(oppId))continue;
        const op=(await get(ref(db,"leaderboard/"+oppId))).val()||{totalPoints:0,gamesPlayed:0,wins:0};
        const oRank=getRank(op.totalPoints,op.gamesPlayed);
        const before=op.totalPoints||0;let loss;
        if(!winnerBot){
          /* Anti-farm layer 1: only diminish ONE-SIDED repeat wins (alt-feeding).
             Friends who TRADE wins keep near-full points (net margin stays low),
             while a main that keeps beating the same alt gets crushed as net grows. */
          let award=calcElo(wRank.idx,oRank.idx,baseScore).winPts;
          const aBeatB=(beat[oppId]&&(now-beat[oppId].t)<H2H_WIN)?beat[oppId].c:0;
          const bBeatA=(op.beat&&op.beat[winnerId]&&(now-op.beat[winnerId].t)<H2H_WIN)?op.beat[winnerId].c:0;
          const net=Math.max(0,aBeatB-bBeatA);
          const mult=net<3?1:net<5?0.5:net<7?0.25:0.08;
          award=Math.max(1,Math.round(award*mult));
          beat[oppId]={c:aBeatB+1,t:now};
          /* Anti-farm layer 2: ZERO-SUM. The winner gains ONLY what the loser
             actually loses, so draining a 0-pt alt mints nothing. */
          loss=Math.min(award,before);totalWin+=loss;
        }else{
          /* Bot winner — a real, non-minted loss (no farm tracking, no winner to credit). */
          loss=Math.min(calcElo(oRank.idx,oRank.idx,baseScore).losePts,before);
        }
        const pb=perfBonus(oppId,op.gamesPlayed||0); // calibration nudge (rewards good play in a loss)
        const newPts=Math.max(0,before-loss+pb);deltas[oppId]=-loss+pb;
        await update(ref(db,"leaderboard/"+oppId),{name:rd.players[oppId]?.name||"Player",
          gamesPlayed:(op.gamesPlayed||0)+1,totalPoints:newPts,wins:op.wins||0,losses:(op.losses||0)+1,lastPlayed:now,since:op.since||now,
          coins:(op.coins||0)+LOSE_COINS});
      }
      /* Credit every HUMAN winner (the player who went out + any teammates), splitting
         the zero-sum pool so allies gain instead of losing. beat/H2H stays on the
         actual winner only. */
      const humanWinners=(teamMode?pls.filter(([id])=>onWinSide(id)&&!isBot(id)).map(([id])=>id):[winnerId]).filter(id=>!isBot(id));
      if(!winnerBot&&humanWinners.length){
        const share=Math.max(1,Math.round(totalWin/humanWinners.length));
        for(const wId of humanWinners){
          const wp=wId===winnerId?prev:((await get(ref(db,"leaderboard/"+wId))).val()||{totalPoints:0,gamesPlayed:0,wins:0});
          const pb=perfBonus(wId,wp.gamesPlayed||0); // calibration nudge (placement-amplified)
          const upd={name:rd.players[wId]?.name||"Player",
            totalPoints:Math.max(0,(wp.totalPoints||0)+share+pb),gamesPlayed:(wp.gamesPlayed||0)+1,wins:(wp.wins||0)+1,lastPlayed:now,since:wp.since||now,
            coins:(wp.coins||0)+coinGain};
          if(wId===winnerId)upd.beat=beat;
          await update(ref(db,"leaderboard/"+wId),upd);
          deltas[wId]=share+pb;
        }
      }else{totalWin=baseScore;}
      const curScores=(await get(ref(db,"rooms/"+rc+"/scores"))).val()||{};
      curScores[winnerId]=(curScores[winnerId]||0)+totalWin;
      await update(ref(db,"rooms/"+rc),{scores:curScores});
      await update(ref(db,"rooms/"+rc+"/game"),{lastAward:totalWin,lastDeltas:deltas,lastCoin:coinGain,lastLoseCoin:LOSE_COINS});
    })();
  },[g?.winner,g?.scored,g?.turnTimestamp,isHost,rc,pls,rd]);

  /* On a win, reveal everyone's hands ON the field and mark this player as
     "reviewing" so the lobby shows their status until they close the review. */
  useEffect(()=>{
    if(g?.winner&&scr==="game"){setShowWin(true);update(ref(db,"rooms/"+rc+"/players/"+pid),{reviewing:true}).catch(()=>{});}
    else if(!g?.winner)setShowWin(false);
  },[g?.winner,scr,rc,pid]);

  const autoPassRef=useRef(false);
  /* HOST-AUTHORITATIVE timeout: only the host resolves a timeout, for whoever's
     turn it currently is, and always advances the turn. This avoids every client
     independently enforcing its own timer (which raced and could loop). */
  useEffect(()=>{
    if(!isHost||!g||g.winner||!g.currentPlayer||snatchModal)return;
    if(turnTimer!==0||autoPassRef.current)return;
    const cur=g.currentPlayer,dir=g.direction;const nm=rd?.players?.[cur]?.name||"Player";
    autoPassRef.current=true;
    (async()=>{
      try{
        if((g.drawStack||0)>0){
          await applyStackDraw(cur,g.hands?.[cur]||[],nm+" timed out!",np(cur,dir));
          return; // currentPlayer advances after the cinematic → autoPassRef resets
        }
        let dp=[...(g.drawPile||[])];const nd=[...g.discardPile];
        if(dp.length<1){const rs=sh(nd.slice(0,-1));dp=[...dp,...rs];nd.splice(0,nd.length-1);}
        if(dp.length){const drawn=dp.shift();const nh={...g.hands};nh[cur]=[...(g.hands?.[cur]||[]),drawn];
          await wgs({hands:nh,drawPile:dp,discardPile:nd,currentPlayer:np(cur,dir),
            message:nm+" timed out",turnTimestamp:Date.now()});}
        else await wgs({currentPlayer:np(cur,dir),message:nm+" timed out",turnTimestamp:Date.now()});
      }catch(e){}
      autoPassRef.current=false;
    })();
  },[turnTimer,isHost,g,snatchModal,np,wgs,rd,applyStackDraw]);
  useEffect(()=>{autoPassRef.current=false;},[g?.currentPlayer]);

  const autoDrawRef=useRef(false);
  useEffect(()=>{
    if(!myTurn||!g||g.winner||drawStack<=0||autoDrawRef.current)return;
    // A +4 challenge is pending for me — I must answer it (challenge/accept), NOT auto-draw.
    if(g.pendingChallenge&&g.pendingChallenge.target===pid)return;
    const hasCounter=drawStackType==="wild4"
      ?myH.some(c=>c.value==="wild4"||c.value==="shadow")
      :myH.some(c=>c.value==="draw2"||c.value==="wild4"||c.value==="shadow");
    if(!hasCounter){
      autoDrawRef.current=true;
      const timer=setTimeout(()=>{
        applyStackDraw(pid,myH,(rd.players[pid]?.name)+" has no counter!",np(pid,g.direction));
      },1200);
      return()=>clearTimeout(timer);
    }
  },[myTurn,g,drawStack,drawStackType,myH,pid,np,wgs,rd,ps,applyStackDraw]);
  useEffect(()=>{autoDrawRef.current=false;},[g?.currentPlayer]);

  /* ═══ BOT AI ═══ */
  const botTurnRef=useRef(null);
  useEffect(()=>{
    if(!isHost||!g||g.winner)return;
    const cp=g.currentPlayer;if(!isBot(cp))return;
    const tk=cp+"_"+g.turnTimestamp;
    if(botTurnRef.current===tk)return;
    botTurnRef.current=tk;
    const pr=myStats?getRank(myStats.totalPoints,myStats.gamesPlayed):UNRANKED;
    const intel=pr.idx<=0?0:pr.idx<=2?1:2;
    setTimeout(async()=>{
      if(botTurnRef.current!==tk)return;
      try{
        const hand=[...(g.hands?.[cp]||[])];if(!hand.length)return;
        const topCard=g.discardPile[g.discardPile.length-1];
        const curColor=g.currentColor;const ds=g.drawStack||0;const dst=g.drawStackType;
        const bn=rd.players[cp]?.name||"Bot";const nh={...g.hands};
        let ndp2=[...(g.drawPile||[])];const nd=[...g.discardPile];let dir=g.direction;
        const cu={...(g.calledUno||{})};const is2P=po.length===2;
        const ensure=n=>{if(ndp2.length<n){const r2=sh(nd.slice(0,-1));ndp2=[...ndp2,...r2];nd.splice(0,nd.length-1);}
          return ndp2.splice(0,Math.min(n,ndp2.length));};

        if(g.pendingChallenge&&g.pendingChallenge.target===cp){
          const dr=ensure(4);nh[cp]=[...hand,...dr];
          await wgs({hands:nh,drawPile:ndp2,discardPile:nd,currentPlayer:np(cp,dir),
            message:bn+" accepts. Draws 4!",pendingChallenge:null,turnTimestamp:Date.now()});return;}

        if(ds>0){
          const ct=dst==="wild4"?hand.filter(c=>c.value==="wild4"||c.value==="shadow")
            :hand.filter(c=>c.value==="draw2"||c.value==="wild4"||c.value==="shadow");
          if(ct.length>0&&(intel>=1||Math.random()>0.3)){
            const card=ct[0];let remain=hand.filter(c=>c.id!==card.id);nd.push(card);
            let nCol=card.color==="wild"?botPickColor(remain):card.color;
            let nds=ds,ndt=dst,m=bn+" played "+gl(card.value),pc=null;
            if(card.value==="draw2"){nds=settings.stacking?ds+2:2;ndt="draw2";m+=" +2!";if(settings.stacking&&nds>2)m+=" Stack: "+nds+"!";}
            else if(card.value==="wild4"){nds=settings.stacking?ds+4:4;ndt="wild4";m+=" +4! > "+nCol.toUpperCase();
              pc={player:cp,target:np(cp,dir),hadMatchingColor:hand.some(c=>c.color===curColor&&c.id!==card.id)};}
            else if(card.value==="shadow"){m+=" Shadow! Deflects "+ds+" to next!";}
            if(remain.length===1&&(intel>=1||Math.random()>0.1))cu[cp]=true;
            if(remain.length===1&&!cu[cp]){m+=" | Forgot UNO! +2 penalty!";remain=[...remain,...ensure(2)];}
            cu[cp]=remain.length===1?cu[cp]:false;nh[cp]=remain;const w=remain.length===0?cp:null;if(w)m=bn+" WINS!";
            await wgs({hands:nh,discardPile:nd,drawPile:ndp2,direction:dir,currentColor:nCol,
              currentPlayer:w?cp:np(cp,dir,false),winner:w,message:m,calledUno:cu,turnTimestamp:Date.now(),
              pendingChallenge:w?null:pc,drawStack:w?0:nds,drawStackType:w?null:ndt});
          }else{
            await applyStackDraw(cp,hand,bn+" has no counter!",np(cp,dir));}
          return;}

        const playable=hand.filter(c=>canPlay(c,topCard,curColor));
        let cardToPlay=null;let drewMsg="";

        if(playable.length>0){
          const nxOpp=np(cp,dir);const nxHL=(g.hands?.[nxOpp]||[]).length;
          cardToPlay=botChooseCard(playable,hand,curColor,intel,nxHL);
        }else{
          if(!ndp2.length){const r2=sh(nd.slice(0,-1));ndp2.push(...r2);nd.splice(0,nd.length-1);}
          if(!ndp2.length){await wgs({currentPlayer:np(cp,dir),message:bn+" passed",turnTimestamp:Date.now()});return;}
          let drawnCards=[];let found=false;
          if(settings.drawTilPlay){
            while(ndp2.length>0&&drawnCards.length<10){
              const d=ndp2.shift();drawnCards.push(d);
              if(canPlay(d,topCard,curColor)){cardToPlay=d;found=true;break;}}
          }else{const d=ndp2.shift();drawnCards=[d];if(canPlay(d,topCard,curColor)){cardToPlay=d;found=true;}}
          hand.push(...drawnCards);
          if(!found){nh[cp]=[...hand];cu[cp]=false;
            const dm=drawnCards.length>1?drawnCards.length+" cards":"";
            await wgs({hands:nh,drawPile:ndp2,discardPile:nd,currentPlayer:np(cp,dir),
              message:bn+" drew"+(dm?" "+dm:"")+" — can't play",turnTimestamp:Date.now(),calledUno:cu});return;}
          drewMsg=drawnCards.length>1?" drew "+drawnCards.length+" and":" drew and";
        }

        let remain=hand.filter(c=>c.id!==cardToPlay.id);
        let nCol=cardToPlay.color==="wild"?botPickColor(remain):(cardToPlay.color||curColor);
        let m=bn+drewMsg+" played "+gl(cardToPlay.value),skip2=false,nds=0,ndt=null,pc=null;

        if(cardToPlay.value==="discardAll"){const mc=cardToPlay.color;
          const disc=remain.filter(c=>c.color===mc);remain=remain.filter(c=>c.color!==mc);
          nd.push(...disc,cardToPlay);m+=" Discard all "+mc+"! (-"+(disc.length+1)+" cards)";}
        else nd.push(cardToPlay);

        if(cardToPlay.value==="reverse"){if(is2P){skip2=true;m+=" Reverse! (Skip)";}else{dir=-dir;m+=" Reverse!";}}
        if(cardToPlay.value==="skip"){skip2=true;m+=" Skip!";}
        if(cardToPlay.value==="draw2"){nds=settings.stacking?(g.drawStack||0)+2:2;ndt="draw2";m+=" +2!";if(settings.stacking&&nds>2)m+=" Stack: "+nds+"!";}
        if(cardToPlay.value==="wild4"){nds=settings.stacking?(g.drawStack||0)+4:4;ndt="wild4";m+=" +4!";if(settings.stacking&&nds>4)m+=" Stack: "+nds+"!";
          pc={player:cp,target:np(cp,dir,false),hadMatchingColor:hand.some(c=>c.color===curColor&&c.id!==cardToPlay.id)};}
        if(cardToPlay.type==="wild")m+=" > "+nCol.toUpperCase();
        if(cardToPlay.value==="shadow"&&(g.drawStack||0)>0){m+=" Shadow! Deflects "+g.drawStack+" to next!";nds=g.drawStack;ndt=g.drawStackType;}
        if(cardToPlay.value==="snatch"){const nxId=np(cp,dir,false);const nxH=[...(nh[nxId]||[])];
          if(nxH.length>0){const si=Math.floor(Math.random()*nxH.length);const st3=nxH.splice(si,1)[0];remain=[...remain,st3];
            let wi=0,wv=999;remain.forEach((c,i)=>{const v=c.type==="wild"?50:c.type==="action"?20:parseInt(c.value)||0;if(v<wv){wv=v;wi=i;}});
            nxH.push(remain[wi]);remain=remain.filter((_,i)=>i!==wi);nh[nxId]=nxH;
            m+=" Snatch! Swapped with "+(rd.players[nxId]?.name)+"!";}else m+=" Snatch! (nothing to take)";}

        if(remain.length===1&&(intel>=1||Math.random()>0.3))cu[cp]=true;
        if(remain.length===1&&!cu[cp]){m+=" | Forgot UNO! +2 penalty!";remain=[...remain,...ensure(2)];}
        cu[cp]=remain.length===1?cu[cp]:false;nh[cp]=remain;const w=remain.length===0?cp:null;if(w)m=bn+" WINS!";
        let nxP=w?cp:np(cp,dir,skip2);
        if((cardToPlay.value==="draw2"||cardToPlay.value==="wild4")&&!w)nxP=np(cp,dir,false);
        await wgs({hands:nh,discardPile:nd,drawPile:ndp2,direction:dir,currentColor:nCol,
          currentPlayer:nxP,winner:w,message:m,calledUno:cu,turnTimestamp:Date.now(),
          pendingChallenge:w?null:pc,drawStack:w?0:nds,drawStackType:w?null:ndt});
      }catch(e){console.error("Bot:",e);try{await wgs({currentPlayer:np(g.currentPlayer,g.direction),
        message:(rd.players[g.currentPlayer]?.name||"Bot")+" passed",turnTimestamp:Date.now()});}catch(e2){}}
    },1200+Math.random()*1300);
  });


  // Music is ON by default; only off if the user explicitly turned it off before.
  const musUserOff=useRef(localStorage.getItem("uno_musicoff")==="1");
  const startMusic=useCallback(()=>{ua();if(!bgm.playing&&!musUserOff.current){bgm.start("menu");setMus(true);}},[]);
  // Browsers block audio until the first user gesture — start music on the very
  // first touch/click/key anywhere (earliest the browser allows).
  useEffect(()=>{
    const go=()=>{ua();if(!bgm.playing&&!musUserOff.current){bgm.start("menu");setMus(true);}rm();};
    const rm=()=>["pointerdown","touchstart","keydown","click"].forEach(e=>window.removeEventListener(e,go));
    ["pointerdown","touchstart","keydown","click"].forEach(e=>window.addEventListener(e,go,{passive:true}));
    return rm;
  },[]);
  // Keep audio alive: re-resume the context (and restart the paused music) on any
  // interaction or when returning to the tab — fixes music intermittently not playing.
  useEffect(()=>{
    const resume=()=>{ua();bgm.resume();};
    const evs=["pointerdown","touchstart","keydown","click"];
    evs.forEach(e=>window.addEventListener(e,resume,{passive:true}));
    const vis=()=>{if(!document.hidden)bgm.resume();};
    document.addEventListener("visibilitychange",vis);
    return()=>{evs.forEach(e=>window.removeEventListener(e,resume));document.removeEventListener("visibilitychange",vis);};
  },[]);
  // Swap between menu track and gameplay tracks as the screen changes.
  useEffect(()=>{if(mus&&bgm.playing)bgm.setMode(scr==="game"?"game":"menu");},[scr,mus]);

  const restoreAccount=async()=>{
    const id=restoreId.trim().toLowerCase();
    if(!id||id.length<4){setRestoreMsg("Enter a valid Player ID");return;}
    if(id===pid){setRestoreMsg("That's already your current ID");return;}
    const snap=await get(ref(db,"leaderboard/"+id));
    if(!snap.exists()){setRestoreMsg("No account found with that ID");return;}
    if(accounts.length>=3&&!accounts.some(a=>a.pid===id)){setRestoreMsg("Max 3 accounts on this device. Remove one first.");return;}
    const data=snap.val();
    registerAccount(id,data.name||"");
    setRestoreMsg("Account restored! Switching...");
    setTimeout(()=>switchToAccount(id,data.name||""),900);
  };
  const newAccount=()=>{
    if(accounts.length>=3){setRestoreMsg("Max 3 accounts reached. Remove one to add another.");return;}
    const nid=gid();registerAccount(nid,"");switchToAccount(nid,"");
  };
  const removeAccount=async(rid,rname)=>{
    try{await remove(ref(db,"leaderboard/"+rid));}catch(e){}
    await releaseName(rname);
    const left=getAccounts().filter(a=>a.pid!==rid);saveAccounts(left);setAccounts(left);
    if(rid===pid){localStorage.removeItem("uno_cname");if(left[0])switchToAccount(left[0].pid,left[0].name);else{localStorage.removeItem("uno_pid");localStorage.removeItem("uno_name");window.location.reload();}}
  };
  const copyPid=()=>{navigator.clipboard?.writeText(pid).then(()=>setRestoreMsg("Copied!")).catch(()=>{});
    setTimeout(()=>setRestoreMsg(""),1500);};

  const createRoom=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("click");
    const cl=await claimName(pName,pid);if(!cl.ok){setErr(cl.msg);return;}
    const code=grc();
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:Date.now(),
      players:{[pid]:{name:pName.trim(),order:0,avatar:myAvatar,photo:myPhoto||null,flags:myFlags}},scores:{},settings:DEF_SETTINGS});setRc(code);setErr("");setScr("lobby");
    }catch(e){setErr("Check Firebase config.");console.error(e);}};

  const createTeamRoom=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("click");
    const cl=await claimName(pName,pid);if(!cl.ok){setErr(cl.msg);return;}
    const code=grc();
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:Date.now(),
      players:{[pid]:{name:pName.trim(),order:0,avatar:myAvatar,photo:myPhoto||null,flags:myFlags}},scores:{},settings:{...DEF_SETTINGS,teamMode:true}});setRc(code);setErr("");setScr("lobby");
    }catch(e){setErr("Check Firebase config.");console.error(e);}};

  const joinRoom=async(codeArg)=>{if(!pName.trim()){setErr("Enter name");return;}
    const code=(typeof codeArg==="string"?codeArg:jc).trim().toUpperCase();if(code.length!==4){setErr("4-letter code");return;}ua();
    const cl=await claimName(pName,pid);if(!cl.ok){setErr(cl.msg);return;}
    try{const snap=await get(ref(db,"rooms/"+code));if(!snap.exists()){setErr("Not found");return;}
      const data=snap.val();if(data.status!=="waiting"){setErr("Already started");return;}
      const cnt=data.players?Object.keys(data.players).length:0;if(cnt>=MAX_PLAYERS){setErr("Full");return;}
      if(!data.players?.[pid])await update(ref(db,"rooms/"+code+"/players/"+pid),{name:pName.trim(),order:cnt,avatar:myAvatar,photo:myPhoto||null,flags:myFlags});
      setRc(code);setErr("");setScr("lobby");ps("join");
    }catch(e){setErr("Failed.");console.error(e);}};

  const saveSetting=async(key,val)=>{const ns={...settings,[key]:val};setSettings(ns);
    if(rc)await update(ref(db,"rooms/"+rc),{settings:ns});};

  const addBot=async()=>{if(!isHost||pls.length>=(settings.maxPlayers||MAX_PLAYERS))return;
    const bc=pls.filter(([id])=>isBot(id)).length;const botId="bot_"+(bc+1)+"_"+Date.now();
    const used=pls.map(([id])=>rd.players[id]?.name).filter(Boolean);
    await update(ref(db,"rooms/"+rc+"/players/"+botId),{name:randBotName(used),order:pls.length,isBot:true,ready:true,avatar:randAvatar()});};
  const toggleReady=async()=>{await update(ref(db,"rooms/"+rc+"/players/"+pid),{ready:!(rd?.players?.[pid]?.ready)});};
  const allReady=pls.every(([id,pd])=>id===rd?.host||(pd.ready&&!pd.reviewing));
  const removeBot=async(botId)=>{if(!isHost||!isBot(botId))return;await remove(ref(db,"rooms/"+rc+"/players/"+botId));};

  const quickPlay1v1=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("click");
    const cl=await claimName(pName,pid);if(!cl.ok){setErr(cl.msg);return;}
    const code=grc();const now=Date.now();
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:now,
      players:{[pid]:{name:pName.trim(),order:0,avatar:myAvatar,photo:myPhoto||null,flags:myFlags},["bot_1_"+now]:{name:randBotName([pName.trim()]),order:1,isBot:true,avatar:randAvatar()}},
      scores:{},settings:DEF_SETTINGS});setRc(code);setErr("");setScr("lobby");setAutoStart(true);
    }catch(e){setErr("Check Firebase config.");}};

  const quickPlayFFA=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("click");
    const cl=await claimName(pName,pid);if(!cl.ok){setErr(cl.msg);return;}
    const code=grc();const now=Date.now();const players={[pid]:{name:pName.trim(),order:0,avatar:myAvatar,photo:myPhoto||null,flags:myFlags}};
    const usedN=[pName.trim()];for(let i=0;i<3;i++){const bn=randBotName(usedN);usedN.push(bn);players["bot_"+(i+1)+"_"+now]={name:bn,order:i+1,isBot:true,avatar:randAvatar()};}
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:now,
      players,scores:{},settings:DEF_SETTINGS});setRc(code);setErr("");setScr("lobby");setAutoStart(true);
    }catch(e){setErr("Check Firebase config.");}};

  const startGame=async()=>{if(!isHost||pls.length<2)return;lbUpdated.current=false;setRoundTimer(settings.roundTime||ROUND_TIME);setTurnTimer(TURN_TIME);ps("gameOn");startMusic();
    // Team mode: split into Chaos/Order (auto-balance any unassigned) and interleave the
    // seating so teammates never sit consecutively. Non-team mode keeps the join order.
    let op=pls,teamAssign=null;
    if(settings.teamMode){
      let chaos=[],order=[];
      if(settings.autoSplit){pls.forEach(([id],i)=>(i%2===0?chaos:order).push(id));}
      else{
        pls.forEach(([id,pd])=>{if(pd.team==="chaos")chaos.push(id);else if(pd.team==="order")order.push(id);});
        pls.forEach(([id,pd])=>{if(pd.team!=="chaos"&&pd.team!=="order")(chaos.length<=order.length?chaos:order).push(id);});
      }
      teamAssign={};chaos.forEach(id=>teamAssign[id]="chaos");order.forEach(id=>teamAssign[id]="order");
      const seq=[],mx=Math.max(chaos.length,order.length);
      for(let i=0;i<mx;i++){if(i<chaos.length)seq.push(chaos[i]);if(i<order.length)seq.push(order[i]);}
      const byId=Object.fromEntries(pls);op=seq.map(id=>[id,byId[id]]);
    }
    const opo=op.map(([id])=>id);
    let deck=sh(mkD());
    if(!settings.specialCards)deck=deck.filter(c=>c.value!=="shadow"&&c.value!=="snatch"&&c.value!=="discardAll");
    const hands={};for(const[p]of op)hands[p]=deck.splice(0,settings.startCards);
    /* High chance each player starts with a Discard-All card */
    if(settings.specialCards)for(const[p]of op){
      if(Math.random()<0.8&&!hands[p].some(c=>c.value==="discardAll")){
        const di=deck.findIndex(c=>c.value==="discardAll");
        if(di>=0){const dc=deck.splice(di,1)[0];const ri=Math.floor(Math.random()*hands[p].length);
          deck.push(hands[p][ri]);hands[p][ri]=dc;}}}
    const badFirst=v=>v==="wild4"||v==="discardAll"||v==="shadow"||v==="snatch"||v==="draw2";
    let fc;while(true){let fi=deck.findIndex(c=>!badFirst(c.value));
      if(fi===-1){deck=sh(deck);fi=0;}fc=deck.splice(fi,1)[0];if(!badFirst(fc.value))break;deck.push(fc);deck=sh(deck);}
    let firstPlayer=opo[0];let direction=1;let currentColor=fc.color;let m="Game started!";let drawPile=[...deck];
    if(fc.value==="skip"){firstPlayer=opo[1%opo.length];m="Game started! First player skipped!";}
    else if(fc.value==="reverse"){direction=-1;
      if(opo.length===2)firstPlayer=opo[0];else firstPlayer=opo[opo.length-1];m="Game started! Direction reversed!";}
    else if(fc.type==="wild"){currentColor=COLORS[Math.floor(Math.random()*4)];m="Game started! Color is "+currentColor.toUpperCase()+"!";}
    const upd={status:"playing",game:{
      hands,drawPile,discardPile:[fc],currentPlayer:firstPlayer,direction,
      currentColor,winner:null,message:m,calledUno:{},unoGrace:null,turnTimestamp:Date.now(),pendingChallenge:null,drawStack:0,drawStackType:null,
      teamMode:!!settings.teamMode}};
    if(teamAssign)op.forEach(([id],i)=>{upd["players/"+id+"/order"]=i;upd["players/"+id+"/team"]=teamAssign[id];});
    await update(ref(db,"rooms/"+rc),upd);
    setScr("game");goFS();goLand();};
  const setTeam=(id,team)=>{if(rc)update(ref(db,"rooms/"+rc+"/players/"+id),{team}).catch(()=>{});};

  useEffect(()=>{if(autoStart&&isHost&&pls.length>=2&&scr==="lobby"){setAutoStart(false);startGame();}},[autoStart,isHost,pls.length,scr]);

  useEffect(()=>{if(rd?.status==="playing"&&scr==="lobby"&&!isHost&&rd?.game&&!rd.game.winner){ua();startMusic();setScr("game");ps("gameOn");goFS();goLand();}},[rd?.status,rd?.game?.turnTimestamp,rd?.game?.winner,scr,isHost,ps,startMusic]);
  useEffect(()=>{if(rd?.status==="waiting"&&scr==="game"){setScr("lobby");setSel(-1);setDrawnCard(null);setHasDrawn(false);setChallenge(null);setActFx(null);setWild4Fx(null);setChibiAttackFx(null);setDraw2Fx(null);setReverseFx(null);setSkipFx(null);setUnoCallFx(null);setUnoPenaltyFx(null);}},[rd?.status,scr]);

  const playC=useCallback(async(ci,cc)=>{if(!g||!myTurn)return;
    const card=myH[ci];ps("card");setSel(-1);setDrawnCard(null);setHasDrawn(false);
    const cCol=card.color==="wild"?(cc||"yellow"):card.color;
    trigBurst(cCol);trigImpact(cCol);
    const nh={...g.hands};let remainHand=myH.filter((_,i)=>i!==ci);
    const nd=[...g.discardPile];let nDir=g.direction,skip=false,nCol=card.color==="wild"?cc:card.color,draw=0;
    const mn=rd.players[pid]?.name||"P";let m=mn+" played "+gl(card.value);
    let pendingChallenge=null;let newDrawStack=0;let newDrawStackType=null;let snatchHold=false;
    const is2P=po.length===2;
    let ndp2=[...(g.drawPile||[])];

    if(card.value==="discardAll"){
      const matchColor=card.color;
      const discarded=remainHand.filter(c=>c.color===matchColor);
      remainHand=remainHand.filter(c=>c.color!==matchColor);
      nd.push(...discarded,card);
      const dCount=discarded.length;
      m+=" Discard all "+matchColor+"! (-"+(dCount+1)+" cards)";
      // Trigger the fly-to-pile animation locally right away (fires even on a winning discard-all).
      // ≥2 cards discarded → discard-all sfx + big animation; single card → just the draw sfx.
      discardFxRef.current=Date.now();
      if(dCount+1>1){psSeq("carddist",dCount+1,1150,280);setActFx("discardAll");trigBurst(matchColor);setDiscardFx({color:matchColor,count:dCount+1,cards:[...discarded,card],ts:Date.now()});}
      else psSeq("carddist",1,0,0);
    } else {
      nd.push(card);
    }
    nh[pid]=remainHand;

    if(card.value==="reverse"){if(is2P){skip=true;m+=" Reverse! (Skip)";}else{nDir=-nDir;m+=" Reverse!";}}
    if(card.value==="skip"){skip=true;m+=" Skip!";}
    if(card.value==="draw2"){
      newDrawStack=settings.stacking?(g.drawStack||0)+2:2;newDrawStackType="draw2";
      m+=" +2!";if(settings.stacking&&newDrawStack>2)m+=" Stack: "+newDrawStack+"!";}
    if(card.value==="wild4"){
      newDrawStack=settings.stacking?(g.drawStack||0)+4:4;newDrawStackType="wild4";
      m+=" +4!";if(settings.stacking&&newDrawStack>4)m+=" Stack: "+newDrawStack+"!";}
    if(card.type==="wild")m+=" > "+cc.toUpperCase();
    if(card.value==="shadow"&&(g.drawStack||0)>0){
      m+=" Shadow! Deflects "+g.drawStack+" to next!";
      newDrawStack=g.drawStack;newDrawStackType=g.drawStackType;}
    if(card.value==="snatch"){
      const nextId=np(pid,nDir,false);const nextH=nh[nextId]||[];
      if(nextH.length>0){
        m+=" Snatch! Pick a card from "+(rd.players[nextId]?.name)+"!";
        snatchHold=true;
        setSnatchModal({phase:"pick",fromId:nextId,fromName:rd.players[nextId]?.name,cardCount:nextH.length,nextTurn:nextId});}
      else m+=" Snatch! (nothing to take)";}
    const nxt=np(pid,nDir,skip);const dt=skip?np(pid,nDir,false):null;
    if(draw>0&&dt){
      if(ndp2.length<draw){const reshuf=sh(nd.slice(0,-1));ndp2=[...ndp2,...reshuf];nd.splice(0,nd.length-1);}
      const dr=ndp2.splice(0,draw);nh[dt]=[...(nh[dt]||[]),...dr];
      m+=" "+(rd.players[dt]?.name)+" draws "+draw+"!";}
    let winner=null;
    if(nh[pid].length===0){winner=pid;m=mn+" WINS!";}
    const cu=g.calledUno||{};
    /* Down to 1 card without pre-calling UNO: open a short grace window instead of an
       instant penalty. During it the player must tap UNO (opponents may catch them,
       or it auto-penalizes when the window closes — see the unoGrace effect). */
    let unoGrace=null;
    if(nh[pid].length===1&&!cu[pid]&&!winner)unoGrace={pid,until:Date.now()+UNO_GRACE_MS};
    let nextPlayer=winner?pid:nxt;
    if((card.value==="draw2"||card.value==="wild4")&&!winner)nextPlayer=np(pid,nDir,false);
    if(snatchHold&&!winner)nextPlayer=pid;
    await wgs({hands:nh,discardPile:nd,drawPile:ndp2,direction:nDir,currentColor:nCol,
      currentPlayer:nextPlayer,winner,message:m,calledUno:{...cu,[pid]:(nh[pid].length===1&&cu[pid])?true:false},
      unoGrace,turnTimestamp:Date.now(),pendingChallenge:winner?null:pendingChallenge,
      drawStack:winner?0:newDrawStack,drawStackType:winner?null:newDrawStackType});
  },[g,myTurn,myH,pid,po,np,wgs,rd,ps,rc,trigBurst,trigImpact]);

  const respondChallenge=useCallback(async(doChallenge)=>{
    if(!g||!challenge)return;setChallenge(null);
    const pc=g.pendingChallenge;if(!pc)return;
    const element=g.currentColor||"green";const dir=g.direction;
    // EXACTLY ONE player is penalized. Guilty +4-player → they draw 4 and the challenger
    // then takes their normal turn. Innocent (wrong challenge) or accept → the challenger
    // draws (6 / 4) and their turn is skipped. Clearing drawStack here is what stops the
    // old bug where the leftover stack ALSO hit the challenger (both penalized).
    let victimId,count,m,nextPlayer;
    if(doChallenge){
      if(pc.hadMatchingColor){victimId=pc.player;count=4;nextPlayer=pid;
        m=(rd.players[pid]?.name)+" challenged — "+(rd.players[pc.player]?.name)+" was GUILTY! Draws 4.";}
      else{victimId=pid;count=6;nextPlayer=np(pid,dir);
        m=(rd.players[pid]?.name)+" challenged & lost — INNOCENT! Draws 6.";}
    }else{victimId=pid;count=4;nextPlayer=np(pid,dir);m=(rd.players[pid]?.name)+" accepts. Draws 4.";}
    // Play the element penalty cinematic FIRST, then deliver the cards synced to its finish.
    await wgs({pendingChallenge:null,drawStack:0,drawStackType:null,pendingSlash:{victim:victimId,name:rd.players[victimId]?.name||"Player",element,type:"wild4",count,ts:Date.now()}});
    setTimeout(async()=>{
      let cg=g;try{const snap=await get(ref(db,"rooms/"+rc+"/game"));if(snap.exists())cg=snap.val();}catch(e){}
      const nh={...cg.hands};let ndp=[...(cg.drawPile||[])];const nd=[...(cg.discardPile||[])];
      if(ndp.length<count){const reshuf=sh(nd.slice(0,-1));ndp=[...ndp,...reshuf];nd.splice(0,nd.length-1);}
      const dr=ndp.splice(0,Math.min(count,ndp.length));
      nh[victimId]=[...(nh[victimId]||[]),...dr];
      await wgs({hands:nh,drawPile:ndp,discardPile:nd,currentPlayer:nextPlayer,message:m,pendingSlash:null,drawStack:0,drawStackType:null,turnTimestamp:Date.now()});
    },SLASH_DELAY);
  },[g,challenge,pid,np,wgs,rd,rc]);

  const doDraw=useCallback(async()=>{
    if(pickDr&&isAdm){setShowDk(true);return;}
    if(!myTurn||g?.winner||drawnCard||hasDrawn)return;
    if(drawStack>0){
      await applyStackDraw(pid,myH,(rd.players[pid]?.name)+" has no counter!",np(pid,g.direction));
      return;}
    ps("draw");const dp=[...(g.drawPile||[])];const nd=[...g.discardPile];
    if(!dp.length){const reshuf=sh(nd.slice(0,-1));dp.push(...reshuf);nd.splice(0,nd.length-1);}
    if(settings.drawTilPlay){
      let cnt=0;let lastDrawn=null;let foundPlayable=false;
      const hand=[...myH];
      while(dp.length>0){
        if(!dp.length){const reshuf=sh(nd.slice(0,-1));dp.push(...reshuf);nd.splice(0,nd.length-1);if(!dp.length)break;}
        lastDrawn=dp.shift();hand.push(lastDrawn);cnt++;
        if(canPlay(lastDrawn,topC,g.currentColor)){foundPlayable=true;break;}
        if(cnt>=10)break;
      }
      const nh={...g.hands};nh[pid]=hand;const cu={...(g.calledUno||{}),[pid]:false};
      if(foundPlayable){
        await wgs({hands:nh,drawPile:dp,discardPile:nd,message:(rd.players[pid]?.name)+" drew "+cnt+" card"+(cnt>1?"s":""),turnTimestamp:Date.now(),calledUno:cu});
        setHasDrawn(true);ps("playable");
      } else {
        await wgs({hands:nh,drawPile:dp,discardPile:nd,currentPlayer:np(pid,g.direction),
          message:(rd.players[pid]?.name)+" drew "+cnt+" — can't play",turnTimestamp:Date.now(),calledUno:cu});
        ps("notPlayable");setLMsg("Drew "+cnt+" — can't play");setTimeout(()=>setLMsg(""),1500);
      }
    } else {
      const drawn=dp.shift();const nh={...g.hands};nh[pid]=[...myH,drawn];
      const cu={...(g.calledUno||{}),[pid]:false};
      const playable=canPlay(drawn,topC,g.currentColor);
      if(playable){
        await wgs({hands:nh,drawPile:dp,discardPile:nd,message:(rd.players[pid]?.name)+" drew a card",turnTimestamp:Date.now(),calledUno:cu});
        setHasDrawn(true);ps("playable");
      } else {
        await wgs({hands:nh,drawPile:dp,discardPile:nd,currentPlayer:np(pid,g.direction),
          message:(rd.players[pid]?.name)+" drew — can't play",turnTimestamp:Date.now(),calledUno:cu});
        ps("notPlayable");setLMsg("Drew — can't play");setTimeout(()=>setLMsg(""),1200);
      }
    }
  },[myTurn,g,drawnCard,hasDrawn,drawStack,pickDr,isAdm,ps,pid,myH,topC,np,wgs,rd,trigShake,settings.drawTilPlay,applyStackDraw]);

  /* Deck tap: draw exactly one card on your turn. Out of turn does nothing.
     A synchronous guard prevents rapid taps from drawing multiple cards. */
  const drawingRef=useRef(false);
  const handleDeckTap=useCallback(()=>{
    if(pickDr&&isAdm){doDraw();return;}
    if(!myTurn||g?.winner||drawnCard||hasDrawn||challenge||drawingRef.current)return;
    drawingRef.current=true;
    Promise.resolve(doDraw()).finally(()=>{drawingRef.current=false;});
  },[pickDr,isAdm,myTurn,g,drawnCard,hasDrawn,challenge,doDraw]);

  const passTurn=async()=>{if(!myTurn||g?.winner)return;setDrawnCard(null);setHasDrawn(false);
    await wgs({currentPlayer:np(pid,g.direction),message:(rd.players[pid]?.name)+" passed",turnTimestamp:Date.now()});};

  const pickDeck=async i=>{if(!g)return;ps("draw");const dp=[...g.drawPile];
    const c={...dp[i],id:Date.now()+Math.random()};
    const nh={...g.hands};nh[pid]=[...myH,c];setShowDk(false);
    await wgs({hands:nh,drawPile:dp,message:(rd.players[pid]?.name)+" drew",turnTimestamp:Date.now()});};
  const admSwap=ci=>{if(!swap)return;setSwpC({idx:ci});setShowDk(true);};
  const swapDk=async di=>{if(!swpC||!g)return;ps("card");
    const nh={...g.hands};const h=[...myH];const dp=[...g.drawPile];
    h[swpC.idx]={...dp[di],id:Date.now()+Math.random()};nh[pid]=h;await wgs({hands:nh,drawPile:dp});
    setSwpC(null);setShowDk(false);setSwap(false);setLMsg("Swapped!");setTimeout(()=>setLMsg(""),1500);};

  const catchUno=useCallback(async(targetId)=>{if(!g||g.winner)return;
    // Re-read the latest state so a just-called UNO (still syncing) isn't wrongly caught
    let fg=g;try{const snap=await get(ref(db,"rooms/"+rc+"/game"));if(snap.exists())fg=snap.val();}catch(e){}
    if(fg.winner)return;
    const targetHand=fg.hands?.[targetId]||[];const cu=fg.calledUno||{};
    if(targetHand.length===1&&!cu[targetId]){ps("catchUno");trigShake();
      const nh={...fg.hands};let ndp=[...(fg.drawPile||[])];const nd=[...fg.discardPile];
      if(ndp.length<2){const rs=sh(nd.slice(0,-1));ndp=[...ndp,...rs];}
      nh[targetId]=[...(nh[targetId]||[]),...ndp.splice(0,2)];
      setCardFlyFx({element:fg.currentColor||"yellow",count:2,toSelf:targetId===pid,dir:victimDir(targetId)});
      await wgs({hands:nh,drawPile:ndp,message:(rd.players[targetId]?.name)+" caught! UNO penalty +2!",
        calledUno:{...cu,[targetId]:true},unoGrace:null});}
  },[g,ps,wgs,rd,trigShake,rc]);

  /* Two distinct opponent taps:
       - tapping their CARDS only catches a forgotten UNO (1 card, never called);
       - tapping their PROFILE (avatar/name) opens a picker to throw an item.  */
  const tapOppCards=useCallback((id)=>{
    if(g?.winner)return;
    const h=g?.hands?.[id]||[];const cu=g?.calledUno||{};
    if(h.length===1&&!cu[id])catchUno(id);
  },[g,catchUno]);
  const throwChosen=useCallback((targetId,itemId)=>{throwAt(targetId,itemId);setThrowPick(null);},[throwAt]);

  const snatchPick=useCallback(async(cardIdx)=>{if(!snatchModal||snatchModal.phase!=="pick"||!g)return;
    const nh={...g.hands};const oppHand=[...(nh[snatchModal.fromId]||[])];
    if(cardIdx>=oppHand.length){await wgs({currentPlayer:snatchModal.nextTurn,turnTimestamp:Date.now()});setSnatchModal(null);return;}
    const stolen=oppHand[cardIdx];oppHand.splice(cardIdx,1);
    nh[snatchModal.fromId]=oppHand;nh[pid]=[...(nh[pid]||[]),stolen];
    await wgs({hands:nh});
    setSnatchModal({phase:"swap",fromId:snatchModal.fromId,fromName:snatchModal.fromName,card:stolen,nextTurn:snatchModal.nextTurn});
  },[snatchModal,g,pid,wgs]);
  const snatchSwap=useCallback(async(myCardIdx)=>{if(!snatchModal||snatchModal.phase!=="swap"||!g)return;
    const nh={...g.hands};const myHand=[...(nh[pid]||[])];const oppHand=[...(nh[snatchModal.fromId]||[])];
    const myCard=myHand[myCardIdx];
    oppHand.push(myCard);nh[snatchModal.fromId]=oppHand;
    nh[pid]=myHand.filter((_,i)=>i!==myCardIdx);
    await wgs({hands:nh,message:(rd.players[pid]?.name)+" swapped a card with "+(snatchModal.fromName)+"!",currentPlayer:snatchModal.nextTurn,turnTimestamp:Date.now()});
    setSnatchModal(null);},[snatchModal,g,pid,wgs,rd]);
  const snatchReturn=useCallback(async()=>{if(!snatchModal||!g)return;
    if(snatchModal.phase==="pick"){await wgs({currentPlayer:snatchModal.nextTurn,turnTimestamp:Date.now()});setSnatchModal(null);return;}
    const nh={...g.hands};const myHand=[...(nh[pid]||[])];const oppHand=[...(nh[snatchModal.fromId]||[])];
    const si=myHand.findIndex(c=>c.id===snatchModal.card.id);if(si===-1){await wgs({currentPlayer:snatchModal.nextTurn,turnTimestamp:Date.now()});setSnatchModal(null);return;}
    oppHand.push(myHand[si]);nh[pid]=myHand.filter((_,i)=>i!==si);nh[snatchModal.fromId]=oppHand;
    await wgs({hands:nh,message:(rd.players[pid]?.name)+" returned the snatched card",currentPlayer:snatchModal.nextTurn,turnTimestamp:Date.now()});
    setSnatchModal(null);},[snatchModal,g,pid,wgs,rd]);

  const cardClick=ci=>{if(swap&&isAdm){admSwap(ci);return;}
    if(!myTurn||g?.winner||drawnCard||challenge||snatchModal)return;
    const card=myH[ci];
    if(drawStack>0){
      if(card.value==="shadow"){playC(ci);return;}
      if(drawStackType==="wild4"){
        if(card.value==="wild4"){setPendW(ci);setPickCol(true);}
        else{ps("error");setLMsg("Only +4 or Shadow can counter!");setTimeout(()=>setLMsg(""),1500);trigShake();}
      } else {
        if(card.value==="draw2"){playC(ci);}
        else if(card.value==="wild4"){setPendW(ci);setPickCol(true);}
        else{ps("error");setLMsg("Counter with +2/+4/Shadow or draw "+drawStack+"!");setTimeout(()=>setLMsg(""),1500);trigShake();}
      }
      return;}
    if(!canPlay(card,topC,g.currentColor)){ps("error");setLMsg("Can't play!");setTimeout(()=>setLMsg(""),1200);trigShake();return;}
    if(card.type==="wild"){setPendW(ci);setPickCol(true);}else playC(ci);};
  const colPick=c=>{setPickCol(false);if(pendW!==null){playC(pendW,c);setPendW(null);}};
  const colCancel=()=>{setPickCol(false);setPendW(null);};
  const callUno=async()=>{if(!(g.calledUno||{})[pid]){
    ps("uno");unoSndRef.current=Date.now(); // immediate feedback on press
    const clearGrace=g.unoGrace&&g.unoGrace.pid===pid?{unoGrace:null}:{};
    await wgs({calledUno:{...(g.calledUno||{}),[pid]:true},message:(rd.players[pid]?.name)+" called UNO!",...clearGrace});
    setLMsg("UNO!");setTimeout(()=>setLMsg(""),1200);}};
  const leave=async(e)=>{if(e&&e.stopPropagation)e.stopPropagation();
    bgm.stop();setMus(false);if(isHost)await remove(ref(db,"rooms/"+rc));
    else await remove(ref(db,"rooms/"+rc+"/players/"+pid));setRc("");setRd(null);setScr("menu");};
  const restart=async()=>{if(!isHost)return;lbUpdated.current=false;setRoundTimer(settings.roundTime||ROUND_TIME);setTurnTimer(TURN_TIME);
    const upd={status:"waiting",game:null};pls.forEach(([id,pd])=>{if(!pd.isBot){upd["players/"+id+"/ready"]=false;upd["players/"+id+"/reviewing"]=null;}});
    await update(ref(db,"rooms/"+rc),upd);setScr("lobby");};
  // Leave the post-win review and go back to the lobby (resets my ready + reviewing flag).
  const backToLobby=async()=>{try{await update(ref(db,"rooms/"+rc+"/players/"+pid),{reviewing:null,ready:false});}catch(e){}setScr("lobby");};
  const toggleMusic=()=>{ua();const on=bgm.toggle(scr==="game"?"game":"menu");musUserOff.current=!on;localStorage.setItem("uno_musicoff",on?"0":"1");setMus(on);};

  const shakeStyle=screenShake?{animation:"screenShake 0.4s ease-out"}:{};
  const gcHex=g?.currentColor?CH[g.currentColor]:"#FF6F00";
  // Global standings → crown for top-3, plain rank number for everyone else, by player id.
  const crownRank=useMemo(()=>{const m={};globalLB.slice(0,3).forEach((p,i)=>{if(p.id)m[p.id]=i+1;});return m;},[globalLB]);
  const rankOf=useMemo(()=>{const m={};globalLB.forEach((p,i)=>{if(p.id)m[p.id]=i+1;});return m;},[globalLB]);

  /* UNO grace window: if I'm the one who forgot to call, run a self-timer. When it
     expires, re-check the live state — if I still have one card and never called,
     auto-penalize me +2. If an opponent already caught me or I tapped UNO in time,
     the flag is gone and we just clear the marker. Only the forgetful player runs
     this, so there's a single authority for the penalty. */
  const graceUntil=g?.unoGrace?.until,gracePid=g?.unoGrace?.pid;
  useEffect(()=>{
    if(!graceUntil||gracePid!==pid)return;
    const t=setTimeout(async()=>{
      let fg=null;try{const snap=await get(ref(db,"rooms/"+rc+"/game"));if(snap.exists())fg=snap.val();}catch(e){}
      if(!fg||!fg.unoGrace||fg.unoGrace.pid!==pid){return;}
      if(fg.winner){update(ref(db,"rooms/"+rc+"/game"),{unoGrace:null}).catch(()=>{});return;}
      const hand=fg.hands?.[pid]||[];const cu=fg.calledUno||{};
      if(hand.length===1&&!cu[pid]){
        trigShake(); // sound handled by the "forgot uno" carddist in the message watcher
        const nh={...fg.hands};let ndp=[...(fg.drawPile||[])];const nd=[...(fg.discardPile||[])];
        if(ndp.length<2){const rs=sh(nd.slice(0,-1));ndp=[...ndp,...rs];}
        nh[pid]=[...(nh[pid]||[]),...ndp.splice(0,2)];
        setCardFlyFx({element:fg.currentColor||"yellow",count:2,toSelf:true,dir:victimDir(pid)});
        await wgs({hands:nh,drawPile:ndp,message:(rd.players[pid]?.name)+" forgot UNO! +2 penalty!",unoGrace:null});
      }else{update(ref(db,"rooms/"+rc+"/game"),{unoGrace:null}).catch(()=>{});}
    },Math.max(0,graceUntil-Date.now())+150);
    return()=>clearTimeout(t);
  },[graceUntil,gracePid,pid,rc,ps,wgs,rd,trigShake]);

  /* Audio settings panel — music + sound-fx toggles and volume sliders */
  const volRow=(icon,label,on,onToggle,vol,setVol,preview)=>(
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{color:"#ddd",fontSize:13,fontWeight:600}}>{icon} {label}</span>
        <button onClick={onToggle} style={{background:on?"rgba(255,215,0,0.9)":"rgba(255,255,255,0.06)",
          border:"none",borderRadius:8,padding:"3px 12px",fontSize:10,fontWeight:800,letterSpacing:1,
          color:on?"#000":"#889",cursor:"pointer",transition:"all 0.2s"}}>{on?"ON":"OFF"}</button>
      </div>
      <input type="range" min="0" max="1" step="0.01" value={vol}
        onChange={e=>setVol(parseFloat(e.target.value))}
        onPointerUp={()=>{if(preview)preview();}}
        style={{width:"100%",accentColor:"#FFD700",cursor:"pointer"}}/>
    </div>
  );
  const audioModal=showAudio&&(
    <div onClick={()=>setShowAudio(false)} style={{position:"fixed",inset:0,background:"rgba(3,6,12,0.5)",zIndex:400,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)",animation:"fadeIn 0.2s"}}>
      <div onClick={e=>e.stopPropagation()} style={{...GLASS,width:"min(88vw,330px)",padding:"22px 22px 24px",position:"relative"}}>
        <button onClick={()=>setShowAudio(false)} style={{position:"absolute",top:8,right:12,background:"none",border:"none",color:"#889",fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        <div style={{color:"#FFD700",fontWeight:800,fontSize:14,letterSpacing:3,marginBottom:20,fontFamily:"'Chakra Petch',sans-serif"}}>AUDIO</div>
        {volRow("🎵","Music",mus,toggleMusic,musVol,setMusVol,null)}
        {volRow("🔊","Sound FX",snd,()=>setSnd(!snd),sfxVol,setSfxVol,()=>sfx.p("card"))}
      </div>
    </div>
  );

  /* ═══ MENU ═══ */
  const myRank=myStats?getRank(myStats.totalPoints,myStats.gamesPlayed):UNRANKED;
  const nextRank=myStats?getNextRank(myStats.totalPoints,myStats.gamesPlayed):getNextRank(0,0);
  const menuCards=useMemo(()=>COLORS.map((c,i)=>({color:c,angle:-15+i*10,x:-60+i*40,delay:i*0.15})),[]);

  if(scr==="menu")return(
    <div style={{height:"100%",background:"#060e0c",
      display:"flex",flexDirection:"column",alignItems:"center",padding:0,
      fontFamily:"'Segoe UI',system-ui,sans-serif",position:"relative",overflow:"hidden"}}
      onClick={()=>{ua();if(!bgm.playing&&!musUserOff.current)startMusic();}}>
      <div style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:`url(${GAME_BG_URL+menuBg})`,backgroundSize:"cover",backgroundPosition:"center"}}/>
      <div style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",
        background:"radial-gradient(ellipse at 50% 12%,rgba(10,18,22,0.55) 0%,transparent 42%),linear-gradient(180deg,rgba(6,10,16,0.72) 0%,rgba(6,10,16,0.34) 24%,rgba(6,10,16,0.24) 50%,rgba(6,10,16,0.5) 78%,rgba(4,8,12,0.86) 100%)"}}/>
      <CanvasBG screen="menu"/>

      {/* Incoming game invites banner */}
      {Object.keys(gameInvites).length>0&&(()=>{const[fid,v]=Object.entries(gameInvites)[0];return(
        <div style={{position:"absolute",top:"max(10px,env(safe-area-inset-top,10px))",left:"50%",transform:"translateX(-50%)",zIndex:60,
          display:"flex",alignItems:"center",gap:10,padding:"8px 12px 8px 14px",borderRadius:14,
          background:"linear-gradient(135deg,rgba(46,125,50,0.95),rgba(27,94,32,0.95))",
          border:"1px solid rgba(129,199,132,0.4)",boxShadow:"0 6px 24px rgba(0,0,0,0.5)",
          backdropFilter:"blur(8px)",animation:"aslide 0.4s ease-out",maxWidth:"92vw"}}>
          <span style={{fontSize:18}}>🎮</span>
          <span style={{fontSize:12,color:"#fff",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}><b>{v.name}</b> invited you!</span>
          <button onClick={e=>{e.stopPropagation();acceptInvite(fid,v.code);}} style={{background:"#fff",border:"none",borderRadius:9,color:"#1B5E20",fontSize:11,fontWeight:900,padding:"6px 14px",cursor:"pointer",letterSpacing:1}}>JOIN</button>
          <button onClick={e=>{e.stopPropagation();remove(ref(db,"ginv/"+pid+"/"+fid));}} style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:8,color:"#fff",fontSize:12,width:24,height:24,cursor:"pointer"}}>×</button>
        </div>);})()}

      {/* Floating decorative cards */}
      <div style={{position:"absolute",top:"8%",left:"50%",transform:"translateX(-50%)",zIndex:1,pointerEvents:"none"}}>
        {menuCards.map((c,i)=>(
          <div key={i} style={{position:"absolute",left:c.x,transform:`rotate(${c.angle}deg)`,opacity:0.15}}>
            <div style={{animation:`menuCardFloat 4s ease-in-out ${c.delay}s infinite`}}>
              <Card card={{id:i,color:c.color,value:["7","2","5","9"][i],type:"number"}} sz="sm" /></div></div>))}
      </div>

      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",
        width:"100%",maxWidth:400,padding:"0 16px",flex:1,justifyContent:"center",gap:0,overflow:"auto"}}>

        {/* Logo (tap 5x to reveal admin login) */}
        <div style={{position:"relative",marginBottom:10,display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer"}} onClick={logoTap}>
          <div style={{animation:"menuLogo 4s ease-in-out infinite"}}>
            <div style={{width:62,height:62,transform:"rotate(45deg)",borderRadius:16,
              background:"linear-gradient(145deg,#2b3242,#12151d)",border:"2px solid #FFD700",
              boxShadow:"0 0 34px rgba(255,215,0,0.35),0 8px 30px rgba(0,0,0,0.5),inset 0 0 18px rgba(255,215,0,0.10)",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{transform:"rotate(-45deg)",fontFamily:"'Chakra Petch',sans-serif",fontWeight:700,fontSize:25,color:"#FFD700",
                textShadow:"0 0 14px rgba(255,215,0,0.6)"}}>RD</span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",lineHeight:0.92}}>
            <span style={{fontFamily:"'Chakra Petch',sans-serif",fontWeight:700,fontSize:40,letterSpacing:3,color:"#F4F7FB",
              textShadow:"0 2px 12px rgba(0,0,0,0.7),0 0 24px rgba(255,215,0,0.22)"}}>ROGUE</span>
            <span style={{fontFamily:"'Chakra Petch',sans-serif",fontWeight:600,fontSize:21,letterSpacing:11,paddingLeft:11,color:"#FFD700",marginTop:3,
              textShadow:"0 0 16px rgba(255,215,0,0.5)"}}>DECK</span>
          </div>
        </div>

        {/* Rank badge */}
        {myStats&&<div style={{marginBottom:8,padding:"8px 14px",borderRadius:16,background:"rgba(0,0,0,0.5)",
          border:`1px solid ${myRank.color}33`,animation:"fadeIn 0.5s",backdropFilter:"blur(8px)",
          width:"100%",maxWidth:320}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:18}}>{myRank.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:900,color:myRank.color,letterSpacing:2}}>{myRank.name.toUpperCase()}</div>
              <div style={{display:"flex",gap:2,marginTop:2}}>
                {[1,2,3,4,5].map(s=>(
                  <span key={s} style={{fontSize:11,filter:s<=myRank.stars?"none":"brightness(0.3)",
                    transition:"all 0.3s"}}>{s<=myRank.stars?"⭐":"☆"}</span>))}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:13,fontWeight:900,color:"#FFD700",fontFamily:"monospace"}}>{myStats.totalPoints}</div>
              <div style={{fontSize:7,color:"#778"}}>{myStats.gamesPlayed} games</div>
            </div>
          </div>
          {myRank.name==="Unranked"&&<div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden",marginTop:2}}>
            <div style={{height:"100%",borderRadius:2,background:"linear-gradient(90deg,#00E5FF88,#00E5FF)",
              width:`${Math.min(100,((myStats.gamesPlayed||0)/10)*100)}%`,transition:"width 0.5s"}}/></div>}
          {myRank.stars<5&&myRank.name!=="Unranked"&&<div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden",marginTop:2}}>
            <div style={{height:"100%",borderRadius:2,background:`linear-gradient(90deg,${myRank.color}88,${myRank.color})`,
              width:`${myRank.starProgress*100}%`,transition:"width 0.5s"}}/></div>}
          {nextRank&&<div style={{fontSize:7,color:myRank.name==="Unranked"?"#00E5FF":"#667",textAlign:"center",marginTop:3,fontWeight:myRank.name==="Unranked"?800:400,letterSpacing:myRank.name==="Unranked"?1:0}}>
            {nextRank.type==="games"?`CALIBRATING · ${myStats.gamesPlayed||0}/10 GAMES`:nextRank.type==="star"?`${nextRank.need} pts to ★${nextRank.nextStar}`:`${nextRank.need} pts to ${nextRank.name}`}</div>}
        </div>}

        {/* Main card */}
        <div style={{...GLASS,padding:"20px 20px 16px",width:"100%",marginBottom:8}}>
          <div onClick={()=>{ps("click");setStoreOpen(true);}} title="Customize (Store)" style={{width:64,height:64,borderRadius:"50%",margin:"0 auto 12px",cursor:"pointer",
            background:"radial-gradient(circle at 50% 32%,#2a3550,#141d2e)",border:"2px solid rgba(255,215,0,0.25)",
            display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            <Avatar id={myAvatar} state="idle" size={56} photo={myPhoto}/>
            {rankOf[pid]&&<div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",marginBottom:-6,zIndex:6,pointerEvents:"none"}}>
              <RankMark rank={rankOf[pid]} size={rankOf[pid]<=5?18:15}/></div>}
            <div style={{position:"absolute",bottom:-2,right:-2,width:22,height:22,borderRadius:"50%",background:"#E040FB",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",border:"2px solid #0b1120"}}>+</div>
          </div>
          <label style={{...ls,marginBottom:4}}>PLAYER NAME</label>
          <input value={pName} onChange={e=>setPName(e.target.value)} placeholder="Enter your name" maxLength={12}
            style={{...ist,marginBottom:8,fontSize:15,padding:"10px 14px",letterSpacing:1}}
            onFocus={e=>e.currentTarget.style.borderColor="rgba(255,215,0,0.4)"}
            onBlur={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}/>

          <button onClick={createRoom} style={{width:"100%",padding:"13px 0",borderRadius:14,border:"none",
            background:"linear-gradient(135deg,#E53935,#C62828,#B71C1C)",color:"#fff",
            fontSize:16,fontWeight:900,cursor:"pointer",letterSpacing:5,
            boxShadow:"0 6px 30px rgba(229,57,53,0.5),0 0 60px rgba(229,57,53,0.1)",
            transition:"all 0.25s",marginBottom:6}}
            onPointerEnter={e=>{e.currentTarget.style.transform="translateY(-2px) scale(1.01)";e.currentTarget.style.boxShadow="0 10px 40px rgba(229,57,53,0.7)";}}
            onPointerLeave={e=>{e.currentTarget.style.transform="translateY(0) scale(1)";e.currentTarget.style.boxShadow="0 6px 30px rgba(229,57,53,0.5)";}}>
            CREATE ROOM</button>

          <button onClick={createTeamRoom} style={{width:"100%",padding:"11px 0",borderRadius:13,border:"none",
              background:"linear-gradient(135deg,#B71C1C,#6A1B9A,#0D47A1)",color:"#fff",
              fontSize:13,fontWeight:900,cursor:"pointer",letterSpacing:3,
              boxShadow:"0 5px 24px rgba(106,27,154,0.45)",transition:"all 0.25s",marginBottom:6}}
              onPointerEnter={e=>e.currentTarget.style.transform="translateY(-2px) scale(1.01)"}
              onPointerLeave={e=>e.currentTarget.style.transform="translateY(0) scale(1)"}>
              ⚔️ TEAM MODE</button>

          <button onClick={quickPlayFFA} style={{width:"100%",padding:"10px 0",borderRadius:12,border:"none",
              background:"linear-gradient(135deg,#2E7D32,#1B5E20)",color:"#fff",
              fontSize:11,fontWeight:800,cursor:"pointer",letterSpacing:3,
              boxShadow:"0 4px 20px rgba(46,125,50,0.4)",transition:"all 0.25s",marginBottom:8}}
              onPointerEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onPointerLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
              FREE FOR ALL</button>

          <div style={{display:"flex",gap:6,alignItems:"stretch"}}>
            <input value={jc} onChange={e=>setJc(e.target.value.toUpperCase())} placeholder="CODE" maxLength={4}
              style={{...ist,flex:1,textAlign:"center",letterSpacing:10,fontSize:22,fontWeight:900,marginBottom:0,padding:"8px 10px"}}
              onFocus={e=>e.currentTarget.style.borderColor="rgba(255,215,0,0.4)"}
              onBlur={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}/>
            <button onClick={joinRoom} style={{padding:"0 24px",borderRadius:12,border:"none",
              background:"linear-gradient(135deg,#1976D2,#0D47A1)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",
              boxShadow:"0 4px 20px rgba(25,118,210,0.45)",transition:"all 0.25s",letterSpacing:2,whiteSpace:"nowrap"}}
              onPointerEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onPointerLeave={e=>e.currentTarget.style.transform="translateY(0)"}>JOIN</button>
          </div>
          {err&&<div style={{color:"#FF5252",fontSize:11,textAlign:"center",padding:8,background:"rgba(255,82,82,0.08)",
            borderRadius:10,marginTop:8,animation:"fadeIn 0.3s",border:"1px solid rgba(255,82,82,0.12)"}}>{err}</div>}
        </div>

        {/* Bottom buttons */}
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
          <button onClick={()=>{ps("click");setShowGlobalLB(true);}} style={{background:"rgba(255,215,0,0.06)",
            border:"1px solid rgba(255,215,0,0.15)",padding:"7px 18px",borderRadius:12,
            color:"#FFD700",fontSize:11,fontWeight:800,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:5,letterSpacing:2}}
            onPointerEnter={e=>{e.currentTarget.style.background="rgba(255,215,0,0.12)";e.currentTarget.style.transform="translateY(-1px)";}}
            onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,215,0,0.06)";e.currentTarget.style.transform="translateY(0)";}}>
            🏆 RANKINGS</button>
          <button onClick={()=>{ps("click");setStoreOpen(true);}} style={{background:"rgba(156,39,176,0.1)",
            border:"1px solid rgba(224,64,251,0.25)",padding:"7px 18px",borderRadius:12,
            color:"#E040FB",fontSize:11,fontWeight:800,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:5,letterSpacing:2}}
            onPointerEnter={e=>{e.currentTarget.style.background="rgba(156,39,176,0.2)";e.currentTarget.style.transform="translateY(-1px)";}}
            onPointerLeave={e=>{e.currentTarget.style.background="rgba(156,39,176,0.1)";e.currentTarget.style.transform="translateY(0)";}}>
            🛒 STORE</button>
          <button onClick={()=>{ps("click");setShowAccount(true);}} style={{background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.1)",padding:"7px 14px",borderRadius:12,
            color:"#aaa",fontSize:11,fontWeight:700,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:4,letterSpacing:1}}
            onPointerEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.transform="translateY(-1px)";}}
            onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.transform="translateY(0)";}}>
            👤 ACCOUNT</button>
          <button onClick={()=>{ps("click");setShowFriends(true);setFriendMsg("");}} style={{background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.1)",padding:"7px 14px",borderRadius:12,position:"relative",
            color:"#aaa",fontSize:11,fontWeight:700,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:4,letterSpacing:1}}
            onPointerEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.transform="translateY(-1px)";}}
            onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.transform="translateY(0)";}}>
            🤝 FRIENDS
            {(Object.keys(friendReqs).length+Object.keys(gameInvites).length)>0&&<span style={{position:"absolute",top:-5,right:-5,
              background:"#E53935",color:"#fff",fontSize:9,fontWeight:900,minWidth:16,height:16,borderRadius:8,
              display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
              boxShadow:"0 0 8px rgba(229,57,53,0.6)"}}>{Object.keys(friendReqs).length+Object.keys(gameInvites).length}</span>}
          </button>
          <button onClick={e=>{e.stopPropagation();ua();setShowAudio(true);}} style={{background:"none",
            border:"1px solid rgba(255,255,255,0.1)",padding:"7px 16px",borderRadius:12,
            color:(mus||snd)?"#FFD700":"#778",fontSize:11,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:4}}
            onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.25)"}
            onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}>
            🔊 AUDIO</button>
          {isAdm&&<button onClick={()=>setShowAdm(true)} style={{background:"none",border:"none",color:"#FFD700",fontSize:8,cursor:"pointer",padding:4,fontWeight:700,letterSpacing:1}}>ADMIN</button>}
        </div>
      </div>
      {audioModal}

      {/* Calibration-complete reveal */}
      {placed&&(<div style={{position:"fixed",inset:0,background:"rgba(3,6,12,0.78)",zIndex:400,
        display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)",animation:"fadeIn 0.3s"}}
        onClick={()=>setPlaced(null)}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:"28px 24px",width:"88%",maxWidth:340,textAlign:"center"}}>
          <div style={{fontSize:10,fontWeight:900,letterSpacing:4,color:"#00E5FF",marginBottom:6}}>CALIBRATION COMPLETE</div>
          <div style={{fontSize:12,color:"#aab",marginBottom:18}}>Your first 10 games are done — you've been placed!</div>
          <div style={{width:96,height:96,margin:"0 auto 12px",borderRadius:"50%",background:placed.bg,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:46,boxShadow:`0 0 40px ${placed.color}66`,animation:"trophyPop 0.7s cubic-bezier(.34,1.56,.64,1) both"}}>{placed.icon}</div>
          <div style={{fontSize:24,fontWeight:900,color:placed.color,letterSpacing:2,fontFamily:"'Chakra Petch',sans-serif",textShadow:`0 0 20px ${placed.color}66`}}>{placed.name.toUpperCase()}</div>
          <div style={{display:"flex",justifyContent:"center",gap:3,margin:"8px 0 18px"}}>
            {[1,2,3,4,5].map(s=><span key={s} style={{fontSize:18,color:s<=placed.stars?placed.color:"#445"}}>{s<=placed.stars?"⭐":"☆"}</span>)}
          </div>
          <button onClick={()=>setPlaced(null)} style={{...bst,background:`linear-gradient(135deg,${placed.color},${placed.color}cc)`,color:"#0a0a0a",fontSize:13,letterSpacing:2}}>CONTINUE</button>
        </div></div>)}

      {/* Global Leaderboard Modal */}
      {showGlobalLB&&(<div style={{position:"fixed",inset:0,background:"rgba(3,6,12,0.62)",zIndex:200,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(12px)",animation:"fadeIn 0.3s"}} onClick={()=>setShowGlobalLB(false)}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:0,width:"92%",maxWidth:400,maxHeight:"85vh",
          overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px 20px 10px",borderBottom:"1px solid rgba(255,215,0,0.08)"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#FFD700",textAlign:"center",letterSpacing:4}}>🏆 GLOBAL RANKINGS</div>
            <div style={{fontSize:9,color:"#667",textAlign:"center",marginTop:4,letterSpacing:2}}>Your first 10 games calibrate your rank</div>
          </div>
          <div style={{overflow:"auto",padding:"8px 12px",flex:1}}>
            {globalLB.length===0?<div style={{textAlign:"center",color:"#556",padding:30,fontSize:12}}>No players yet. Be the first!</div>
            :globalLB.slice(0,50).map((p,i)=>{
              const r=getRank(p.totalPoints,p.gamesPlayed);const isMe=p.id===pid;
              return(<div key={p.id} onClick={()=>{sfx.p("click");setStatsView(p);}} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 8px",
                borderRadius:12,marginBottom:3,cursor:"pointer",
                background:isMe?"rgba(255,215,0,0.06)":i<3?"rgba(255,255,255,0.02)":"transparent",
                border:isMe?"1px solid rgba(255,215,0,0.12)":i===0?"1px solid rgba(255,215,0,0.08)":"1px solid transparent",
                animation:`slideIn 0.3s ease-out ${Math.min(i*0.04,0.8)}s both`}}>
                <div style={{width:34,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#556",
                  borderRadius:8,...(i<5?{background:`radial-gradient(circle at 50% 45%,${["rgba(255,150,140,0.28)","rgba(190,140,255,0.26)","rgba(150,205,255,0.28)","rgba(255,140,90,0.26)","rgba(190,140,255,0.26)"][i]},rgba(255,255,255,0) 70%)`}:{})}}>
                  {i<5?<Crown rank={i+1} size={32}/>:(i+1)}</div>
                <div style={{flexShrink:0}}><Avatar id={p.avatar} photo={p.photo} size={30}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:isMe?"#FFD700":"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span>
                    {Array.isArray(p.flags)&&p.flags.map(f=><span key={f} style={{fontSize:12,flexShrink:0}}>{flagEmoji(f)}</span>)}
                    <span style={{fontSize:7,color:"#556",fontFamily:"monospace",flexShrink:0}}>{getTag(p.id)}</span>{isMe&&<span style={{fontSize:7,color:"#889",flexShrink:0}}>(you)</span>}</div>
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                    <span style={{fontSize:8}}>{r.icon}</span>
                    <span style={{fontSize:7,color:r.color,fontWeight:700,letterSpacing:1}}>{r.name.toUpperCase()}</span>
                    {r.stars>0&&<span style={{fontSize:7}}>{"⭐".repeat(r.stars)}</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:12,fontWeight:900,color:"#FFD700",fontFamily:"monospace"}}>{p.totalPoints}</div>
                  <div style={{fontSize:7,color:"#667"}}>{p.gamesPlayed} games</div>
                </div>
              </div>);})}
          </div>
          <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,215,0,0.08)",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",gap:4,flexWrap:"wrap"}}>
              {RANK_TIERS.map(r=>(
                <div key={r.name} style={{display:"flex",alignItems:"center",gap:2,fontSize:7,color:r.color,
                  padding:"2px 5px",borderRadius:6,background:"rgba(0,0,0,0.3)"}}>
                  <span>{r.icon}</span><span style={{fontWeight:700}}>{r.name}</span>
                  <span style={{color:"#556"}}>{r.min}+</span></div>))}
            </div>
          </div>
        </div>
      </div>)}

      {statsView&&<PlayerStatsModal stats={statsView} isOwner={statsView.id===pid} onClose={()=>setStatsView(null)}/>}
      {storeOpen&&<StoreModal onClose={()=>setStoreOpen(false)} coins={coins} owned={owned}
        myAvatar={myAvatar} myThrow={myThrow} onBuy={buyItem} onEquipAvatar={equipAvatar} onEquipThrow={equipThrow} isAdm={isAdm}
        myPhoto={myPhoto} onPhoto={setMyPhoto}/>}

      {/* Account Modal */}
      {showFriends&&(<div style={{position:"fixed",inset:0,background:"rgba(3,6,12,0.62)",zIndex:200,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(12px)",animation:"fadeIn 0.3s"}} onClick={()=>{setShowFriends(false);setFriendMsg("");}}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:"20px 18px",width:"92%",maxWidth:400,maxHeight:"88vh",overflow:"auto",position:"relative"}}>
          <button onClick={()=>{setShowFriends(false);setFriendMsg("");}} style={{position:"absolute",top:8,right:12,background:"none",border:"none",color:"#889",fontSize:24,cursor:"pointer"}}>×</button>
          <div style={{fontSize:16,fontWeight:900,color:"#FFD700",letterSpacing:2,marginBottom:12,fontFamily:"'Chakra Petch',sans-serif"}}>🤝 FRIENDS</div>
          {/* Your ID to share */}
          <div style={{background:"rgba(255,215,0,0.06)",border:"1px solid rgba(255,215,0,0.15)",borderRadius:10,padding:"8px 12px",marginBottom:12}}>
            <div style={{fontSize:8,color:"#889",letterSpacing:2,marginBottom:3}}>YOUR PLAYER ID — SHARE TO GET ADDED</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontFamily:"monospace",fontSize:15,color:"#FFD700",fontWeight:800,letterSpacing:1,flex:1}}>{pid}</span>
              <button onClick={()=>{try{navigator.clipboard.writeText(pid);setFriendMsg("ID copied!");setTimeout(()=>setFriendMsg(""),1200);}catch(e){}}}
                style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:7,color:"#ddd",fontSize:10,fontWeight:700,padding:"5px 10px",cursor:"pointer"}}>COPY</button>
            </div>
          </div>
          {/* Add friend */}
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <input value={friendIdInput} onChange={e=>setFriendIdInput(e.target.value)} placeholder="Enter friend's Player ID"
              style={{...ist,marginBottom:0,flex:1,fontSize:12}}/>
            <button onClick={sendFriendReq} style={{background:"linear-gradient(135deg,#2E7D32,#1B5E20)",border:"none",borderRadius:12,
              color:"#fff",fontSize:11,fontWeight:800,letterSpacing:1,padding:"0 16px",cursor:"pointer"}}>ADD</button>
          </div>
          {friendMsg&&<div style={{fontSize:10,color:friendMsg.includes("Failed")||friendMsg.includes("No player")||friendMsg.includes("own")?"#EF5350":"#4CAF50",marginBottom:8,textAlign:"center"}}>{friendMsg}</div>}
          {/* Pending game invites */}
          {Object.keys(gameInvites).length>0&&<div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:"#4CAF50",letterSpacing:2,marginBottom:5,fontWeight:800}}>🎮 GAME INVITES</div>
            {Object.entries(gameInvites).map(([fid,v])=>(
              <div key={fid} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:10,marginBottom:4,
                background:"rgba(76,175,80,0.1)",border:"1px solid rgba(76,175,80,0.25)"}}>
                <span style={{flex:1,fontSize:12,color:"#ddd",fontWeight:600}}>{v.name} invited you</span>
                <button onClick={()=>acceptInvite(fid,v.code)} style={{background:"#2E7D32",border:"none",borderRadius:7,color:"#fff",fontSize:10,fontWeight:800,padding:"5px 12px",cursor:"pointer"}}>JOIN</button>
              </div>))}
          </div>}
          {/* Pending friend requests */}
          {Object.keys(friendReqs).length>0&&<div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:"#FFD700",letterSpacing:2,marginBottom:5,fontWeight:800}}>FRIEND REQUESTS</div>
            {Object.entries(friendReqs).map(([fid,v])=>(
              <div key={fid} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:10,marginBottom:4,
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
                <span style={{flex:1,fontSize:12,color:"#ddd",fontWeight:600}}>{v.name}</span>
                <button onClick={()=>acceptFriendReq(fid,v.name)} style={{background:"#2E7D32",border:"none",borderRadius:7,color:"#fff",fontSize:10,fontWeight:800,padding:"5px 10px",cursor:"pointer"}}>✓</button>
                <button onClick={()=>declineFriendReq(fid)} style={{background:"rgba(255,82,82,0.15)",border:"1px solid rgba(255,82,82,0.3)",borderRadius:7,color:"#FF5252",fontSize:10,fontWeight:800,padding:"5px 10px",cursor:"pointer"}}>✕</button>
              </div>))}
          </div>}
          {/* Friends list */}
          <div style={{fontSize:9,color:"#889",letterSpacing:2,marginBottom:5,fontWeight:800}}>MY FRIENDS ({Object.keys(friends).length})</div>
          {Object.keys(friends).length===0&&<div style={{fontSize:11,color:"#667",textAlign:"center",padding:"12px 0"}}>No friends yet. Share your ID or add someone above.</div>}
          {Object.entries(friends).map(([fid,v])=>{const online=globalLB.find(p=>p.id===fid);return(
            <div key={fid} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:10,marginBottom:4,
              background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{width:28,height:28,borderRadius:8,background:CG[COLORS[fid.charCodeAt(0)%4]],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>{(v.name||"?")[0]?.toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,color:"#ddd",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{online?.name||v.name}</div>
                <div style={{fontSize:8,color:"#667"}}>{online?online.totalPoints+" pts":"—"}</div>
              </div>
              {delFriendId===fid?(<>
                <span style={{fontSize:9,color:"#EF5350",fontWeight:700}}>Remove?</span>
                <button onClick={()=>{removeFriend(fid);setDelFriendId(null);}} style={{background:"#C62828",border:"none",borderRadius:6,color:"#fff",fontSize:9,fontWeight:800,padding:"5px 9px",cursor:"pointer"}}>YES</button>
                <button onClick={()=>setDelFriendId(null)} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:6,color:"#ddd",fontSize:9,fontWeight:800,padding:"5px 9px",cursor:"pointer"}}>NO</button>
              </>):(<>
                {rc&&scr==="lobby"&&<button onClick={()=>inviteFriend(fid)} style={{background:"#1565C0",border:"none",borderRadius:7,color:"#fff",fontSize:9,fontWeight:800,padding:"5px 10px",cursor:"pointer"}}>INVITE</button>}
                <button onClick={()=>setDelFriendId(fid)} title="Remove friend" style={{background:"none",border:"1px solid rgba(255,82,82,0.25)",borderRadius:7,fontSize:12,padding:"4px 8px",cursor:"pointer"}}>🗑️</button>
              </>)}
            </div>);})}
        </div>
      </div>)}
      {showAccount&&(<div style={{position:"fixed",inset:0,background:"rgba(3,6,12,0.62)",zIndex:200,
        display:"flex",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(12px)",animation:"fadeIn 0.3s"}} onClick={()=>{setShowAccount(false);setRestoreMsg("");}}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:20,width:"92%",maxWidth:360}}>
          <div style={{fontSize:16,fontWeight:900,color:"#FFD700",textAlign:"center",letterSpacing:3,marginBottom:16}}>👤 YOUR ACCOUNT</div>

          <div style={{fontSize:9,color:"#889",letterSpacing:2,marginBottom:4}}>YOUR PLAYER ID</div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <div style={{flex:1,padding:"10px 12px",borderRadius:10,background:"rgba(0,0,0,0.5)",
              border:"1px solid rgba(255,215,0,0.15)",fontFamily:"monospace",fontSize:14,fontWeight:800,
              color:"#FFD700",letterSpacing:3,wordBreak:"break-all"}}>{pid}</div>
            <button onClick={copyPid} style={{padding:"8px 14px",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",
              background:"rgba(255,215,0,0.08)",color:"#FFD700",fontSize:10,fontWeight:800,cursor:"pointer",
              letterSpacing:1,transition:"all 0.2s",whiteSpace:"nowrap"}}
              onPointerEnter={e=>e.currentTarget.style.background="rgba(255,215,0,0.15)"}
              onPointerLeave={e=>e.currentTarget.style.background="rgba(255,215,0,0.08)"}>COPY</button>
          </div>
          <div style={{fontSize:8,color:"#667",marginBottom:16,lineHeight:1.5,padding:"0 2px"}}>
            Save this ID to recover your account on another device or browser. Your ranking, stats, and progress are tied to this ID.</div>

          {/* Flags — up to 2 (dual citizens); shown on the global leaderboard */}
          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:"#889",letterSpacing:2}}>YOUR FLAGS <span style={{color:"#667"}}>(pick up to 2)</span></div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {myFlags.length>0&&<span style={{fontSize:18}}>{myFlags.map(f=>flagEmoji(f)).join(" ")}</span>}
                <button onClick={()=>{setFlagEdit(!flagEdit);setFlagSearch("");}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid rgba(255,215,0,0.25)",
                  background:"rgba(255,215,0,0.08)",color:"#FFD700",fontSize:9,fontWeight:800,cursor:"pointer",letterSpacing:1}}>{flagEdit?"DONE":(myFlags.length?"EDIT":"ADD")}</button>
              </div>
            </div>
            {flagEdit&&<div>
              <input value={flagSearch} onChange={e=>setFlagSearch(e.target.value)} placeholder="Search country…"
                style={{...ist,marginBottom:8,fontSize:12}}/>
              <div style={{maxHeight:190,overflowY:"auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                {COUNTRIES.filter(([cc,n])=>n.toLowerCase().includes(flagSearch.toLowerCase())||cc.toLowerCase().includes(flagSearch.toLowerCase())).map(([cc,n])=>{
                  const on=myFlags.includes(cc);
                  return(<button key={cc} onClick={()=>{
                    if(on)setMyFlags(myFlags.filter(x=>x!==cc));
                    else if(myFlags.length<2)setMyFlags([...myFlags,cc]);
                    else setMyFlags([myFlags[1],cc]);
                  }} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",borderRadius:8,cursor:"pointer",textAlign:"left",
                    background:on?"rgba(76,175,80,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${on?"rgba(76,175,80,0.4)":"rgba(255,255,255,0.06)"}`}}>
                    <span style={{fontSize:16}}>{flagEmoji(cc)}</span>
                    <span style={{fontSize:9,color:on?"#7CE38B":"#ccc",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span>
                    {on&&<span style={{marginLeft:"auto",fontSize:10,color:"#4CAF50"}}>✓</span>}</button>);})}
              </div>
            </div>}
          </div>

          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:9,color:"#889",letterSpacing:2}}>ACCOUNTS ON THIS DEVICE</div>
              <div style={{fontSize:9,color:"#667",fontWeight:800}}>{accounts.length}/3</div>
            </div>
            {accounts.map(a=>{const cur=a.pid===pid;return(
              <div key={a.pid} onClick={()=>{if(!cur){sfx.p("click");switchToAccount(a.pid,a.name);}}}
                style={{display:"flex",alignItems:"center",gap:8,padding:"9px 11px",borderRadius:10,marginBottom:6,
                  background:cur?"rgba(76,175,80,0.12)":"rgba(255,255,255,0.04)",
                  border:`1px solid ${cur?"rgba(76,175,80,0.35)":"rgba(255,255,255,0.06)"}`,
                  cursor:cur?"default":"pointer"}}>
                <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                  background:cur?"linear-gradient(135deg,#4CAF50,#2E7D32)":"rgba(255,255,255,0.08)",
                  fontSize:13,fontWeight:900,color:"#fff"}}>{(a.name||"?").charAt(0).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:800,color:cur?"#7CE38B":"#DDD",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name||"(no name)"}</div>
                  <div style={{fontSize:9,color:"#778",fontFamily:"monospace",letterSpacing:1}}>{getTag(a.pid)}</div>
                </div>
                {cur?<div style={{fontSize:8,fontWeight:800,color:"#4CAF50",letterSpacing:1}}>ACTIVE</div>
                  :<div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{fontSize:8,fontWeight:800,color:"#5C9",letterSpacing:1}}>TAP TO USE</div>
                    <button onClick={e=>{e.stopPropagation();setDelText("");setDelAcc(a);}} style={{padding:"3px 7px",borderRadius:7,
                      border:"1px solid rgba(244,67,54,0.25)",background:"rgba(244,67,54,0.08)",color:"#EF5350",fontSize:9,fontWeight:800,cursor:"pointer"}}>✕</button>
                  </div>}
              </div>);})}
            {accounts.length<3&&<button onClick={newAccount} style={{width:"100%",padding:"9px",borderRadius:10,
              border:"1px dashed rgba(255,215,0,0.3)",background:"rgba(255,215,0,0.05)",color:"#FFD700",fontSize:10,fontWeight:800,
              cursor:"pointer",letterSpacing:1}}>+ ADD NEW ACCOUNT</button>}
          </div>

          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14}}>
            <div style={{fontSize:9,color:"#889",letterSpacing:2,marginBottom:4}}>RESTORE / ADD BY PLAYER ID</div>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <input value={restoreId} onChange={e=>setRestoreId(e.target.value)} placeholder="Enter Player ID"
                style={{...ist,flex:1,marginBottom:0,fontSize:12,fontFamily:"monospace",letterSpacing:2}}
                onFocus={e=>e.currentTarget.style.borderColor="rgba(255,215,0,0.4)"}
                onBlur={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}/>
              <button onClick={restoreAccount} style={{padding:"8px 14px",borderRadius:10,border:"none",
                background:"linear-gradient(135deg,#1976D2,#0D47A1)",color:"#fff",fontSize:10,fontWeight:800,
                cursor:"pointer",letterSpacing:1,transition:"all 0.2s",whiteSpace:"nowrap"}}
                onPointerEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
                onPointerLeave={e=>e.currentTarget.style.transform="translateY(0)"}>RESTORE</button>
            </div>
            <div style={{fontSize:8,color:"#667",lineHeight:1.5,padding:"0 2px"}}>
              Paste a previously saved Player ID to restore your stats and ranking.</div>
          </div>

          {restoreMsg&&<div style={{textAlign:"center",fontSize:10,fontWeight:700,marginTop:10,padding:"6px 12px",
            borderRadius:8,animation:"fadeIn 0.3s",
            color:/switching|copied/i.test(restoreMsg)?"#4CAF50":"#FF9800",
            background:/switching|copied/i.test(restoreMsg)?"rgba(76,175,80,0.1)":"rgba(255,152,0,0.1)",
            border:`1px solid ${/switching|copied/i.test(restoreMsg)?"rgba(76,175,80,0.2)":"rgba(255,152,0,0.2)"}`
          }}>{restoreMsg}</div>}

          <button onClick={()=>{setShowAccount(false);setRestoreMsg("");}} style={{width:"100%",marginTop:14,padding:"10px",
            borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",background:"none",
            color:"#889",fontSize:11,cursor:"pointer",letterSpacing:2,transition:"all 0.2s"}}
            onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.2)"}
            onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}>CLOSE</button>
        </div>
      </div>)}

      {/* Delete-account confirmation (retype name) */}
      {delAcc&&(()=>{const word=(delAcc.name||"").trim()||"DELETE";const ok=delText.trim()===word;return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:400,
          display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",animation:"fadeIn 0.25s"}}
          onClick={()=>{setDelAcc(null);setDelText("");}}>
          <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:22,width:"88%",maxWidth:320}}>
            <div style={{fontSize:14,fontWeight:900,color:"#EF5350",textAlign:"center",letterSpacing:2,marginBottom:10}}>⚠️ DELETE ACCOUNT</div>
            <div style={{fontSize:11,color:"#bbc",textAlign:"center",lineHeight:1.5,marginBottom:14}}>
              This <b style={{color:"#EF5350"}}>permanently deletes</b> <b style={{color:"#fff"}}>{delAcc.name||"(no name)"}</b> ({getTag(delAcc.pid)}) — stats and ranking are erased from the server and <b style={{color:"#fff"}}>cannot be recovered</b>. The name becomes free for anyone to take.
            </div>
            <div style={{fontSize:9,color:"#889",letterSpacing:1,marginBottom:5,textAlign:"center"}}>TYPE <b style={{color:"#FFD700"}}>{word}</b> TO CONFIRM</div>
            <input value={delText} onChange={e=>setDelText(e.target.value)} placeholder={word} autoFocus
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.12)",
                background:"rgba(0,0,0,0.4)",color:"#fff",fontSize:13,outline:"none",marginBottom:12,textAlign:"center"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setDelAcc(null);setDelText("");}} style={{flex:1,padding:"10px",borderRadius:10,
                border:"1px solid rgba(255,255,255,0.1)",background:"none",color:"#aab",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1}}>CANCEL</button>
              <button disabled={!ok} onClick={()=>{const p=delAcc.pid,nm=delAcc.name;setDelAcc(null);setDelText("");removeAccount(p,nm);}}
                style={{flex:1,padding:"10px",borderRadius:10,border:"none",opacity:ok?1:0.4,cursor:ok?"pointer":"not-allowed",
                  background:"linear-gradient(135deg,#E53935,#B71C1C)",color:"#fff",fontSize:11,fontWeight:800,letterSpacing:1}}>DELETE</button>
            </div>
          </div>
        </div>);})()}

      {/* Admin Login (logo 5x tap, or ••• dot) */}
      {showAdm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:400,
        display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",animation:"fadeIn 0.25s"}}
        onClick={()=>{setShowAdm(false);setAdmP("");}}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:22,width:"88%",maxWidth:300}}>
          <div style={{fontSize:14,fontWeight:900,color:"#FFD700",textAlign:"center",letterSpacing:3,marginBottom:16}}>🔒 ADMIN</div>
          {err==="Wrong password"&&<div style={{textAlign:"center",color:"#EF5350",fontSize:10,fontWeight:700,marginBottom:10}}>{err}</div>}
          <input value={admP} onChange={e=>{setAdmP(e.target.value);if(err)setErr("");}} type="password" placeholder="Password" autoFocus
            onKeyDown={e=>{if(e.key==="Enter"){if(admP===ADMIN_PASS){setIsAdm(true);setShowAdm(false);setAdmP("");}else setErr("Wrong password");}}}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,215,0,0.2)",
              background:"rgba(0,0,0,0.4)",color:"#fff",fontSize:14,outline:"none",marginBottom:12,textAlign:"center",letterSpacing:2}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setShowAdm(false);setAdmP("");}} style={{flex:1,padding:"10px",borderRadius:10,
              border:"1px solid rgba(255,255,255,0.1)",background:"none",color:"#889",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1}}>CANCEL</button>
            <button onClick={()=>{if(admP===ADMIN_PASS){setIsAdm(true);setShowAdm(false);setAdmP("");}else setErr("Wrong password");}}
              style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:isAdm?"#2E7D32":"linear-gradient(135deg,#FFD700,#DAA520)",
                color:isAdm?"#fff":"#1a1200",fontSize:11,fontWeight:800,cursor:"pointer",letterSpacing:1}}>{isAdm?"✓ ACTIVE":"UNLOCK"}</button>
          </div>
          {isAdm&&(()=>{const tgt=admTgt||pid;const amt=parseInt(admPts,10)||0;
            const others=globalLB.filter(p=>p.id!==pid);
            const iBtn={flex:1,padding:"9px 4px",borderRadius:9,fontSize:10,fontWeight:800,cursor:"pointer",letterSpacing:0.5};
            return(<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,215,0,0.15)"}}>
              <div style={{fontSize:10,fontWeight:900,color:"#FFD700",letterSpacing:2,marginBottom:8}}>⚡ GRANT POINTS / COINS</div>
              <select value={tgt} onChange={e=>setAdmTgt(e.target.value)}
                style={{width:"100%",padding:"9px 10px",borderRadius:9,border:"1px solid rgba(255,215,0,0.2)",background:"rgba(0,0,0,0.5)",color:"#fff",fontSize:11,outline:"none",marginBottom:8}}>
                <option value={pid}>You — {pName||"Me"}</option>
                {others.map(p=><option key={p.id} value={p.id}>{p.name||"Player"} · {p.totalPoints||0}pts · {p.coins||0}🪙</option>)}
              </select>
              <input value={admPts} onChange={e=>setAdmPts(e.target.value.replace(/[^0-9]/g,""))} inputMode="numeric" placeholder="amount"
                style={{width:"100%",padding:"9px 12px",borderRadius:9,border:"1px solid rgba(255,215,0,0.2)",background:"rgba(0,0,0,0.4)",color:"#fff",fontSize:13,outline:"none",marginBottom:8,textAlign:"center",letterSpacing:1}}/>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                <button onClick={()=>adminGrant(tgt,"totalPoints",amt)} style={{...iBtn,border:"none",background:"linear-gradient(135deg,#43A047,#2E7D32)",color:"#fff"}}>+ POINTS</button>
                <button onClick={()=>adminGrant(tgt,"totalPoints",-amt)} style={{...iBtn,border:"1px solid rgba(244,67,54,0.35)",background:"rgba(244,67,54,0.1)",color:"#EF5350"}}>− POINTS</button>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>adminGrant(tgt,"coins",amt)} style={{...iBtn,border:"none",background:"linear-gradient(135deg,#FFB300,#DAA520)",color:"#1a1200"}}>+ COINS</button>
                <button onClick={()=>adminGrant(tgt,"coins",-amt)} style={{...iBtn,border:"1px solid rgba(255,179,0,0.35)",background:"rgba(255,179,0,0.08)",color:"#FFB300"}}>− COINS</button>
              </div>
              {admMsg&&<div style={{textAlign:"center",color:"#4CAF50",fontSize:10,fontWeight:800,marginTop:8}}>{admMsg}</div>}
            </div>);})()}
          {isAdm&&<button onClick={()=>{setIsAdm(false);setShowAdm(false);}} style={{width:"100%",marginTop:8,padding:"8px",borderRadius:10,
            border:"1px solid rgba(244,67,54,0.25)",background:"rgba(244,67,54,0.08)",color:"#EF5350",fontSize:10,fontWeight:700,cursor:"pointer"}}>LOG OUT ADMIN</button>}
        </div>
      </div>)}

      <style>{globalCSS}</style>
    </div>);

  /* ═══ LOBBY ═══ */
  if(scr==="lobby")return(
    <div style={{height:"100%",background:"radial-gradient(ellipse at 50% 25%,#1a2f2a 0%,#0f1f1c 35%,#0a1614 65%,#060e0c 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:14,
      fontFamily:"'Segoe UI',system-ui,sans-serif",position:"relative",overflowY:"auto",overflowX:"hidden"}}>
      <CanvasBG screen="lobby"/>
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%"}}>
        <div style={{color:"rgba(255,215,0,0.4)",fontSize:10,letterSpacing:5,marginBottom:5}}>ROOM CODE</div>
        <div style={{fontSize:48,fontWeight:900,letterSpacing:16,color:"#FFD700",
          textShadow:"0 0 45px rgba(255,215,0,0.5),0 0 90px rgba(255,215,0,0.2)",marginBottom:20,fontFamily:"Arial Black",
          animation:"codeGlow 2s ease-in-out infinite"}}>{rc}</div>
        <div style={{...GLASS,padding:20,width:"100%",maxWidth:380,marginBottom:18}}>
          {settings.teamMode?(()=>{
            const withTeam=pls.map(([id,pd],i)=>({id,pd,team:settings.autoSplit?(i%2===0?"chaos":"order"):(pd.team||null)}));
            const un=withTeam.filter(x=>!x.team);
            const chip=(x)=>(<div key={x.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 5px",borderRadius:8,marginBottom:3,background:x.id===pid?"rgba(255,215,0,0.08)":"rgba(0,0,0,0.25)"}}>
              <Avatar id={x.pd.avatar} size={22} photo={x.pd.photo}/>
              <span style={{flex:1,minWidth:0,fontSize:10,color:"#ddd",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.pd.name}{x.id===pid?" (you)":""}</span>
              {isHost&&x.pd.isBot&&<button onClick={e=>{e.stopPropagation();removeBot(x.id);}} style={{background:"none",border:"1px solid rgba(255,82,82,0.25)",color:"#FF5252",width:18,height:18,borderRadius:5,fontSize:11,cursor:"pointer",lineHeight:1,flexShrink:0}}>×</button>}
            </div>);
            return(<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{color:"#889",fontSize:9,letterSpacing:3}}>TEAMS ({pls.length}/{settings.maxPlayers||MAX_PLAYERS})</span>
                <div onClick={()=>{if(!isHost)return;const na=!settings.autoSplit;if(!na)pls.forEach(([id],i)=>setTeam(id,i%2===0?"chaos":"order"));saveSetting("autoSplit",na);}}
                  style={{display:"flex",alignItems:"center",gap:6,cursor:isHost?"pointer":"default"}}>
                  <span style={{fontSize:8,fontWeight:800,letterSpacing:1,color:"#aaa"}}>AUTO-SHUFFLE</span>
                  <div style={{width:32,height:18,borderRadius:9,background:settings.autoSplit?"rgba(46,125,50,0.6)":"rgba(255,255,255,0.08)",position:"relative",transition:"all 0.3s"}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:settings.autoSplit?"#4CAF50":"#555",position:"absolute",top:3,left:settings.autoSplit?17:3,transition:"all 0.3s"}}/></div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:(!settings.autoSplit&&un.length)?8:0}}>
                {["chaos","order"].map(tk=>{const T=TEAMS[tk];const mem=withTeam.filter(x=>x.team===tk);const canJoin=!settings.autoSplit&&rd?.players?.[pid]?.team!==tk;
                  return(<div key={tk} onClick={()=>{if(canJoin)setTeam(pid,tk);}} style={{flex:1,minWidth:0,borderRadius:12,padding:"8px 7px",
                    background:`linear-gradient(180deg,${T.color}22,${T.color}08)`,border:`1px solid ${T.color}66`,cursor:canJoin?"pointer":"default"}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:6}}>
                      <img src={TEAM_LOGO_URL+T.logo} alt="" style={{width:38,height:38,objectFit:"contain",filter:`drop-shadow(0 0 6px ${T.glow})`}}/>
                      <span style={{fontSize:11,fontWeight:900,color:T.color,letterSpacing:1,textShadow:`0 0 8px ${T.glow}`}}>{T.name.toUpperCase()}</span>
                    </div>
                    {mem.length===0?<div style={{textAlign:"center",fontSize:8,color:"#667",padding:"10px 0"}}>{settings.autoSplit?"auto-filled":"tap to join"}</div>:mem.map(chip)}
                  </div>);})}
              </div>
              {!settings.autoSplit&&un.length>0&&<div>
                <div style={{fontSize:8,color:"#778",letterSpacing:2,margin:"2px 0 4px"}}>UNASSIGNED — pick a team</div>
                {un.map(x=>(<div key={x.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:8,marginBottom:3,background:"rgba(255,255,255,0.03)"}}>
                  <Avatar id={x.pd.avatar} size={22} photo={x.pd.photo}/>
                  <span style={{flex:1,minWidth:0,fontSize:10,color:"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.pd.name}{x.id===pid?" (you)":""}</span>
                  {(isHost||x.id===pid)&&["chaos","order"].map(tk=>(<button key={tk} onClick={()=>setTeam(x.id,tk)} style={{fontSize:9,fontWeight:800,padding:"3px 7px",borderRadius:6,border:`1px solid ${TEAMS[tk].color}`,background:`${TEAMS[tk].color}22`,color:TEAMS[tk].color,cursor:"pointer"}}>{TEAMS[tk].icon}</button>))}
                </div>))}
              </div>}
            </>);
          })():(<>
          <div style={{color:"#889",fontSize:9,marginBottom:12,letterSpacing:3}}>PLAYERS ({pls.length}/{settings.maxPlayers||MAX_PLAYERS})</div>
          {pls.map(([id,pd],i)=>(
            <div key={id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
              background:id===pid?"rgba(255,215,0,0.06)":"transparent",borderRadius:12,marginBottom:4,
              transition:"all 0.3s",animation:`slideIn 0.4s ease-out ${i*0.08}s both`,
              border:id===pid?"1px solid rgba(255,215,0,0.1)":"1px solid transparent"}}>
              <div style={{flexShrink:0}}><Avatar id={pd.avatar} state={pd.ready&&id!==rd?.host?"celebrate":"idle"} size={38} photo={pd.photo}/></div>
              <div style={{flex:1,color:"#ddd",fontWeight:600,fontSize:14}}>{pd.name}{id===pid&&<span style={{color:"#778",fontSize:9}}> (you)</span>}{pd.isBot&&<span style={{color:"#4CAF50",fontSize:8,background:"rgba(76,175,80,0.1)",padding:"1px 6px",borderRadius:4,fontWeight:700,letterSpacing:1,marginLeft:4}}>BOT</span>}</div>
              <span style={{fontSize:11,color:"#778",fontWeight:600,fontFamily:"monospace"}}>{rd?.scores?.[id]||0}</span>
              {id===rd?.host&&!pd.reviewing&&<span style={{fontSize:8,color:"#FFD700",background:"rgba(255,215,0,0.1)",padding:"2px 8px",borderRadius:6,fontWeight:700,letterSpacing:1}}>HOST</span>}
              {pd.reviewing?<span style={{fontSize:8,fontWeight:800,letterSpacing:1,padding:"2px 8px",borderRadius:6,
                color:"#FFB74D",background:"rgba(255,152,0,0.12)",border:"1px solid rgba(255,152,0,0.3)",animation:"pulse 1.4s infinite"}}>🎴 IN-GAME</span>
                :id!==rd?.host&&<span style={{fontSize:8,fontWeight:800,letterSpacing:1,padding:"2px 8px",borderRadius:6,
                color:pd.ready?"#4CAF50":"#889",background:pd.ready?"rgba(76,175,80,0.12)":"rgba(255,255,255,0.04)",
                border:pd.ready?"1px solid rgba(76,175,80,0.3)":"1px solid rgba(255,255,255,0.06)"}}>{pd.ready?"✓ READY":"NOT READY"}</span>}
              {settings.teamMode&&(()=>{const cur=pd.team&&TEAMS[pd.team];const editable=(isHost||id===pid)&&!settings.autoSplit;
                if(settings.autoSplit)return <span style={{fontSize:8,fontWeight:800,letterSpacing:1,padding:"2px 7px",borderRadius:6,color:"#889",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)"}}>AUTO</span>;
                return <div onClick={()=>editable&&setTeam(id,pd.team==="chaos"?"order":"chaos")} title={editable?"Tap to switch team":""}
                  style={{fontSize:8,fontWeight:800,letterSpacing:1,padding:"3px 8px",borderRadius:6,cursor:editable?"pointer":"default",whiteSpace:"nowrap",
                    color:cur?"#fff":"#889",background:cur?cur.grad:"rgba(255,255,255,0.05)",
                    border:`1px solid ${cur?cur.color:"rgba(255,255,255,0.12)"}`,boxShadow:cur?`0 0 8px ${cur.glow}`:"none"}}>
                  {cur?cur.icon+" "+cur.name.toUpperCase():"PICK TEAM"}</div>;})()}
              {isHost&&pd.isBot&&<button onClick={()=>removeBot(id)} style={{background:"none",border:"1px solid rgba(255,82,82,0.2)",
                color:"#FF5252",width:22,height:22,borderRadius:6,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                transition:"all 0.2s"}} onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,82,82,0.5)"}
                onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,82,82,0.2)"}>×</button>}
            </div>))}</>)}
          {isHost&&pls.length<(settings.maxPlayers||MAX_PLAYERS)&&<button onClick={addBot} style={{width:"100%",padding:"8px 0",borderRadius:10,
            border:"1px dashed rgba(76,175,80,0.3)",background:"rgba(76,175,80,0.06)",color:"#4CAF50",
            fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:3,transition:"all 0.2s",marginTop:4}}
            onPointerEnter={e=>{e.currentTarget.style.borderColor="rgba(76,175,80,0.5)";e.currentTarget.style.background="rgba(76,175,80,0.12)";}}
            onPointerLeave={e=>{e.currentTarget.style.borderColor="rgba(76,175,80,0.3)";e.currentTarget.style.background="rgba(76,175,80,0.06)";}}>
            + ADD BOT</button>}
        </div>
        <button onClick={()=>{setShowInvite(true);setInviteSel({});setFriendMsg("");}} style={{width:"100%",maxWidth:380,padding:"9px 0",borderRadius:12,marginBottom:10,
          border:"1px solid rgba(21,101,192,0.35)",background:"rgba(21,101,192,0.1)",color:"#64B5F6",
          fontSize:11,fontWeight:800,cursor:"pointer",letterSpacing:2,transition:"all 0.2s"}}
          onPointerEnter={e=>e.currentTarget.style.background="rgba(21,101,192,0.18)"}
          onPointerLeave={e=>e.currentTarget.style.background="rgba(21,101,192,0.1)"}>🤝 INVITE FRIENDS</button>
        {/* Settings */}
        <div style={{width:"100%",maxWidth:380,marginBottom:10}}>
          <button onClick={()=>setShowSettings(!showSettings)} style={{background:"none",border:"1px solid rgba(255,215,0,0.12)",
            color:"#FFD700",padding:"6px 16px",borderRadius:10,fontSize:10,fontWeight:700,cursor:"pointer",
            letterSpacing:3,transition:"all 0.2s",display:"flex",alignItems:"center",gap:6,margin:"0 auto"}}
            onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,215,0,0.3)"}
            onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,215,0,0.12)"}>
            ⚙ SETTINGS {showSettings?"▲":"▼"}</button>
          {showSettings&&<div style={{...GLASS,padding:14,marginTop:8,animation:"fadeIn 0.3s"}}>
            {[
              {label:"Turn Time",key:"turnTime",opts:[{v:10,l:"10s"},{v:15,l:"15s"},{v:20,l:"20s"},{v:30,l:"30s"}]},
              {label:"Round Time",key:"roundTime",opts:[{v:120,l:"2 min"},{v:180,l:"3 min"},{v:300,l:"5 min"},{v:0,l:"∞"}]},
              {label:"Starting Cards",key:"startCards",opts:[{v:5,l:"5"},{v:7,l:"7"},{v:10,l:"10"}]},
            ].map(s=>(
              <div key={s.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:10,color:"#aaa",fontWeight:700,letterSpacing:1}}>{s.label}</span>
                <div style={{display:"flex",gap:3}}>
                  {s.opts.map(o=>(
                    <button key={o.v} onClick={()=>isHost&&saveSetting(s.key,o.v)}
                      style={{padding:"4px 10px",borderRadius:7,border:"none",fontSize:9,fontWeight:700,cursor:isHost?"pointer":"default",
                        background:settings[s.key]===o.v?"rgba(255,215,0,0.2)":"rgba(255,255,255,0.04)",
                        color:settings[s.key]===o.v?"#FFD700":"#778",
                        border:settings[s.key]===o.v?"1px solid rgba(255,215,0,0.3)":"1px solid rgba(255,255,255,0.06)",
                        transition:"all 0.2s"}}>{o.l}</button>))}
                </div>
              </div>))}
            {[
              {label:"Stacking (+2/+4)",key:"stacking"},
              {label:"Special Cards",key:"specialCards"},
              {label:"Draw Until Playable",key:"drawTilPlay"},
            ].map(s=>(
              <div key={s.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:10,color:"#aaa",fontWeight:700,letterSpacing:1}}>{s.label}</span>
                <button onClick={()=>isHost&&saveSetting(s.key,!settings[s.key])}
                  style={{width:40,height:22,borderRadius:11,border:"none",cursor:isHost?"pointer":"default",
                    background:settings[s.key]?"rgba(46,125,50,0.6)":"rgba(255,255,255,0.08)",
                    position:"relative",transition:"all 0.3s"}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:settings[s.key]?"#4CAF50":"#555",
                    position:"absolute",top:3,left:settings[s.key]?21:3,transition:"all 0.3s",
                    boxShadow:settings[s.key]?"0 0 8px rgba(76,175,80,0.5)":"none"}}/>
                </button>
              </div>))}
            {!isHost&&<div style={{fontSize:8,color:"#667",textAlign:"center",marginTop:4,letterSpacing:1}}>Only the host can change settings</div>}
          </div>}
        </div>

        {isHost&&pls.length>=2&&(allReady
          ?<button onClick={startGame} style={{...bst,maxWidth:380,
            background:"linear-gradient(135deg,#2E7D32,#1B5E20)",fontSize:18,letterSpacing:6,
            boxShadow:"0 6px 30px rgba(46,125,50,0.5)",animation:"pulse 2s infinite"}}
            onPointerEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
            onPointerLeave={e=>e.currentTarget.style.transform="translateY(0)"}>START GAME</button>
          :<button disabled style={{...bst,maxWidth:380,background:"rgba(255,255,255,0.05)",color:"#667",
            fontSize:14,letterSpacing:3,cursor:"not-allowed",border:"1px solid rgba(255,255,255,0.06)"}}>WAITING FOR PLAYERS…</button>)}
        {isHost&&pls.length<2&&<div style={{color:"#889",fontSize:13,letterSpacing:2}}>Add players or bots to start</div>}
        {!isHost&&<button onClick={toggleReady} style={{...bst,maxWidth:380,
          background:rd?.players?.[pid]?.ready?"linear-gradient(135deg,#455A64,#37474F)":"linear-gradient(135deg,#2E7D32,#1B5E20)",
          fontSize:16,letterSpacing:4,boxShadow:rd?.players?.[pid]?.ready?"none":"0 6px 30px rgba(46,125,50,0.5)",
          animation:rd?.players?.[pid]?.ready?"none":"pulse 2s infinite"}}
          onPointerEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
          onPointerLeave={e=>e.currentTarget.style.transform="translateY(0)"}>{rd?.players?.[pid]?.ready?"✓ READY — TAP TO CANCEL":"TAP WHEN READY"}</button>}
        {!isHost&&<div style={{color:"#889",fontSize:11,marginTop:8,letterSpacing:2}}>Waiting for host to start…</div>}
        <button onClick={leave} style={{marginTop:14,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"#889",
          padding:"8px 24px",borderRadius:10,fontSize:11,cursor:"pointer",transition:"all 0.2s",letterSpacing:2}}
          onPointerEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.25)";e.currentTarget.style.color="#aaa";}}
          onPointerLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.color="#889";}}>{isHost?"Close":"Leave"}</button>
      </div>
      {showInvite&&(()=>{const selCount=Object.values(inviteSel).filter(Boolean).length;return(
        <div onClick={()=>setShowInvite(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",animation:"fadeIn 0.3s"}}>
          <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:"20px 18px",width:"92%",maxWidth:380,maxHeight:"86vh",overflow:"auto",position:"relative"}}>
            <button onClick={()=>setShowInvite(false)} style={{position:"absolute",top:8,right:12,background:"none",border:"none",color:"#889",fontSize:24,cursor:"pointer"}}>×</button>
            <div style={{fontSize:15,fontWeight:900,color:"#64B5F6",letterSpacing:2,marginBottom:4,fontFamily:"'Chakra Petch',sans-serif"}}>🤝 INVITE FRIENDS</div>
            <div style={{fontSize:9,color:"#889",marginBottom:12,letterSpacing:1}}>Tap to select, then send — they get a join notification.</div>
            {Object.keys(friends).length===0&&<div style={{fontSize:11,color:"#667",textAlign:"center",padding:"16px 0"}}>No friends yet. Add friends from the menu first.</div>}
            {Object.entries(friends).map(([fid,v])=>{const online=globalLB.find(p=>p.id===fid);const already=pls.some(([id])=>id===fid);const sel=!!inviteSel[fid];return(
              <div key={fid} onClick={()=>!already&&setInviteSel(s=>({...s,[fid]:!s[fid]}))} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,marginBottom:4,cursor:already?"default":"pointer",
                background:sel?"rgba(21,101,192,0.15)":"rgba(255,255,255,0.03)",border:sel?"1px solid rgba(21,101,192,0.4)":"1px solid rgba(255,255,255,0.06)",opacity:already?0.45:1}}>
                <div style={{width:22,height:22,borderRadius:6,border:sel?"none":"1.5px solid rgba(255,255,255,0.2)",background:sel?"#1565C0":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",flexShrink:0}}>{sel?"✓":""}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:"#ddd",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{online?.name||v.name}</div>
                  <div style={{fontSize:8,color:already?"#4CAF50":"#667"}}>{already?"already in room":(online?online.totalPoints+" pts":"—")}</div>
                </div>
              </div>);})}
            {friendMsg&&<div style={{fontSize:11,color:"#4CAF50",textAlign:"center",margin:"6px 0",fontWeight:700}}>{friendMsg}</div>}
            {Object.keys(friends).length>0&&<button onClick={()=>{const ids=Object.keys(inviteSel).filter(k=>inviteSel[k]);if(!ids.length)return;ids.forEach(fid=>inviteFriend(fid));setFriendMsg("Invited "+ids.length+" friend"+(ids.length>1?"s":"")+"!");setInviteSel({});setTimeout(()=>{setShowInvite(false);setFriendMsg("");},1000);}}
              style={{...bst,marginTop:8,background:selCount?"linear-gradient(135deg,#1565C0,#0D47A1)":"rgba(255,255,255,0.05)",
              color:selCount?"#fff":"#667",fontSize:13,letterSpacing:2,cursor:selCount?"pointer":"not-allowed",boxShadow:selCount?"0 4px 18px rgba(21,101,192,0.4)":"none"}}>SEND INVITES ({selCount})</button>}
          </div>
        </div>);})()}
      <style>{globalCSS}</style>
    </div>);

  /* ═══ GAME ═══ */
  if(!g)return<div style={{height:"100%",background:"#060e0c",display:"flex",flexDirection:"column",gap:16,alignItems:"center",justifyContent:"center",color:"#889"}}><style>{globalCSS}</style><LoopSpinner/><div style={{fontSize:12,letterSpacing:4,fontWeight:800,color:"#4CE0A0"}}>CONNECTING…</div></div>;
  const myIdx=po.indexOf(pid);
  // Self-relative seating: everyone sees the table going around from their own seat
  // (next player after me first). Teammates end up across from each other consistently,
  // and turn flows right→left (me → next opp on the left → across → right).
  const opps=myIdx<0?po.filter(id=>id!==pid):[...po.slice(myIdx+1),...po.slice(0,myIdx)];
  const n=myH.length;const spread=Math.min(n*3,32);const st2=-spread/2;
  const cardSpacing=Math.min(isLandscape?42:55,(isLandscape?320:380)/Math.max(n,1));
  const clusterHalf=((n-1)/2)*cardSpacing+(isLandscape?35:44);
  const topOpps=opps.length<=2?opps:opps.filter((_,i)=>i>0&&i<opps.length-(opps.length>2?1:0));
  const leftOpp=opps.length>2?opps[0]:null;
  const rightOpp=opps.length>2?opps[opps.length-1]:null;

  const OppCard=({id,pos})=>{const pd=rd.players[id];const h=g.hands?.[id]||[];const turn=g.currentPlayer===id;
    const hasUno=h.length===1;const cu=g.calledUno||{};const canCatch=hasUno&&!cu[id];
    const isV=pos==="left"||pos==="right";
    const avState=hitFx[id]?"hit":(g.winner&&id===g.winner)?"celebrate":hasUno?"uno":"idle";
    return(<div key={id} ref={el=>{if(el)oppRefs.current[id]=el;else delete oppRefs.current[id];}}
      style={{display:"flex",flexDirection:isV?"row":"column",alignItems:"center",
      background:turn?"rgba(0,0,0,0.45)":"rgba(0,0,0,0.25)",borderRadius:10,padding:isV?"5px 4px":"4px 7px",
      border:turn?`1px solid ${gcHex}55`:"1px solid rgba(255,215,0,0.04)",
      boxShadow:turn?`0 0 20px ${gcHex}22,0 0 40px ${gcHex}08`:"none",
      transition:"all 0.4s",position:"relative",
      backdropFilter:"blur(6px)",animation:turn?"neonPulse 2s ease-in-out infinite":"none"}}>
      {/* PROFILE (avatar + name + count) → open the throwable picker */}
      <div onClick={e=>{e.stopPropagation();if(!g.winner&&id!==pid)setThrowPick(id);}} title="Throw an item at them"
        style={{display:"flex",flexDirection:isV?"column":"row",alignItems:"center",gap:3,marginBottom:isV?0:2,marginRight:isV?3:0,cursor:"pointer"}}>
        <div style={{position:"relative",flexShrink:0,filter:`drop-shadow(0 2px 8px ${CH[COLORS[opps.indexOf(id)%4]]}55)`}}>
          <Avatar id={pd?.avatar} state={avState} size={30} photo={pd?.photo}/>
          {g.teamMode&&pd?.team&&TEAMS[pd.team]&&<div style={{position:"absolute",inset:-3,borderRadius:"50%",border:`2px solid ${TEAMS[pd.team].color}`,boxShadow:`0 0 7px ${TEAMS[pd.team].glow}`,pointerEvents:"none"}}/>}
          {rankOf[id]&&<div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",marginBottom:-4,zIndex:5,pointerEvents:"none"}}>
            <RankMark rank={rankOf[id]}/></div>}</div>
        <span style={{fontSize:9,color:turn?"#fff":"#999",fontWeight:700,whiteSpace:"nowrap",
          textShadow:turn?`0 0 8px ${gcHex}66`:"none"}}>{pd?.name}</span>
        <span style={{fontSize:9,background:"rgba(255,255,255,0.1)",borderRadius:5,padding:"1px 5px",
          color:turn?"#fff":"#888",fontWeight:800,fontFamily:"monospace"}}>{h.length}</span>
        {hasUno&&<span style={{fontSize:8,color:"#E53935",fontWeight:900,animation:"pulse 0.4s infinite"}}>UNO!</span>}
      </div>
      {/* CARDS → catch a forgotten UNO (only does anything when they're catchable) */}
      <div onClick={e=>{e.stopPropagation();tapOppCards(id);}} style={{display:"flex",flexDirection:isV?"column":"row",cursor:canCatch?"pointer":"default"}}>
        {(()=>{const cards=h.slice(0,40);const n=cards.length;const dim=isV?72:48;
          const maxS=isV?230:(isLandscape?165:300);
          const step=Math.max(3,Math.min(isV?20:16,(maxS-dim)/Math.max(n-1,1)));const ov=step-dim;
          const reveal=!!g.winner; // flip everyone's cards face-up when the round is over
          const allyReveal=g.teamMode&&pd?.team&&rd.players[pid]?.team===pd.team; // teammates see each other's hands
          return cards.map((c,ci)=><div key={c.id} style={{...(isV?{marginTop:ci>0?ov:0}:{marginLeft:ci>0?ov:0}),
            animation:reveal?`cardFlipIn 0.55s cubic-bezier(.34,1.2,.5,1) ${ci*0.06}s both`:"none"}}>
            <Card card={c} sz="xs" faceDown={(reveal||allyReveal)?false:(!peek||!isAdm)}/></div>);})()}
      </div>
      {canCatch&&<div style={{position:"absolute",bottom:isV?"auto":-12,right:isV?-8:"auto",left:isV?"auto":"auto",
        fontSize:7,color:"#FF9800",fontWeight:800,
        background:"rgba(0,0,0,0.9)",padding:"2px 7px",borderRadius:5,animation:"pulse 0.6s infinite",
        whiteSpace:"nowrap",border:"1px solid rgba(255,152,0,0.25)"}}>CATCH!</div>}
      {turn&&!g.winner&&<div style={{position:"absolute",zIndex:6,pointerEvents:"none",
        ...(pos==="left"?{right:-17,top:"50%",transform:"translateY(-50%)"}
          :pos==="right"?{left:-17,top:"50%",transform:"translateY(-50%)"}
          :{bottom:-19,left:"50%",transform:"translateX(-50%)"})}}>
        <span style={{display:"block",fontSize:20,lineHeight:1,color:gcHex,
          textShadow:`0 0 10px ${gcHex},0 0 20px ${gcHex}aa,0 1px 3px rgba(0,0,0,0.8)`,
          animation:"arrowPulse 0.8s ease-in-out infinite"}}>{pos==="left"?"◀":pos==="right"?"▶":"▲"}</span></div>}
    </div>);};

  return(
    <div style={{height:"100%",background:"#060e0c",
      fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",
      transition:"background 1s ease",
      boxShadow:myTurn&&!g.winner?`inset 0 0 30px ${gcHex}30,inset 0 0 80px ${gcHex}10`:"none",
      borderTop:myTurn&&!g.winner?`3px solid ${gcHex}66`:"3px solid transparent",
      ...shakeStyle}} onClick={()=>{ua();if(mus&&!bgm.playing)bgm.start("game");}}>
      {/* Random cartoon scene for this room + a dark scrim so cards stay readable */}
      <div style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:`url(${GAME_BG_URL+bgForRoom(rc)})`,backgroundSize:"cover",backgroundPosition:"center"}}/>
      <div style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",transition:"background 1s ease",
        background:`radial-gradient(ellipse at 50% 42%,${gcHex}1f 0%,transparent 48%),linear-gradient(180deg,rgba(6,10,16,0.62) 0%,rgba(6,10,16,0.15) 18%,rgba(6,10,16,0.02) 42%,rgba(6,10,16,0.06) 56%,rgba(6,10,16,0.3) 70%,rgba(4,8,12,0.82) 81%,rgba(4,7,12,0.97) 100%)`}}/>
      <CanvasBG screen="game" currentColor={g.currentColor}/>
      {lightningColor&&<LightningFX color={lightningColor} onDone={()=>setLightningColor(null)}/>}
      {impactColor&&<AnimeImpact color={impactColor} onDone={()=>setImpactColor(null)}/>}
      {burstColor&&<BurstFX color={burstColor} onDone={()=>setBurstColor(null)}/>}
      {pickCol&&<CWheel onPick={colPick} onCancel={colCancel}/>}
      {actFx&&<ActFX type={actFx} onDone={()=>setActFx(null)}/>}
      {wild4Fx&&<ElementalW4FX color={wild4Fx} onDone={()=>setWild4Fx(null)}/>}
      {chibiAttackFx&&<ChibiAttackFX element={chibiAttackFx.element} victimName={chibiAttackFx.victimName} count={chibiAttackFx.count} toSelf={chibiAttackFx.toSelf} dir={chibiAttackFx.dir} onDone={()=>setChibiAttackFx(null)}/>}
      {cardFlyFx&&<CardFlyFX element={cardFlyFx.element} count={cardFlyFx.count} toSelf={cardFlyFx.toSelf} dir={cardFlyFx.dir} onDone={()=>setCardFlyFx(null)}/>}
      {dealFx&&<div style={{position:"fixed",inset:0,zIndex:95,pointerEvents:"none",overflow:"hidden"}}>
        {dealFx.cards.map(c=><div key={c.key} style={{position:"fixed",left:dealFx.ox,top:dealFx.oy,width:30,height:44,marginLeft:-15,marginTop:-22,
          borderRadius:6,background:"linear-gradient(135deg,#141428,#0f3a44)",border:"2px solid rgba(255,255,255,0.85)",
          boxShadow:"0 4px 12px rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",
          "--dx":c.dx+"px","--dy":c.dy+"px","--r":c.rot+"deg",
          animation:`dealSweep 0.42s cubic-bezier(.4,0,.3,1) ${c.delay}s both`}}>
          <div style={{width:16,height:16,borderRadius:"50%",background:"#E53935",transform:"rotate(-20deg)",boxShadow:"0 0 4px rgba(0,0,0,0.4)"}}/></div>)}
      </div>}
      {draw2Fx&&<Draw2FX color={draw2Fx} onDone={()=>setDraw2Fx(null)}/>}
      {reverseFx&&<ReverseFX color={reverseFx} onDone={()=>setReverseFx(null)}/>}
      {skipFx&&<SkipFX color={skipFx} onDone={()=>setSkipFx(null)}/>}
      {unoCallFx&&<UnoCallFX color={unoCallFx} onDone={()=>setUnoCallFx(null)}/>}
      {unoPenaltyFx!==null&&<UnoPenaltyFX victimName={unoPenaltyFx} onDone={()=>setUnoPenaltyFx(null)}/>}
      {discardFx&&<DiscardAllFX color={discardFx.color} count={discardFx.count} cards={discardFx.cards} onDone={()=>setDiscardFx(null)}/>}
      {activeEmote&&<div style={{position:"absolute",top:"15%",left:"50%",transform:"translateX(-50%)",zIndex:120,
        display:"flex",flexDirection:"column",alignItems:"center",gap:6,pointerEvents:"none",
        animation:"emotePopIn 0.35s cubic-bezier(.34,1.56,.64,1)"}}>
        <div style={{background:"rgba(0,0,0,0.85)",borderRadius:12,padding:"4px 14px",
          border:"1px solid rgba(255,215,0,0.25)",backdropFilter:"blur(8px)"}}>
          <span style={{fontSize:10,color:"#FFD700",fontWeight:700,letterSpacing:1}}>{activeEmote.senderName}</span></div>
        <img src={EMOTE_URL+activeEmote.gif} alt={activeEmote.id}
          style={{width:100,height:100,objectFit:"contain",filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.7))",
            imageRendering:"auto"}}/>
      </div>}
      {emoteTray&&!g.winner&&<div onClick={()=>setEmoteTray(false)} style={{position:"absolute",inset:0,zIndex:99}}>
        <div onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:isLandscape?105:135,left:"50%",transform:"translateX(-50%)",
          display:"flex",gap:10,padding:"10px 16px",borderRadius:18,
          background:"rgba(8,16,14,0.92)",border:"1px solid rgba(255,215,0,0.15)",
          backdropFilter:"blur(12px)",boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
          animation:"aslide 0.2s ease-out"}}>
          {EMOTES.map(em=>(
            <div key={em.id} onClick={()=>{if(!emoteCD)sendEmote(em.id);}}
              style={{width:60,height:60,borderRadius:14,cursor:emoteCD?"not-allowed":"pointer",
                background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                opacity:emoteCD?0.3:1,transition:"all 0.2s"}}
              onPointerEnter={e2=>{if(!emoteCD)e2.currentTarget.style.background="rgba(255,215,0,0.12)";e2.currentTarget.style.transform="scale(1.08)";}}
              onPointerLeave={e2=>{e2.currentTarget.style.background="rgba(255,255,255,0.04)";e2.currentTarget.style.transform="scale(1)";}}>
              <img src={EMOTE_URL+em.gif} alt={em.id} style={{width:40,height:40,objectFit:"contain",imageRendering:"auto"}}/>
              <span style={{fontSize:7,color:"#889",fontWeight:700,letterSpacing:1}}>{em.label}</span>
            </div>))}
        </div>
      </div>}
      {timeoutFx!==null&&<div style={{position:"fixed",inset:0,zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",
        pointerEvents:"none",animation:"timeoutFade 2s ease-out forwards"}}>
        <div style={{fontSize:"min(72px, 14vw)",fontWeight:900,fontFamily:"Arial Black",fontStyle:"italic",
          letterSpacing:3,transform:"skewX(-8deg)",color:"transparent",
          backgroundImage:"linear-gradient(180deg,#FFECEC 6%,#FF5A5A 46%,#B3121F 94%)",
          WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",
          WebkitTextStroke:"1px rgba(60,0,0,0.45)",
          filter:"drop-shadow(3px 4px 0 rgba(70,0,0,0.6)) drop-shadow(0 0 16px rgba(255,70,70,0.4))",
          textAlign:"center"}}>TIMED OUT!</div></div>}
      {turnFx!==null&&timeoutFx===null&&<div style={{position:"fixed",inset:0,zIndex:55,display:"flex",alignItems:"center",justifyContent:"center",
        pointerEvents:"none",animation:"turnTextFade 1.8s ease-out forwards"}}>
        <div style={{fontSize:"min(56px, 11vw)",fontWeight:900,fontFamily:"Arial Black",fontStyle:"italic",
          color:"transparent",letterSpacing:3,transform:"skewX(-8deg)",textTransform:"uppercase",
          backgroundImage:`linear-gradient(180deg,#ffffff 8%,${gcHex} 58%,${gcHex})`,
          WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",
          WebkitTextStroke:"1px rgba(0,0,0,0.32)",
          filter:`drop-shadow(3px 4px 0 rgba(0,0,0,0.5)) drop-shadow(0 0 16px ${gcHex}66)`,
          textAlign:"center"}}>{turnFx}</div></div>}
      {challenge&&<ChallengeModal playerName={challenge.playerName}
        onChallenge={()=>respondChallenge(true)} onAccept={()=>respondChallenge(false)}/>}

      {snatchModal&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:85,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,
        backdropFilter:"blur(12px)",animation:"fadeIn 0.3s ease-out"}}>
        {snatchModal.phase==="pick"?(<>
          <div style={{color:"#FF9800",fontSize:14,fontWeight:800,letterSpacing:3}}>SNATCH FROM {snatchModal.fromName?.toUpperCase()}</div>
          <div style={{color:"#aaa",fontSize:10,textAlign:"center",maxWidth:280,lineHeight:1.5,padding:"6px 12px",
            background:"rgba(255,255,255,0.03)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)"}}>
            Pick a card from {snatchModal.fromName}'s hand. You won't see it until you swap!</div>
          <div style={{color:"#889",fontSize:10,fontWeight:700,letterSpacing:2,marginTop:2}}>TAP A CARD TO STEAL</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",maxWidth:380}}>
            {Array.from({length:snatchModal.cardCount}).map((_,i)=>(
              <div key={i} onClick={()=>snatchPick(i)} style={{cursor:"pointer",transition:"transform 0.2s",animation:`cardDeal 0.4s ease-out ${i*0.06}s both`}}
                onPointerEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
                onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                <Card card={{color:"wild",value:"wild",type:"wild"}} sz="sm" faceDown/></div>))}
          </div>
          <button onClick={snatchReturn} style={{...MBTN,background:"rgba(255,255,255,0.06)",
            border:"1px solid rgba(255,255,255,0.12)",color:"#999",marginTop:4}}
            onPointerEnter={e=>e.currentTarget.style.transform="scale(1.06)"}
            onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>CANCEL</button>
        </>):(<>
          <div style={{color:"#FF9800",fontSize:14,fontWeight:800,letterSpacing:3}}>CARD SNATCHED!</div>
          <div style={{animation:"cardReveal 0.5s cubic-bezier(.34,1.56,.64,1)"}}><Card card={snatchModal.card} sz="md"/></div>
          <div style={{color:"#aaa",fontSize:10,textAlign:"center",maxWidth:280,lineHeight:1.5,padding:"6px 12px",
            background:"rgba(255,255,255,0.03)",borderRadius:10,border:"1px solid rgba(255,255,255,0.05)"}}>
            Now pick one of your cards to give back to {snatchModal.fromName}.</div>
          <div style={{color:"#889",fontSize:10,fontWeight:700,letterSpacing:2,marginTop:2}}>TAP YOUR CARD TO SWAP</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",maxWidth:340}}>
            {myH.filter(c=>c.id!==snatchModal.card.id).map((c)=>(
              <div key={c.id} onClick={()=>snatchSwap(myH.findIndex(mc=>mc.id===c.id))} style={{cursor:"pointer",transition:"transform 0.2s"}}
                onPointerEnter={e=>e.currentTarget.style.transform="scale(1.08)"}
                onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                <Card card={c} sz="sm"/></div>))}
          </div>
          <button onClick={snatchReturn} style={{...MBTN,background:"rgba(255,255,255,0.06)",
            border:"1px solid rgba(255,255,255,0.12)",color:"#999",marginTop:4}}
            onPointerEnter={e=>e.currentTarget.style.transform="scale(1.06)"}
            onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>RETURN CARD</button>
        </>)}
      </div>)}

      {showDk&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:150,
        display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 4px",overflow:"auto",backdropFilter:"blur(8px)"}}>
        <div style={{color:"#FFD700",fontSize:16,fontWeight:800,marginBottom:12,letterSpacing:3}}>{swpC?"SWAP":"PICK"}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center",maxWidth:480}}>
          {(g.drawPile||[]).map((c,i)=><Card key={c.id} card={c} sz="sm" onClick={()=>swpC?swapDk(i):pickDeck(i)}/>)}</div>
        <button onClick={()=>{setShowDk(false);setSwpC(null);setSwap(false);}}
          style={{marginTop:12,padding:"8px 24px",borderRadius:10,border:"none",background:"#333",color:"#aaa",fontSize:11,cursor:"pointer"}}>Cancel</button>
      </div>)}

      {g.winner&&(()=>{const wTeam=g.teamMode?rd.players?.[g.winner]?.team:null;const mTeam=g.teamMode?rd.players?.[pid]?.team:null;
        const win=g.teamMode?(!!wTeam&&mTeam===wTeam):(g.winner===pid);const d=g.lastDeltas?.[pid];return(<>
        {win&&<ConfettiFX/>}
        {/* Centered win banner that celebrates, then fades out so the deck/pile & all cards are reviewable */}
        <div style={{position:"absolute",top:"46%",left:"50%",zIndex:151,
          display:"flex",flexDirection:"column",alignItems:"center",gap:5,pointerEvents:"none",width:"94%",maxWidth:400,
          animation:"winBannerAway 3.8s ease-out forwards"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 20px",borderRadius:16,
            background:"linear-gradient(135deg,rgba(18,24,28,0.95),rgba(8,12,14,0.95))",
            border:`1px solid ${win?"rgba(255,215,0,0.45)":"rgba(239,83,80,0.3)"}`,backdropFilter:"blur(8px)",
            boxShadow:win?"0 6px 34px rgba(255,215,0,0.25)":"0 6px 24px rgba(0,0,0,0.55)",animation:"slamIn 0.5s cubic-bezier(.2,1.5,.4,1) both"}}>
            <span style={{fontSize:38,filter:`drop-shadow(0 0 14px ${win?"rgba(255,215,0,0.7)":"rgba(239,83,80,0.35)"})`}}>{win?"🏆":"💀"}</span>
            <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
              <span style={{fontSize:20,fontWeight:900,color:win?"#FFD700":"#EF5350",fontFamily:"'Chakra Petch',sans-serif",letterSpacing:2}}>{g.teamMode&&wTeam?TEAMS[wTeam].name.toUpperCase()+" WINS!":win?"VICTORY!":"DEFEAT"}</span>
              <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{g.teamMode&&wTeam?`${TEAMS[wTeam].icon} ${rd.players[g.winner]?.name} went out`:`${rd.players[g.winner]?.name} wins`}</span>
            </div>
            {(()=>{const pts=win?(g.lastAward!=null?g.lastAward:(d||0)):(d||0);
              if(win)return<span style={{fontSize:26,fontWeight:900,color:"#4CAF50",textShadow:"0 0 14px rgba(76,175,80,0.5)"}}>+{pts}</span>;
              if(pts<0)return<span style={{fontSize:24,fontWeight:900,color:"#EF5350",textShadow:"0 0 12px rgba(239,83,80,0.45)"}}>{pts}</span>;
              return null;})()}
          </div>
          {win&&g.lastCoin>0&&<div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:12,
            background:"linear-gradient(135deg,rgba(255,193,7,0.18),rgba(255,152,0,0.12))",border:"1px solid rgba(255,193,7,0.4)",
            animation:"slamIn 0.5s 0.15s cubic-bezier(.2,1.5,.4,1) both"}}>
            <span style={{fontSize:14}}>🪙</span>
            <span style={{fontSize:13,fontWeight:900,color:"#FFC107"}}>+{g.lastCoin} coins</span></div>}
          {!win&&g.lastLoseCoin>0&&<div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:12,
            background:"linear-gradient(135deg,rgba(255,193,7,0.14),rgba(255,152,0,0.08))",border:"1px solid rgba(255,193,7,0.28)",
            animation:"slamIn 0.5s 0.15s cubic-bezier(.2,1.5,.4,1) both"}}>
            <span style={{fontSize:14}}>🪙</span>
            <span style={{fontSize:12,fontWeight:800,color:"#FFC107"}}>+{g.lastLoseCoin} coins for playing</span></div>}
          <span style={{fontSize:8,color:"#99a",letterSpacing:1,textShadow:"0 1px 3px #000"}}>everyone's final hands are revealed</span>
        </div>
        {/* Back to lobby */}
        <div style={{position:"absolute",bottom:"calc(env(safe-area-inset-bottom,0px) + 16px)",left:"50%",transform:"translateX(-50%)",zIndex:151,
          display:"flex",flexDirection:"column",alignItems:"center",gap:5,animation:"fadeIn 0.5s 0.6s both"}}>
          <span style={{fontSize:9,color:"#99a",letterSpacing:1,textShadow:"0 1px 4px #000"}}>👀 Review everyone's cards, then</span>
          <button onClick={backToLobby} style={{...bst,maxWidth:250,padding:"12px 30px",background:"linear-gradient(135deg,#2E7D32,#1B5E20)",
            boxShadow:"0 4px 22px rgba(46,125,50,0.55)"}}
            onPointerEnter={e=>e.currentTarget.style.transform="scale(1.03)"}
            onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>BACK TO LOBBY</button>
        </div>
      </>);})()}

      {/* Flying throwable projectile — skipped for gif items (their gif shows the
          full arc/impact), kept for procedural items and known-broken gifs. */}
      {throwAnim&&(!throwAnim.item.gif||throwGifCache[throwAnim.item.id]===false)&&(<div style={{position:"fixed",left:throwAnim.tx,top:throwAnim.ty,zIndex:400,pointerEvents:"none",
        fontSize:34,lineHeight:1,willChange:"transform",
        "--tsx":`${throwAnim.sx-throwAnim.tx}px`,"--tsy":`${throwAnim.sy-throwAnim.ty}px`,"--tax":"0px","--tay":"0px",
        animation:"throwArc 0.9s ease-in forwards"}}>
        <span style={{display:"inline-block",filter:"drop-shadow(0 3px 6px rgba(0,0,0,0.55))"}}>{throwAnim.item.emoji}</span>
      </div>)}

      {/* Splat impact overlay */}
      {splatFx&&(<div key={splatFx.key} style={{position:"fixed",left:splatFx.tx,top:splatFx.ty,zIndex:401,pointerEvents:"none",
        display:"flex",flexDirection:"column",alignItems:"center",willChange:"transform,opacity",
        animation:"splatPop 1.4s ease-out forwards"}}>
        <ThrowSplat item={splatFx.item}/>
      </div>)}

      {/* Throwable picker — compact bottom sheet; game stays visible behind it */}
      {throwPick&&(()=>{const mine=THROWABLES.filter(t=>owned.includes(t.id));const tgt=rd?.players?.[throwPick];
        return(<div onClick={()=>setThrowPick(null)} style={{position:"fixed",inset:0,zIndex:402,
          display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 8px 12px"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:420,background:"rgba(16,24,40,0.95)",
            borderRadius:16,padding:"10px 12px 12px",position:"relative",border:"1px solid rgba(255,215,0,0.3)",
            boxShadow:"0 -8px 30px rgba(0,0,0,0.55)",animation:"slideUp 0.2s ease-out"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:900,color:"#FFD700",letterSpacing:1}}>🍅 Throw at <span style={{color:"#fff"}}>{tgt?.name||"Opponent"}</span></div>
              <button onClick={()=>setThrowPick(null)} style={{width:28,height:28,background:"none",border:"none",color:"#889",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {mine.length===0?<div style={{textAlign:"center",color:"#889",fontSize:10,padding:"8px 0"}}>No throwables yet — buy some in the Store.</div>
              :<div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
              {mine.map(t=><button key={t.id} onClick={()=>throwChosen(throwPick,t.id)}
                style={{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 12px",borderRadius:12,cursor:"pointer",
                  background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)"}}>
                <span style={{fontSize:30,lineHeight:1}}>{t.emoji}</span>
                <span style={{fontSize:8,fontWeight:800,color:"#bcd",whiteSpace:"nowrap"}}>{t.name}</span></button>)}
            </div>}
          </div>
        </div>);})()}

      {showLB&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:160,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)"}}
        onClick={()=>setShowLB(false)}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:20,width:"90%",maxWidth:360,maxHeight:"80vh",overflow:"auto"}}>
          <div style={{fontSize:16,fontWeight:900,color:"#FFD700",textAlign:"center",marginBottom:14,letterSpacing:3}}>🏆 LEADERBOARD</div>
          {[...pls].sort((a,b)=>(rd?.scores?.[b[0]]||0)-(rd?.scores?.[a[0]]||0)).map(([id,pd],i)=>{
            const score=rd?.scores?.[id]||0;const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            const glb=globalLB.find(p=>p.id===id);
            const plrRank=glb?getRank(glb.totalPoints,glb.gamesPlayed):UNRANKED;
            return(<div key={id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 8px",
              borderRadius:10,marginBottom:4,
              background:i===0?"rgba(255,215,0,0.08)":id===pid?"rgba(255,255,255,0.04)":"transparent",
              border:i===0?"1px solid rgba(255,215,0,0.15)":"1px solid transparent",
              animation:`slideIn 0.3s ease-out ${i*0.06}s both`}}>
              <span style={{fontSize:13,width:20,textAlign:"center"}}>{medal||(i+1)+"."}</span>
              <div style={{width:24,height:24,borderRadius:6,background:plrRank.bg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,flexShrink:0,
                border:`1px solid ${plrRank.color}44`}}>{plrRank.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#ddd",fontWeight:600,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pd.name}{id===pid&&<span style={{color:"#778",fontSize:7}}> (you)</span>}</div>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <span style={{fontSize:7,color:plrRank.color,fontWeight:700,letterSpacing:1}}>{plrRank.name.toUpperCase()}</span>
                  {plrRank.stars>0&&<span style={{fontSize:6}}>{"⭐".repeat(plrRank.stars)}</span>}
                  {glb&&<span style={{fontSize:7,color:"#667"}}>{glb.totalPoints}pts</span>}
                </div>
              </div>
              <div style={{color:"#FFD700",fontWeight:900,fontSize:13,fontFamily:"monospace",flexShrink:0}}>{score}</div>
            </div>);})}
        </div>
      </div>)}

      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"max(4px,env(safe-area-inset-top,4px)) max(12px,env(safe-area-inset-right,12px)) 3px max(12px,env(safe-area-inset-left,12px))",flexShrink:0,
        background:"linear-gradient(180deg,rgba(0,0,0,0.5),transparent)",zIndex:20}}>
        <button onClick={leave} style={{background:"none",border:"none",color:"#889",fontSize:16,cursor:"pointer",transition:"color 0.2s",padding:"2px 6px"}}
          onPointerEnter={e=>e.currentTarget.style.color="#fff"} onPointerLeave={e=>e.currentTarget.style.color="#889"}>{"←"}</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:"#FFD700",fontFamily:"'Chakra Petch',sans-serif",letterSpacing:2,
            textShadow:"0 0 15px rgba(255,215,0,0.3)"}}>ROGUE DECK</span>
          <span style={{fontSize:8,color:"#889",background:"rgba(0,0,0,0.6)",padding:"3px 8px",borderRadius:6,
            fontFamily:"monospace",letterSpacing:4,border:"1px solid rgba(255,255,255,0.05)"}}>{rc}</span>
          <span style={{fontSize:15,color:`${gcHex}55`,animation:g.direction===1?"sCW 4s linear infinite":"sCCW 4s linear infinite"}}>{g.direction===1?"⟳":"⟲"}</span>
          {!g.winner&&settings.roundTime>0&&<div style={{display:"flex",alignItems:"center",gap:3,padding:"2px 8px",borderRadius:8,
            background:roundTimer<=30?"rgba(255,82,82,0.15)":"rgba(0,0,0,0.4)",
            border:`1px solid ${roundTimer<=30?"rgba(255,82,82,0.3)":"rgba(255,255,255,0.06)"}`,
            animation:roundTimer<=30?"dangerPulse 1s infinite":"none"}}>
            <span style={{fontSize:8,color:roundTimer<=30?"#FF5252":"#889",fontWeight:700,letterSpacing:1}}>⏱</span>
            <span style={{fontSize:10,fontWeight:900,fontFamily:"monospace",
              color:roundTimer<=30?"#FF5252":roundTimer<=60?"#FF9800":"#aaa"}}>
              {Math.floor(roundTimer/60)}:{(roundTimer%60).toString().padStart(2,"0")}</span>
          </div>}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {isAdm&&<>{[{k:"peek",i:"👁",on:peek,fn:()=>setPeek(!peek)},
            {k:"pick",i:"🎯",on:pickDr,fn:()=>setPickDr(!pickDr)},
            {k:"swap",i:"🔀",on:swap,fn:()=>{setSwap(!swap);setSwpC(null);}},
          ].map(b=>(<button key={b.k} onClick={b.fn} style={{padding:"2px 6px",borderRadius:6,border:"none",fontSize:11,cursor:"pointer",
            background:b.on?"rgba(255,215,0,0.9)":"rgba(0,0,0,0.4)",color:b.on?"#000":"#FFD700",
            transition:"all 0.2s"}}>{b.i}</button>))}</>}
          <button onClick={()=>setShowLB(!showLB)} style={{padding:"2px 6px",borderRadius:6,border:"none",fontSize:11,cursor:"pointer",
            background:showLB?"rgba(255,215,0,0.9)":"rgba(0,0,0,0.4)",color:showLB?"#000":"#FFD700",
            transition:"all 0.2s",fontWeight:700}}>🏆</button>
          {!g.winner&&<button onClick={()=>setEmoteTray(!emoteTray)} style={{background:emoteTray?"rgba(255,215,0,0.9)":"none",border:"none",fontSize:14,cursor:"pointer",
            opacity:emoteCD?0.3:0.8,padding:"2px 4px",borderRadius:6,transition:"all 0.2s"}}>{"💬"}</button>}
          <button onClick={e=>{e.stopPropagation();setShowAudio(true);}} style={{background:"none",border:"none",fontSize:15,cursor:"pointer",opacity:(snd||mus)?0.8:0.3,padding:2}}>
            {(snd||mus)?"🔊":"🔇"}</button>
          <button onClick={()=>{goFS();goLand();}} style={{background:"none",border:"none",fontSize:14,cursor:"pointer",padding:2,opacity:0.3}}>{"⛶"}</button>
        </div>
      </div>
      {audioModal}



      {/* Main game area — 3-column layout: left opp | center (top opps + table + hand) | right opp */}
      <div style={{flex:1,display:"flex",minHeight:0,zIndex:10,position:"relative",
        paddingLeft:"env(safe-area-inset-left,0px)",paddingRight:"env(safe-area-inset-right,0px)"}}>

        {/* Left opponent */}
        {leftOpp&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",flexShrink:0,zIndex:10}}>
          <OppCard id={leftOpp} pos="left"/>
        </div>}

        {/* Center column */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0}}>

          {/* Top opponents */}
          <div style={{display:"flex",justifyContent:"center",gap:5,padding:"2px 5px",flexWrap:"wrap",flexShrink:0}}>
            {topOpps.map(id=><OppCard key={id} id={id} pos="top"/>)}
          </div>

          {/* Center play area */}
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            position:"relative",minHeight:0,zIndex:5}}>
            <div className="uno-table-circle" style={{position:"absolute",width:"min(200px, 40vw)",height:"min(200px, 40vw)",borderRadius:"50%",
              border:`2px solid rgba(255,215,0,0.1)`,pointerEvents:"none",
              background:`radial-gradient(circle,rgba(20,40,35,0.6),rgba(10,22,20,0.3) 60%,transparent 80%)`,
              boxShadow:`0 0 80px rgba(0,0,0,0.4) inset,0 0 40px ${gcHex}06`,transition:"all 1s",
              animation:"tableGlow 4s ease-in-out infinite"}}>
              {/* Turn-direction indicator: a colour-matched LOOP that spins in the direction
                 of play and flips on a reverse card, tinted to the current pile colour. */}
              {(()=>{const col=CH[g.currentColor]||"#FFD700";const cw=g.direction===1;
                return(<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
                  width:"min(280px,55vw,44vh)",height:"min(280px,55vw,44vh)",pointerEvents:"none",opacity:0.72}}>
                  <div style={{width:"100%",height:"100%",animation:`${cw?"sCW":"sCCW"} 3.4s linear infinite`}}>
                    <svg viewBox="0 0 100 100" width="100%" height="100%"
                      style={{transform:cw?"none":"scaleX(-1)",filter:`drop-shadow(0 0 7px ${col}cc)`}}>
                      <path d="M 80 30 A 37 37 0 0 1 72 80" fill="none" stroke={col} strokeWidth="8.5" strokeLinecap="round"/>
                      <path d="M 72 80 l 14 -1 l -8 13 z" fill={col}/>
                      <path d="M 20 70 A 37 37 0 0 1 28 20" fill="none" stroke={col} strokeWidth="8.5" strokeLinecap="round"/>
                      <path d="M 28 20 l -14 1 l 8 -13 z" fill={col}/>
                    </svg>
                  </div>
                </div>);})()}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"min(16px, 3vw)",zIndex:3}}>
              <div onPointerDown={e=>{if(e.pointerType==="mouse"&&e.button!==0)return;handleDeckTap();}}
                style={{cursor:(pickDr&&isAdm)||(myTurn&&!drawnCard&&!challenge)?"pointer":"default",transition:"transform 0.3s",position:"relative",touchAction:"manipulation",padding:8,margin:-8,
                  animation:drawStack>0&&myTurn?"dangerPulse 0.8s infinite":(myTurn&&!drawnCard&&!challenge?"deckIdle 3s ease-in-out infinite":"none"),
                  border:drawStack>0&&myTurn?"2px solid #FF5252":"2px solid transparent",borderRadius:12,
                  boxShadow:drawStack>0&&myTurn?"0 0 20px rgba(255,82,82,0.4)":"none"}}
                onPointerEnter={e=>{if(e.pointerType==="mouse"&&myTurn&&!drawnCard&&!challenge)e.currentTarget.style.transform="scale(1.1) rotate(-3deg)";}}
                onPointerLeave={e=>{if(e.pointerType==="mouse")e.currentTarget.style.transform="scale(1)";}}>
                <Card card={{color:"wild",value:"wild",type:"wild"}} sz={isLandscape?"sm":"md"} faceDown/>
                {drawStack>0&&myTurn&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",
                  fontSize:11,fontWeight:900,color:"#fff",background:"#E53935",borderRadius:8,padding:"2px 8px",
                  boxShadow:"0 0 10px rgba(229,57,53,0.5)",zIndex:4}}>+{drawStack}</div>}
              </div>
              <div style={{position:"relative",...(g.winner?{filter:"drop-shadow(0 0 16px rgba(255,215,0,0.85))",animation:"pulse 1.4s ease-in-out infinite"}:{})}}>{topC&&<Card card={topC} sz={isLandscape?"sm":"md"} animate={cAn}/>}
                {g.winner&&<div style={{position:"absolute",top:-16,left:"50%",transform:"translateX(-50%)",fontSize:7,color:"#FFD700",fontWeight:900,letterSpacing:1,whiteSpace:"nowrap",textShadow:"0 0 6px rgba(255,215,0,0.6)",pointerEvents:"none"}}>👑 WINNING CARD</div>}
                <div style={{position:"absolute",top:-8,right:-8,width:isLandscape?16:22,height:isLandscape?16:22,borderRadius:"50%",
                  background:CG[g.currentColor],border:"2px solid rgba(255,255,255,0.7)",
                  boxShadow:`0 0 18px ${gcHex}aa,0 0 35px ${gcHex}44`,transition:"all 0.5s"}}/>
                {!g.winner&&(()=>{const low=turnTimer<=5;return(<div style={{position:"absolute",left:"calc(100% + 12px)",top:"50%",transform:"translateY(-50%)",
                  width:46,height:46,pointerEvents:"none",zIndex:15}}>
                  {/* only the clock IMAGE wobbles; the number stays centered in the face so it's always readable */}
                  <img src={UI_URL+"clock.png"} width={46} height={46} alt="" style={{position:"absolute",inset:0,display:"block",objectFit:"contain",transformOrigin:"50% 22%",
                    animation:low?"clockImgShake 0.35s ease-in-out infinite":"none",
                    filter:low?"drop-shadow(0 0 7px rgba(255,60,60,0.9))":"drop-shadow(0 2px 3px rgba(0,0,0,0.5))"}}/>
                  <div style={{position:"absolute",left:"50%",top:"54%",transform:"translate(-50%,-50%)",zIndex:1,
                    fontSize:15,fontWeight:900,fontFamily:"'Arial Black',sans-serif",
                    color:low?"#D32029":"#A83228",textShadow:"0 1px 1px rgba(255,255,255,0.7)",
                    animation:low?"numPulse 0.5s infinite":"none"}}>{turnTimer}</div>
                </div>);})()}
              </div>
            </div>
          </div>
          {drawStack>0&&<div style={{textAlign:"center",flexShrink:0,zIndex:15,pointerEvents:"none"}}>
            <span style={{padding:"2px 10px",borderRadius:10,fontSize:9,fontWeight:900,
              background:"linear-gradient(135deg,#FF6F00,#E65100)",color:"#fff",letterSpacing:2,
              boxShadow:"0 0 15px rgba(255,111,0,0.4)",animation:"dangerPulse 0.8s infinite",
              display:"inline-block",whiteSpace:"nowrap"}}>⚡ +{drawStack} ⚡</span></div>}

          {/* PASS TURN button - after drawing */}
          {myTurn&&hasDrawn&&!g.winner&&(
            <div style={{textAlign:"center",paddingBottom:2,flexShrink:0,zIndex:12}}>
              <button onClick={passTurn} style={{padding:"8px 32px",borderRadius:18,
                border:"2px solid rgba(255,152,0,0.5)",
                background:"linear-gradient(135deg,rgba(255,152,0,0.2),rgba(255,111,0,0.1))",
                color:"#FF9800",fontSize:14,fontWeight:900,cursor:"pointer",letterSpacing:4,
                transition:"all 0.2s",backdropFilter:"blur(6px)",
                boxShadow:"0 0 20px rgba(255,152,0,0.2),0 4px 15px rgba(0,0,0,0.4)",
                animation:"pulse 1.5s infinite"}}
                onPointerEnter={e=>{e.currentTarget.style.background="linear-gradient(135deg,rgba(255,152,0,0.35),rgba(255,111,0,0.2))";e.currentTarget.style.transform="scale(1.05)";}}
                onPointerLeave={e=>{e.currentTarget.style.background="linear-gradient(135deg,rgba(255,152,0,0.2),rgba(255,111,0,0.1))";e.currentTarget.style.transform="scale(1)";}}>PASS TURN ▶</button>
            </div>)}

          {/* Hand - player's cards */}
          <div style={{flexShrink:0,background:"linear-gradient(0deg,rgba(0,0,0,0.5),rgba(0,0,0,0.1),transparent)",paddingBottom:3,zIndex:6,
            position:"relative"}}>
            {myTurn&&!g.winner&&<div style={{position:"absolute",top:-42,left:"50%",transform:"translateX(-50%)",
              zIndex:9,display:"flex",flexDirection:"column",alignItems:"center",pointerEvents:"none"}}>
              <span style={{fontSize:38,color:gcHex,lineHeight:0.9,textShadow:`0 0 16px ${gcHex},0 0 32px ${gcHex}aa,0 2px 5px rgba(0,0,0,0.8)`,
                animation:"turnArrowBounce 0.8s ease-in-out infinite"}}>▼</span>
            </div>}
            <div style={{flex:1,position:"relative"}}>
            <div style={{position:"absolute",left:`calc(50% - ${clusterHalf}px - 30px)`,bottom:8,zIndex:7,
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"left 0.3s ease"}}>
              {/* your own avatar (mirrors how opponents see you) with your global rank on top */}
              <div style={{position:"relative",filter:`drop-shadow(0 2px 8px ${gcHex}55)`}}>
                <Avatar id={myAvatar} photo={myPhoto} size={34}
                  state={hitFx[pid]?"hit":(g.winner===pid)?"celebrate":myH.length===1?"uno":"idle"}/>
                {g.teamMode&&rd.players?.[pid]?.team&&TEAMS[rd.players[pid].team]&&<div style={{position:"absolute",inset:-3,borderRadius:"50%",border:`2px solid ${TEAMS[rd.players[pid].team].color}`,boxShadow:`0 0 8px ${TEAMS[rd.players[pid].team].glow}`,pointerEvents:"none"}}/>}
                {rankOf[pid]&&<div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",marginBottom:-4,zIndex:5,pointerEvents:"none"}}>
                  <RankMark rank={rankOf[pid]}/></div>}
              </div>
              <span style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.65)",letterSpacing:1,
                writingMode:"vertical-rl",textOrientation:"mixed",
                textShadow:"0 1px 4px rgba(0,0,0,0.8)",whiteSpace:"nowrap"}}>{pName||"You"}</span>
            </div>
            <div className="uno-hand-area" style={{position:"relative",height:isLandscape?"min(100px, 24vh)":"min(120px, 22vh)",display:"flex",justifyContent:"center"}}>
              {myH.map((card,i)=>{
                const angle=n<=1?0:st2+(i/Math.max(n-1,1))*spread;
                const liftY=Math.abs(angle)*0.4;const isSel=sel===i;
                const playable=myTurn&&!drawnCard&&!challenge&&topC&&(
                  drawStack>0?(drawStackType==="wild4"?card.value==="wild4":(card.value==="draw2"||card.value==="wild4")):canPlay(card,topC,g.currentColor));
                const cardSz=isLandscape?"md":"lg";
                const spacing=Math.min(isLandscape?42:55,(isLandscape?320:380)/Math.max(n,1));const xOff=(i-(n-1)/2)*spacing;
                const no=newOrder[card.id];const isNew=no!==undefined;
                const anim=isNew?(initialDeal
                  ?`cardDeal 0.55s cubic-bezier(.22,1,.36,1) ${i*0.28}s both`
                  :`cardReceive 1s cubic-bezier(.34,1.25,.5,1) ${no*0.28}s both`):"none";
                return(<div key={card.id} onPointerDown={e=>{if(e.pointerType==="mouse"&&e.button!==0)return;if((myTurn&&!drawnCard&&!challenge)||(swap&&isAdm)){if(isSel)cardClick(i);else{ps("cardLift");setSel(i);}}}}
                  style={{position:"absolute",bottom:isSel?(isLandscape?25:35):playable?(6+liftY):(2+liftY),left:`calc(50% + ${xOff}px - ${isLandscape?35:44}px)`,
                    transform:`rotate(${angle}deg)${isSel?" scale(1.08)":""}`,touchAction:"manipulation",
                    transition:"left 0.28s cubic-bezier(.34,1.56,.64,1),bottom 0.28s ease,transform 0.28s ease",zIndex:isSel?50:i,
                    animation:anim,
                    filter:isSel?"brightness(1.2)":playable?"brightness(1.06)":"none",
                    cursor:(myTurn&&!drawnCard&&!challenge)||(swap&&isAdm)?"pointer":"default"}}>
                  <Card card={card} sz={cardSz} highlighted={playable&&!isSel} lifted={isSel}/>
                </div>);})}
            </div>
            {!g.winner&&!(g.calledUno||{})[pid]&&(()=>{
              const urgent=g?.unoGrace&&g.unoGrace.pid===pid; // I forgot — quick, tap it!
              const bc=urgent?"#FF1744":gcHex;
              const usz=urgent?60:50;
              return(<div onPointerDown={callUno} style={{position:"absolute",left:`calc(50% + ${clusterHalf}px + 6px)`,bottom:10,width:usz,height:usz,cursor:"pointer",zIndex:8,touchAction:"manipulation",
                transformOrigin:"50% 55%",
                filter:urgent?"drop-shadow(0 0 14px #FF1744) drop-shadow(0 0 7px #FF5252)":`drop-shadow(0 0 10px ${bc}88) drop-shadow(0 2px 5px rgba(0,0,0,0.6))`,
                animation:urgent?"unoUrgent 0.45s ease-in-out infinite":"unoIdle 1.7s ease-in-out infinite",
                transition:"left 0.3s ease,width 0.2s,height 0.2s"}}>
                {urgent&&<div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",marginBottom:6,
                  background:"#FF1744",color:"#fff",fontSize:10,fontWeight:900,letterSpacing:1,padding:"3px 8px",borderRadius:8,
                  whiteSpace:"nowrap",boxShadow:"0 2px 10px rgba(255,23,68,0.6)",animation:"pulse 0.45s infinite",zIndex:2}}>SAY UNO!</div>}
                <img src={UI_URL+"unobutton.png"} width={usz} height={usz} alt="UNO" style={{display:"block",objectFit:"contain",pointerEvents:"none"}}/>
              </div>);})()}
            </div>
          </div>
        </div>

        {/* Right opponent */}
        {rightOpp&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",flexShrink:0,zIndex:10}}>
          <OppCard id={rightOpp} pos="right"/>
        </div>}
      </div>
      <style>{globalCSS}</style>
    </div>);
}

const globalCSS=`
  .uno-rotating *{transition:none !important;animation:none !important;}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  @keyframes uP{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  @keyframes cFly{0%{transform:scale(0.3) translateY(80px) rotate(-15deg);opacity:0;filter:blur(3px)}
    25%{transform:scale(1.06) translateY(-6px) rotate(2deg);opacity:1;filter:blur(0)}
    45%{transform:scale(0.98) translateY(2px) rotate(-0.5deg)}
    65%{transform:scale(1.01) translateY(-1px)}100%{transform:scale(1) translateY(0) rotate(0);opacity:1;filter:blur(0)}}
  @keyframes wB{0%{transform:scale(0)}40%{transform:scale(1.2)}70%{transform:scale(0.95)}100%{transform:scale(1)}}
  @keyframes spinRays{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
  @keyframes trophyPop{0%{opacity:0;transform:scale(0) translateY(30px) rotate(-18deg)}55%{opacity:1;transform:scale(1.25) translateY(0) rotate(6deg)}75%{transform:scale(0.92) rotate(-3deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}
  @keyframes slamIn{0%{opacity:0;transform:scale(2.4);filter:blur(6px)}60%{opacity:1;transform:scale(0.92);filter:blur(0)}100%{opacity:1;transform:scale(1)}}
  @keyframes dealSweep{0%{opacity:0;transform:translate(0,0) scale(0.4) rotate(0deg)}
    14%{opacity:1;transform:translate(calc(var(--dx)*0.12),calc(var(--dy)*0.12)) scale(0.92) rotate(calc(var(--r)*0.3))}
    82%{opacity:1}
    100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1) rotate(var(--r))}}
  @keyframes cardDeal{0%{transform:translateY(-40px) scale(0.6) rotateY(90deg);opacity:0}
    40%{transform:translateY(5px) scale(1.05) rotateY(-10deg);opacity:1}
    70%{transform:translateY(-2px) scale(0.98) rotateY(3deg)}100%{transform:translateY(0) scale(1) rotateY(0)}}
  @keyframes cardReceive{0%{opacity:0;transform:translateY(-40px) scale(0.68) rotate(-4deg)}
    50%{opacity:1;transform:translateY(6px) scale(1.06) rotate(1deg)}
    76%{transform:translateY(-2px) scale(0.98)}100%{opacity:1;transform:translateY(0) scale(1) rotate(0)}}
  @keyframes cardDrawPull{0%{transform:translateX(-30px) scale(0.7) rotate(-8deg);opacity:0}
    50%{transform:translateX(5px) scale(1.06) rotate(2deg);opacity:1}100%{transform:translateX(0) scale(1) rotate(0)}}
  @keyframes cardHover3D{0%,100%{transform:perspective(400px) rotateY(0deg) rotateX(0deg)}
    25%{transform:perspective(400px) rotateY(2deg) rotateX(-1deg)}
    75%{transform:perspective(400px) rotateY(-2deg) rotateX(1deg)}}
  @keyframes deckIdle{0%,100%{transform:scale(1) rotate(0deg);box-shadow:0 3px 15px rgba(0,0,0,0.5)}
    50%{transform:scale(1.02) rotate(0.5deg);box-shadow:0 6px 25px rgba(0,0,0,0.6)}}
  @keyframes tableGlow{0%,100%{box-shadow:0 0 40px rgba(255,215,0,0.02) inset}50%{box-shadow:0 0 60px rgba(255,215,0,0.05) inset}}
  @keyframes chevFlow{0%,100%{opacity:0.1}45%{opacity:1}}
  @keyframes sCW{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @keyframes sCCW{from{transform:rotate(360deg)}to{transform:rotate(0)}}
  @keyframes af{0%{opacity:1}50%{opacity:1}70%{opacity:0.7}85%{opacity:0.3;transform:scale(1.02)}100%{opacity:0;transform:scale(1.05)}}
  @keyframes apop{0%{transform:scale(0) rotate(-15deg)}40%{transform:scale(1.3) rotate(5deg)}70%{transform:scale(0.9)}100%{transform:scale(1) rotate(0)}}
  @keyframes aslide{0%{transform:translateY(20px) scale(0.8);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
  @keyframes fadeIn{0%{opacity:0;transform:translateY(8px) scale(0.98)}40%{opacity:0.8}100%{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes slideUp{0%{opacity:0;transform:translateY(24px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes slideIn{0%{opacity:0;transform:translateX(-15px) scale(0.96)}60%{opacity:0.9}100%{opacity:1;transform:translateX(0) scale(1)}}
  @keyframes cardReveal{0%{transform:scale(0.15) rotateY(90deg);opacity:0;filter:blur(4px)}
    50%{transform:scale(1.08) rotateY(-6deg);opacity:1;filter:blur(0)}
    75%{transform:scale(0.97) rotateY(2deg)}100%{transform:scale(1) rotateY(0)}}
  @keyframes neonPulse{0%,100%{filter:brightness(1);opacity:0.9}50%{filter:brightness(1.15);opacity:1}}
  @keyframes turnGlow{0%,100%{box-shadow:0 0 25px var(--gc,#FF6F00)44,0 0 50px var(--gc,#FF6F00)15}50%{box-shadow:0 0 35px var(--gc,#FF6F00)66,0 0 70px var(--gc,#FF6F00)25}}
  @keyframes playableGlow{0%,100%{box-shadow:0 4px 20px currentColor}50%{box-shadow:0 4px 35px currentColor,0 0 20px currentColor}}
  @keyframes turnArrowBounce{0%,100%{transform:translateY(0);opacity:0.6}50%{transform:translateY(4px);opacity:1}}
  @keyframes draw2Pop{0%{transform:scale(0.2) rotate(-10deg);opacity:0}30%{transform:scale(1.25) rotate(4deg);opacity:1}50%{transform:scale(1) rotate(0)}80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.1) translateY(-20px)}}
  @keyframes draw2Ring{0%{transform:scale(0.3);opacity:0.9}70%{opacity:0.4}100%{transform:scale(1.6);opacity:0}}
  @keyframes mangaBurst{0%{opacity:0;transform:rotate(var(--a)) translateX(40px) scaleX(0.2)}30%{opacity:0.95}100%{opacity:0.5;transform:rotate(var(--a)) translateX(64px) scaleX(1)}}
  @keyframes chibiPunchIn{0%{transform:scale(0.2) translateY(30px);opacity:0}45%{transform:scale(1.95) translateY(-6px);opacity:1}70%{transform:scale(1.55)}100%{transform:scale(1.7) translateY(0);opacity:1}}
  @keyframes stanceLine{0%{opacity:0;transform:scaleY(0.6)}35%{opacity:1}100%{opacity:0;transform:scaleY(1)}}
  @keyframes stanceRise{0%{opacity:0;transform:scale(1.55) translateY(26px)}55%{opacity:0.5}100%{opacity:0.5;transform:scale(1.75) translateY(0)}}
  @keyframes slashFlash{0%{opacity:0.85}100%{opacity:0}}
  @keyframes slashArc{0%{transform:translateX(-60%) rotate(-18deg) scaleX(0.2);opacity:0}25%{opacity:1}70%{opacity:1}100%{transform:translateX(55%) rotate(-18deg) scaleX(1);opacity:0}}
  @keyframes splashPop{0%{opacity:0}40%{opacity:0.85}100%{opacity:0.65}}
  @keyframes arrowPulse{0%,100%{opacity:0.55;transform:scale(0.88)}50%{opacity:1;transform:scale(1.18)}}
  @keyframes cardFlipIn{0%{opacity:0;transform:perspective(700px) rotateY(-78deg) scale(0.82)}55%{opacity:1}100%{opacity:1;transform:perspective(700px) rotateY(0deg) scale(1)}}
  @keyframes cardTitleIn{0%{opacity:0;transform:translateY(10px) scale(0.8)}100%{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes cardFly{0%{opacity:0;transform:translate(var(--fx),-24px) rotate(var(--fr)) scale(0.55)}22%{opacity:1;transform:translate(var(--fx),0) rotate(var(--fr)) scale(1)}45%{opacity:1;transform:translate(calc(var(--fx)*0.5),0) rotate(calc(var(--fr)*0.5)) scale(1)}100%{opacity:0;transform:translate(0,var(--fy)) rotate(0) scale(0.5)}}
  @keyframes cardLand{0%{opacity:0;transform:translate(var(--fx),-46px) rotate(var(--fr)) scale(0.5)}16%{opacity:1;transform:translate(var(--fx),0) rotate(var(--fr)) scale(1.06)}68%{opacity:1;transform:translate(calc(var(--fx)*0.35 + var(--fex,0px)*0.6),calc(var(--fy)*0.7)) rotate(calc(var(--fr)*0.35)) scale(0.92)}90%{opacity:1;transform:translate(var(--fex,0px),var(--fy)) rotate(0deg) scale(0.72)}100%{opacity:0;transform:translate(var(--fex,0px),calc(var(--fy) + 8px)) rotate(0deg) scale(0.62)}}
  @keyframes penaltyFling{0%{opacity:0;transform:translate(calc(-50% + var(--rx)),calc(-50% + var(--ry))) rotate(var(--fr)) scale(0.4)}13%{opacity:1;transform:translate(calc(-50% + var(--rx)),calc(-50% + var(--ry))) rotate(var(--fr)) scale(1)}40%{opacity:1;transform:translate(-50%,-50%) rotate(0deg) scale(1.14)}74%{opacity:1;transform:translate(calc(-50% + var(--fex,0px) * 0.78),calc(-50% + var(--fy) * 0.78)) rotate(0deg) scale(0.86)}92%{opacity:1;transform:translate(calc(-50% + var(--fex,0px)),calc(-50% + var(--fy))) rotate(0deg) scale(0.6)}100%{opacity:0;transform:translate(calc(-50% + var(--fex,0px)),calc(-50% + var(--fy) + 10px)) rotate(0deg) scale(0.52)}}
  @keyframes landFlash{0%{opacity:0;transform:translate(-50%,-50%) scale(0.4)}40%{opacity:0.95;transform:translate(-50%,-50%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.35)}}
  @keyframes charZoom{0%{transform:scale(1.14)}100%{transform:scale(1)}}
  @keyframes skillErupt{0%{opacity:0;transform:translateX(-50%) scaleY(0.35)}35%{opacity:1}100%{opacity:0.92;transform:translateX(-50%) scaleY(1)}}
  @keyframes emberRise{0%{opacity:0;transform:translate(0,0) scale(1)}15%{opacity:1}100%{opacity:0;transform:translate(var(--ex),-330px) scale(0.2)}}
  @keyframes sparkFlash{0%{opacity:0}12%{opacity:1}24%{opacity:0}44%{opacity:0.9}58%{opacity:0}100%{opacity:0}}
  @keyframes strobeFlash{0%{opacity:0}8%{opacity:0.85}16%{opacity:0}28%{opacity:0.6}36%{opacity:0}52%{opacity:0.75}60%{opacity:0}100%{opacity:0}}
  @keyframes chargePulse{0%{opacity:0;transform:scale(0.3)}40%{opacity:1}100%{opacity:0.85;transform:scale(1.05)}}
  @keyframes convergeIn{0%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(0.4)}35%{opacity:1}100%{opacity:0.9;transform:translate(0,0) scale(1)}}
  @keyframes boltFlash{0%{opacity:0}9%{opacity:1}22%{opacity:0}40%{opacity:0.95}54%{opacity:0}72%{opacity:0.8}84%{opacity:0}100%{opacity:0}}
  @keyframes boltStrike{0%{opacity:0}6%{opacity:1}17%{opacity:0}31%{opacity:1}43%{opacity:0}61%{opacity:1}73%{opacity:0}100%{opacity:0}}
  @keyframes impactFlash{0%{opacity:0;transform:translate(-50%,-50%) scale(0.25)}16%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}44%{opacity:0.75;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.45)}}
  @keyframes penaltyDrop{0%{opacity:0;transform:translateY(-60px) scale(0.8) rotate(-8deg)}25%{opacity:1}100%{opacity:0;transform:translateY(170px) scale(0.9) rotate(10deg)}}
  @keyframes bubbleRise{0%{opacity:0;transform:translate(0,0) scale(0.7)}20%{opacity:0.95}100%{opacity:0;transform:translate(var(--bx),-330px) scale(1.15)}}
  @keyframes leafSpiral{0%{opacity:0;transform:rotate(var(--la)) translateX(12px) scale(0.4)}20%{opacity:1}100%{opacity:0;transform:rotate(calc(var(--la) + 260deg)) translateX(var(--lr)) scale(1)}}
  /* +4 penalty-card groups: element handles the cards, then flings them to the victim */
  @keyframes greenCardGroup{0%{opacity:0;transform:rotate(0deg) scale(0.4)}16%{opacity:1;transform:rotate(0deg) scale(1)}58%{transform:rotate(500deg) scale(1.06)}78%{opacity:1;transform:rotate(640deg) scale(0.9)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(760deg) scale(0.28)}}
  @keyframes redCardGroup{0%{opacity:0;transform:translateY(18px) rotate(0deg) scale(0.4)}16%{opacity:1;transform:translateY(0) rotate(0deg) scale(1)}58%{transform:translateY(-18px) rotate(150deg) scale(1.06)}78%{opacity:1;transform:translateY(-26px) rotate(210deg) scale(0.92)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(250deg) scale(0.3)}}
  @keyframes yellowCardGroup{0%{opacity:0;transform:translate(0,0) scale(0.4)}14%{opacity:1;transform:translate(0,0) scale(1)}22%{transform:translate(-8px,5px) scale(1)}30%{transform:translate(8px,-6px)}38%{transform:translate(-7px,-5px)}46%{transform:translate(8px,6px)}54%{transform:translate(-6px,3px)}62%{transform:translate(0,0) scale(1.1)}76%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(0.28)}}
  @keyframes blueCardGroup{0%{opacity:0;transform:rotate(0deg) translateY(0) scale(0.4)}16%{opacity:1;transform:rotate(0deg) translateY(0) scale(1)}40%{transform:rotate(70deg) translateY(-10px) scale(1.04)}62%{transform:rotate(150deg) translateY(10px) scale(1.04)}80%{opacity:1;transform:rotate(210deg) translateY(-6px) scale(0.92)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(250deg) scale(0.3)}}
  @keyframes draw2CardL{0%{transform:translate(0,0) rotate(0);opacity:0}25%{opacity:1}45%{transform:translate(-46px,-6px) rotate(-14deg)}80%{opacity:1}100%{transform:translate(-70px,-70px) rotate(-24deg);opacity:0}}
  @keyframes draw2CardR{0%{transform:translate(0,0) rotate(0);opacity:0}25%{opacity:1}45%{transform:translate(46px,-6px) rotate(14deg)}80%{opacity:1}100%{transform:translate(70px,-70px) rotate(24deg);opacity:0}}
  @keyframes dangerPulse{0%,100%{transform:scale(1);opacity:0.9}50%{transform:scale(1.05);opacity:1}}
  @keyframes menuLogo{0%,100%{transform:scale(1) rotate(0deg)}25%{transform:scale(1.06) rotate(2deg)}75%{transform:scale(1.03) rotate(-1deg)}}
  @keyframes menuCardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
  @keyframes codeGlow{0%,100%{text-shadow:0 0 35px rgba(255,215,0,0.4),0 0 70px rgba(255,215,0,0.15)}50%{text-shadow:0 0 55px rgba(255,215,0,0.7),0 0 110px rgba(255,215,0,0.3)}}
  @keyframes spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--sx),var(--sy)) scale(0);opacity:0}}
  @keyframes ringExpand{0%{transform:scale(0.3);opacity:0.8}100%{transform:scale(3);opacity:0}}
  @keyframes bgPulse{0%{opacity:0}30%{opacity:1}100%{opacity:0.3}}
  @keyframes crownFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1.5px) scale(1.05)}}
  @keyframes elecFlash{0%,100%{opacity:0}6%{opacity:1}13%{opacity:0.15}22%{opacity:0.95}30%{opacity:0}}
  @keyframes shimmerGlow{0%,100%{opacity:0.3;transform:scale(0.85)}50%{opacity:0.8;transform:scale(1.08)}}
  @keyframes clockImgShake{0%,100%{transform:rotate(-8deg)}25%{transform:rotate(8deg)}50%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
  @keyframes numPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.22)}}
  @keyframes unoIdle{0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.08) rotate(-3deg)}}
  @keyframes unoUrgent{0%,100%{transform:scale(1.05) rotate(-6deg)}50%{transform:scale(1.2) rotate(6deg)}}
  @keyframes glitterRise{0%{opacity:0;transform:translateY(0) scale(0.4)}20%{opacity:1;transform:translateY(calc(var(--rise) * -0.2)) scale(1)}75%{opacity:0.7}100%{opacity:0;transform:translateY(calc(var(--rise) * -1)) scale(0.65)}}
  @keyframes winBannerAway{0%{opacity:0;transform:translate(-50%,-50%) scale(0.9)}8%{opacity:1;transform:translate(-50%,-50%) scale(1)}70%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-64%) scale(0.85);visibility:hidden}}
  @keyframes emotePopIn{0%{opacity:0;transform:translateX(-50%) scale(0.2) translateY(30px)}
    50%{opacity:1;transform:translateX(-50%) scale(1.12) translateY(-6px)}
    100%{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}
  @keyframes screenShake{0%{transform:translate(0,0)}10%{transform:translate(-4px,2px)}20%{transform:translate(4px,-3px)}35%{transform:translate(-3px,3px)}50%{transform:translate(3px,-1px)}65%{transform:translate(-2px,1px)}80%{transform:translate(1px,-1px)}100%{transform:translate(0,0)}}
  @keyframes timeoutFade{0%{opacity:0;transform:scale(0.8)}15%{opacity:1;transform:scale(1.05)}30%{transform:scale(1)}70%{opacity:0.8}100%{opacity:0;transform:scale(1.1)}}
  @keyframes turnTextFade{0%{opacity:0;transform:scale(0.7)}12%{opacity:1;transform:scale(1.06)}25%{transform:scale(1)}65%{opacity:0.7}100%{opacity:0;transform:scale(1.08)}}
  @keyframes discardPull{0%{opacity:0}
    18%{transform:translate(0,0) rotate(0deg) scale(1.14);opacity:1}
    52%{transform:translate(0,-6px) rotate(0deg) scale(1.06);opacity:1}
    78%{transform:translate(0,-24px) rotate(360deg) scale(0.55);opacity:0.9}
    100%{transform:translate(0,-52px) rotate(720deg) scale(0);opacity:0}}
  @keyframes discardFade{0%{opacity:1}82%{opacity:1}100%{opacity:0;transform:scale(1.04)}}
  @keyframes discardArc{0%{opacity:0;transform:translate(var(--sx),var(--sy)) rotate(var(--sr)) scale(0.65)}
    14%{opacity:1;transform:translate(var(--sx),var(--sy)) rotate(var(--sr)) scale(1)}
    50%{opacity:1;transform:translate(calc(var(--sx)*0.5 + var(--ax)),calc(var(--sy)*0.42 - 72px)) rotate(calc(var(--sr)*0.4)) scale(0.98)}
    82%{opacity:1;transform:translate(0px,-26px) rotate(0deg) scale(0.72)}
    100%{opacity:0;transform:translate(0px,-34px) rotate(0deg) scale(0.5)}}
  @keyframes deckPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
  @keyframes w4bg{0%{opacity:0;transform:scale(0.5)}100%{opacity:1;transform:scale(1)}}
  @keyframes w4ring{0%{transform:rotate(0deg) scale(0.5);opacity:0}20%{opacity:0.8}100%{transform:rotate(360deg) scale(1.5);opacity:0}}
  @keyframes w4orb{0%{transform:rotate(var(--w4a)) translateX(0) scale(0);opacity:0}
    30%{opacity:1;transform:rotate(var(--w4a)) translateX(var(--w4r)) scale(1)}
    100%{transform:rotate(calc(var(--w4a) + 360deg)) translateX(var(--w4r)) scale(0);opacity:0}}
  @keyframes w4card{0%{transform:rotate(0deg) translateY(0) scale(0);opacity:0}
    50%{opacity:1;transform:rotate(calc(var(--w4ca)/2)) translateY(calc(var(--w4cd) * -0.5)) scale(1.1)}
    100%{transform:rotate(var(--w4ca)) translateY(calc(var(--w4cd) * -1)) scale(0.9);opacity:0.8}}
  @keyframes chibiEnter{0%{transform:translateX(80px) translateY(40px) scale(0);opacity:0}
    60%{transform:translateX(-8px) translateY(-5px) scale(1.1);opacity:1}
    100%{transform:translateX(0) translateY(0) scale(1);opacity:1}}
  @keyframes chibiHaha{0%{transform:translateY(0) scale(1)}100%{transform:translateY(-3px) scale(1.08)}}
  @keyframes chibiBounce{0%{transform:translateY(0)}100%{transform:translateY(-4px)}}
  @keyframes chibiTripFall{0%{transform:rotate(0deg) translateY(0)}50%{transform:rotate(12deg) translateY(4px)}100%{transform:rotate(85deg) translateY(30px)}}
  @keyframes trailPop{0%{transform:scale(0.5) translateY(0);opacity:0}30%{opacity:1;transform:scale(1.1) translateY(-6px)}100%{transform:scale(0.7) translateY(-16px);opacity:0}}
  @keyframes slashSweep{0%{transform:translateX(-60%) rotate(-12deg) scaleX(0.3);opacity:0}30%{opacity:1}60%{opacity:1}100%{transform:translateX(60%) rotate(-12deg) scaleX(1);opacity:0}}
  @keyframes projFly{0%{transform:translate(0,0) scale(0.6);opacity:0}15%{opacity:1}100%{transform:translate(-260px,-40px) scale(1.1);opacity:0}}
  @keyframes unoAura{0%{opacity:0;transform:scale(0.6)}30%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.3)}}
  @keyframes unoRing{0%{transform:scale(0.4);opacity:0.9}100%{transform:scale(6);opacity:0}}
  @keyframes unoRayShoot{0%{opacity:0;transform:rotate(var(--a,0deg)) translateY(0) scaleY(0.3)}30%{opacity:0.9}100%{opacity:0;transform:rotate(var(--a,0deg)) translateY(-70px) scaleY(1)}}
  @keyframes unoZoomText{0%{transform:scale(0.2) rotate(-8deg);opacity:0}35%{transform:scale(1.4) rotate(3deg);opacity:1}55%{transform:scale(1.1) rotate(-2deg)}75%{transform:scale(1.25) rotate(0);opacity:1}100%{transform:scale(1.1);opacity:0}}
  @keyframes stampSlam{0%{transform:rotate(-18deg) scale(2.5);opacity:0}60%{transform:rotate(-18deg) scale(0.9);opacity:1}100%{transform:rotate(-18deg) scale(1);opacity:1}}
  @keyframes sweatFall{0%{transform:translateY(0) scale(1);opacity:0.9}100%{transform:translateY(24px) scale(0.4);opacity:0}}
  @keyframes clockSpinBack{0%{transform:rotate(0deg)}100%{transform:rotate(-360deg)}}
  @keyframes speedLine{0%{opacity:0;transform:rotate(var(--a,0deg)) scaleY(0.2)}30%{opacity:0.8}100%{opacity:0;transform:rotate(var(--a,0deg)) scaleY(1.3)}}
  @keyframes arrowFlip{0%{transform:scaleX(1) rotate(0deg)}50%{transform:scaleX(-1) rotate(180deg)}100%{transform:scaleX(1) rotate(360deg)}}
  @keyframes sealedPulse{0%{opacity:0;transform:scale(0.5)}40%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.25)}}
  @keyframes dodgeOut{0%{opacity:0;transform:translateX(-40px) scale(0.6)}30%{opacity:1;transform:translateX(0) scale(1.1)}100%{opacity:0;transform:translateX(60px) scale(0.4)}}
  @keyframes avBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
  @keyframes avBlink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(0.12)}}
  @keyframes avHit{0%,100%{transform:rotate(-6deg) translateY(1px)}50%{transform:rotate(6deg) translateY(-1px)}}
  @keyframes avCele{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.04)}}
  @keyframes avUno{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  @keyframes avDizzy{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
  @keyframes avSpark{0%,100%{opacity:0;transform:scale(0.4)}50%{opacity:1;transform:scale(1.1)}}
  @keyframes throwArc{0%{opacity:0;transform:translate(var(--tsx),var(--tsy)) rotate(0deg) scale(0.5)}
    12%{opacity:1;transform:translate(var(--tsx),var(--tsy)) rotate(90deg) scale(1)}
    50%{opacity:1;transform:translate(calc(var(--tsx)*0.5 + var(--tax)),calc(var(--tsy)*0.5 - 60px)) rotate(360deg) scale(1.1)}
    88%{opacity:1;transform:translate(0,0) rotate(680deg) scale(1)}
    100%{opacity:0;transform:translate(0,0) rotate(720deg) scale(1.3)}}
  @keyframes splatPop{0%{opacity:0;transform:translate(-50%,-50%) scale(0.2)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}70%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.1)}}
  @keyframes twk{0%,100%{opacity:0.35}50%{opacity:1}}
  @keyframes stinkRise{0%{opacity:0;transform:translateY(8px)}35%{opacity:0.9}100%{opacity:0;transform:translateY(-16px)}}
  @keyframes smokePuff{0%{opacity:0.7;transform:scale(0.5)}100%{opacity:0;transform:scale(1.5)}}
  *{-webkit-tap-highlight-color:transparent;user-select:none;box-sizing:border-box;margin:0;padding:0;}
  html,body,#root{height:100%;height:100dvh;overflow:hidden;}
  @supports(height:100dvh){html,body,#root{height:100dvh;}}
  @media(orientation:landscape) and (max-height:500px){
    .uno-hand-area{height:min(95px,25vh)!important;z-index:8!important;}
    .uno-table-circle{width:min(130px,22vw)!important;height:min(130px,22vw)!important;}
  }
  @media(orientation:landscape) and (max-height:400px){
    .uno-hand-area{height:min(80px,22vh)!important;z-index:8!important;}
    .uno-table-circle{width:min(100px,20vw)!important;height:min(100px,20vw)!important;}
  }
  @media(orientation:portrait){
    .uno-hand-area{height:min(140px,18vh)!important;}
  }
  @media(orientation:portrait) and (min-height:800px){
    .uno-hand-area{height:min(155px,19vh)!important;}
  }
`;

const GLASS={background:"rgba(8,20,18,0.75)",borderRadius:20,border:"1px solid rgba(255,215,0,0.08)",
  backdropFilter:"blur(20px)",boxShadow:"0 12px 50px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.03)"};
const MBTN={padding:"11px 28px",borderRadius:14,border:"none",color:"#fff",fontSize:14,fontWeight:700,
  cursor:"pointer",letterSpacing:2,transition:"all 0.2s"};
const ls={color:"#889",fontSize:9,display:"block",marginBottom:5,letterSpacing:4,textTransform:"uppercase"};
const ist={width:"100%",padding:"12px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",
  background:"rgba(255,255,255,0.04)",color:"#fff",fontSize:14,outline:"none",marginBottom:10,boxSizing:"border-box",transition:"all 0.25s"};
const bst={width:"100%",padding:"14px 0",borderRadius:14,border:"none",color:"#fff",fontSize:15,fontWeight:800,
  cursor:"pointer",letterSpacing:4,transition:"all 0.25s"};
