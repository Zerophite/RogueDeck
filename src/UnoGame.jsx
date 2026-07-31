import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
const DEF_SETTINGS={turnTime:15,roundTime:180,startCards:7,stacking:true,specialCards:true,drawTilPlay:false,maxPlayers:10};

/* ══ BACKGROUND MUSIC (Web Audio - upbeat funky bossa) ══ */
class BGMusic{
  constructor(){this.ctx=null;this.playing=false;this.master=null;this.timer=null;this.vol=0.2;this.bar=0;}
  init(ctx){this.ctx=ctx;}
  _pad(freqs,t,dur){
    if(!this.ctx||!this.master)return;
    freqs.forEach(freq=>{
      const o1=this.ctx.createOscillator();const o2=this.ctx.createOscillator();
      o1.type="triangle";o2.type="sine";
      o1.frequency.value=freq;o2.frequency.value=freq*1.002;
      const f=this.ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=900;f.Q.value=1;
      const g=this.ctx.createGain();
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.018,t+0.5);
      g.gain.setValueAtTime(0.015,t+dur-0.8);g.gain.linearRampToValueAtTime(0,t+dur);
      o1.connect(f);o2.connect(f);f.connect(g);g.connect(this.master);
      o1.start(t);o2.start(t);o1.stop(t+dur+0.1);o2.stop(t+dur+0.1);});}
  _wBass(notes,t,bpm){
    if(!this.ctx||!this.master)return;
    const step=60/bpm;
    notes.forEach((freq,i)=>{
      const o=this.ctx.createOscillator();o.type="sine";o.frequency.value=freq;
      const o2=this.ctx.createOscillator();o2.type="triangle";o2.frequency.value=freq;
      const f=this.ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=500;
      const g=this.ctx.createGain();const nt=t+i*step;
      g.gain.setValueAtTime(0,nt);g.gain.linearRampToValueAtTime(0.065,nt+0.02);
      g.gain.setValueAtTime(0.055,nt+step*0.6);g.gain.linearRampToValueAtTime(0,nt+step*0.9);
      o.connect(f);o2.connect(f);f.connect(g);g.connect(this.master);
      o.start(nt);o2.start(nt);o.stop(nt+step+0.05);o2.stop(nt+step+0.05);});}
  _pluck(freq,t,dur){
    if(!this.ctx||!this.master)return;
    const o=this.ctx.createOscillator();o.type="triangle";o.frequency.value=freq;
    const o2=this.ctx.createOscillator();o2.type="sine";o2.frequency.value=freq*2;
    const g=this.ctx.createGain();const g2=this.ctx.createGain();
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.035,t+0.005);g.gain.exponentialRampToValueAtTime(0.003,t+dur);
    g2.gain.setValueAtTime(0,t);g2.gain.linearRampToValueAtTime(0.015,t+0.005);g2.gain.exponentialRampToValueAtTime(0.001,t+dur*0.5);
    o.connect(g);o2.connect(g2);g.connect(this.master);g2.connect(this.master);
    o.start(t);o2.start(t);o.stop(t+dur+0.05);o2.stop(t+dur+0.05);}
  _hat(t,open){
    if(!this.ctx||!this.master)return;
    const len=open?0.08:0.03;const vol=open?0.035:0.028;
    const buf=this.ctx.createBuffer(1,this.ctx.sampleRate*len,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*(open?0.1:0.03)));
    const b=this.ctx.createBufferSource();b.buffer=buf;
    const f=this.ctx.createBiquadFilter();f.type="highpass";f.frequency.value=open?4000:7000;
    const g=this.ctx.createGain();g.gain.value=vol;
    b.connect(f);f.connect(g);g.connect(this.master);b.start(t);}
  _kick(t){
    if(!this.ctx||!this.master)return;
    const o=this.ctx.createOscillator();o.type="sine";
    o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(40,t+0.08);
    const g=this.ctx.createGain();g.gain.setValueAtTime(0.06,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.15);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+0.18);}
  _snap(t){
    if(!this.ctx||!this.master)return;
    const buf=this.ctx.createBuffer(1,this.ctx.sampleRate*0.015,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.015));
    const b=this.ctx.createBufferSource();b.buffer=buf;
    const f=this.ctx.createBiquadFilter();f.type="bandpass";f.frequency.value=4500;f.Q.value=5;
    const g=this.ctx.createGain();g.gain.value=0.05;
    b.connect(f);f.connect(g);g.connect(this.master);b.start(t);}
  _playLoop(){
    if(!this.playing||!this.ctx)return;
    const bpm=this.bpm;const step=60/bpm;const bd=step*8;const tr=this.transpose;
    const t=this.ctx.currentTime+0.05;
    const prog=this.progs[this.bar%this.progs.length];
    this._pad(prog.pad.map(f=>f*tr),t,bd+0.6);
    this._wBass(prog.bass.map(f=>f*tr),t,bpm);
    prog.pl.forEach((notes,ci)=>{const ct=t+ci*step*2;
      notes.forEach((f,fi)=>this._pluck(f*tr,ct+fi*step*0.5+(Math.random()*0.008),step*1.5));});
    const bossa=[1,0,1,0,0,1,0,1,0,0,1,0,1,0,0,1];
    for(let b=0;b<8;b++){
      const bt=t+b*step;
      if(this.groove===0){/* bossa */
        this._hat(bt,b%4===0);
        if(b%4===2)this._snap(bt);
        if(bossa[b*2%16])this._kick(bt);
        if(bossa[(b*2+1)%16])this._hat(bt+step*0.5,false);
      }else{/* straight backbeat */
        this._hat(bt,b%4===0);this._hat(bt+step*0.5,false);
        if(b%2===0)this._kick(bt);
        if(b%4===2)this._snap(bt);}}
    this.bar++;
    this.timer=setTimeout(()=>this._playLoop(),(bd-0.15)*1000);}
  start(){
    if(this.playing||!this.ctx)return;
    if(this.ctx.state==="suspended")this.ctx.resume();
    this.playing=true;this.bar=0;
    /* pick a random happy song each game: progression set + key + tempo + groove */
    const sets=[
      [{pad:[261.63,329.63,392],bass:[65.41,82.41,98,82.41,65.41,98,82.41,65.41],pl:[[523,659],[392,523],[440,659],[523,784]]},
       {pad:[293.66,349.23,440],bass:[73.42,87.31,98,110,98,87.31,73.42,98],pl:[[587,784],[440,587],[523,659],[587,880]]},
       {pad:[349.23,440,523],bass:[87.31,110,130.81,110,87.31,130.81,110,87.31],pl:[[698,880],[523,698],[587,784],[698,1047]]},
       {pad:[329.63,392,493.88],bass:[82.41,98,110,130.81,110,98,82.41,110],pl:[[659,880],[493,659],[523,784],[659,987]]}],
      [{pad:[261.63,329.63,392],bass:[65.41,98,65.41,82.41,65.41,98,82.41,98],pl:[[523,659],[659,784],[523,659],[784,988]]},
       {pad:[392,493.88,587.33],bass:[98,73.42,98,146.83,98,123.47,98,73.42],pl:[[587,784],[784,988],[587,784],[988,784]]},
       {pad:[261.63,329.63,440],bass:[55,82.41,110,82.41,55,110,82.41,55],pl:[[440,659],[523,659],[440,523],[659,880]]},
       {pad:[349.23,440,523.25],bass:[87.31,130.81,87.31,110,87.31,130.81,110,87.31],pl:[[523,698],[698,880],[523,698],[880,1047]]}],
      [{pad:[293.66,349.23,440],bass:[73.42,110,73.42,87.31,73.42,110,87.31,110],pl:[[587,698],[698,880],[587,698],[880,698]]},
       {pad:[392,493.88,587.33],bass:[98,146.83,98,123.47,98,146.83,123.47,98],pl:[[784,988],[587,784],[698,880],[988,784]]},
       {pad:[261.63,329.63,392],bass:[65.41,98,130.81,98,65.41,130.81,98,65.41],pl:[[523,659],[784,659],[523,659],[784,1047]]},
       {pad:[261.63,329.63,440],bass:[55,82.41,110,82.41,55,110,82.41,55],pl:[[440,659],[523,659],[440,523],[659,880]]}]];
    this.progs=sets[Math.floor(Math.random()*sets.length)];
    this.bpm=100+Math.floor(Math.random()*30);
    this.transpose=Math.pow(2,(Math.floor(Math.random()*8)-3)/12);
    this.groove=Math.random()<0.5?0:1;
    this.master=this.ctx.createGain();this.master.gain.setValueAtTime(0,this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.vol,this.ctx.currentTime+2.5);
    this.master.connect(this.ctx.destination);this._playLoop();}
  stop(){this.playing=false;if(this.timer){clearTimeout(this.timer);this.timer=null;}
    if(this.master&&this.ctx){try{this.master.gain.linearRampToValueAtTime(0,this.ctx.currentTime+1);}catch(e){}
      setTimeout(()=>{try{this.master?.disconnect();}catch(e){}this.master=null;},1500);}}
  toggle(){if(this.playing){this.stop();return false;}this.start();return true;}
}
const bgm=new BGMusic();

