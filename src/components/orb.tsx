"use client";
import { useEffect, useRef, useState } from "react";
import { Core } from "./core";

export type OrbState = "idle" | "thinking" | "listening";

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

// A plasma sphere: domain-warped 3D noise inside, fresnel rim, soft halo outside.
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uLevel;
uniform float uWarm;

vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.,a=.55;for(int i=0;i<3;i++){f+=a*snoise(p);p*=1.9;a*=.42;}return f;}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/(.5*min(uRes.x,uRes.y));
  float r=length(uv);
  float t=uTime*(.18+.55*uEnergy);
  float R=.64+.025*sin(uTime*1.3)+.07*uLevel;

  vec3 cArc=vec3(.25,.85,1.);
  vec3 cPlasma=vec3(.55,.42,1.);
  vec3 cPink=vec3(1.,.37,.78);
  vec3 cSolar=vec3(1.,.66,.36);
  vec3 cDeep=vec3(.04,.05,.18);

  vec3 col=vec3(0.);float a=0.;
  if(r<R+.004){
    float z=sqrt(max(R*R-r*r,0.));
    vec3 n=vec3(uv,z)/R;
    vec3 p=n*(.75+.3*uEnergy)+vec3(0.,0.,t);
    vec3 q=vec3(fbm(p+vec3(0.,t*.6,0.)),fbm(p+vec3(5.2,1.3,t*.4)),fbm(p+vec3(1.7,9.2,-t*.3)));
    float f=fbm(p+1.4*q);
    col=mix(cDeep*2.2,cPlasma,smoothstep(-.7,.45,f));
    col=mix(col,cArc,.85*smoothstep(-.1,.8,q.x+.3*f));
    col=mix(col,cPink,.45*smoothstep(.2,.9,q.y)*(1.-uWarm*.4));
    col+=cSolar*smoothstep(.05,.6,f*q.z+.15*q.z)*(.45+uWarm*.9);
    // brighter core when working / listening
    col+=vec3(.8,.9,1.)*pow(max(n.z,0.),5.)*(.22+.45*uEnergy+.6*uLevel);
    float fres=pow(1.-n.z,2.2);
    col+=mix(cArc,cPlasma,uv.y*.5+.5)*fres*1.15;
    col+=pow(max(dot(n,normalize(vec3(-.45,.55,.75))),0.),28.)*.55;
    a=smoothstep(R+.004,R-.006,r);
  }
  // halo
  float d=max(r-R,0.);
  float halo=exp(-d*(7.5-3.*uEnergy-2.*uLevel))*(.38+.4*uEnergy+.5*uLevel);
  float ang=atan(uv.y,uv.x);
  vec3 hc=mix(cArc,cPlasma,.5+.5*sin(ang*2.+uTime*.7));
  hc=mix(hc,cSolar,uWarm*.35*(.5+.5*sin(ang*3.-uTime)));
  float ha=halo*(1.-a)*smoothstep(1.,.62,r);
  col=col*a+hc*ha;
  a=a+ha;
  gl_FragColor=vec4(col,clamp(a,0.,1.));
}`;

const TARGET: Record<OrbState, number> = { idle: 0.25, thinking: 1, listening: 0.65 };

/**
 * JARVIS's presence — a living plasma sphere rendered with WebGL.
 * Energy follows the state (calm → busy), `level` follows the microphone.
 * Falls back to the CSS core when WebGL isn't available.
 */
export function Orb({ size = 260, state = "idle", level = 0, className }: { size?: number; state?: OrbState; level?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level });
  live.current = { state, level };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) {
      setFailed(true);
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setFailed(true);
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const u = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      energy: gl.getUniformLocation(prog, "uEnergy"),
      level: gl.getUniformLocation(prog, "uLevel"),
      warm: gl.getUniformLocation(prog, "uWarm"),
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      gl.viewport(0, 0, el.width, el.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let energy = TARGET[live.current.state];
    let lvl = 0;
    let warm = 0;
    let raf = 0;
    let visible = true;
    const start = performance.now();
    const frame = (now: number) => {
      const { state: st, level: lv } = live.current;
      energy += (TARGET[st] - energy) * 0.05;
      lvl += (lv - lvl) * 0.25;
      warm += ((st === "listening" ? 1 : 0) - warm) * 0.05;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.res, el.width, el.height);
      gl.uniform1f(u.time, reduced ? 4 : (now - start) / 1000);
      gl.uniform1f(u.energy, energy);
      gl.uniform1f(u.level, lvl);
      gl.uniform1f(u.warm, warm);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (visible && !reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && document.visibilityState === "visible";
      if (visible && !was) raf = requestAnimationFrame(frame);
    });
    io.observe(el);
    const onVis = () => {
      const was = visible;
      visible = document.visibilityState === "visible";
      if (visible && !was) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  if (failed) return <Core size={size * 0.62} state={state === "idle" ? "idle" : "thinking"} className={className} />;
  return (
    <canvas
      ref={canvas}
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={state === "thinking" ? "JARVIS חושב" : state === "listening" ? "JARVIS מקשיב" : "JARVIS"}
    />
  );
}