/* ══ ANIME SFX ENGINE (LOUD - matches music volume) ══ */
class AnimeSFX{
  constructor(){this.c=null;}
  init(){if(!this.c)try{this.c=new(window.AudioContext||window.webkitAudioContext)();if(this.c.state==="suspended")this.c.resume();bgm.init(this.c);}catch(e){}}
  _osc(freq,type,t,dur,vol=0.18){
    const o=this.c.createOscillator();const g=this.c.createGain();o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g);g.connect(this.c.destination);o.start(t);o.stop(t+dur);}
  _bend(freq,endFreq,type,t,dur,vol=0.18){
    const o=this.c.createOscillator();const g=this.c.createGain();o.type=type;
    o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(endFreq,t+dur*0.6);
    const lp=this.c.createBiquadFilter();lp.type="lowpass";lp.frequency.value=3500;lp.Q.value=6;
    g.gain.setValueAtTime(vol,t);g.gain.setValueAtTime(vol*0.8,t+dur*0.3);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(lp);lp.connect(g);g.connect(this.c.destination);o.start(t);o.stop(t+dur);}
  _noise(t,dur,vol=0.3){
    const buf=this.c.createBuffer(1,this.c.sampleRate*dur,this.c.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.12));
    const b=this.c.createBufferSource();b.buffer=buf;const g=this.c.createGain();g.gain.value=vol;
    const f=this.c.createBiquadFilter();f.type="highpass";f.frequency.value=2500;
    b.connect(f);f.connect(g);g.connect(this.c.destination);b.start(t);}
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
    b.connect(f);f.connect(g);g.connect(this.c.destination);b.start(t);
    this._bend(80,25,"sine",t,0.5,0.2);this._bend(60,20,"sine",t+0.05,0.4,0.15);}
  _fNoise(t,dur,freq,q,type,vol=0.2){
    const buf=this.c.createBuffer(1,this.c.sampleRate*dur,this.c.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.2));
    const b=this.c.createBufferSource();b.buffer=buf;const f=this.c.createBiquadFilter();
    f.type=type;f.frequency.value=freq;f.Q.value=q;
    const g=this.c.createGain();g.gain.value=vol;
    b.connect(f);f.connect(g);g.connect(this.c.destination);b.start(t);}
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
  pEl(color){if(!this.c)return;try{const t=this.c.currentTime;
    switch(color){case"red":this._fireEl(t);break;case"blue":this._waterEl(t);break;
      case"green":this._windEl(t);break;case"yellow":this._lightEl(t);break;}}catch(e){}}
  p(type){if(!this.c)return;try{const n=this.c.currentTime;
    switch(type){
      case "card":this._noise(n,0.07,0.5);this._bend(600,1200,"sine",n,0.08,0.2);this._osc(1000,"triangle",n+0.02,0.05,0.12);break;
      case "draw":this._bend(300,600,"sine",n,0.15,0.18);this._bend(400,800,"triangle",n+0.05,0.12,0.12);this._noise(n,0.04,0.2);break;
      case "action":this._bend(400,1200,"sawtooth",n,0.2,0.12);this._bend(600,1600,"square",n+0.05,0.18,0.08);this._shimmer(800,n+0.1,0.3,0.06);break;
      case "turn":this._chime([880,1100,1320],n,0.07,0.16);this._shimmer(1200,n+0.15,0.2,0.05);break;
      case "uno":this._chime([523,784,1047,1319,1568],n,0.06,0.18);this._shimmer(1500,n+0.2,0.4,0.07);this._bend(500,2000,"sine",n,0.4,0.1);break;
      case "win":this._chime([523,659,784,1047,1319,1568,2093],n,0.09,0.2);this._shimmer(2000,n+0.3,0.6,0.08);this._bend(400,2400,"sine",n,0.8,0.08);[523,1047,1568].forEach((f,i)=>this._osc(f,"triangle",n+0.5+i*0.1,0.4,0.12));break;
      case "error":this._bend(400,150,"sawtooth",n,0.2,0.18);this._bend(300,100,"square",n+0.1,0.2,0.12);break;
      case "join":this._chime([440,554,659,880],n,0.07,0.16);this._shimmer(800,n+0.15,0.3,0.06);break;
      case "challenge":this._bend(600,1400,"triangle",n,0.15,0.2);this._bend(1400,600,"triangle",n+0.15,0.15,0.2);this._bend(600,1800,"sawtooth",n+0.3,0.2,0.12);break;
      case "penalty":this._bend(800,200,"sawtooth",n,0.3,0.18);this._bend(600,150,"square",n+0.1,0.25,0.12);this._osc(100,"sine",n+0.2,0.2,0.15);break;
      case "skip":this._bend(1000,400,"sine",n,0.12,0.2);this._bend(800,300,"triangle",n+0.06,0.1,0.15);break;
      case "reverse":this._bend(400,1200,"sine",n,0.12,0.18);this._bend(1200,400,"sine",n+0.12,0.12,0.18);this._shimmer(800,n+0.1,0.2,0.06);break;
      case "draw2":this._thunder(n);this._bend(500,1000,"triangle",n,0.1,0.2);this._bend(500,1000,"triangle",n+0.12,0.1,0.18);break;
      case "draw4":this._thunder(n);this._thunder(n+0.15);[0,0.08,0.16,0.24].forEach((d,i)=>{this._bend(400+i*150,900+i*200,"triangle",n+d,0.12,0.18-i*0.03);});this._shimmer(600,n+0.15,0.4,0.06);break;
      case "wild":this._bend(300,1800,"sine",n,0.3,0.15);this._shimmer(1200,n+0.1,0.4,0.07);this._chime([523,659,784,1047],n+0.05,0.06,0.12);break;
      case "playable":this._chime([659,880,1047],n,0.06,0.14);break;
      case "notPlayable":this._bend(500,250,"sine",n,0.2,0.15);break;
      case "gameOn":this._chime([523,659,784,1047,1319],n,0.08,0.2);this._bend(300,1500,"sine",n,0.5,0.08);break;
      case "catchUno":this._bend(800,1600,"square",n,0.1,0.18);this._bend(1200,2000,"sine",n+0.05,0.1,0.15);this._noise(n+0.08,0.06,0.2);break;
      case "sparkle":[2000,2400,2800,3200,3600].forEach((f,i)=>{this._osc(f,"sine",n+i*0.03,0.15,0.07);});break;
      case "cardSlide":this._noise(n,0.1,0.3);this._bend(200,400,"sine",n,0.08,0.08);break;
      case "stack":this._thunder(n);this._bend(300,900,"triangle",n,0.12,0.22);this._bend(500,1200,"sine",n+0.06,0.1,0.18);this._noise(n+0.08,0.05,0.2);break;
      case "discardAll":this._chime([523,659,784,1047,1319,1568],n,0.05,0.16);this._shimmer(1500,n+0.2,0.5,0.08);this._bend(400,2000,"sine",n,0.4,0.1);this._noise(n+0.1,0.08,0.2);break;
      case "tick":this._osc(1200,"sine",n,0.03,0.1);break;
      case "timeout":this._bend(600,200,"sawtooth",n,0.25,0.2);this._bend(400,120,"square",n+0.12,0.2,0.15);break;
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
const BOT_NAMES=["Botchi","RoboK","AI-chan","Mecha","Droid","Cybot","NPC-san","Unit-7","Glitch"];
const isBot=id=>id?.startsWith("bot_");
function botPickColor(hand){const cnt={red:0,blue:0,green:0,yellow:0};hand.forEach(c=>{if(c.color!=="wild"&&cnt[c.color]!==undefined)cnt[c.color]++;});const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);return best[0][1]>0?best[0][0]:COLORS[Math.floor(Math.random()*4)];}
function botChooseCard(playable,hand,curColor,intel,nextOppHL){if(intel===0)return playable[Math.floor(Math.random()*playable.length)];const scored=playable.map(c=>{let s=0;if(c.type!=="wild")s+=3;if(c.value==="discardAll")s+=8;if(c.value==="draw2")s+=5;if(c.value==="skip"||c.value==="reverse")s+=4;if(c.value==="snatch")s+=2;if(c.color===curColor)s+=2;if(intel>=2&&nextOppHL<=2){if(c.value==="draw2"||c.value==="wild4")s+=10;if(c.value==="skip")s+=6;}if(c.value==="wild4")s-=2;return{card:c,s};});scored.sort((a,b)=>b.s-a.s);if(intel<=1&&scored.length>1&&Math.random()>0.6)return scored[Math.min(1,scored.length-1)].card;return scored[0].card;}
function gpid(){let i=localStorage.getItem("uno_pid");if(!i){i=gid();localStorage.setItem("uno_pid",i);}return i;}
function getTag(id){return"#"+id.slice(0,4).toUpperCase();}
function goFS(){try{const d=document.documentElement;(d.requestFullscreen||d.webkitRequestFullscreen||d.msRequestFullscreen)?.call(d);}catch(e){}}
function goLand(){try{screen.orientation?.lock?.("landscape").catch(()=>{});}catch(e){}}

const RANK_TIERS=[
  {name:"Bronze",min:0,starGap:100,color:"#CD7F32",bg:"linear-gradient(135deg,#CD7F32,#8B5A2B)",icon:"🥉",idx:0},
  {name:"Silver",min:500,starGap:200,color:"#C0C0C0",bg:"linear-gradient(135deg,#C0C0C0,#808080)",icon:"🥈",idx:1},
  {name:"Gold",min:1500,starGap:300,color:"#FFD700",bg:"linear-gradient(135deg,#FFD700,#DAA520)",icon:"🥇",idx:2},
  {name:"Platinum",min:3000,starGap:600,color:"#E5E4E2",bg:"linear-gradient(135deg,#E5E4E2,#A0C4FF,#E5E4E2)",icon:"💎",idx:3},
  {name:"Diamond",min:6000,starGap:800,color:"#B9F2FF",bg:"linear-gradient(135deg,#B9F2FF,#00BCD4,#E1F5FE)",icon:"💠",idx:4},
  {name:"Grand Master",min:10000,starGap:2000,color:"#FF4500",bg:"linear-gradient(135deg,#FF4500,#FFD700,#FF4500)",icon:"👑",idx:5},
];
const UNRANKED={name:"Unranked",stars:0,color:"#666",bg:"linear-gradient(135deg,#444,#333)",icon:"—",idx:-1,starProgress:0};
function getRank(pts,games){
  if(games<10)return{...UNRANKED,totalStarPts:0};
  let tier=RANK_TIERS[0];for(const t of RANK_TIERS){if(pts>=t.min)tier=t;}
  const inTier=pts-tier.min;const stars=Math.min(5,Math.floor(inTier/tier.starGap)+1);
  const curStarBase=tier.min+(stars-1)*tier.starGap;const nextStarAt=tier.min+stars*tier.starGap;
  const starProgress=stars>=5?1:(pts-curStarBase)/(nextStarAt-curStarBase);
  return{...tier,stars,starProgress};}
function getNextRank(pts,games){
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
        p.trail.forEach((tr,ti)=>{ctx.globalAlpha=tr.l*0.12*(ti/p.trail.length);
          ctx.fillStyle=col;ctx.beginPath();ctx.arc(tr.x,tr.y,p.sz*tr.l*0.5,0,Math.PI*2);ctx.fill();});
        ctx.globalAlpha=p.life*0.35;ctx.fillStyle=col;
        ctx.beginPath();ctx.arc(p.x,p.y,p.sz*p.life*2.2,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=p.life;ctx.beginPath();ctx.arc(p.x,p.y,p.sz*p.life,0,Math.PI*2);ctx.fill();
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
      bg.addColorStop(0,"#1e1e1e");bg.addColorStop(0.5,"#141414");bg.addColorStop(1,"#0a0a0a");
      ctx.fillStyle=bg;ctx.fill();
      ctx.strokeStyle="rgba(255,215,0,0.35)";ctx.lineWidth=2;ctx.stroke();
      for(let i=-W;i<W+H;i+=8){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+H,H);
        ctx.strokeStyle="rgba(255,215,0,0.025)";ctx.lineWidth=2;ctx.stroke();}
      const sg=ctx.createRadialGradient(W*0.3,H*0.2,0,W*0.3,H*0.2,W*0.6);
      sg.addColorStop(0,"rgba(255,215,0,0.07)");sg.addColorStop(1,"transparent");
      ctx.fillStyle=sg;ctx.fillRect(0,0,W,H);
      ctx.save();ctx.translate(W*0.5,H*0.48);ctx.rotate(-0.35);
      const ew=W*0.34,eh=H*0.26;
      ellipse(0,0,ew,eh);
      const eg=ctx.createLinearGradient(-ew,-eh,ew,eh);
      eg.addColorStop(0,"#E53935");eg.addColorStop(0.5,"#C62828");eg.addColorStop(1,"#B71C1C");
      ctx.fillStyle=eg;ctx.fill();
      ctx.shadowColor="rgba(229,57,53,0.6)";ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;
      ellipse(0,0,ew,eh);ctx.strokeStyle="rgba(255,255,255,0.2)";ctx.lineWidth=1;ctx.stroke();
      ctx.rotate(0.35);
      ctx.font=`900 ${dm.f*1.3}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="#FFD700";ctx.shadowColor="rgba(0,0,0,0.8)";ctx.shadowBlur=6;
      ctx.fillText("UNO",0,1);ctx.shadowColor="rgba(255,215,0,0.4)";ctx.shadowBlur=15;ctx.fillText("UNO",0,1);
      ctx.shadowBlur=0;ctx.restore();
    } else if(isW){
      roundRect(0,0,W,H,R);ctx.save();ctx.clip();
      const hw=W/2,hh=H/2;
      const qc=[{x:0,y:0,c1:CH.red,c2:"#C41E1E"},{x:hw,y:0,c1:CH.blue,c2:"#0747A6"},
        {x:0,y:hh,c1:CH.yellow,c2:"#F9C800"},{x:hw,y:hh,c1:CH.green,c2:"#00873E"}];
      qc.forEach(q=>{const g=ctx.createLinearGradient(q.x,q.y,q.x+hw,q.y+hh);
        g.addColorStop(0,q.c1);g.addColorStop(1,q.c2);ctx.fillStyle=g;ctx.fillRect(q.x,q.y,hw,hh);});
      const sg2=ctx.createRadialGradient(W*0.3,H*0.2,0,W*0.3,H*0.2,W*0.6);
      sg2.addColorStop(0,"rgba(255,255,255,0.18)");sg2.addColorStop(1,"transparent");
      ctx.fillStyle=sg2;ctx.fillRect(0,0,W,H);
      ctx.restore();
      roundRect(0,0,W,H,R);ctx.strokeStyle="rgba(255,255,255,0.35)";ctx.lineWidth=2;ctx.stroke();
      ctx.save();ctx.translate(W*0.5,H*0.48);ctx.rotate(-0.35);
      const cr=Math.min(W,H)*0.25;
      ellipse(0,0,cr,cr);ctx.fillStyle="rgba(0,0,0,0.92)";ctx.fill();
      ellipse(0,0,cr,cr);ctx.strokeStyle="rgba(255,255,255,0.45)";ctx.lineWidth=1.5;ctx.stroke();
      ctx.rotate(0.35);
      const sym2=gs(card.value);
      ctx.font=`900 ${dm.fs*0.7}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="#fff";ctx.shadowColor="rgba(255,255,255,0.5)";ctx.shadowBlur=10;
      ctx.fillText(sym2,0,1);ctx.shadowBlur=0;ctx.restore();
      ctx.font=`800 ${dm.cf}px sans-serif`;ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,0.8)";ctx.shadowBlur=3;
      ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(gs(card.value),4,3);
      ctx.save();ctx.translate(W-4,H-3);ctx.rotate(Math.PI);ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillText(gs(card.value),0,0);ctx.restore();ctx.shadowBlur=0;
    } else {
      const isShadow=card.value==="shadow";
      roundRect(0,0,W,H,R);ctx.save();ctx.clip();
      const rgb=CHR[card.color]||[255,165,0];
      if(isShadow){
        const bg2=ctx.createLinearGradient(0,0,W*0.7,H);
        bg2.addColorStop(0,`rgba(${Math.floor(rgb[0]*0.25)},${Math.floor(rgb[1]*0.25)},${Math.floor(rgb[2]*0.25)},1)`);
        bg2.addColorStop(0.5,"#111");bg2.addColorStop(1,"#000");
        ctx.fillStyle=bg2;ctx.fillRect(0,0,W,H);
      } else {
        const bg2=ctx.createLinearGradient(0,0,W*0.7,H);
        bg2.addColorStop(0,`rgba(${Math.min(255,rgb[0]+50)},${Math.min(255,rgb[1]+50)},${Math.min(255,rgb[2]+50)},1)`);
        bg2.addColorStop(0.5,CH[card.color]);
        bg2.addColorStop(1,`rgba(${Math.max(0,rgb[0]-60)},${Math.max(0,rgb[1]-60)},${Math.max(0,rgb[2]-60)},1)`);
        ctx.fillStyle=bg2;ctx.fillRect(0,0,W,H);
      }

      ctx.globalAlpha=isShadow?0.03:0.06;
      for(let i=0;i<6;i++){const dx=W*0.15+i*W*0.15;
        ctx.beginPath();ctx.moveTo(dx,-5);ctx.lineTo(dx+H*0.5,H+5);ctx.strokeStyle=isShadow?CH[card.color]:"#fff";ctx.lineWidth=1;ctx.stroke();}
      ctx.globalAlpha=1;

      if(!isShadow){
        const shine=ctx.createLinearGradient(0,0,W*0.6,H*0.4);
        shine.addColorStop(0,"rgba(255,255,255,0.22)");shine.addColorStop(0.3,"rgba(255,255,255,0.08)");
        shine.addColorStop(1,"transparent");ctx.fillStyle=shine;ctx.fillRect(0,0,W,H);
      } else {
        const glow=ctx.createRadialGradient(W*0.5,H*0.4,0,W*0.5,H*0.4,W*0.6);
        glow.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.08)`);glow.addColorStop(1,"transparent");
        ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
      }
      const vg=ctx.createLinearGradient(0,H*0.7,0,H);
      vg.addColorStop(0,"transparent");vg.addColorStop(1,isShadow?"rgba(0,0,0,0.3)":"rgba(0,0,0,0.15)");
      ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
      ctx.restore();

      roundRect(0,0,W,H,R);ctx.strokeStyle=isShadow?`${CH[card.color]}88`:"rgba(255,255,255,0.5)";ctx.lineWidth=2;ctx.stroke();
      const sym3=gs(card.value);const tc2=card.color==="yellow"?"#333":"#fff";
      ctx.save();ctx.translate(W*0.5,H*0.48);ctx.rotate(-0.35);
      const er=Math.min(W,H)*0.27;
      ellipse(0,0,er*1.05,er);
      if(isShadow){
        const sg=ctx.createRadialGradient(0,0,0,0,0,er);
        sg.addColorStop(0,`${CH[card.color]}33`);sg.addColorStop(1,"rgba(0,0,0,0.9)");
        ctx.fillStyle=sg;ctx.fill();
        ellipse(0,0,er*1.05,er);ctx.strokeStyle=`${CH[card.color]}66`;ctx.lineWidth=1.5;ctx.stroke();
        ctx.shadowColor=`${CH[card.color]}44`;ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;
      } else {
        ctx.fillStyle="rgba(255,255,255,0.96)";ctx.fill();
        ellipse(0,0,er*1.05,er);ctx.strokeStyle=CH[card.color];ctx.lineWidth=1.5;ctx.stroke();
        ctx.shadowColor=`${CH[card.color]}55`;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
      }
      ctx.rotate(0.35);

      if(card.value==="shadow"){
        ctx.font=`${dm.fs*0.85}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText("👤",0,1);
      } else if(card.value==="snatch"){
        ctx.font=`${dm.fs*0.8}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText("🫳",0,1);
      } else if(card.value==="discardAll"){
        ctx.strokeStyle=CH[card.color];ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,er*0.45,0.3,Math.PI*1.3);ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,er*0.45,Math.PI+0.3,Math.PI*2.3);ctx.stroke();
        ctx.fillStyle=CH[card.color];
        ctx.beginPath();ctx.moveTo(er*0.35,-er*0.25);ctx.lineTo(er*0.5,-er*0.05);ctx.lineTo(er*0.25,-er*0.05);ctx.fill();
        ctx.beginPath();ctx.moveTo(-er*0.35,er*0.25);ctx.lineTo(-er*0.5,er*0.05);ctx.lineTo(-er*0.25,er*0.05);ctx.fill();
      } else if(card.value==="skip"){
        ctx.strokeStyle=CH[card.color];ctx.lineWidth=2.5;
        ctx.beginPath();ctx.arc(0,0,er*0.4,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(-er*0.35,er*0.35);ctx.lineTo(er*0.35,-er*0.35);ctx.stroke();
      } else if(card.value==="reverse"){
        ctx.fillStyle=CH[card.color];ctx.font=`900 ${dm.fs*0.7}px "Arial Black",sans-serif`;
        ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("⇄",0,1);
      } else if(card.value==="draw2"){
        ctx.fillStyle=CH[card.color];ctx.font=`900 ${dm.fs*0.6}px "Arial Black",sans-serif`;
        ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("+2",0,2);
      } else {
        ctx.font=`900 ${dm.fs}px "Arial Black",sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillStyle=CH[card.color];ctx.shadowColor=`${CH[card.color]}44`;ctx.shadowBlur=4;
        ctx.fillText(sym3,0,2);ctx.shadowBlur=0;
      }
      ctx.restore();

      const cornerSym=card.value==="shadow"?"S":card.value==="snatch"?"SN":card.value==="discardAll"?"ALL":sym3;
      const cfs=card.value==="discardAll"||card.value==="snatch"?dm.cf*0.75:card.value==="shadow"?dm.cf*0.7:dm.cf;
      ctx.font=`800 ${cfs}px sans-serif`;ctx.fillStyle=card.value==="shadow"?CH[card.color]:tc2;
      ctx.shadowColor=card.color==="yellow"?"transparent":"rgba(0,0,0,0.7)";ctx.shadowBlur=3;
      ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(cornerSym,4,3);
      ctx.save();ctx.translate(W-4,H-3);ctx.rotate(Math.PI);ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillText(cornerSym,0,0);ctx.restore();ctx.shadowBlur=0;
    }
  },[card.color,card.value,card.type,faceDown,sz]);

  return(
    <div onClick={onClick} style={{width:dm.w,height:dm.h,borderRadius:dm.r,position:"relative",flexShrink:0,
      cursor:onClick?"pointer":"default",
      transition:"transform 0.35s cubic-bezier(.34,1.56,.64,1),box-shadow 0.35s ease",
      boxShadow:lifted?`0 20px 50px rgba(0,0,0,0.95),0 0 0 2px ${gc},0 0 40px ${gc}66`
        :highlighted?`0 4px 22px ${gc}66,0 0 0 2px ${gc}55`
        :"0 4px 18px rgba(0,0,0,0.65),0 1px 4px rgba(0,0,0,0.3)",
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

/* ═══ ELEMENT → CHIBI GENDER (fire/lightning = boy, water/wind = girl) ═══ */
const ELEM_GENDER={red:"boy",yellow:"boy",blue:"girl",green:"girl"};

/* ═══ ELEMENTAL ART SHEETS (4 columns: fire | lightning | water | wind) ═══ */
const ART_URL=import.meta.env.BASE_URL+"art/";
const ELEM_COL={red:0,yellow:1,blue:2,green:3};
const artPosX=el=>((ELEM_COL[el]??0)/3)*100;
/* Effect colors matched to the art (lightning art is purple, not yellow) */
const ART_GLOW={red:"#FF7A18",yellow:"#FFD21A",blue:"#29B6F6",green:"#66BB6A"};
const ART_DARK={red:"#BF360C",yellow:"#F57F17",blue:"#01579B",green:"#1B5E20"};

/* ═══ MANGA CHIBI (SVG, poses: slash / trip) — boy & girl variants ═══ */
const Chibi=({pose="slash",accent="#FFD700",dark="#B8860B",gender="boy",element="red"})=>{
  const poseAnim=pose==="trip"?"chibiTripFall 1s ease-in forwards":"chibiBounce 0.4s ease infinite alternate";
  const isGirl=gender==="girl";const isTrip=pose==="trip";const u=gender;
  const skin1="#FFE7CE",skin2="#FBD3A8";
  const hairA=isGirl?accent:"#33334A",hairB=isGirl?dark:"#16161F";
  return(<svg viewBox="0 0 120 178" width="98" height="145" style={{overflow:"visible",filter:"drop-shadow(0 6px 10px rgba(0,0,0,0.55))"}}>
    <defs>
      <radialGradient id={`chSkin_${u}`} cx="50%" cy="38%"><stop offset="0%" stopColor={skin1}/><stop offset="100%" stopColor={skin2}/></radialGradient>
      <linearGradient id={`chHair_${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={hairA}/><stop offset="100%" stopColor={hairB}/></linearGradient>
      <linearGradient id={`chBody_${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent}/><stop offset="100%" stopColor={dark}/></linearGradient>
      <radialGradient id={`chIris_${u}`} cx="50%" cy="35%"><stop offset="0%" stopColor={accent}/><stop offset="100%" stopColor={dark}/></radialGradient>
    </defs>
    <g style={{animation:poseAnim,transformOrigin:"60px 110px"}}>
      {/* girl twin-tails behind */}
      {isGirl&&<><path d="M22,52 Q-2,88 8,132 Q22,124 26,88 Q24,66 32,54 Z" fill={`url(#chHair_${u})`} stroke={hairB} strokeWidth="1.5"/>
        <path d="M98,52 Q122,88 112,132 Q98,124 94,88 Q96,66 88,54 Z" fill={`url(#chHair_${u})`} stroke={hairB} strokeWidth="1.5"/></>}
      {/* legs */}
      <rect x={isGirl?49:47} y={isGirl?150:142} width={isGirl?10:12} height={isGirl?18:24} rx="6" fill={`url(#chSkin_${u})`}/>
      <rect x={isGirl?61:61} y={isGirl?150:142} width={isGirl?10:12} height={isGirl?18:24} rx="6" fill={`url(#chSkin_${u})`}/>
      <ellipse cx={isGirl?54:53} cy={isGirl?168:166} rx="8" ry="5" fill={dark}/>
      <ellipse cx={isGirl?66:67} cy={isGirl?168:166} rx="8" ry="5" fill={dark}/>
      {/* body / outfit */}
      {isGirl
        ?<path d="M42,100 Q60,94 78,100 L98,158 Q60,172 22,158 Z" fill={`url(#chBody_${u})`} stroke={hairB} strokeWidth="1.5"/>
        :<path d="M40,100 Q60,94 80,100 L86,146 Q60,154 34,146 Z" fill={`url(#chBody_${u})`} stroke="#0008" strokeWidth="1"/>}
      <rect x={isGirl?40:38} y="118" width={isGirl?40:44} height="7" rx="3.5" fill="#fff" opacity="0.35"/>
      {/* back arm (their left / screen right) */}
      <rect x="78" y="99" width="12" height="30" rx="6" fill={`url(#chSkin_${u})`} transform="rotate(14 84 102)"/>
      {/* neck + collar */}
      <rect x="52" y="90" width="16" height="14" rx="5" fill={`url(#chSkin_${u})`}/>
      <path d="M44,96 Q60,105 76,96 L73,104 Q60,111 47,104 Z" fill={dark} stroke={hairB} strokeWidth="1"/>
      {/* head */}
      <ellipse cx="60" cy="58" rx="43" ry="41" fill={`url(#chSkin_${u})`} stroke="#E8B08A" strokeWidth="1.5"/>
      <ellipse cx="46" cy="42" rx="19" ry="14" fill="#fff" opacity="0.16"/>
      <path d="M92,52 Q98,76 72,94 Q90,72 84,52 Z" fill="#E39A6E" opacity="0.28"/>
      {/* ears */}
      <ellipse cx="18" cy="60" rx="6" ry="9" fill={`url(#chSkin_${u})`}/><ellipse cx="102" cy="60" rx="6" ry="9" fill={`url(#chSkin_${u})`}/>
      {/* blush */}
      <ellipse cx="29" cy="73" rx="7.5" ry="4" fill="#FF9AA2" opacity="0.55"/><ellipse cx="91" cy="73" rx="7.5" ry="4" fill="#FF9AA2" opacity="0.55"/>
      {/* eyes */}
      {isTrip
        ?<><path d="M37,55 L51,67 M51,55 L37,67" stroke="#2A1622" strokeWidth="3.5" strokeLinecap="round"/>
           <path d="M69,55 L83,67 M83,55 L69,67" stroke="#2A1622" strokeWidth="3.5" strokeLinecap="round"/></>
        :<>
           <ellipse cx="43" cy="61" rx="10.5" ry="13.5" fill="#fff"/><ellipse cx="77" cy="61" rx="10.5" ry="13.5" fill="#fff"/>
           <ellipse cx="44" cy="63" rx="8.5" ry="11" fill={`url(#chIris_${u})`}/><ellipse cx="76" cy="63" rx="8.5" ry="11" fill={`url(#chIris_${u})`}/>
           <ellipse cx="44" cy="64" rx="8.5" ry="11" fill="none" stroke="#000" strokeWidth="1" opacity="0.22"/>
           <ellipse cx="76" cy="64" rx="8.5" ry="11" fill="none" stroke="#000" strokeWidth="1" opacity="0.22"/>
           <ellipse cx="44" cy="65" rx="4" ry="5.6" fill="#120c1a"/><ellipse cx="76" cy="65" rx="4" ry="5.6" fill="#120c1a"/>
           <ellipse cx="40" cy="58" rx="3.6" ry="4.4" fill="#fff"/><ellipse cx="72" cy="58" rx="3.6" ry="4.4" fill="#fff"/>
           <circle cx="47" cy="68" r="2" fill="#fff" opacity="0.9"/><circle cx="79" cy="68" r="2" fill="#fff" opacity="0.9"/>
           <path d="M35,69 Q44,73 52,69" stroke="#fff" strokeWidth="1.4" fill="none" opacity="0.45"/>
           <path d="M68,69 Q76,73 85,69" stroke="#fff" strokeWidth="1.4" fill="none" opacity="0.45"/>
           <path d="M31,53 Q43,47 55,54" stroke="#1c0e18" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
           <path d="M65,54 Q77,47 89,53" stroke="#1c0e18" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
           <path d="M31,53 L26,49" stroke="#1c0e18" strokeWidth="3" fill="none" strokeLinecap="round"/>
           <path d="M89,53 L94,49" stroke="#1c0e18" strokeWidth="3" fill="none" strokeLinecap="round"/>
           <path d={pose==="slash"?"M31,41 Q43,37 51,43":"M32,42 Q43,38 52,44"} stroke={hairB} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
           <path d={pose==="slash"?"M69,43 Q77,37 89,41":"M68,44 Q77,38 88,42"} stroke={hairB} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
         </>}
      {/* nose */}
      {!isTrip&&<path d="M60,70 Q57.5,74 60.5,74.5" stroke="#D2916B" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.75"/>}
      {/* mouth */}
      {isTrip
        ?<ellipse cx="60" cy="83" rx="5" ry="6" fill="#7A2523"/>
        :pose==="slash"
          ?<><path d="M50,80 Q60,93 70,80 Q60,85 50,80 Z" fill="#7A2523"/><path d="M53,83 Q60,89 67,83 Z" fill="#E8636B"/><path d="M50,80 Q60,83 70,80" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.6"/></>
          :<path d="M52,81 Q60,88 68,81" stroke="#B23A2E" strokeWidth="2.5" fill="none" strokeLinecap="round"/>}
      {/* hair front */}
      {isGirl
        ?<><path d="M14,54 Q10,14 60,10 Q110,14 106,54 Q101,28 82,23 Q91,41 80,45 L71,27 Q66,42 60,45 Q54,42 49,27 L40,45 Q29,41 38,23 Q19,28 14,54 Z" fill={`url(#chHair_${u})`} stroke={hairB} strokeWidth="1.5"/>
           <path d="M30,30 Q42,19 58,21" stroke="#fff" strokeWidth="3" opacity="0.28" fill="none" strokeLinecap="round"/>
           <path d="M66,22 Q80,25 90,36" stroke="#fff" strokeWidth="2.5" opacity="0.22" fill="none" strokeLinecap="round"/></>
        :<><path d="M16,52 Q12,16 32,13 L28,31 L41,9 L45,29 L57,6 L61,28 L75,8 L77,29 L90,14 L87,33 Q106,21 104,52 Q95,31 76,29 Q60,27 44,29 Q25,31 16,52 Z" fill={`url(#chHair_${u})`} stroke={hairB} strokeWidth="1.5"/>
           <path d="M40,20 L44,31 M57,13 L59,29 M73,17 L71,30" stroke="#fff" strokeWidth="2" opacity="0.22" strokeLinecap="round"/></>}
      {/* boy headband */}
      {!isGirl&&<><rect x="14" y="41" width="92" height="10" rx="5" fill={accent}/><rect x="14" y="41" width="92" height="3" rx="1.5" fill="#fff" opacity="0.4"/></>}
      {/* girl bows at tails + top */}
      {isGirl&&[[20,54],[100,54]].map(([bx,by],i)=><g key={i}>
        <path d={`M${bx},${by} l-11,-6 l0,12 Z`} fill={accent} stroke={hairB} strokeWidth="1"/>
        <path d={`M${bx},${by} l11,-6 l0,12 Z`} fill={accent} stroke={hairB} strokeWidth="1"/>
        <circle cx={bx} cy={by} r="4" fill={dark}/></g>)}
      {/* front slash arm + energy blade */}
      {pose==="slash"&&<g>
        <animateTransform attributeName="transform" type="rotate" values="48 40 104;-66 40 104;48 40 104" dur="0.5s" repeatCount="indefinite"/>
        <rect x="34" y="76" width="12" height="32" rx="6" fill={`url(#chSkin_${u})`}/>
        <g transform="translate(40,74) scale(0.52)"><ElementBlade element={element} accent={accent} dark={dark}/></g>
      </g>}
      {/* trip: flailing front arm + sweat */}
      {isTrip&&<><rect x="24" y="96" width="12" height="30" rx="6" fill={`url(#chSkin_${u})`} transform="rotate(-40 30 100)"/>
        <ellipse cx="30" cy="40" rx="6" ry="9" fill="#5AC8FA" opacity="0.9" style={{animation:"sweatFall 0.9s ease-in forwards"}}/></>}
      {/* draw stance: element blade held across, ready to unsheathe */}
      {pose==="draw"&&<g transform="rotate(-11 60 104)">
        <g transform="translate(84,105) rotate(-90) scale(0.52)"><ElementBlade element={element} accent={accent} dark={dark}/></g>
        <rect x="62" y="98.5" width="11" height="11" rx="5.5" fill={`url(#chSkin_${u})`}/>
        <rect x="76" y="98.5" width="11" height="11" rx="5.5" fill={`url(#chSkin_${u})`}/>
      </g>}
    </g>
  </svg>);};

/* ═══ ELEMENTAL BLADE (energy weapon, shape varies by element) ═══ */
/* Authored vertical: grip near y=0, blade tip toward y=-len. */
const ElementBlade=({element,accent,dark})=>{
  let blade;
  if(element==="yellow"){/* lightning — jagged bolt */
    blade=<path d="M0,2 L-8,-22 L5,-38 L-7,-62 L6,-82 L-4,-104 L3,-126 L9,-100 L-2,-80 L8,-58 L-3,-36 L9,-20 L4,2 Z" fill={accent} stroke="#fff" strokeWidth="1.2"/>;
  }else if(element==="blue"){/* water — crescent curve */
    blade=<path d="M-5,2 Q-26,-60 3,-128 Q13,-64 7,2 Z" fill={accent} stroke="#fff" strokeWidth="1.2"/>;
  }else if(element==="green"){/* wind — slim glaive */
    blade=<path d="M-4,2 L-6,-72 Q-3,-126 5,-130 Q11,-72 6,2 Z" fill={accent} stroke="#fff" strokeWidth="1.2"/>;
  }else{/* fire — wavy flame blade */
    blade=<path d="M-6,2 Q-11,-28 -3,-50 Q-12,-74 -2,-96 Q-9,-114 3,-130 Q12,-108 5,-86 Q13,-62 4,-44 Q11,-22 6,2 Z" fill={accent} stroke="#fff" strokeWidth="1.2"/>;
  }
  return(<g style={{filter:`drop-shadow(0 0 7px ${accent}) drop-shadow(0 0 15px ${accent}aa)`}}>
    {blade}
    <rect x="-3.5" y="0" width="7" height="20" rx="3" fill={dark}/>
    <rect x="-10" y="-3" width="20" height="6" rx="3" fill={dark}/>
    <rect x="-1.5" y="-118" width="3" height="112" rx="1.5" fill="#fff" opacity="0.55"/>
  </g>);
};

/* ═══ ORNATE FRAME (gold filigree border, manhwa cover style) ═══ */
const OrnateFrame=({accent})=>(
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:6}}>
    <defs><linearGradient id="ornGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#FFF3C4"/><stop offset="45%" stopColor="#E6B23A"/><stop offset="100%" stopColor="#9A6B12"/></linearGradient></defs>
    <rect x="2.2" y="3" width="95.6" height="94" rx="1.2" fill="none" stroke="url(#ornGold)" strokeWidth="1.4"/>
    <rect x="4" y="5" width="92" height="90" rx="0.8" fill="none" stroke="url(#ornGold)" strokeWidth="0.5" opacity="0.8"/>
    {/* corner flourishes */}
    {[[0,0,1,1],[100,0,-1,1],[0,100,1,-1],[100,100,-1,-1]].map(([cx,cy,sx,sy],i)=>(
      <g key={i} transform={`translate(${cx} ${cy}) scale(${sx} ${sy})`} fill="url(#ornGold)">
        <path d="M2.2,14 Q2.2,2.2 14,2.2 L22,2.2 Q9,3 5,9 Q3,13 2.2,22 Z" opacity="0.95"/>
        <path d="M6,7 Q13,4 20,4.5 Q13,6.5 8.5,11 Q5.5,15 5,20 Q4.5,13 6,7 Z" opacity="0.9"/>
        <circle cx="4.4" cy="4.4" r="1.5"/>
      </g>))}
  </svg>
);

/* ═══ +2 PENALTY — cards fan in the air then fly to the penalized player ═══ */
const CardFlyFX=({element,count,toSelf,onDone})=>{
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{const t=setTimeout(()=>doneRef.current(),1050);return()=>clearTimeout(t);},[]);
  const em=EM(element);const n=Math.min(count,10);
  const cards=useMemo(()=>Array.from({length:n},(_,i)=>({id:i,
    sx:n<=1?0:-100+i*(200/(n-1)),del:i*0.05,rot:-18+Math.random()*36})),[n]);
  const fy=toSelf?280:-230;
  return(<div style={{position:"fixed",inset:0,zIndex:96,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{position:"absolute",width:170,height:170,borderRadius:"50%",
      background:`radial-gradient(circle,${em.glow}33,transparent 70%)`,animation:"bgPulse 0.6s ease-out"}}/>
    {cards.map(c=><div key={c.id} style={{position:"absolute",
      "--fx":`${c.sx}px`,"--fy":`${fy}px`,"--fr":`${c.rot}deg`,
      animation:`cardFly 0.95s cubic-bezier(.5,0,.72,1) ${c.del}s forwards`}}>
      <div style={{width:40,height:58,borderRadius:6,background:CG[element]||em.grad,
        border:"2px solid rgba(255,255,255,0.85)",boxShadow:`0 5px 16px rgba(0,0,0,0.5),0 0 16px ${em.glow}77`,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:14,fontWeight:900,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.6)"}}>+2</span></div>
    </div>)}
  </div>);
};

/* ═══ +4 PENALTY CINEMATIC — character card → element skill whirls the cards ═══ */
const ChibiAttackFX=({element,victimName,count,toSelf,onDone})=>{
  const[phase,setPhase]=useState(0);
  const doneRef=useRef(onDone);doneRef.current=onDone;
  useEffect(()=>{
    const t1=setTimeout(()=>setPhase(1),750);
    const t2=setTimeout(()=>doneRef.current(),2850);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  const em0=EM(element);const em={...em0,glow:ART_GLOW[element]||em0.glow,c3:ART_DARK[element]||em0.c3};
  const gen=ELEM_GENDER[element]||"boy";const posX=artPosX(element);
  const rays=useMemo(()=>Array.from({length:22},(_,i)=>({id:i,a:(i/22)*360})),[element]);
  const vlines=useMemo(()=>Array.from({length:26},(_,i)=>({id:i,x:(i/26)*100,d:Math.random()*0.3,w:1+Math.random()*2})),[element]);
  const dust=useMemo(()=>Array.from({length:16},(_,i)=>({id:i,a:Math.random()*Math.PI*2,r:60+Math.random()*140,d:Math.random()*0.25,s:7+Math.random()*15})),[element]);
  const splashes=useMemo(()=>Array.from({length:11},(_,i)=>({id:i,a:Math.random()*Math.PI*2,r:95+Math.random()*115,rot:Math.random()*360,w:14+Math.random()*32,h:5+Math.random()*7,d:Math.random()*0.4})),[element]);
  const cardSplash=useMemo(()=>Array.from({length:9},(_,i)=>({id:i,a:Math.random()*Math.PI*2,r:34+Math.random()*74,rot:Math.random()*360,w:10+Math.random()*20,h:4+Math.random()*5,d:Math.random()*0.4})),[element]);
  const FXN=element==="green"?32:38;
  const fx=useMemo(()=>Array.from({length:FXN},(_,i)=>({id:i,
    x:-175+Math.random()*350,y:-140+Math.random()*280,d:Math.random()*1.2,dur:0.9+Math.random()*0.8,
    sz:12+Math.random()*20,drift:-60+Math.random()*120,rot:Math.random()*360,a:(i/FXN)*360,r:95+Math.random()*185})),[element]);
  const bolts=useMemo(()=>element!=="yellow"?[]:Array.from({length:4},(_,i)=>{
    let x=50,p="M50,0";const segs=9;
    for(let s=1;s<=segs;s++){const y=Math.round((s/segs)*300);x=50+(Math.random()-0.5)*48;p+=` L${Math.round(x)},${y}`;}
    return{id:i,x:-150+i*95+(Math.random()-0.5)*22,d:0.05+i*0.1+Math.random()*0.07,path:p};}),[element]);
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
    {/* LIGHTNING — big jagged bolts striking down */}
    {element==="yellow"&&bolts.map(b=>(
      <svg key={b.id} viewBox="0 0 100 300" preserveAspectRatio="none"
        style={{position:"absolute",left:`calc(50% + ${b.x}px)`,top:0,width:70,height:"54%",transform:"translateX(-50%)",zIndex:3,
          filter:`drop-shadow(0 0 8px ${em.glow})`,animation:`boltFlash 0.7s steps(1,end) ${b.d}s both`}}>
        <path d={b.path} fill="none" stroke={em.glow} strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" opacity="0.6"/>
        <path d={b.path} fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      </svg>))}
    {/* FIRE — rising embers + flame licks */}
    {element==="red"&&fx.map(p=><div key={p.id} style={{position:"absolute",left:`calc(50% + ${p.x}px)`,bottom:"12%",
      width:p.sz,height:p.sz*(p.id%3?1:1.7),borderRadius:p.id%3?"50%":"50% 50% 50% 50% / 60% 60% 40% 40%",
      background:"radial-gradient(circle,#FFF3C4,#FF7A18 70%)",
      boxShadow:`0 0 16px #FF7A18`,opacity:0,"--ex":`${p.drift}px`,zIndex:3,
      animation:`emberRise ${p.dur}s ease-out ${p.d}s forwards`}}/>)}
    {/* LIGHTNING — electric sparks */}
    {element==="yellow"&&fx.map(p=><div key={p.id} style={{position:"absolute",left:`calc(50% + ${p.x}px)`,top:`calc(46% + ${p.y}px)`,
      width:p.id%4?3:5,height:p.sz*2.6,background:"linear-gradient(#fff,#FFE066)",borderRadius:2,transform:`rotate(${p.rot}deg)`,opacity:0,zIndex:3,
      boxShadow:`0 0 14px ${em.glow}`,animation:`sparkFlash 0.5s steps(1,end) ${p.d}s forwards`}}/>)}
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
    {/* the penalty cards — caught in the element, then flung to the victim */}
    {(()=>{const nC=Math.max(2,Math.min(count||4,8));
      return(<div style={{position:"absolute",left:"50%",top:"45%",width:0,height:0,zIndex:4,
        "--tx":"0px","--ty":toSelf?"330px":"-290px",
        animation:`${element}CardGroup 1.5s cubic-bezier(.55,0,.55,1) 0.1s both`}}>
        {Array.from({length:nC}).map((_,i)=>{const a=(i/nC)*360;
          return(<div key={i} style={{position:"absolute",left:0,top:0,
            transform:`translate(-50%,-50%) rotate(${a}deg) translateY(-70px)`}}>
            <div style={{width:34,height:49,borderRadius:5,background:CG[element]||em.grad,
              border:"2px solid rgba(255,255,255,0.9)",boxShadow:`0 3px 11px rgba(0,0,0,0.55),0 0 13px ${em.glow}99`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:13,fontWeight:900,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.6)"}}>+4</span></div>
          </div>);})}
      </div>);})()}
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

const DiscardAllFX=({color,count,onDone})=>{
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[onDone]);
  const gc=CH[color]||"#E040FB";
  const cards=useMemo(()=>Array.from({length:Math.max(count,3)},(_,i)=>({
    id:i,startX:-140+Math.random()*280,startY:180+Math.random()*40,
    rot:-25+Math.random()*50,delay:i*0.1})),[count]);
  return(<div style={{position:"fixed",inset:0,zIndex:95,pointerEvents:"none",
    display:"flex",alignItems:"center",justifyContent:"center",animation:"af 3s forwards"}}>
    <div style={{position:"absolute",inset:0,
      background:`radial-gradient(circle at 50% 55%,${gc}44,transparent 60%)`,
      animation:"bgPulse 1s ease-out"}}/>
    {cards.map(c=>(
      <div key={c.id} style={{position:"absolute",width:50,height:75,borderRadius:8,
        background:CG[color],border:"2px solid rgba(255,255,255,0.6)",
        boxShadow:`0 4px 20px ${gc}88`,
        transform:`translate(${c.startX}px,${c.startY}px) rotate(${c.rot}deg)`,
        animation:`discardPull 0.6s cubic-bezier(.22,1,.36,1) ${c.delay}s forwards`,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:"60%",height:"50%",borderRadius:"50%",background:"rgba(255,255,255,0.9)",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:14,fontWeight:900,color:gc,fontFamily:"Arial Black"}}>✕</span>
        </div>
      </div>))}
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
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:90,
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,
    backdropFilter:"blur(12px)",animation:"fadeIn 0.3s ease-out"}}>
    <div style={{fontSize:52,animation:"apop 0.4s cubic-bezier(.34,1.56,.64,1)",
      textShadow:"0 0 40px #9C27B0,0 0 80px #9C27B0"}}>+4</div>
    <div style={{color:"#FF9800",fontSize:18,fontWeight:800,textAlign:"center",maxWidth:300}}>
      {playerName} played Wild Draw Four!</div>
    <div style={{color:"#889",fontSize:11,textAlign:"center",maxWidth:280,lineHeight:1.6,
      background:"rgba(255,255,255,0.03)",padding:"10px 16px",borderRadius:12,
      border:"1px solid rgba(255,255,255,0.05)"}}>
      Challenge if you think they had a matching color card.<br/>Guilty = they draw 4 | Innocent = you draw 6!</div>
    <div style={{display:"flex",gap:14,marginTop:6}}>
      <button onClick={onChallenge} style={{...MBTN,background:"linear-gradient(135deg,#FF6F00,#E65100)",
        boxShadow:"0 4px 25px rgba(255,111,0,0.5)",animation:"pulse 1.2s infinite"}}
        onPointerEnter={e=>e.currentTarget.style.transform="scale(1.06)"}
        onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>CHALLENGE!</button>
      <button onClick={onAccept} style={{...MBTN,background:"rgba(255,255,255,0.06)",
        border:"1px solid rgba(255,255,255,0.1)",color:"#999"}}
        onPointerEnter={e=>e.currentTarget.style.transform="scale(1.06)"}
        onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>ACCEPT +4</button>
    </div>
  </div>);

const CWheel=({onPick,onCancel})=>{
  const[h,setH]=useState(null);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,
    backdropFilter:"blur(16px)",animation:"fadeIn 0.2s ease-out"}}>
    <div style={{color:"#fff",fontSize:22,fontWeight:800,letterSpacing:4}}>Choose Color</div>
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

/* ═══ MAIN GAME ═══ */
export default function UnoGame(){
  const pid=useRef(gpid()).current;
  const[scr,setScr]=useState("menu");
  const[pName,setPName]=useState(localStorage.getItem("uno_name")||"");
  const[rc,setRc]=useState("");const[jc,setJc]=useState("");const[err,setErr]=useState("");
  const[isAdm,setIsAdm]=useState(false);const[admP,setAdmP]=useState("");const[showAdm,setShowAdm]=useState(false);
  const[peek,setPeek]=useState(false);const[pickDr,setPickDr]=useState(false);
  const[swap,setSwap]=useState(false);const[swpC,setSwpC]=useState(null);const[showDk,setShowDk]=useState(false);
  const[rd,setRd]=useState(null);const[pickCol,setPickCol]=useState(false);const[pendW,setPendW]=useState(null);
  const[lMsg,setLMsg]=useState("");const[snd,setSnd]=useState(true);const[mus,setMus]=useState(false);
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
  const[snatchModal,setSnatchModal]=useState(null);
  const[wild4Fx,setWild4Fx]=useState(null);
  const[chibiAttackFx,setChibiAttackFx]=useState(null);
  const[cardFlyFx,setCardFlyFx]=useState(null);
  const[draw2Fx,setDraw2Fx]=useState(null);
  const[reverseFx,setReverseFx]=useState(null);
  const[skipFx,setSkipFx]=useState(null);
  const[unoCallFx,setUnoCallFx]=useState(null);
  const[unoPenaltyFx,setUnoPenaltyFx]=useState(null);
  const[timeoutFx,setTimeoutFx]=useState(null);
  const[turnFx,setTurnFx]=useState(null);
  const[showAccount,setShowAccount]=useState(false);
  const[restoreId,setRestoreId]=useState("");
  const[restoreMsg,setRestoreMsg]=useState("");
  const[settings,setSettings]=useState(DEF_SETTINGS);
  const[showSettings,setShowSettings]=useState(false);
  const[autoStart,setAutoStart]=useState(false);
  const[roundTimer,setRoundTimer]=useState(ROUND_TIME);
  const prevT=useRef(null);const prevM=useRef("");const lbUpdated=useRef(false);

  useEffect(()=>{if(pName)localStorage.setItem("uno_name",pName);},[pName]);

  useEffect(()=>{
    const lbRef=ref(db,"leaderboard");
    const u=onValue(lbRef,s=>{const d=s.val();if(!d){setGlobalLB([]);setMyStats(null);return;}
      const arr=Object.entries(d).map(([id,v])=>({id,...v})).sort((a,b)=>b.totalPoints-a.totalPoints);
      setGlobalLB(arr);
      const me=d[pid];if(me)setMyStats(me);});
    return()=>off(lbRef);
  },[pid]);
  const ps=useCallback(t=>{if(snd)sfx.p(t);},[snd]);
  const psE=useCallback(c=>{if(snd)sfx.pEl(c);},[snd]);
  const trigShake=useCallback(()=>{setScreenShake(true);setTimeout(()=>setScreenShake(false),400);},[]);
  const trigBurst=useCallback(c=>{setBurstColor(c);setTimeout(()=>setBurstColor(null),1500);},[]);
  const trigImpact=useCallback(c=>{setImpactColor(c);setTimeout(()=>setImpactColor(null),600);},[]);
  const trigLightning=useCallback(c=>{setLightningColor(c);setTimeout(()=>setLightningColor(null),1500);},[]);

  useEffect(()=>{if(!rc)return;const r=ref(db,"rooms/"+rc);
    const u=onValue(r,s=>{const d=s.val();if(d){setRd(d);if(d.settings)setSettings({...DEF_SETTINGS,...d.settings});}else{setRd(null);setScr("menu");setErr("Room closed");}});
    return()=>off(r);},[rc]);

  const pls=rd?.players?Object.entries(rd.players).sort((a,b)=>a[1].order-b[1].order):[];
  const po=pls.map(([id])=>id);const isHost=rd?.host===pid;
  const g=rd?.game||null;const myH=g?.hands?.[pid]||[];
  const topC=g?.discardPile?g.discardPile[g.discardPile.length-1]:null;
  const myTurn=g?.currentPlayer===pid;const msg=g?.message||lMsg;
  const drawStack=g?.drawStack||0;
  const drawStackType=g?.drawStackType||null;
  const lastStackTypeRef=useRef(null);
  useEffect(()=>{if(g?.drawStackType)lastStackTypeRef.current=g.drawStackType;},[g?.drawStackType]);

  useEffect(()=>{
    if(!g||!myTurn||g.winner)return;
    if(g.pendingChallenge&&g.pendingChallenge.target===pid){
      setChallenge({playerId:g.pendingChallenge.player,
        playerName:rd.players[g.pendingChallenge.player]?.name||"Player",
        playerHadColor:g.pendingChallenge.hadMatchingColor});}
  },[g?.pendingChallenge,myTurn,g?.winner,pid,rd?.players,g]);

  useEffect(()=>{if(!g?.message||g.message===prevM.current)return;prevM.current=g.message;const m=g.message.toLowerCase();
    if(m.includes("challenge")&&m.includes("guilty")){setActFx("challenge");ps("challenge");trigShake();trigBurst("red");trigImpact("red");}
    else if(m.includes("challenge")&&m.includes("innocent")){setActFx("challenge");ps("challenge");trigBurst("blue");trigImpact("blue");}
    else if(m.includes("stack")){const stc=g?.currentColor||"yellow";setActFx("stack");ps("stack");psE(stc);trigShake();trigBurst(stc);}
    else if(m.includes("called uno")){setUnoCallFx(g?.currentColor||"red");ps("uno");trigShake();}
    else if(m.includes("forgot uno")||m.includes("caught!")){ps("penalty");trigShake();
      const fm=g.message.match(/^(.*?)\s+played\s/i);const cm=g.message.match(/^(.*?)\s+caught!/i);
      setUnoPenaltyFx((cm&&cm[1])||(fm&&fm[1])||"");}
    else if(/has no counter! draws|timed out! draws|accepts\. draws|draws \d+ cards!/i.test(m)){
      ps("penalty");
      if(lastStackTypeRef.current!=="wild4")trigShake();
    }
    else if(m.includes("skip")){const sc=g?.currentColor||"red";setSkipFx(sc);ps("skip");psE(sc);trigBurst(sc);}
    else if(m.includes("reverse")){const rc2=g?.currentColor||"blue";setReverseFx(rc2);ps("reverse");psE(rc2);trigBurst(rc2);}
    else if(m.includes("+2")&&!m.includes("+4")&&!m.includes("stack")){const dc=g?.currentColor||"yellow";setDraw2Fx(dc);ps("draw2");psE(dc);}
    else if(m.includes("+4")){const wc=g?.currentColor||"green";setWild4Fx(wc);ps("draw4");psE(wc);trigShake();trigBurst(wc);trigImpact(wc);}
    else if(m.includes("wild")&&!m.includes("+4")){setActFx("wild");ps("wild");trigBurst("yellow");}
    else if(m.includes("wins")){ps("win");trigBurst("yellow");trigImpact("yellow");}
    else if(m.includes("discard all")){const dac=g?.currentColor||"yellow";setActFx("discardAll");ps("discardAll");psE(dac);trigBurst(dac);}
    else if(m.includes("shadow")){const shc=g?.currentColor||"blue";setActFx("shadow");ps("skip");psE(shc);trigBurst(shc);}
    else if(m.includes("snatch")){const snc=g?.currentColor||"yellow";setActFx("snatch");ps("draw2");psE(snc);trigShake();trigBurst(snc);}
    else if(m.includes("played")){}
    if(m.includes("timed out")){const tm=g.message.match(/^(.*?)\s+timed out/i);setTimeoutFx(tm?tm[1]:"");}
  },[g?.message,ps,psE,trigShake,trigBurst,trigImpact,trigLightning,g?.currentColor]);
  useEffect(()=>{if(timeoutFx!==null){const t=setTimeout(()=>setTimeoutFx(null),2000);return()=>clearTimeout(t);}},[timeoutFx]);

  useEffect(()=>{if(g?.currentPlayer&&g.currentPlayer!==prevT.current){
    if(prevT.current!==null){
      if(g.currentPlayer===pid){ps("turn");setTurnFx("YOUR TURN");}
      else setTurnFx((rd?.players?.[g.currentPlayer]?.name||"...")+"'s turn");
    }
    prevT.current=g.currentPlayer;setHasDrawn(false);setDrawnCard(null);setTurnTimer(settings.turnTime);}},[g?.currentPlayer,pid,ps,rd?.players]);
  useEffect(()=>{if(turnFx!==null){const t=setTimeout(()=>setTurnFx(null),1800);return()=>clearTimeout(t);}},[turnFx]);
  useEffect(()=>{setSel(-1);},[myH.length]);

  const np=useCallback((cur,dir,skip=false)=>{const i=po.indexOf(cur);const n=po.length;
    let x=(i+dir+n)%n;if(skip)x=(x+dir+n)%n;return po[x];},[po]);
  const wgs=useCallback(async u=>{try{await update(ref(db,"rooms/"+rc+"/game"),u);}catch(e){}},[rc]);

  /* Resolve a draw-stack penalty. Play an animation first, then deliver the
     penalty cards when it lands: +4 (wild4) → sword-draw cinematic (~850ms),
     +2 (draw2) → cards fly to the penalized player (~650ms). */
  const SLASH_DELAY=2150,DRAW2_DELAY=650;
  const applyStackDraw=useCallback(async(victimId,victimHand,reasonBase,nextPlayer)=>{
    const cnt=g.drawStack||0;const type=g.drawStackType;const element=g.currentColor||"green";
    let ndp=[...(g.drawPile||[])];const nd=[...g.discardPile];
    if(ndp.length<cnt){const reshuf=sh(nd.slice(0,-1));ndp=[...ndp,...reshuf];nd.splice(0,nd.length-1);}
    const drawn=ndp.splice(0,Math.min(cnt,ndp.length));
    const nh={...g.hands};nh[victimId]=[...victimHand,...drawn];
    const drawWrite={hands:nh,drawPile:ndp,discardPile:nd,drawStack:0,drawStackType:null,
      currentPlayer:nextPlayer,message:reasonBase+" Draws "+cnt+"!",turnTimestamp:Date.now()};
    const delay=type==="wild4"?SLASH_DELAY:DRAW2_DELAY;
    await wgs({pendingSlash:{victim:victimId,name:rd.players[victimId]?.name||"Player",element,type:type||"draw2",count:cnt,ts:Date.now()}});
    setTimeout(()=>{wgs({...drawWrite,pendingSlash:null});},delay);
  },[g,wgs,rd]);

  /* Watch pendingSlash → +4 sword cinematic, or +2 card-fly to the victim */
  const slashRef=useRef(null);
  useEffect(()=>{
    const psl=g?.pendingSlash;
    if(psl&&psl.ts&&psl.ts!==slashRef.current){
      slashRef.current=psl.ts;
      ps("penalty");
      if(psl.type==="wild4"){
        setChibiAttackFx({element:psl.element||"green",victimName:psl.name,count:psl.count||4,toSelf:psl.victim===pid});
        const t=setTimeout(()=>trigShake(),SLASH_DELAY);
        return()=>clearTimeout(t);
      }else{
        setCardFlyFx({element:psl.element||"yellow",count:psl.count||2,toSelf:psl.victim===pid});
      }
    }
  },[g?.pendingSlash,ps,trigShake,pid]);

  useEffect(()=>{if(!g||g.winner||!g.currentPlayer)return;
    setTurnTimer(settings.turnTime);
    const iv=setInterval(()=>{setTurnTimer(prev=>{
      if(prev<=1){clearInterval(iv);return 0;}
      if(prev<=5&&snd)sfx.p("tick");
      return prev-1;});},1000);
    return()=>clearInterval(iv);
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
      if(lbUpdated.current)return;lbUpdated.current=true;
      const hands=g.hands||{};let minCards=Infinity;let winnerId=null;
      for(const[id,h]of Object.entries(hands)){if(h.length<minCards){minCards=h.length;winnerId=id;}}
      if(winnerId){
        (async()=>{
          const mn=rd.players[winnerId]?.name||"Player";
          const baseScore=Math.max(20,calcScore(hands,winnerId));
          const winnerIsBot=isBot(winnerId);
          if(!winnerIsBot){
            const lbSnap=await get(ref(db,"leaderboard/"+winnerId));const prev=lbSnap.val()||{totalPoints:0,gamesPlayed:0,wins:0,name:mn};
            const wRank=getRank(prev.totalPoints,prev.gamesPlayed);let totalWin=0;
            for(const[oppId]of pls){if(oppId===winnerId)continue;
              const isOppBot2=isBot(oppId);
              const op=isOppBot2?{totalPoints:0,gamesPlayed:0,wins:0}:(await get(ref(db,"leaderboard/"+oppId))).val()||{totalPoints:0,gamesPlayed:0,wins:0};
              const oRank=getRank(op.totalPoints,op.gamesPlayed);
              const elo=calcElo(wRank.idx,oRank.idx,baseScore);totalWin+=elo.winPts;
              if(!isOppBot2){const newPts=Math.max(0,(op.totalPoints||0)-elo.losePts);
              await update(ref(db,"leaderboard/"+oppId),{name:rd.players[oppId]?.name||"Player",
                gamesPlayed:(op.gamesPlayed||0)+1,totalPoints:newPts,wins:op.wins||0,losses:(op.losses||0)+1,lastPlayed:Date.now()});}}
            const curScores=rd.scores||{};curScores[winnerId]=(curScores[winnerId]||0)+totalWin;
            await update(ref(db,"rooms/"+rc),{scores:curScores});
            await update(ref(db,"leaderboard/"+winnerId),{name:mn,totalPoints:(prev.totalPoints||0)+totalWin,
              gamesPlayed:(prev.gamesPlayed||0)+1,wins:(prev.wins||0)+1,lastPlayed:Date.now()});
            await wgs({winner:winnerId,message:"⏰ Time's up! "+mn+" wins with fewest cards! (+"+totalWin+" pts)"});
          }else{
            await wgs({winner:winnerId,message:"⏰ Time's up! "+mn+" wins with fewest cards!"});
          }
        })();
      }
    }
  },[roundTimer,g,isHost,pls,rc,wgs,rd]);

  const autoPassRef=useRef(false);
  useEffect(()=>{if(turnTimer===0&&myTurn&&!g?.winner&&!autoPassRef.current&&!snatchModal){
    autoPassRef.current=true;ps("timeout");
    (async()=>{
      if(drawStack>0){
        await applyStackDraw(pid,myH,(rd.players[pid]?.name)+" timed out!",np(pid,g.direction));
        return;
      } else if(!hasDrawn){
        const dp=[...(g.drawPile||[])];
        if(dp.length){const drawn=dp.shift();const nh={...g.hands};nh[pid]=[...myH,drawn];
          await wgs({hands:nh,drawPile:dp,currentPlayer:np(pid,g.direction),
            message:(rd.players[pid]?.name)+" timed out",turnTimestamp:Date.now()});}
        else await wgs({currentPlayer:np(pid,g.direction),message:(rd.players[pid]?.name)+" timed out",turnTimestamp:Date.now()});
      } else {
        await wgs({currentPlayer:np(pid,g.direction),message:(rd.players[pid]?.name)+" timed out",turnTimestamp:Date.now()});
      }
      autoPassRef.current=false;
    })();
  }},[turnTimer,myTurn,g,drawStack,hasDrawn,pid,myH,np,wgs,rd,ps,snatchModal,applyStackDraw]);
  useEffect(()=>{autoPassRef.current=false;},[g?.currentPlayer]);

  const autoDrawRef=useRef(false);
  useEffect(()=>{
    if(!myTurn||!g||g.winner||drawStack<=0||autoDrawRef.current)return;
    const hasCounter=drawStackType==="wild4"
      ?myH.some(c=>c.value==="wild4"||c.value==="shadow")
      :myH.some(c=>c.value==="draw2"||c.value==="wild4"||c.value==="shadow");
    if(!hasCounter){
      autoDrawRef.current=true;
      const timer=setTimeout(()=>{
        ps("penalty");
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
            if(remain.length===1&&(intel>=1||Math.random()>0.3))cu[cp]=true;
            if(remain.length===1&&!cu[cp]){m+=" | Forgot UNO! +2 penalty!";remain=[...remain,...ensure(2)];}
            cu[cp]=false;nh[cp]=remain;const w=remain.length===0?cp:null;if(w)m=bn+" WINS!";
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
          nd.push(...disc,cardToPlay);m+=" Discard all "+mc+"! (-"+(disc.length+1)+" cards)";
          const dr=ensure(1);remain=[...remain,...dr];m+=" Drew 1.";}
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
        cu[cp]=false;nh[cp]=remain;const w=remain.length===0?cp:null;if(w)m=bn+" WINS!";
        let nxP=w?cp:np(cp,dir,skip2);
        if((cardToPlay.value==="draw2"||cardToPlay.value==="wild4")&&!w)nxP=np(cp,dir,false);
        await wgs({hands:nh,discardPile:nd,drawPile:ndp2,direction:dir,currentColor:nCol,
          currentPlayer:nxP,winner:w,message:m,calledUno:cu,turnTimestamp:Date.now(),
          pendingChallenge:w?null:pc,drawStack:w?0:nds,drawStackType:w?null:ndt});
      }catch(e){console.error("Bot:",e);try{await wgs({currentPlayer:np(g.currentPlayer,g.direction),
        message:(rd.players[g.currentPlayer]?.name||"Bot")+" passed",turnTimestamp:Date.now()});}catch(e2){}}
    },1200+Math.random()*1300);
  });

  const trigA=()=>{setCAn("cFly 0.6s cubic-bezier(.22,1,.36,1)");setTimeout(()=>setCAn(null),600);};

  const startMusic=useCallback(()=>{ua();if(!bgm.playing){bgm.start();setMus(true);}},[]);

  const restoreAccount=async()=>{
    const id=restoreId.trim().toLowerCase();
    if(!id||id.length<4){setRestoreMsg("Enter a valid Player ID");return;}
    if(id===pid){setRestoreMsg("That's already your current ID");return;}
    const snap=await get(ref(db,"leaderboard/"+id));
    if(!snap.exists()){setRestoreMsg("No account found with that ID");return;}
    const data=snap.val();
    localStorage.setItem("uno_pid",id);
    if(data.name)setPName(data.name);
    setRestoreMsg("Account restored! Reloading...");
    setTimeout(()=>window.location.reload(),1200);
  };
  const copyPid=()=>{navigator.clipboard?.writeText(pid).then(()=>setRestoreMsg("Copied!")).catch(()=>{});
    setTimeout(()=>setRestoreMsg(""),1500);};

  const createRoom=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("join");
    const code=grc();
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:Date.now(),
      players:{[pid]:{name:pName.trim(),order:0}},scores:{},settings:DEF_SETTINGS});setRc(code);setErr("");setScr("lobby");
    }catch(e){setErr("Check Firebase config.");console.error(e);}};

  const joinRoom=async()=>{if(!pName.trim()){setErr("Enter name");return;}
    const code=jc.trim().toUpperCase();if(code.length!==4){setErr("4-letter code");return;}ua();
    try{const snap=await get(ref(db,"rooms/"+code));if(!snap.exists()){setErr("Not found");return;}
      const data=snap.val();if(data.status!=="waiting"){setErr("Already started");return;}
      const cnt=data.players?Object.keys(data.players).length:0;if(cnt>=10){setErr("Full");return;}
      if(!data.players?.[pid])await update(ref(db,"rooms/"+code+"/players/"+pid),{name:pName.trim(),order:cnt});
      setRc(code);setErr("");setScr("lobby");ps("join");
    }catch(e){setErr("Failed.");console.error(e);}};

  const saveSetting=async(key,val)=>{const ns={...settings,[key]:val};setSettings(ns);
    if(rc)await update(ref(db,"rooms/"+rc),{settings:ns});};

  const addBot=async()=>{if(!isHost||pls.length>=(settings.maxPlayers||10))return;
    const bc=pls.filter(([id])=>isBot(id)).length;const botId="bot_"+(bc+1)+"_"+Date.now();
    await update(ref(db,"rooms/"+rc+"/players/"+botId),{name:BOT_NAMES[bc%BOT_NAMES.length],order:pls.length,isBot:true});};
  const removeBot=async(botId)=>{if(!isHost||!isBot(botId))return;await remove(ref(db,"rooms/"+rc+"/players/"+botId));};

  const quickPlay1v1=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("join");
    const code=grc();const now=Date.now();
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:now,
      players:{[pid]:{name:pName.trim(),order:0},["bot_1_"+now]:{name:BOT_NAMES[0],order:1,isBot:true}},
      scores:{},settings:DEF_SETTINGS});setRc(code);setErr("");setScr("lobby");setAutoStart(true);
    }catch(e){setErr("Check Firebase config.");}};

  const quickPlayFFA=async()=>{if(!pName.trim()){setErr("Enter name");return;}ua();ps("join");
    const code=grc();const now=Date.now();const players={[pid]:{name:pName.trim(),order:0}};
    for(let i=0;i<3;i++)players["bot_"+(i+1)+"_"+now]={name:BOT_NAMES[i],order:i+1,isBot:true};
    try{await set(ref(db,"rooms/"+code),{host:pid,status:"waiting",createdAt:now,
      players,scores:{},settings:DEF_SETTINGS});setRc(code);setErr("");setScr("lobby");setAutoStart(true);
    }catch(e){setErr("Check Firebase config.");}};

  const startGame=async()=>{if(!isHost||pls.length<2)return;lbUpdated.current=false;setRoundTimer(settings.roundTime||ROUND_TIME);setTurnTimer(TURN_TIME);ps("gameOn");startMusic();
    let deck=sh(mkD());
    if(!settings.specialCards)deck=deck.filter(c=>c.value!=="shadow"&&c.value!=="snatch"&&c.value!=="discardAll");
    const hands={};for(const[p]of pls)hands[p]=deck.splice(0,settings.startCards);
    const badFirst=v=>v==="wild4"||v==="discardAll"||v==="shadow"||v==="snatch"||v==="draw2";
    let fc;while(true){let fi=deck.findIndex(c=>!badFirst(c.value));
      if(fi===-1){deck=sh(deck);fi=0;}fc=deck.splice(fi,1)[0];if(!badFirst(fc.value))break;deck.push(fc);deck=sh(deck);}
    let firstPlayer=po[0];let direction=1;let currentColor=fc.color;let m="Game started!";let drawPile=[...deck];
    if(fc.value==="skip"){firstPlayer=po[1%po.length];m="Game started! First player skipped!";}
    else if(fc.value==="reverse"){direction=-1;
      if(po.length===2)firstPlayer=po[0];else firstPlayer=po[po.length-1];m="Game started! Direction reversed!";}
    else if(fc.type==="wild"){currentColor=COLORS[Math.floor(Math.random()*4)];m="Game started! Color is "+currentColor.toUpperCase()+"!";}
    await update(ref(db,"rooms/"+rc),{status:"playing",game:{
      hands,drawPile,discardPile:[fc],currentPlayer:firstPlayer,direction,
      currentColor,winner:null,message:m,calledUno:{},turnTimestamp:Date.now(),pendingChallenge:null,drawStack:0,drawStackType:null}});
    setScr("game");goFS();goLand();};

  useEffect(()=>{if(autoStart&&isHost&&pls.length>=2&&scr==="lobby"){setAutoStart(false);startGame();}},[autoStart,isHost,pls.length,scr]);

  useEffect(()=>{if(rd?.status==="playing"&&scr==="lobby"&&!isHost){ua();startMusic();setScr("game");ps("gameOn");goFS();goLand();}},[rd?.status,scr,isHost,ps,startMusic]);
  useEffect(()=>{if(rd?.status==="waiting"&&scr==="game"){setScr("lobby");setSel(-1);setDrawnCard(null);setHasDrawn(false);setChallenge(null);setActFx(null);setWild4Fx(null);setChibiAttackFx(null);setDraw2Fx(null);setReverseFx(null);setSkipFx(null);setUnoCallFx(null);setUnoPenaltyFx(null);}},[rd?.status,scr]);

  const playC=useCallback(async(ci,cc)=>{if(!g||!myTurn)return;
    const card=myH[ci];ps("card");trigA();setSel(-1);setDrawnCard(null);
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
      setDiscardFx({color:matchColor,count:dCount+1});
      if(ndp2.length<1){const reshuf=sh(nd.slice(0,-1));ndp2=[...ndp2,...reshuf];}
      const drawnCard2=ndp2.splice(0,1);remainHand=[...remainHand,...drawnCard2];
      m+=" Drew 1.";
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
    if(nh[pid].length===0){winner=pid;
      if(!lbUpdated.current){lbUpdated.current=true;const baseScore=calcScore(nh,pid);
      const lbSnap=await get(ref(db,"leaderboard/"+pid));const prev=lbSnap.val()||{totalPoints:0,gamesPlayed:0,wins:0,name:mn};
      const wRank=getRank(prev.totalPoints,prev.gamesPlayed);
      let totalWin=0;
      for(const[oppId]of pls){if(oppId===pid)continue;
        const isOppBot=isBot(oppId);
        const op=isOppBot?{totalPoints:0,gamesPlayed:0,wins:0}:(await get(ref(db,"leaderboard/"+oppId))).val()||{totalPoints:0,gamesPlayed:0,wins:0};
        const oRank=getRank(op.totalPoints,op.gamesPlayed);
        const elo=calcElo(wRank.idx,oRank.idx,baseScore);totalWin+=elo.winPts;
        if(!isOppBot){const newPts=Math.max(0,(op.totalPoints||0)-elo.losePts);
        await update(ref(db,"leaderboard/"+oppId),{name:rd.players[oppId]?.name||"Player",
          gamesPlayed:(op.gamesPlayed||0)+1,totalPoints:newPts,wins:op.wins||0,losses:(op.losses||0)+1,lastPlayed:Date.now()});}}
      m=mn+" WINS! (+"+totalWin+" pts)";
      const curScores=rd.scores||{};curScores[pid]=(curScores[pid]||0)+totalWin;
      await update(ref(db,"rooms/"+rc),{scores:curScores});
      await update(ref(db,"leaderboard/"+pid),{name:mn,totalPoints:(prev.totalPoints||0)+totalWin,
        gamesPlayed:(prev.gamesPlayed||0)+1,wins:(prev.wins||0)+1,lastPlayed:Date.now()});
      }else{m=mn+" WINS!";}
    }
    const cu=g.calledUno||{};
    if(nh[pid].length===1&&!cu[pid]&&!winner){m+=" | Forgot UNO! +2 penalty!";
      if(ndp2.length<2){const rs=sh(nd.slice(0,-1));ndp2=[...ndp2,...rs];}
      nh[pid]=[...nh[pid],...ndp2.splice(0,2)];winner=null;}
    let nextPlayer=winner?pid:nxt;
    if((card.value==="draw2"||card.value==="wild4")&&!winner)nextPlayer=np(pid,nDir,false);
    if(snatchHold&&!winner)nextPlayer=pid;
    await wgs({hands:nh,discardPile:nd,drawPile:ndp2,direction:nDir,currentColor:nCol,
      currentPlayer:nextPlayer,winner,message:m,calledUno:{...cu,[pid]:(nh[pid].length===1&&cu[pid])?true:false},
      turnTimestamp:Date.now(),pendingChallenge:winner?null:pendingChallenge,
      drawStack:winner?0:newDrawStack,drawStackType:winner?null:newDrawStackType});
  },[g,myTurn,myH,pid,po,np,wgs,rd,ps,rc,trigBurst,trigImpact]);

  const respondChallenge=useCallback(async(doChallenge)=>{
    if(!g||!challenge)return;setChallenge(null);
    const pc=g.pendingChallenge;if(!pc)return;
    const nh={...g.hands};let ndp=[...(g.drawPile||[])];const nd=[...g.discardPile];let m="";
    const ensureCards=count=>{if(ndp.length<count){const reshuf=sh(nd.slice(0,-1));ndp=[...ndp,...reshuf];nd.splice(0,nd.length-1);}
      return ndp.splice(0,Math.min(count,ndp.length));};
    if(doChallenge){ps("challenge");trigShake();
      if(pc.hadMatchingColor){const dr=ensureCards(4);nh[pc.player]=[...(nh[pc.player]||[]),...dr];
        m=(rd.players[pid]?.name)+" challenged! "+(rd.players[pc.player]?.name)+" was GUILTY! Draws 4!";trigBurst("red");}
      else{const dr=ensureCards(6);nh[pid]=[...(nh[pid]||[]),...dr];
        m=(rd.players[pid]?.name)+" challenged! "+(rd.players[pc.player]?.name)+" was INNOCENT! "+(rd.players[pid]?.name)+" draws 6!";ps("penalty");trigBurst("blue");}
    }else{const dr=ensureCards(4);nh[pid]=[...(nh[pid]||[]),...dr];m=(rd.players[pid]?.name)+" accepts. Draws 4!";ps("draw4");}
    await wgs({hands:nh,drawPile:ndp,discardPile:nd,currentPlayer:np(pid,g.direction),
      message:m,pendingChallenge:null,turnTimestamp:Date.now()});
  },[g,challenge,pid,np,wgs,rd,ps,trigShake,trigBurst]);

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
      await wgs({hands:nh,drawPile:ndp,message:(rd.players[targetId]?.name)+" caught! UNO penalty +2!",
        calledUno:{...cu,[targetId]:true}});}
  },[g,ps,wgs,rd,trigShake,rc]);

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
    await wgs({calledUno:{...(g.calledUno||{}),[pid]:true},message:(rd.players[pid]?.name)+" called UNO!"});
    setLMsg("UNO!");setTimeout(()=>setLMsg(""),1200);}};
  const leave=async()=>{bgm.stop();setMus(false);if(isHost)await remove(ref(db,"rooms/"+rc));
    else await remove(ref(db,"rooms/"+rc+"/players/"+pid));setRc("");setRd(null);setScr("menu");};
  const restart=async()=>{if(!isHost)return;lbUpdated.current=false;setRoundTimer(settings.roundTime||ROUND_TIME);setTurnTimer(TURN_TIME);await update(ref(db,"rooms/"+rc),{status:"waiting",game:null});setScr("lobby");};
  const toggleMusic=()=>{ua();const on=bgm.toggle();setMus(on);};

  const shakeStyle=screenShake?{animation:"screenShake 0.4s ease-out"}:{};
  const gcHex=g?.currentColor?CH[g.currentColor]:"#FF6F00";

  /* ═══ MENU ═══ */
  const myRank=myStats?getRank(myStats.totalPoints,myStats.gamesPlayed):UNRANKED;
  const nextRank=myStats?getNextRank(myStats.totalPoints,myStats.gamesPlayed):getNextRank(0,0);
  const menuCards=useMemo(()=>COLORS.map((c,i)=>({color:c,angle:-15+i*10,x:-60+i*40,delay:i*0.15})),[]);

  if(scr==="menu")return(
    <div style={{height:"100%",background:"radial-gradient(ellipse at 50% 15%,#1a2826 0%,#121e1c 20%,#0c1614 40%,#080f0d 65%,#040807 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",padding:0,
      fontFamily:"'Segoe UI',system-ui,sans-serif",position:"relative",overflow:"hidden"}}
      onClick={()=>{ua();if(!bgm.playing)startMusic();}}>
      <CanvasBG screen="menu"/>

      {/* Floating decorative cards */}
      <div style={{position:"absolute",top:"8%",left:"50%",transform:"translateX(-50%)",zIndex:1,pointerEvents:"none"}}>
        {menuCards.map((c,i)=>(
          <div key={i} style={{position:"absolute",left:c.x,transform:`rotate(${c.angle}deg)`,opacity:0.15}}>
            <div style={{animation:`menuCardFloat 4s ease-in-out ${c.delay}s infinite`}}>
              <Card card={{id:i,color:c.color,value:["7","2","5","9"][i],type:"number"}} sz="sm" /></div></div>))}
      </div>

      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",
        width:"100%",maxWidth:400,padding:"0 16px",flex:1,justifyContent:"center",gap:0,overflow:"auto"}}>

        {/* Logo */}
        <div style={{position:"relative",marginBottom:6}}>
          <div style={{width:200,height:105,borderRadius:"50%",
            background:"linear-gradient(145deg,#E53935,#C62828,#B71C1C)",
            display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",
            boxShadow:"0 12px 60px rgba(229,57,53,0.5),0 0 100px rgba(229,57,53,0.15),inset 0 2px 10px rgba(255,255,255,0.2)",
            border:"3px solid #FFD700",animation:"menuLogo 3s ease-in-out infinite"}}>
            <span style={{fontSize:30,fontWeight:900,color:"#FFD700",fontFamily:"Arial Black",lineHeight:1,
              textShadow:"0 2px 10px rgba(0,0,0,0.8),0 0 30px rgba(255,215,0,0.5)"}}>UNONG</span>
            <span style={{fontSize:16,fontWeight:900,color:"#FFD700",fontFamily:"Arial Black",letterSpacing:7,
              textShadow:"0 2px 8px rgba(0,0,0,0.8),0 0 20px rgba(255,215,0,0.4)"}}>BITAW</span>
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
          {myRank.stars<5&&myRank.name!=="Unranked"&&<div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden",marginTop:2}}>
            <div style={{height:"100%",borderRadius:2,background:`linear-gradient(90deg,${myRank.color}88,${myRank.color})`,
              width:`${myRank.starProgress*100}%`,transition:"width 0.5s"}}/></div>}
          {nextRank&&<div style={{fontSize:7,color:"#667",textAlign:"center",marginTop:3}}>
            {nextRank.type==="games"?`${nextRank.need} more games to rank`:nextRank.type==="star"?`${nextRank.need} pts to ★${nextRank.nextStar}`:`${nextRank.need} pts to ${nextRank.name}`}</div>}
        </div>}

        {/* Main card */}
        <div style={{...GLASS,padding:"20px 20px 16px",width:"100%",marginBottom:8}}>
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
          <button onClick={()=>setShowGlobalLB(true)} style={{background:"rgba(255,215,0,0.06)",
            border:"1px solid rgba(255,215,0,0.15)",padding:"7px 18px",borderRadius:12,
            color:"#FFD700",fontSize:11,fontWeight:800,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:5,letterSpacing:2}}
            onPointerEnter={e=>{e.currentTarget.style.background="rgba(255,215,0,0.12)";e.currentTarget.style.transform="translateY(-1px)";}}
            onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,215,0,0.06)";e.currentTarget.style.transform="translateY(0)";}}>
            🏆 RANKINGS</button>
          <button onClick={()=>setShowAccount(true)} style={{background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.1)",padding:"7px 14px",borderRadius:12,
            color:"#aaa",fontSize:11,fontWeight:700,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:4,letterSpacing:1}}
            onPointerEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.transform="translateY(-1px)";}}
            onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.transform="translateY(0)";}}>
            👤 ACCOUNT</button>
          <button onClick={e=>{e.stopPropagation();toggleMusic();}} style={{background:"none",
            border:"1px solid rgba(255,255,255,0.1)",padding:"7px 16px",borderRadius:12,
            color:mus?"#FFD700":"#778",fontSize:11,cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:4}}
            onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.25)"}
            onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}>
            🎵 {mus?"ON":"OFF"}</button>
          {!showAdm?<button onClick={()=>setShowAdm(true)} style={{background:"none",border:"none",color:"#222",fontSize:8,cursor:"pointer",padding:4}}>{"•••"}</button>
          :<div style={{display:"flex",gap:4,alignItems:"center",animation:"fadeIn 0.3s"}}>
            <input value={admP} onChange={e=>setAdmP(e.target.value)} type="password" placeholder="Pass"
              style={{padding:"5px 8px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#fff",fontSize:9,outline:"none",width:70}}/>
            <button onClick={()=>{if(admP===ADMIN_PASS){setIsAdm(true);setErr("");ps("join");}else setErr("Wrong");}}
              style={{padding:"5px 10px",borderRadius:8,border:"none",background:isAdm?"#2E7D32":"#444",color:"#fff",fontSize:8,cursor:"pointer",fontWeight:700}}>
              {isAdm?"✓":"→"}</button>
            {isAdm&&<span style={{color:"#FFD700",fontSize:7,letterSpacing:1}}>ADMIN</span>}
          </div>}
        </div>
      </div>

      {/* Global Leaderboard Modal */}
      {showGlobalLB&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        backdropFilter:"blur(12px)",animation:"fadeIn 0.3s"}} onClick={()=>setShowGlobalLB(false)}>
        <div onClick={e=>e.stopPropagation()} style={{...GLASS,padding:0,width:"92%",maxWidth:400,maxHeight:"85vh",
          overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px 20px 10px",borderBottom:"1px solid rgba(255,215,0,0.08)"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#FFD700",textAlign:"center",letterSpacing:4}}>🏆 GLOBAL RANKINGS</div>
            <div style={{fontSize:9,color:"#667",textAlign:"center",marginTop:4,letterSpacing:2}}>Play 10 games to earn your rank</div>
          </div>
          <div style={{overflow:"auto",padding:"8px 12px",flex:1}}>
            {globalLB.length===0?<div style={{textAlign:"center",color:"#556",padding:30,fontSize:12}}>No players yet. Be the first!</div>
            :globalLB.slice(0,50).map((p,i)=>{
              const r=getRank(p.totalPoints,p.gamesPlayed);const isMe=p.id===pid;
              return(<div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 8px",
                borderRadius:12,marginBottom:3,
                background:isMe?"rgba(255,215,0,0.06)":i<3?"rgba(255,255,255,0.02)":"transparent",
                border:isMe?"1px solid rgba(255,215,0,0.12)":i===0?"1px solid rgba(255,215,0,0.08)":"1px solid transparent",
                animation:`slideIn 0.3s ease-out ${Math.min(i*0.04,0.8)}s both`}}>
                <div style={{width:20,textAlign:"center",fontSize:i<3?13:9,fontWeight:800,
                  color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#556"}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)}</div>
                <div style={{width:28,height:28,borderRadius:7,background:r.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,
                  border:`1px solid ${r.color}44`}}>{r.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:isMe?"#FFD700":"#ccc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {p.name}<span style={{fontSize:7,color:"#556",fontFamily:"monospace",marginLeft:3}}>{getTag(p.id)}</span>{isMe&&<span style={{fontSize:7,color:"#889"}}> (you)</span>}</div>
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
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

      {/* Account Modal */}
      {showAccount&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,
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

          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14}}>
            <div style={{fontSize:9,color:"#889",letterSpacing:2,marginBottom:4}}>RESTORE ACCOUNT</div>
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
            color:restoreMsg.includes("Restored")||restoreMsg.includes("Copied")?"#4CAF50":"#FF9800",
            background:restoreMsg.includes("Restored")||restoreMsg.includes("Copied")?"rgba(76,175,80,0.1)":"rgba(255,152,0,0.1)",
            border:`1px solid ${restoreMsg.includes("Restored")||restoreMsg.includes("Copied")?"rgba(76,175,80,0.2)":"rgba(255,152,0,0.2)"}`
          }}>{restoreMsg}</div>}

          <button onClick={()=>{setShowAccount(false);setRestoreMsg("");}} style={{width:"100%",marginTop:14,padding:"10px",
            borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",background:"none",
            color:"#889",fontSize:11,cursor:"pointer",letterSpacing:2,transition:"all 0.2s"}}
            onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.2)"}
            onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}>CLOSE</button>
        </div>
      </div>)}

      <style>{globalCSS}</style>
    </div>);

  /* ═══ LOBBY ═══ */
  if(scr==="lobby")return(
    <div style={{height:"100%",background:"radial-gradient(ellipse at 50% 25%,#1a2f2a 0%,#0f1f1c 35%,#0a1614 65%,#060e0c 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:14,
      fontFamily:"'Segoe UI',system-ui,sans-serif",position:"relative",overflow:"hidden"}}>
      <CanvasBG screen="lobby"/>
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",width:"100%"}}>
        <div style={{color:"rgba(255,215,0,0.4)",fontSize:10,letterSpacing:5,marginBottom:5}}>ROOM CODE</div>
        <div style={{fontSize:48,fontWeight:900,letterSpacing:16,color:"#FFD700",
          textShadow:"0 0 45px rgba(255,215,0,0.5),0 0 90px rgba(255,215,0,0.2)",marginBottom:20,fontFamily:"Arial Black",
          animation:"codeGlow 2s ease-in-out infinite"}}>{rc}</div>
        <div style={{...GLASS,padding:20,width:"100%",maxWidth:380,marginBottom:18}}>
          <div style={{color:"#889",fontSize:9,marginBottom:12,letterSpacing:3}}>PLAYERS ({pls.length}/10)</div>
          {pls.map(([id,pd],i)=>(
            <div key={id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
              background:id===pid?"rgba(255,215,0,0.06)":"transparent",borderRadius:12,marginBottom:4,
              transition:"all 0.3s",animation:`slideIn 0.4s ease-out ${i*0.08}s both`,
              border:id===pid?"1px solid rgba(255,215,0,0.1)":"1px solid transparent"}}>
              <div style={{width:34,height:34,borderRadius:10,background:CG[COLORS[i%4]],display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:14,fontWeight:800,color:COLORS[i%4]==="yellow"?"#333":"#fff",
                boxShadow:`0 3px 12px ${CH[COLORS[i%4]]}44`}}>{pd.name?.[0]?.toUpperCase()}</div>
              <div style={{flex:1,color:"#ddd",fontWeight:600,fontSize:14}}>{pd.name}{id===pid&&<span style={{color:"#778",fontSize:9}}> (you)</span>}{pd.isBot&&<span style={{color:"#4CAF50",fontSize:8,background:"rgba(76,175,80,0.1)",padding:"1px 6px",borderRadius:4,fontWeight:700,letterSpacing:1,marginLeft:4}}>BOT</span>}</div>
              <span style={{fontSize:11,color:"#778",fontWeight:600,fontFamily:"monospace"}}>{rd?.scores?.[id]||0}</span>
              {id===rd?.host&&<span style={{fontSize:8,color:"#FFD700",background:"rgba(255,215,0,0.1)",padding:"2px 8px",borderRadius:6,fontWeight:700,letterSpacing:1}}>HOST</span>}
              {isHost&&pd.isBot&&<button onClick={()=>removeBot(id)} style={{background:"none",border:"1px solid rgba(255,82,82,0.2)",
                color:"#FF5252",width:22,height:22,borderRadius:6,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                transition:"all 0.2s"}} onPointerEnter={e=>e.currentTarget.style.borderColor="rgba(255,82,82,0.5)"}
                onPointerLeave={e=>e.currentTarget.style.borderColor="rgba(255,82,82,0.2)"}>×</button>}
            </div>))}
          {isHost&&pls.length<(settings.maxPlayers||10)&&<button onClick={addBot} style={{width:"100%",padding:"8px 0",borderRadius:10,
            border:"1px dashed rgba(76,175,80,0.3)",background:"rgba(76,175,80,0.06)",color:"#4CAF50",
            fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:3,transition:"all 0.2s",marginTop:4}}
            onPointerEnter={e=>{e.currentTarget.style.borderColor="rgba(76,175,80,0.5)";e.currentTarget.style.background="rgba(76,175,80,0.12)";}}
            onPointerLeave={e=>{e.currentTarget.style.borderColor="rgba(76,175,80,0.3)";e.currentTarget.style.background="rgba(76,175,80,0.06)";}}>
            + ADD BOT</button>}
        </div>
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

        {isHost&&pls.length>=2&&<button onClick={startGame} style={{...bst,maxWidth:380,
          background:"linear-gradient(135deg,#2E7D32,#1B5E20)",fontSize:18,letterSpacing:6,
          boxShadow:"0 6px 30px rgba(46,125,50,0.5)",animation:"pulse 2s infinite"}}
          onPointerEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
          onPointerLeave={e=>e.currentTarget.style.transform="translateY(0)"}>START GAME</button>}
        {!isHost&&<div style={{color:"#889",fontSize:13,animation:"pulse 2s infinite",letterSpacing:2}}>Waiting for host...</div>}
        <button onClick={leave} style={{marginTop:14,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"#889",
          padding:"8px 24px",borderRadius:10,fontSize:11,cursor:"pointer",transition:"all 0.2s",letterSpacing:2}}
          onPointerEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.25)";e.currentTarget.style.color="#aaa";}}
          onPointerLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.color="#889";}}>{isHost?"Close":"Leave"}</button>
      </div>
      <style>{globalCSS}</style>
    </div>);

  /* ═══ GAME ═══ */
  if(!g)return<div style={{height:"100%",background:"#060e0c",display:"flex",alignItems:"center",justifyContent:"center",color:"#889"}}><style>{globalCSS}</style>Loading...</div>;
  const opps=po.filter(id=>id!==pid);
  const isLandscape=typeof window!=="undefined"&&window.innerWidth>window.innerHeight;
  const n=myH.length;const spread=Math.min(n*3,32);const st2=-spread/2;
  const cardSpacing=Math.min(isLandscape?42:55,(isLandscape?320:380)/Math.max(n,1));
  const clusterHalf=((n-1)/2)*cardSpacing+(isLandscape?35:44);
  const topOpps=opps.length<=2?opps:opps.filter((_,i)=>i>0&&i<opps.length-(opps.length>2?1:0));
  const leftOpp=opps.length>2?opps[0]:null;
  const rightOpp=opps.length>2?opps[opps.length-1]:null;

  const OppCard=({id,pos})=>{const pd=rd.players[id];const h=g.hands?.[id]||[];const turn=g.currentPlayer===id;
    const hasUno=h.length===1;const cu=g.calledUno||{};const canCatch=hasUno&&!cu[id];
    const isV=pos==="left"||pos==="right";
    return(<div key={id} style={{display:"flex",flexDirection:isV?"row":"column",alignItems:"center",
      background:turn?"rgba(0,0,0,0.45)":"rgba(0,0,0,0.25)",borderRadius:10,padding:isV?"5px 4px":"4px 7px",
      border:turn?`1px solid ${gcHex}55`:"1px solid rgba(255,215,0,0.04)",
      boxShadow:turn?`0 0 20px ${gcHex}22,0 0 40px ${gcHex}08`:"none",
      transition:"all 0.4s",cursor:canCatch?"pointer":"default",position:"relative",
      backdropFilter:"blur(6px)",animation:turn?"neonPulse 2s ease-in-out infinite":"none"}}
      onClick={canCatch?()=>catchUno(id):undefined}>
      <div style={{display:"flex",flexDirection:isV?"column":"row",alignItems:"center",gap:3,marginBottom:isV?0:2,marginRight:isV?3:0}}>
        <div style={{width:28,height:28,borderRadius:8,background:CG[COLORS[opps.indexOf(id)%4]],
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,
          color:COLORS[opps.indexOf(id)%4]==="yellow"?"#333":"#fff",
          boxShadow:`0 2px 8px ${CH[COLORS[opps.indexOf(id)%4]]}44`,flexShrink:0}}>
          {pd?.name?.[0]?.toUpperCase()}</div>
        <span style={{fontSize:9,color:turn?"#fff":"#999",fontWeight:700,whiteSpace:"nowrap",
          textShadow:turn?`0 0 8px ${gcHex}66`:"none"}}>{pd?.name}</span>
        <span style={{fontSize:9,background:"rgba(255,255,255,0.1)",borderRadius:5,padding:"1px 5px",
          color:turn?"#fff":"#888",fontWeight:800,fontFamily:"monospace"}}>{h.length}</span>
        {hasUno&&<span style={{fontSize:8,color:"#E53935",fontWeight:900,animation:"pulse 0.4s infinite"}}>UNO!</span>}
      </div>
      <div style={{display:"flex",flexDirection:isV?"column":"row"}}>
        {h.slice(0,isLandscape?6:h.length).map((c,ci)=><Card key={c.id} card={c} sz="xs" faceDown={!peek||!isAdm}
          style={isV?{marginTop:ci>0?-52:0}:{marginLeft:ci>0?(isLandscape?-32:-28):0}}/>)}
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
    <div style={{height:"100%",
      background:`radial-gradient(ellipse at 50% 40%,${gcHex}18 0%,#0f1f1c 25%,#0a1614 55%,#060e0c 100%)`,
      fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",
      transition:"background 1s ease",
      boxShadow:myTurn&&!g.winner?`inset 0 0 30px ${gcHex}30,inset 0 0 80px ${gcHex}10`:"none",
      borderTop:myTurn&&!g.winner?`3px solid ${gcHex}66`:"3px solid transparent",
      ...shakeStyle}} onClick={()=>{ua();if(mus&&!bgm.playing)bgm.start();}}>
      <CanvasBG screen="game" currentColor={g.currentColor}/>
      {lightningColor&&<LightningFX color={lightningColor} onDone={()=>setLightningColor(null)}/>}
      {impactColor&&<AnimeImpact color={impactColor} onDone={()=>setImpactColor(null)}/>}
      {burstColor&&<BurstFX color={burstColor} onDone={()=>setBurstColor(null)}/>}
      {pickCol&&<CWheel onPick={colPick} onCancel={colCancel}/>}
      {actFx&&<ActFX type={actFx} onDone={()=>setActFx(null)}/>}
      {wild4Fx&&<ElementalW4FX color={wild4Fx} onDone={()=>setWild4Fx(null)}/>}
      {chibiAttackFx&&<ChibiAttackFX element={chibiAttackFx.element} victimName={chibiAttackFx.victimName} onDone={()=>setChibiAttackFx(null)}/>}
      {cardFlyFx&&<CardFlyFX element={cardFlyFx.element} count={cardFlyFx.count} toSelf={cardFlyFx.toSelf} onDone={()=>setCardFlyFx(null)}/>}
      {draw2Fx&&<Draw2FX color={draw2Fx} onDone={()=>setDraw2Fx(null)}/>}
      {reverseFx&&<ReverseFX color={reverseFx} onDone={()=>setReverseFx(null)}/>}
      {skipFx&&<SkipFX color={skipFx} onDone={()=>setSkipFx(null)}/>}
      {unoCallFx&&<UnoCallFX color={unoCallFx} onDone={()=>setUnoCallFx(null)}/>}
      {unoPenaltyFx!==null&&<UnoPenaltyFX victimName={unoPenaltyFx} onDone={()=>setUnoPenaltyFx(null)}/>}
      {discardFx&&<DiscardAllFX color={discardFx.color} count={discardFx.count} onDone={()=>setDiscardFx(null)}/>}
      {timeoutFx!==null&&<div style={{position:"fixed",inset:0,zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",
        pointerEvents:"none",animation:"timeoutFade 2s ease-out forwards"}}>
        <div style={{fontSize:"min(66px, 13vw)",fontWeight:900,color:"#fff",fontFamily:"Arial Black",fontStyle:"italic",
          letterSpacing:4,transform:"skewX(-7deg)",WebkitTextStroke:"3px #C62828",
          textShadow:"4px 4px 0 rgba(0,0,0,0.6),0 0 26px rgba(255,82,82,0.85),0 0 55px rgba(255,82,82,0.4)",
          textAlign:"center"}}>TIMED OUT!</div></div>}
      {turnFx!==null&&timeoutFx===null&&<div style={{position:"fixed",inset:0,zIndex:55,display:"flex",alignItems:"center",justifyContent:"center",
        pointerEvents:"none",animation:"turnTextFade 1.8s ease-out forwards"}}>
        <div style={{fontSize:"min(54px, 11vw)",fontWeight:900,fontFamily:"Arial Black",fontStyle:"italic",
          color:"#fff",letterSpacing:3,transform:"skewX(-7deg)",WebkitTextStroke:`3px ${gcHex}`,
          textShadow:`4px 4px 0 rgba(0,0,0,0.55),0 0 26px ${gcHex},0 0 55px ${gcHex}66`,
          textAlign:"center",textTransform:"uppercase"}}>{turnFx}</div></div>}
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

      {g.winner&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:150,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize:70,marginBottom:14,animation:"wB 0.6s cubic-bezier(.34,1.56,.64,1)"}}>{g.winner===pid?"🎉":"🏆"}</div>
        <div style={{fontSize:30,fontWeight:900,color:"#FFD700",marginBottom:10,
          textShadow:"0 0 45px rgba(255,215,0,0.5),0 0 90px rgba(255,215,0,0.2)",
          animation:"codeGlow 2s ease-in-out infinite",letterSpacing:3}}>{rd.players[g.winner]?.name} wins!</div>
        <div style={{fontSize:16,color:"#aaa",marginBottom:6}}>+{calcScore(g.hands,g.winner)} points</div>
        <div style={{fontSize:20,color:"#FFD700",marginBottom:20,fontWeight:700}}>Total: {rd?.scores?.[g.winner]||0}</div>
        <div style={{fontSize:11,color:"#889",marginBottom:18,letterSpacing:2}}>First to 500 wins the match!</div>
        {isHost?(<>
          <button onClick={restart} style={{...bst,maxWidth:260,background:"linear-gradient(135deg,#E53935,#C62828)",
            boxShadow:"0 4px 25px rgba(229,57,53,0.5)"}}
            onPointerEnter={e=>e.currentTarget.style.transform="scale(1.03)"}
            onPointerLeave={e=>e.currentTarget.style.transform="scale(1)"}>NEXT ROUND</button>
          <button onClick={leave} style={{marginTop:12,background:"none",border:"none",color:"#889",fontSize:12,cursor:"pointer"}}>Close</button>
        </>):<div style={{color:"#889",fontSize:12}}>Waiting for host...</div>}
      </div>)}

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
          <div style={{textAlign:"center",marginTop:12,color:"#889",fontSize:9,letterSpacing:2}}>FIRST TO 500 WINS</div>
        </div>
      </div>)}

      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 12px",flexShrink:0,
        background:"linear-gradient(180deg,rgba(0,0,0,0.5),transparent)",zIndex:20}}>
        <button onClick={leave} style={{background:"none",border:"none",color:"#889",fontSize:16,cursor:"pointer",transition:"color 0.2s",padding:"2px 6px"}}
          onPointerEnter={e=>e.currentTarget.style.color="#fff"} onPointerLeave={e=>e.currentTarget.style.color="#889"}>{"←"}</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:900,color:"#FFD700",fontFamily:"Arial Black",
            textShadow:"0 0 15px rgba(255,215,0,0.3)"}}>UNO</span>
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
          <button onClick={()=>setSnd(!snd)} style={{background:"none",border:"none",fontSize:14,cursor:"pointer",opacity:snd?0.8:0.25,padding:2}}>
            {snd?"🔊":"🔇"}</button>
          <button onClick={e=>{e.stopPropagation();toggleMusic();}} style={{background:"none",border:"none",fontSize:14,cursor:"pointer",opacity:mus?0.8:0.25,padding:2}}>{"🎵"}</button>
          <button onClick={()=>{goFS();goLand();}} style={{background:"none",border:"none",fontSize:14,cursor:"pointer",padding:2,opacity:0.3}}>{"⛶"}</button>
        </div>
      </div>



      {/* Main game area — 3-column layout: left opp | center (top opps + table + hand) | right opp */}
      <div style={{flex:1,display:"flex",minHeight:0,zIndex:10,position:"relative"}}>

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
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:"min(30px, 6vw)",color:`${gcHex}10`,animation:g.direction===1?"sCW 5s linear infinite":"sCCW 5s linear infinite"}}>{g.direction===1?"⟳":"⟲"}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"min(16px, 3vw)",zIndex:3}}>
              <div onClick={(pickDr&&isAdm)||(myTurn&&!g.winner&&!drawnCard&&!challenge)?doDraw:undefined}
                style={{cursor:(pickDr&&isAdm)||(myTurn&&!drawnCard&&!challenge)?"pointer":"default",transition:"transform 0.3s",position:"relative",
                  animation:drawStack>0&&myTurn?"dangerPulse 0.8s infinite":(myTurn&&!drawnCard&&!challenge?"deckIdle 3s ease-in-out infinite":"none"),
                  border:drawStack>0&&myTurn?"2px solid #FF5252":"2px solid transparent",borderRadius:12,
                  boxShadow:drawStack>0&&myTurn?"0 0 20px rgba(255,82,82,0.4)":"none"}}
                onPointerEnter={e=>{if(myTurn&&!drawnCard&&!challenge)e.currentTarget.style.transform="scale(1.1) rotate(-3deg)";}}
                onPointerLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
                <Card card={{color:"wild",value:"wild",type:"wild"}} sz={isLandscape?"sm":"md"} faceDown/>
                {drawStack>0&&myTurn&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",
                  fontSize:11,fontWeight:900,color:"#fff",background:"#E53935",borderRadius:8,padding:"2px 8px",
                  boxShadow:"0 0 10px rgba(229,57,53,0.5)",zIndex:4}}>+{drawStack}</div>}
              </div>
              <div style={{position:"relative"}}>{topC&&<Card card={topC} sz={isLandscape?"sm":"md"} animate={cAn}/>}
                <div style={{position:"absolute",top:-8,right:-8,width:isLandscape?16:22,height:isLandscape?16:22,borderRadius:"50%",
                  background:CG[g.currentColor],border:"2px solid rgba(255,255,255,0.7)",
                  boxShadow:`0 0 18px ${gcHex}aa,0 0 35px ${gcHex}44`,transition:"all 0.5s"}}/>
                {!g.winner&&<div style={{position:"absolute",left:"calc(100% + 14px)",top:"50%",transform:"translateY(-50%)",
                  width:36,height:36,pointerEvents:"none",zIndex:15}}>
                  <svg width="36" height="36" viewBox="0 0 36 36" style={{transform:"rotate(-90deg)"}}>
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="3"/>
                    <circle cx="18" cy="18" r="15" fill="none"
                      stroke={turnTimer<=5?"#FF5252":gcHex}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${(turnTimer/(settings.turnTime||15))*94.2} 94.2`}
                      style={{transition:"stroke-dasharray 1s linear,stroke 0.5s"}}/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:900,fontFamily:"monospace",
                    color:turnTimer<=5?"#FF5252":gcHex,
                    animation:turnTimer<=5?"dangerPulse 0.5s infinite":"none"}}>{turnTimer}</div>
                </div>}
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
            <span style={{position:"absolute",left:`calc(50% - ${clusterHalf}px - 16px)`,bottom:10,fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:1,
              writingMode:"vertical-rl",textOrientation:"mixed",
              textShadow:"0 1px 4px rgba(0,0,0,0.8)",whiteSpace:"nowrap",zIndex:7,transition:"left 0.3s ease"}}>{pName||"You"}</span>
            <div className="uno-hand-area" style={{position:"relative",height:isLandscape?"min(100px, 24vh)":"min(120px, 22vh)",display:"flex",justifyContent:"center"}}>
              {myH.map((card,i)=>{
                const angle=n<=1?0:st2+(i/Math.max(n-1,1))*spread;
                const liftY=Math.abs(angle)*0.4;const isSel=sel===i;
                const playable=myTurn&&!drawnCard&&!challenge&&topC&&(
                  drawStack>0?(drawStackType==="wild4"?card.value==="wild4":(card.value==="draw2"||card.value==="wild4")):canPlay(card,topC,g.currentColor));
                const cardSz=isLandscape?"md":"lg";
                const spacing=Math.min(isLandscape?42:55,(isLandscape?320:380)/Math.max(n,1));const xOff=(i-(n-1)/2)*spacing;
                return(<div key={card.id} onClick={()=>{if((myTurn&&!drawnCard&&!challenge)||(swap&&isAdm)){if(isSel)cardClick(i);else setSel(i);}}}
                  style={{position:"absolute",bottom:isSel?(isLandscape?25:35):playable?(6+liftY):(2+liftY),left:`calc(50% + ${xOff}px - ${isLandscape?35:44}px)`,
                    transform:`rotate(${angle}deg)${isSel?" scale(1.08)":""}`,
                    transition:"left 0.28s cubic-bezier(.34,1.56,.64,1),bottom 0.28s ease,transform 0.28s ease",zIndex:isSel?50:i,
                    animation:`cardDeal 0.5s cubic-bezier(.22,1,.36,1) ${i*0.04}s both`,
                    filter:isSel?"brightness(1.2)":playable?"brightness(1.06)":"none",
                    cursor:(myTurn&&!drawnCard&&!challenge)||(swap&&isAdm)?"pointer":"default"}}>
                  <Card card={card} sz={cardSz} highlighted={playable&&!isSel} lifted={isSel}/>
                </div>);})}
            </div>
            {!g.winner&&!(g.calledUno||{})[pid]&&(
              <div onClick={callUno} style={{position:"absolute",left:`calc(50% + ${clusterHalf}px + 6px)`,bottom:10,width:48,height:48,borderRadius:"50%",cursor:"pointer",zIndex:8,
                background:`radial-gradient(circle at 38% 32%,rgba(255,255,255,0.15),${gcHex}18 40%,rgba(0,0,0,0.9) 75%)`,
                border:`3px solid ${gcHex}`,
                boxShadow:`0 0 22px ${gcHex}66,0 0 45px ${gcHex}28,inset 0 -5px 12px rgba(0,0,0,0.6),inset 0 3px 8px rgba(255,255,255,0.1)`,
                animation:"uP 0.8s infinite",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                transition:"left 0.3s ease,border-color 0.5s,box-shadow 0.5s"}}
                onPointerEnter={e=>{e.currentTarget.style.transform="scale(1.15)";}}
                onPointerLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
                <span style={{fontSize:8,fontWeight:900,color:"#FFD600",letterSpacing:1,lineHeight:1,
                  textShadow:`0 0 8px rgba(255,214,0,0.6)`}}>UNO</span>
                <span style={{fontSize:16,fontWeight:900,color:"#fff",lineHeight:1,
                  textShadow:`0 0 14px ${gcHex},0 1px 4px rgba(0,0,0,0.9)`}}>!</span>
              </div>)}
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
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  @keyframes uP{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  @keyframes cFly{0%{transform:scale(0.3) translateY(80px) rotate(-15deg);opacity:0;filter:blur(3px)}
    25%{transform:scale(1.06) translateY(-6px) rotate(2deg);opacity:1;filter:blur(0)}
    45%{transform:scale(0.98) translateY(2px) rotate(-0.5deg)}
    65%{transform:scale(1.01) translateY(-1px)}100%{transform:scale(1) translateY(0) rotate(0);opacity:1;filter:blur(0)}}
  @keyframes wB{0%{transform:scale(0)}40%{transform:scale(1.2)}70%{transform:scale(0.95)}100%{transform:scale(1)}}
  @keyframes cardDeal{0%{transform:translateY(-40px) scale(0.6) rotateY(90deg);opacity:0}
    40%{transform:translateY(5px) scale(1.05) rotateY(-10deg);opacity:1}
    70%{transform:translateY(-2px) scale(0.98) rotateY(3deg)}100%{transform:translateY(0) scale(1) rotateY(0)}}
  @keyframes cardDrawPull{0%{transform:translateX(-30px) scale(0.7) rotate(-8deg);opacity:0}
    50%{transform:translateX(5px) scale(1.06) rotate(2deg);opacity:1}100%{transform:translateX(0) scale(1) rotate(0)}}
  @keyframes cardHover3D{0%,100%{transform:perspective(400px) rotateY(0deg) rotateX(0deg)}
    25%{transform:perspective(400px) rotateY(2deg) rotateX(-1deg)}
    75%{transform:perspective(400px) rotateY(-2deg) rotateX(1deg)}}
  @keyframes deckIdle{0%,100%{transform:scale(1) rotate(0deg);box-shadow:0 3px 15px rgba(0,0,0,0.5)}
    50%{transform:scale(1.02) rotate(0.5deg);box-shadow:0 6px 25px rgba(0,0,0,0.6)}}
  @keyframes tableGlow{0%,100%{box-shadow:0 0 40px rgba(255,215,0,0.02) inset}50%{box-shadow:0 0 60px rgba(255,215,0,0.05) inset}}
  @keyframes sCW{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @keyframes sCCW{from{transform:rotate(360deg)}to{transform:rotate(0)}}
  @keyframes af{0%{opacity:1}50%{opacity:1}70%{opacity:0.7}85%{opacity:0.3;transform:scale(1.02)}100%{opacity:0;transform:scale(1.05)}}
  @keyframes apop{0%{transform:scale(0) rotate(-15deg)}40%{transform:scale(1.3) rotate(5deg)}70%{transform:scale(0.9)}100%{transform:scale(1) rotate(0)}}
  @keyframes aslide{0%{transform:translateY(20px) scale(0.8);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
  @keyframes fadeIn{0%{opacity:0;transform:translateY(8px) scale(0.98)}40%{opacity:0.8}100%{opacity:1;transform:translateY(0) scale(1)}}
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
  @keyframes charZoom{0%{transform:scale(1.14)}100%{transform:scale(1)}}
  @keyframes skillErupt{0%{opacity:0;transform:translateX(-50%) scaleY(0.35)}35%{opacity:1}100%{opacity:0.92;transform:translateX(-50%) scaleY(1)}}
  @keyframes emberRise{0%{opacity:0;transform:translate(0,0) scale(1)}15%{opacity:1}100%{opacity:0;transform:translate(var(--ex),-330px) scale(0.2)}}
  @keyframes sparkFlash{0%{opacity:0}12%{opacity:1}24%{opacity:0}44%{opacity:0.9}58%{opacity:0}100%{opacity:0}}
  @keyframes strobeFlash{0%{opacity:0}8%{opacity:0.85}16%{opacity:0}28%{opacity:0.6}36%{opacity:0}52%{opacity:0.75}60%{opacity:0}100%{opacity:0}}
  @keyframes chargePulse{0%{opacity:0;transform:scale(0.3)}40%{opacity:1}100%{opacity:0.85;transform:scale(1.05)}}
  @keyframes convergeIn{0%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(0.4)}35%{opacity:1}100%{opacity:0.9;transform:translate(0,0) scale(1)}}
  @keyframes boltFlash{0%{opacity:0}9%{opacity:1}22%{opacity:0}40%{opacity:0.95}54%{opacity:0}72%{opacity:0.8}84%{opacity:0}100%{opacity:0}}
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
  @keyframes screenShake{0%{transform:translate(0,0)}10%{transform:translate(-4px,2px)}20%{transform:translate(4px,-3px)}35%{transform:translate(-3px,3px)}50%{transform:translate(3px,-1px)}65%{transform:translate(-2px,1px)}80%{transform:translate(1px,-1px)}100%{transform:translate(0,0)}}
  @keyframes timeoutFade{0%{opacity:0;transform:scale(0.8)}15%{opacity:1;transform:scale(1.05)}30%{transform:scale(1)}70%{opacity:0.8}100%{opacity:0;transform:scale(1.1)}}
  @keyframes turnTextFade{0%{opacity:0;transform:scale(0.7)}12%{opacity:1;transform:scale(1.06)}25%{transform:scale(1)}65%{opacity:0.7}100%{opacity:0;transform:scale(1.08)}}
  @keyframes discardPull{0%{opacity:1}30%{transform:translate(0,0) rotate(0deg) scale(1.1);opacity:1}
    70%{transform:translate(0,-20px) rotate(360deg) scale(0.6);opacity:0.8}
    100%{transform:translate(0,-40px) rotate(720deg) scale(0);opacity:0}}
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
