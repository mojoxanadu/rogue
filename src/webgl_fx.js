  // Lightweight WebGL-backed effects manager.
  // If WebGL cannot initialize, methods return false and callers keep their old paths.
  window.WebGLFX = (function() {
    const TAU = Math.PI * 2;
    const state = {
      started: false,
      active: false,
      hooksInstalled: false,
      glCanvas: null,
      gl: null,
      program: null,
      buffer: null,
      uniforms: null,
      orbs: {
        hp: { pulse: 0, impacts: [] },
        mp: { pulse: 0, impacts: [] }
      }
    };

    const vsSource = [
      'attribute vec2 a_pos;',
      'varying vec2 v_uv;',
      'void main() {',
      '  v_uv = a_pos * 0.5 + 0.5;',
      '  gl_Position = vec4(a_pos, 0.0, 1.0);',
      '}'
    ].join('\n');

    const fsSource = [
      'precision mediump float;',
      'varying vec2 v_uv;',
      'uniform float u_time;',
      'uniform float u_mode;',
      'uniform float u_energy;',
      'uniform vec3 u_tint;',
      'uniform vec2 u_seed;',
      'float hash(vec2 p) {',
      '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
      '}',
      'float noise(vec2 p) {',
      '  vec2 i = floor(p);',
      '  vec2 f = fract(p);',
      '  f = f * f * (3.0 - 2.0 * f);',
      '  return mix(',
      '    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
      '    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),',
      '    f.y',
      '  );',
      '}',
      'float fbm(vec2 p) {',
      '  float value = 0.0;',
      '  float amp = 0.5;',
      '  for(int i = 0; i < 4; i++) {',
      '    value += noise(p) * amp;',
      '    p = p * 2.03 + vec2(17.0, 9.0);',
      '    amp *= 0.5;',
      '  }',
      '  return value;',
      '}',
      'void main() {',
      '  vec2 uv = v_uv;',
      '  vec2 p = (uv - 0.5) * 2.0;',
      '  float r = length(p);',
      '  float t = u_time;',
      '  vec3 color = u_tint;',
      '  float alpha = 0.0;',
      '  if(u_mode < 0.5) {',
      '    float swirl = fbm(p * 2.6 + u_seed * 4.0 + vec2(t * 0.35, -t * 0.22));',
      '    float ring = sin((r * 16.0 - t * 5.0) + swirl * 5.0);',
      '    alpha = smoothstep(1.05, 0.18, r) * (0.22 + swirl * 0.38 + ring * 0.12 + u_energy * 0.12);',
      '    color = mix(color * 0.55, vec3(1.0), 0.18 + swirl * 0.24);',
      '  } else if(u_mode < 1.5) {',
      '    vec2 fp = vec2(p.x * 1.2, p.y * 1.6 + 0.4);',
      '    float flame = fbm(fp * 2.2 + vec2(0.0, -t * 1.2) + u_seed * 7.0);',
      '    float core = smoothstep(1.05, 0.05, length(fp));',
      '    alpha = core * (0.3 + flame * 0.7) * (0.9 + u_energy * 0.2);',
      '    color = mix(vec3(0.92, 0.14, 0.03), vec3(1.0, 0.88, 0.25), flame * 0.8 + core * 0.2);',
      '  } else if(u_mode < 2.5) {',
      '    float aura = abs(0.62 - r);',
      '    float haze = fbm(p * 3.2 + u_seed * 5.0 + vec2(t * 0.28, -t * 0.55));',
      '    alpha = smoothstep(0.3, 0.0, aura + haze * 0.09) * (0.45 + u_energy * 0.18);',
      '    color = mix(vec3(0.95, 0.2, 0.05), vec3(1.0, 0.8, 0.3), haze);',
      '  } else {',
      '    float beam = 1.0 - abs(p.y + sin(p.x * 9.0 + t * 8.0 + u_seed.x * 4.0) * 0.14);',
      '    float sparks = fbm(p * 5.0 + vec2(t * 0.9, t * 0.35) + u_seed * 3.0);',
      '    alpha = smoothstep(0.0, 1.0, beam) * (0.15 + sparks * 0.95);',
      '    color = mix(vec3(0.2, 0.7, 1.0), vec3(1.0), beam * 0.65);',
      '  }',
      '  /* Mode 4: Icebolt — crystalline blue frost */',
      '  if(u_mode >= 3.5) {',
      '    float crystals = fbm(p * 5.5 + vec2(t * 0.15, t * 0.08) + u_seed * 6.0);',
      '    float shard = max(0.0, 1.0 - abs(p.x * 2.5 + sin(p.y * 12.0 + t * 2.0) * 0.18));',
      '    float coldCore = smoothstep(1.05, 0.0, r);',
      '    alpha = coldCore * (0.4 + crystals * 0.5 + shard * 0.3) * (0.85 + u_energy * 0.2);',
      '    color = mix(vec3(0.55, 0.85, 1.0), vec3(0.9, 0.97, 1.0), crystals * 0.7 + shard * 0.3);',
      '  }',
      '  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));',
      '}'
    ].join('\n');

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function nowMs() {
      return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function hash2(x, y) {
      let n = (x * 374761393 + y * 668265263) >>> 0;
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    function hexToRgb01(hex) {
      if(!hex || hex[0] !== '#') return [1, 1, 1];
      let raw = hex.length === 4
        ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
        : hex;
      let value = parseInt(raw.slice(1), 16);
      if(Number.isNaN(value)) return [1, 1, 1];
      return [
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255
      ];
    }

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
      }
      return shader;
    }

    function initGL() {
      if(state.active) return true;
      state.started = true;
      try {
        const glCanvas = document.createElement('canvas');
        glCanvas.width = 128;
        glCanvas.height = 128;
        const gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true }) ||
          glCanvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
        if(!gl) return false;

        const program = gl.createProgram();
        gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
        gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(program);
        if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
        }

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 1, -1, -1, 1,
          -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);

        state.glCanvas = glCanvas;
        state.gl = gl;
        state.program = program;
        state.buffer = buffer;
        state.uniforms = {
          time: gl.getUniformLocation(program, 'u_time'),
          mode: gl.getUniformLocation(program, 'u_mode'),
          energy: gl.getUniformLocation(program, 'u_energy'),
          tint: gl.getUniformLocation(program, 'u_tint'),
          seed: gl.getUniformLocation(program, 'u_seed')
        };
        state.active = true;
        return true;
      } catch(err) {
        const errMsg = err && err.message ? err.message : String(err);
        console.warn('WebGLFX disabled:', errMsg);
        if(typeof window.debugLog === 'function') window.debugLog('[webgl] WebGLFX init failed: ' + errMsg);
        state.active = false;
        // Allow later retries (some browsers may fail early during boot and
        // succeed after user interaction / context availability settles).
        state.started = false;
        return false;
      }
    }

    function ensureStarted() {
      installOrbHooks();
      return initGL();
    }

    function renderTexture(mode, energy, tint, seedX, seedY, width, height) {
      if(!ensureStarted()) return null;
      const gl = state.gl;
      const glCanvas = state.glCanvas;
      const w = Math.max(16, Math.round(width || 128));
      const h = Math.max(16, Math.round(height || 128));
      if(glCanvas.width !== w || glCanvas.height !== h) {
        glCanvas.width = w;
        glCanvas.height = h;
      }

      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.useProgram(state.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
      const aPos = gl.getAttribLocation(state.program, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(state.uniforms.time, nowMs() * 0.001);
      gl.uniform1f(state.uniforms.mode, mode);
      gl.uniform1f(state.uniforms.energy, energy);
      gl.uniform3f(state.uniforms.tint, tint[0], tint[1], tint[2]);
      gl.uniform2f(state.uniforms.seed, seedX, seedY);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return glCanvas;
    }

    function installOrbHooks() {
      if(state.hooksInstalled) return;
      ['hp', 'mp'].forEach(kind => {
        const orb = document.getElementById(kind + '-orb');
        if(!orb) return;
        const handle = (ev) => {
          const source = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
          const rect = orb.getBoundingClientRect();
          const localX = rect.width > 0 ? (source.clientX - rect.left) / rect.width : 0.5;
          energizeOrb(kind, 1.1, localX);
        };
        if(window.PointerEvent) {
          orb.addEventListener('pointerdown', handle);
        } else {
          orb.addEventListener('mousedown', handle);
          orb.addEventListener('touchstart', handle, { passive: true });
        }
      });
      state.hooksInstalled = true;
    }

    function energizeOrb(kind, amount, centerX) {
      if(!ensureStarted()) return false;
      const orb = state.orbs[kind] || state.orbs.hp;
      orb.pulse = clamp(orb.pulse + amount, 0, 4.5);
      // Also energise NS fluid orb
      if(state.nsOrbs && state.nsOrbs.orbs[kind]) {
        state.nsOrbs.orbs[kind].energy = Math.min(1.0, (state.nsOrbs.orbs[kind].energy||0) + amount * 0.4);
      }
      orb.impacts.unshift({
        x: clamp(centerX == null ? 0.5 : centerX, 0.08, 0.92),
        amp: Math.max(1.3, amount * 5.5),
        born: nowMs(),
        phase: Math.random() * TAU
      });
      orb.impacts = orb.impacts.slice(0, 6);
      return true;
    }

    function _hsvToRgb(h, s, v) {
      const i = Math.floor(h*6), f = h*6-i;
      const p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
      switch(i%6){
        case 0:return[v,t,p]; case 1:return[q,v,p]; case 2:return[p,v,t];
        case 3:return[p,q,v]; case 4:return[t,p,v]; default:return[v,p,q];
      }
    }

    function _nsOrbSplat(orb, cx, cy, vx, vy, col) {
      if(!state.nsOrbs) return;
      const gl = state.nsOrbs.gl, p = state.nsOrbs.progs.splat, SIM = state.nsOrbs.SIM;
      gl.useProgram(p);
      const loc = gl.getAttribLocation(p, 'a_pos');
      gl.bindBuffer(gl.ARRAY_BUFFER, state.nsOrbs.qbuf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      function splatFBO(srcTex, dstFBO, color, radius) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.uniform1i(gl.getUniformLocation(p,'u_base'), 0);
        gl.uniform2f(gl.getUniformLocation(p,'u_pt'), cx, cy);
        gl.uniform3fv(gl.getUniformLocation(p,'u_col'), color);
        gl.uniform1f(gl.getUniformLocation(p,'u_r'), radius);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO);
        gl.viewport(0,0,SIM,SIM);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }
      // Velocity splat — full motion, no 0.001 scaling (matches demo behavior)
      splatFBO(orb.vel.r.tex, orb.vel.w.fbo, [vx, vy, 0], 0.0025);
      orb.vel.swap();
      // Dye splat
      splatFBO(orb.dye.r.tex, orb.dye.w.fbo, col, 0.003);
      orb.dye.swap();
    }

    function _nsVelSplat(orb, cx, cy, vx, vy, r) {
      if(!state.nsOrbs) return;
      const gl = state.nsOrbs.gl, p = state.nsOrbs.progs.splat, SIM = state.nsOrbs.SIM;
      gl.useProgram(p);
      const loc = gl.getAttribLocation(p, 'a_pos');
      gl.bindBuffer(gl.ARRAY_BUFFER, state.nsOrbs.qbuf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, orb.vel.r.tex);
      gl.uniform1i(gl.getUniformLocation(p,'u_base'), 0);
      gl.uniform2f(gl.getUniformLocation(p,'u_pt'), cx, cy);
      gl.uniform3f(gl.getUniformLocation(p,'u_col'), vx, vy, 0);
      gl.uniform1f(gl.getUniformLocation(p,'u_r'), r);
      gl.bindFramebuffer(gl.FRAMEBUFFER, orb.vel.w.fbo);
      gl.viewport(0,0,SIM,SIM);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      orb.vel.swap();
    }

    function drawOrb(canvasId, fillPct, color, phase, kind) {
      // ── Lazy-init WebGL2 NS fluid system (try once, then remember the result) ──
      if (state.nsOrbs === undefined) {
        try {
          const SIM = 128;
          const ofc = document.createElement('canvas');
          ofc.width = SIM; ofc.height = SIM;
          const gl2 = ofc.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
          if (!gl2) throw new Error('no webgl2');
          gl2.getExtension('EXT_color_buffer_float');

          // ── Shaders ────────────────────────────────────────────────────────────
          const qVS = `#version 300 es
            precision highp float; in vec2 a_pos; out vec2 v_uv;
            void main(){ v_uv=(a_pos+1.0)*0.5; gl_Position=vec4(a_pos,0,1); }`;
          const advFS = `#version 300 es
            precision highp float; in vec2 v_uv;
            uniform sampler2D u_vel, u_src; uniform float u_dt, u_diss; uniform vec2 u_ts;
            out vec4 o;
            void main(){ vec2 vel=texture(u_vel,v_uv).xy;
              vec2 p=clamp(v_uv-vel*u_dt, u_ts, 1.0-u_ts);
              o=u_diss*texture(u_src,p); }`;
          const divFS = `#version 300 es
            precision highp float; in vec2 v_uv;
            uniform sampler2D u_vel; uniform vec2 u_ts; out vec4 o;
            void main(){ float L=texture(u_vel,v_uv-vec2(u_ts.x,0)).x,
              R=texture(u_vel,v_uv+vec2(u_ts.x,0)).x,
              T=texture(u_vel,v_uv+vec2(0,u_ts.y)).y,
              B=texture(u_vel,v_uv-vec2(0,u_ts.y)).y;
              o=vec4((R-L+T-B)*0.5,0,0,1); }`;
          const prsFS = `#version 300 es
            precision highp float; in vec2 v_uv;
            uniform sampler2D u_prs, u_div; uniform vec2 u_ts; out vec4 o;
            void main(){ float L=texture(u_prs,v_uv-vec2(u_ts.x,0)).x,
              R=texture(u_prs,v_uv+vec2(u_ts.x,0)).x,
              T=texture(u_prs,v_uv+vec2(0,u_ts.y)).x,
              B=texture(u_prs,v_uv-vec2(0,u_ts.y)).x,
              d=texture(u_div,v_uv).x;
              o=vec4((L+R+T+B-d)*0.25,0,0,1); }`;
          const gradFS = `#version 300 es
            precision highp float; in vec2 v_uv;
            uniform sampler2D u_prs, u_vel; uniform vec2 u_ts; out vec4 o;
            void main(){ float L=texture(u_prs,v_uv-vec2(u_ts.x,0)).x,
              R=texture(u_prs,v_uv+vec2(u_ts.x,0)).x,
              T=texture(u_prs,v_uv+vec2(0,u_ts.y)).x,
              B=texture(u_prs,v_uv-vec2(0,u_ts.y)).x;
              vec2 vel=texture(u_vel,v_uv).xy-vec2(R-L,T-B)*0.5;
              o=vec4(vel,0,1); }`;
          const splatFS = `#version 300 es
            precision highp float; in vec2 v_uv;
            uniform sampler2D u_base; uniform vec2 u_pt; uniform vec3 u_col; uniform float u_r;
            out vec4 o;
            void main(){ vec2 d=v_uv-u_pt; float s=exp(-dot(d,d)/u_r);
              o=texture(u_base,v_uv)+vec4(u_col*s,0); }`;
          const dispFS = `#version 300 es
            precision highp float; in vec2 v_uv;
            uniform sampler2D u_dye; uniform vec3 u_base; uniform float u_bloom, u_fill, u_time;
            out vec4 fragColor;
            void main(){
              vec2 uvc=v_uv*2.0-1.0; float dist=length(uvc);
              if(dist>1.0){fragColor=vec4(0);return;}
              vec3 dye=texture(u_dye,v_uv).rgb;
              // Amplified dye for visibility (was 1.8)
              vec3 col=u_base+dye*3.5;
              // Fill from bottom up: empty region is top (high UV y after drawImage flip)
              float waterY=u_fill;
              if(v_uv.y>waterY){col=u_base*0.3; fragColor=vec4(col,1.0); return;}
              float wave=sin(v_uv.x*20.0+u_time*5.0)*0.008;
              if(v_uv.y>waterY-0.01-wave&&v_uv.y<waterY+0.005)col=mix(col,vec3(1.0),0.3);
              col*=1.0-smoothstep(0.68,1.0,dist)*0.65;
              vec2 sp=uvc+vec2(-0.3,0.35); float spec=exp(-dot(sp,sp)/0.06)*0.45;
              col+=vec3(spec*(1.0+u_bloom*0.3));
              col+=u_base*smoothstep(0.6,0.0,dist)*u_bloom*0.15;
              // DEBUG: very obvious brightness pulse to confirm display shader runs
              col *= 0.6 + 0.4 * sin(u_time * 3.0);
              fragColor=vec4(col,1.0); }`;

          function mkProg(vs, fs) {
            const p = gl2.createProgram();
            [gl2.VERTEX_SHADER, gl2.FRAGMENT_SHADER].forEach((t, i) => {
              const s = gl2.createShader(t);
              gl2.shaderSource(s, [vs, fs][i]);
              gl2.compileShader(s);
              gl2.attachShader(p, s);
            });
            gl2.linkProgram(p);
            return gl2.getProgramParameter(p, gl2.LINK_STATUS) ? p : null;
          }

          function mkFBO(w, h) {
            const tex = gl2.createTexture();
            gl2.bindTexture(gl2.TEXTURE_2D, tex);
            // Try RGBA16F first; fall back to RGBA8 if half-float isn't renderable
            let usedFormat = 'rgba16f';
            try {
              gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA16F, w, h, 0, gl2.RGBA, gl2.HALF_FLOAT, null);
            } catch(e) {
              gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, w, h, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, null);
              usedFormat = 'rgba8';
            }
            gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
            gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
            gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
            gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
            const fbo = gl2.createFramebuffer();
            gl2.bindFramebuffer(gl2.FRAMEBUFFER, fbo);
            gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, tex, 0);
            // Verify the FBO is renderable
            const status = gl2.checkFramebufferStatus(gl2.FRAMEBUFFER);
            if (status !== gl2.FRAMEBUFFER_COMPLETE && usedFormat === 'rgba16f') {
              // Retry with RGBA8
              gl2.bindTexture(gl2.TEXTURE_2D, tex);
              gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, w, h, 0, gl2.RGBA, gl2.UNSIGNED_BYTE, null);
              gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, tex, 0);
            }
            gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
            gl2.bindTexture(gl2.TEXTURE_2D, null);
            return { tex, fbo };
          }

          function mkDouble(w, h) {
            return { r: mkFBO(w, h), w: mkFBO(w, h),
              swap() { const t=this.r; this.r=this.w; this.w=t; } };
          }

          const progs = {
            adv:   mkProg(qVS, advFS),
            div:   mkProg(qVS, divFS),
            prs:   mkProg(qVS, prsFS),
            grad:  mkProg(qVS, gradFS),
            splat: mkProg(qVS, splatFS),
            disp:  mkProg(qVS, dispFS),
          };
          if(Object.values(progs).some(p => !p)) throw new Error('NS orb shader failed');

          const qbuf = gl2.createBuffer();
          gl2.bindBuffer(gl2.ARRAY_BUFFER, qbuf);
          gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl2.STATIC_DRAW);

          function mkOrb(baseColor, colorful) {
            return {
              vel: mkDouble(SIM, SIM), dye: mkDouble(SIM, SIM),
              div: mkFBO(SIM, SIM), prs: mkDouble(SIM, SIM),
              baseColor, colorful,
              hue: colorful ? 0.65 : 0.02,
              energy: 0.55, lastSplat: 0
            };
          }

          state.nsOrbs = {
            gl: gl2, ofc, progs, qbuf, SIM,
            ts: [1/SIM, 1/SIM],
            orbs: {
              hp: mkOrb([0.25, 0.01, 0.02], false),
              mp: mkOrb([0.01, 0.03, 0.35], true)
            }
          };
          console.log('[orb] WebGL2 NS fluid initialized successfully');

          // Seed initial splats
          setTimeout(() => {
            for (let i = 0; i < 8; i++) {
              const a = (i/8)*Math.PI*2;
              const cx = 0.5+Math.cos(a)*0.2, cy = 0.5+Math.sin(a)*0.2;
              _nsOrbSplat(state.nsOrbs.orbs.hp, cx, cy, (0.5-cx)*20, (0.5-cy)*20, [0.8,0.05,0.0]);
              _nsOrbSplat(state.nsOrbs.orbs.mp, cx, cy, (0.5-cx)*20, (0.5-cy)*20, [0.0,0.1,0.8]);
            }
          }, 80);

        } catch(err) {
          const errMsg = err && err.message ? err.message : String(err);
          console.warn('[orb] NS fluid disabled, using fallback:', errMsg);
          state.nsOrbs = null;
        }
      }

      // Log once to help diagnose production issues
      if (!window._orbLoggedOnce) {
        window._orbLoggedOnce = true;
        const stateName = state.nsOrbs ? 'NS-fluid WebGL2' : 'animated 2D fallback';
        console.log('[orb] drawOrb first call. Using:', stateName);
      }

      // ── Fall back to old renderer if NS init failed ────────────────────────────
      if (!state.nsOrbs) {
        // Legacy renderer (animated sine-wave waterline)
        const canvas = document.getElementById(canvasId);
        if(!canvas) return false;
        const drawCtx = canvas.getContext('2d');
        if(!drawCtx) return false;
        const W = canvas.width, H = canvas.height;
        drawCtx.clearRect(0, 0, W, H);
        if(fillPct <= 0) return true;
        const t = nowMs() * 0.001;
        const waterY = H * (1 - fillPct);
        drawCtx.save();
        drawCtx.beginPath();
        drawCtx.arc(W/2, H/2, W/2 - 1, 0, Math.PI*2);
        drawCtx.clip();
        // Animated wave surface
        drawCtx.beginPath();
        drawCtx.moveTo(0, H);
        for(let x = 0; x <= W; x += 2) {
          const waveOffset = Math.sin(x * 0.15 + t * 2) * 2 + Math.sin(x * 0.08 + t * 1.5) * 1.5;
          drawCtx.lineTo(x, waterY + waveOffset);
        }
        drawCtx.lineTo(W, H);
        drawCtx.closePath();
        const grad = drawCtx.createLinearGradient(0, waterY, 0, H);
        grad.addColorStop(0, color);
        grad.addColorStop(0.7, color);
        grad.addColorStop(1, '#111');
        drawCtx.fillStyle = grad;
        drawCtx.fill();
        // Surface highlight
        drawCtx.strokeStyle = 'rgba(255,255,255,0.35)';
        drawCtx.lineWidth = 1;
        drawCtx.beginPath();
        for(let x = 0; x <= W; x += 2) {
          const waveOffset = Math.sin(x * 0.15 + t * 2) * 2 + Math.sin(x * 0.08 + t * 1.5) * 1.5;
          if(x === 0) drawCtx.moveTo(x, waterY + waveOffset);
          else drawCtx.lineTo(x, waterY + waveOffset);
        }
        drawCtx.stroke();
        // Bubbles
        for(let b = 0; b < 3; b++) {
          const bx = W/2 + Math.sin(t * (0.7 + b * 0.3) + b) * (W * 0.25);
          const by = H - ((t * 15 + b * 40) % (H * fillPct));
          drawCtx.beginPath();
          drawCtx.arc(bx, by, 1.5 + Math.sin(t * 3 + b) * 0.5, 0, Math.PI*2);
          drawCtx.fillStyle = 'rgba(255,255,255,0.4)';
          drawCtx.fill();
        }
        drawCtx.restore();
        return true;
      }

      // ── NS fluid step ──────────────────────────────────────────────────────────
      const ns = state.nsOrbs;
      const gl = ns.gl;
      const orb = ns.orbs[kind] || ns.orbs.hp;
      const SIM = ns.SIM;
      const ts = ns.ts;
      const dt = 0.016;
      const nowSec = nowMs() / 1000;

      // Energy decay
      orb.energy = Math.max(0.08, orb.energy * 0.994);
      const e = orb.energy;

      // Auto color splat — bigger, more frequent for visibility
      if (nowSec - orb.lastSplat > 0.4) {
        orb.lastSplat = nowSec;
        orb.energy = Math.max(orb.energy, 0.3);
        const a = Math.random() * Math.PI * 2;
        const r = 0.1 + Math.random() * 0.3;
        const cx = 0.5 + Math.cos(a)*r, cy = 0.5 + Math.sin(a)*r;
        if (orb.colorful) {
          orb.hue = (orb.hue + 0.137) % 1.0;
        } else {
          orb.hue = (orb.hue + 0.05) % 0.12;
        }
        const col = _hsvToRgb(orb.hue, 1.0, 1.2); // brighter
        _nsOrbSplat(orb, cx, cy, (0.5-cx)*40, (0.5-cy)*40, col);
      }

      // Energy-scaled turbulence
      if (e > 0.09) {
        const bursts = orb.colorful ? 3 : 2;
        for (let b = 0; b < bursts; b++) {
          const bx = 0.15 + Math.random()*0.70;
          const by = 0.15 + Math.random()*0.70;
          const rx = bx-0.5, ry = by-0.5;
          let vx, vy;
          if (b % 2 === 0) {
            const spd = (10 + Math.random()*12) * e;
            vx = -ry*spd + (Math.random()-0.5)*3*e;
            vy =  rx*spd + (Math.random()-0.5)*3*e;
          } else {
            const len = Math.sqrt(rx*rx+ry*ry)+0.001;
            const spd = (8 + Math.random()*10) * e;
            vx = rx/len*spd; vy = ry/len*spd;
          }
          const rr = (0.035 + Math.random()*0.025) * (0.5 + e*0.5);
          _nsVelSplat(orb, bx, by, vx, vy, rr);
        }
      }

      // NS solve
      const velDiss = (0.99 * e + 0.96 * (1-e));
      function bind(prog) {
        gl.useProgram(prog);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, ns.qbuf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
      function drawTo(fbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, SIM, SIM);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      function setT(prog, name, unit, tex) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(prog, name), unit);
      }

      // Advect velocity
      bind(ns.progs.adv);
      setT(ns.progs.adv,'u_vel',0,orb.vel.r.tex);
      setT(ns.progs.adv,'u_src',1,orb.vel.r.tex);
      gl.uniform1f(gl.getUniformLocation(ns.progs.adv,'u_dt'),dt);
      gl.uniform1f(gl.getUniformLocation(ns.progs.adv,'u_diss'),velDiss);
      gl.uniform2fv(gl.getUniformLocation(ns.progs.adv,'u_ts'),ts);
      drawTo(orb.vel.w.fbo); orb.vel.swap();

      // Divergence
      bind(ns.progs.div);
      setT(ns.progs.div,'u_vel',0,orb.vel.r.tex);
      gl.uniform2fv(gl.getUniformLocation(ns.progs.div,'u_ts'),ts);
      drawTo(orb.div.fbo);

      // Pressure (15 Jacobi iters)
      bind(ns.progs.prs);
      gl.uniform2fv(gl.getUniformLocation(ns.progs.prs,'u_ts'),ts);
      setT(ns.progs.prs,'u_div',1,orb.div.tex);
      for(let i=0;i<15;i++){
        setT(ns.progs.prs,'u_prs',0,orb.prs.r.tex);
        drawTo(orb.prs.w.fbo); orb.prs.swap();
      }

      // Gradient subtract
      bind(ns.progs.grad);
      setT(ns.progs.grad,'u_prs',0,orb.prs.r.tex);
      setT(ns.progs.grad,'u_vel',1,orb.vel.r.tex);
      gl.uniform2fv(gl.getUniformLocation(ns.progs.grad,'u_ts'),ts);
      drawTo(orb.vel.w.fbo); orb.vel.swap();

      // Advect dye
      bind(ns.progs.adv);
      setT(ns.progs.adv,'u_vel',0,orb.vel.r.tex);
      setT(ns.progs.adv,'u_src',1,orb.dye.r.tex);
      gl.uniform1f(gl.getUniformLocation(ns.progs.adv,'u_dt'),dt);
      gl.uniform1f(gl.getUniformLocation(ns.progs.adv,'u_diss'),0.997);
      gl.uniform2fv(gl.getUniformLocation(ns.progs.adv,'u_ts'),ts);
      drawTo(orb.dye.w.fbo); orb.dye.swap();

      // Display to offscreen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, SIM, SIM);
      bind(ns.progs.disp);
      setT(ns.progs.disp,'u_dye',0,orb.dye.r.tex);
      gl.uniform3fv(gl.getUniformLocation(ns.progs.disp,'u_base'), orb.baseColor);
      gl.uniform1f(gl.getUniformLocation(ns.progs.disp,'u_bloom'), 0.4);
      gl.uniform1f(gl.getUniformLocation(ns.progs.disp,'u_fill'), clamp(fillPct,0,1));
      gl.uniform1f(gl.getUniformLocation(ns.progs.disp,'u_time'), nowMs()*0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Blit to game canvas
      const canvas = document.getElementById(canvasId);
      if(!canvas) return false;
      const drawCtx = canvas.getContext('2d');
      if(!drawCtx) return false;
      drawCtx.clearRect(0, 0, canvas.width, canvas.height);
      drawCtx.save();
      drawCtx.beginPath();
      drawCtx.arc(canvas.width/2, canvas.height/2, canvas.width/2-1, 0, TAU);
      drawCtx.clip();
      drawCtx.drawImage(ns.ofc, 0, 0, canvas.width, canvas.height);
      drawCtx.restore();

      return true;
    }

     function drawGrassUnderlay(targetCtx, px, py, mapX, mapY, animNow) {
      if(!targetCtx) return false;
      const tile = theMap[mapY] && theMap[mapY][mapX];
      const inCrag = !!(window._eagleCragBounds && mapX >= window._eagleCragBounds.x1 && mapX <= window._eagleCragBounds.x2 && mapY >= window._eagleCragBounds.y1 && mapY <= window._eagleCragBounds.y2);

      let drawSparseFloor = false;
      if(currentScene === 'town') {
        if(tile !== TILES.GRASS && tile !== TILES.BUSH) return false;
      } else if(inCrag) {
        if(tile === TILES.FLOOR) drawSparseFloor = hash2(mapX, mapY) < 0.16;
        else if(tile !== TILES.GRASS && tile !== TILES.BUSH) return false;
        if(tile === TILES.FLOOR && !drawSparseFloor) return false;
      } else {
        return false;
      }

      const tuftCount = inCrag ? 5 : (tile === TILES.BUSH ? 8 : 16);
      const swayBase = animNow * 0.004 + mapX * 0.61 + mapY * 0.47;
      const alpha = inCrag ? 0.22 : 0.3;

      // Compute avatar parting factor
      let partDx = 0, partDy = 0, partStrength = 0;
      if(typeof player !== 'undefined') {
        const distToPlayer = Math.hypot(mapX - player.x, mapY - player.y);
        if(distToPlayer < 1.5) {
          partDx = (mapX + 0.5) - player.x;
          partDy = (mapY + 0.5) - player.y;
          partStrength = Math.max(0, 1.0 - distToPlayer / 1.5);
        }
      }

      targetCtx.save();
      targetCtx.lineCap = 'round';
      for(let i = 0; i < tuftCount; i++) {
        const seed = hash2(mapX * 13 + i * 7, mapY * 17 + i * 11);
        // Scatter bases across the entire tile, not just the bottom edge
        const baseX = px + 2 + seed * (TILE_SIZE - 4);
        const seed2 = hash2(mapX * 31 + i * 23, mapY * 37 + i * 29);
        const baseY = py + 4 + seed2 * (TILE_SIZE - 8);
        const height = (inCrag ? 8 : 12) + seed * (inCrag ? 8 : 18);
        let sway = Math.sin(swayBase + i * 0.7 + seed * 5.0) * (inCrag ? 3.0 : 5.0);
        // Also add a faster subtle sway layer
        sway += Math.sin(animNow * 0.007 + mapX + i * 1.3) * 1.5;
        // Avatar parting: blades near player lean away from player center
        if(partStrength > 0) {
          const partLean = partDx * partStrength * 6.0;
          sway += partLean;
        }
        targetCtx.strokeStyle = seed > 0.5
          ? `rgba(150, 205, 105, ${alpha + 0.05})`
          : `rgba(42, 100, 34, ${alpha})`;
        targetCtx.lineWidth = seed > 0.5 ? 1.4 : 2.0;
        targetCtx.beginPath();
        targetCtx.moveTo(baseX, baseY);
        targetCtx.quadraticCurveTo(baseX + sway * 0.4, baseY - height * 0.55, baseX + sway, baseY - height);
        targetCtx.stroke();
      }

      // Second lighter pass — thinner, brighter blades, also scattered
      if(!inCrag) {
        targetCtx.lineWidth = 0.8;
        const thinCount = Math.floor(tuftCount * 0.7);
        for(let i = 0; i < thinCount; i++) {
          const seed2 = hash2(mapX * 7 + i * 11, mapY * 23 + i * 5);
          const baseX2 = px + 2 + seed2 * (TILE_SIZE - 4);
          const seed3 = hash2(mapX * 41 + i * 43, mapY * 47 + i * 53);
          const baseY2 = py + 3 + seed3 * (TILE_SIZE - 6);
          const height2 = 6 + seed2 * 12;
          let sway2 = Math.sin(swayBase * 1.3 + i * 1.2 + seed2 * 3.5) * 3.5;
          sway2 += Math.sin(animNow * 0.006 + mapY + i * 2.1) * 1.2;
          if(partStrength > 0) {
            sway2 += partDx * partStrength * 4.0;
          }
          targetCtx.strokeStyle = `rgba(180, 230, 120, ${alpha * 0.5})`;
          targetCtx.beginPath();
          targetCtx.moveTo(baseX2, baseY2);
          targetCtx.quadraticCurveTo(baseX2 + sway2 * 0.5, baseY2 - height2 * 0.6, baseX2 + sway2, baseY2 - height2);
          targetCtx.stroke();
        }
      }

      targetCtx.restore();
      return true;
    }

    // ── Per-enemy Ifrit GPU particle system ──────────────────────────────────

    // SDF density with cx parameter (demo-style): x in [0,1], y in [0,1], cx=center x [0,1]
    function ifritDensity(x, y, cx) {
      cx = (cx !== undefined) ? cx : 0.5;
      const lx = (x - cx) * 8.0;
      const ly = y;
      function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
      function ell(px, py, ecx, ecy, rx, ry) { const dx = (px - ecx) / rx, dy = (py - ecy) / ry; return Math.sqrt(dx * dx + dy * dy); }
      // Standing pose (same as demo)
      let d = ell(lx, ly, 0, 0.82, 0.28, 0.10);
      d = smin(d, ell(lx, ly, 0, 0.655, 0.38, 0.16), 0.15);
      d = smin(d, ell(lx, ly, 0, 0.54, 0.30, 0.07), 0.12);
      d = smin(d, ell(lx, ly, -0.22, 0.40, 0.13, 0.14), 0.10);
      d = smin(d, ell(lx, ly,  0.22, 0.40, 0.13, 0.14), 0.10);
      d = smin(d, ell(lx, ly, -0.48 + ly * 0.1, 0.67, 0.12, 0.13), 0.08);
      d = smin(d, ell(lx, ly,  0.48 - ly * 0.1, 0.67, 0.12, 0.13), 0.08);
      d = smin(d, ell(lx, ly, -0.12, 0.935, 0.04, 0.07), 0.05);
      d = smin(d, ell(lx, ly,  0.12, 0.935, 0.04, 0.07), 0.05);
      return Math.max(0, 1.0 - d);
    }

    // Spawn a single Ifrit particle into a plain object (used to seed the pool)
    function spawnIfritParticle(auraW, auraH, cx01, combatMode) {
      // Sample a position in [0,1]x[0,1] matching the body SDF
      let sx, sy;
      let tries = 0;
      do {
        sx = (Math.random() - 0.5) * 0.35 + cx01;
        sy = Math.random() * 0.95;
        tries++;
      } while (ifritDensity(sx, sy, cx01) < Math.random() && tries < 40);
      // Convert to NDC [-1,1]
      const nx = (sx - 0.5) * 2.0;
      const ny = (sy - 0.5) * 2.0;
      const speedMult = combatMode ? 1.8 : 1.0;
      return {
        x: nx, y: ny,
        vx: (Math.random() - 0.5) * 0.06 * speedMult,
        vy: 0.025 + Math.random() * 0.08 * speedMult,
        heat: 0.35 + Math.random() * 0.65,
        life: combatMode ? (0.2 + Math.random() * 0.35) : (0.4 + Math.random() * 0.7),
        age: 0,
        size: 5 + Math.random() * 9
      };
    }

    // Init per-enemy GL state
    function initIfritGL(enemy, drawSize) {
      const auraW = Math.ceil(drawSize * 1.2);
      const auraH = Math.ceil(drawSize * 1.8);
      const offc = document.createElement('canvas');
      offc.width = auraW; offc.height = auraH;
      const gl = offc.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
                 offc.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
      if (!gl) return null;

      const vsrc = [
        'attribute vec2 a_pos;',
        'attribute float a_heat;',
        'attribute float a_size;',
        'varying float v_heat;',
        'void main() {',
        '  v_heat = a_heat;',
        '  gl_Position = vec4(a_pos, 0.0, 1.0);',
        '  gl_PointSize = clamp(a_size * (0.5 + a_heat * 1.5), 1.0, 48.0);',
        '}'
      ].join('\n');

      const fsrc = [
        'precision mediump float;',
        'varying float v_heat;',
        'void main() {',
        '  vec2 uv = gl_PointCoord - 0.5;',
        '  float r = length(uv) * 2.0;',
        '  float alpha = smoothstep(1.0, 0.0, r) * v_heat * 0.88;',
        '  vec3 col;',
        '  if(v_heat > 0.75) col = mix(vec3(1.0,0.85,0.3), vec3(1.0,1.0,0.9), (v_heat-0.75)*4.0);',
        '  else if(v_heat > 0.45) col = mix(vec3(1.0,0.3,0.0), vec3(1.0,0.85,0.3), (v_heat-0.45)/0.3);',
        '  else col = mix(vec3(0.3,0.02,0.0), vec3(1.0,0.3,0.0), v_heat/0.45);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n');

      const prog = createFireProgram(gl, vsrc, fsrc);
      if (!prog) return null;

      const MAX_P = 600;
      const cx01 = 0.5; // center of NDC mapped to [0,1]
      const particles = [];
      for (let i = 0; i < MAX_P * 0.6; i++) {
        particles.push(spawnIfritParticle(auraW, auraH, cx01, false));
      }

      enemy._ifritGL = {
        offc, gl, prog,
        buf: gl.createBuffer(),
        MAX_P, particles,
        stateTimer: 0,
        ifritState: 'idle',
        drawSize,
        auraW, auraH,
        lastTime: 0
      };
      return enemy._ifritGL;
    }

    function drawIfritAura(targetCtx, px, py, drawSize, animNow, enemy) {
      if (!targetCtx) return false;

      // Use enemy-attached state if enemy is provided, else fallback to global state
      const ent = enemy || {};

      // Lazy-init or resize
      if (!ent._ifritGL || ent._ifritGL.drawSize !== drawSize) {
        const igl2 = initIfritGL(ent, drawSize);
        if (!igl2) {
          // Fallback: FBM blob aura (original behavior)
          ensureStarted();
          const auraS = Math.ceil(drawSize * 1.7);
          const p2 = (auraS - drawSize) / 2;
          const texture = renderTexture(2, 1.0 + Math.sin(animNow * 0.006) * 0.15, [1.0, 0.42, 0.08], px * 0.01, py * 0.01, auraS, auraS);
          if (!texture) return false;
          targetCtx.save();
          targetCtx.globalCompositeOperation = 'lighter';
          targetCtx.globalAlpha = 0.58;
          targetCtx.drawImage(texture, px - p2, py - p2, auraS, auraS);
          targetCtx.restore();
          return true;
        }
      }

      const igl = ent._ifritGL;
      if (!igl) return false;

      const { offc: iCanvas, gl, prog, buf, particles, auraW, auraH } = igl;
      const now = animNow;
      const dt = Math.min(80, now - (igl.lastTime || now)) * 0.001;
      igl.lastTime = now;

      // Update state machine
      igl.stateTimer += dt;
      const combatMode = !!(ent.provoked ||
        (ent.stats && ent.stats.hp != null && ent.stats.maxHp && ent.stats.hp / ent.stats.maxHp < 0.5));
      if (combatMode) {
        igl.ifritState = 'combat';
      } else if (igl.stateTimer > 3.0) {
        igl.ifritState = Math.random() < 0.4 ? 'walk' : 'idle';
        igl.stateTimer = 0;
      }

      const spawnPerFrame = combatMode ? 20 : 10;
      const maxParticles = combatMode ? igl.MAX_P : Math.floor(igl.MAX_P * 0.55);
      const cx01 = 0.5;

      // Spawn particles rejection-sampled from SDF
      for (let attempt = 0; attempt < spawnPerFrame * 4 && particles.length < maxParticles; attempt++) {
        const sx = (Math.random() - 0.5) * 0.38 + cx01;
        const sy = Math.random() * 0.98;
        const dens = ifritDensity(sx, sy, cx01);
        if (Math.random() > dens * 1.4) continue;
        particles.push(spawnIfritParticle(auraW, auraH, cx01, combatMode));
      }

      // Update particles
      const turbScale = combatMode ? 1.6 : 1.0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        p.x  += p.vx * dt;
        p.y  += p.vy * dt;
        p.vx += (Math.random() - 0.5) * 0.04 * turbScale * dt;
        p.heat = Math.max(0, p.heat - dt * (combatMode ? 1.8 : 1.1));
        if (p.age > p.life || p.heat <= 0) {
          particles.splice(i, 1);
        }
      }

      const count = particles.length;
      gl.viewport(0, 0, iCanvas.width, iCanvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (count > 0) {
        const interleaved = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          interleaved[i * 4]     = particles[i].x;
          interleaved[i * 4 + 1] = particles[i].y;
          interleaved[i * 4 + 2] = particles[i].heat;
          interleaved[i * 4 + 3] = particles[i].size;
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.DYNAMIC_DRAW);

        const stride = 4 * 4;
        const aPos  = gl.getAttribLocation(prog, 'a_pos');
        const aHeat = gl.getAttribLocation(prog, 'a_heat');
        const aSize = gl.getAttribLocation(prog, 'a_size');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos,  2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(aHeat);
        gl.vertexAttribPointer(aHeat, 1, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(aSize);
        gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 12);
        gl.drawArrays(gl.POINTS, 0, count);
      }

      targetCtx.save();
      targetCtx.globalCompositeOperation = 'lighter';
      targetCtx.globalAlpha = combatMode ? 0.95 : 0.85;
      targetCtx.drawImage(iCanvas, px - auraW / 2, py - auraH * 0.8, auraW, auraH);
      targetCtx.restore();
      return true;
    }

    function toScreen(mapX, mapY, playerX, playerY, viewCx, viewCy, tileSize) {
      return {
        x: (mapX - playerX + viewCx) * tileSize + tileSize / 2,
        y: (mapY - playerY + viewCy) * tileSize + tileSize / 2
      };
    }

    function drawChainLightning(targetCtx, effect, playerX, playerY, viewCx, viewCy, tileSize, animNow) {
      if(!targetCtx || !effect) return false;
      const start = toScreen(effect.x1, effect.y1, playerX, playerY, viewCx, viewCy, tileSize);
      const end   = toScreen(effect.x2, effect.y2, playerX, playerY, viewCx, viewCy, tileSize);
      const life  = clamp(effect.life || 0.6, 0, 1.5);
      const power = effect.power || 1;

      // Build fractal lightning segments via midpoint displacement
      // Re-seed each frame for flickering
      const seed = Math.floor(animNow / 80);
      let rng = seed * 1234567 + 89012;
      function rand() {
        rng = (rng * 1664525 + 1013904223) & 0xffffffff;
        return (rng >>> 0) / 4294967296;
      }

      const segments = [];

      function buildLightning(x1, y1, x2, y2, depth, widthFactor) {
        if(depth === 0) {
          segments.push({ x1, y1, x2, y2, w: widthFactor });
          return;
        }
        const mx = (x1 + x2) / 2 + (rand() - 0.5) * depth * 14;
        const my = (y1 + y2) / 2 + (rand() - 0.5) * depth * 14;
        buildLightning(x1, y1, mx, my, depth - 1, widthFactor);
        buildLightning(mx, my, x2, y2, depth - 1, widthFactor);
        // Branch 35% of the time when depth >= 2
        if(depth >= 2 && rand() < 0.35) {
          const bx = mx + (rand() - 0.5) * 50;
          const by = my + (rand() - 0.5) * 50;
          buildLightning(mx, my, bx, by, depth - 2, widthFactor * 0.5);
        }
      }

      buildLightning(start.x, start.y, end.x, end.y, 4, 1.0);

      targetCtx.save();
      targetCtx.globalCompositeOperation = 'lighter';
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.shadowBlur = 0;

      // Draw glow pass (thick, low alpha blue)
      for(const seg of segments) {
        targetCtx.strokeStyle = `rgba(80, 180, 255, ${0.12 * life * seg.w})`;
        targetCtx.lineWidth = 10 * seg.w * (1 + power * 0.3);
        targetCtx.beginPath();
        targetCtx.moveTo(seg.x1, seg.y1);
        targetCtx.lineTo(seg.x2, seg.y2);
        targetCtx.stroke();
      }
      // Draw mid glow
      for(const seg of segments) {
        targetCtx.strokeStyle = `rgba(140, 220, 255, ${0.3 * life * seg.w})`;
        targetCtx.lineWidth = 4 * seg.w * (1 + power * 0.2);
        targetCtx.beginPath();
        targetCtx.moveTo(seg.x1, seg.y1);
        targetCtx.lineTo(seg.x2, seg.y2);
        targetCtx.stroke();
      }
      // Draw white core (main trunk only)
      for(const seg of segments) {
        if(seg.w < 0.6) continue;
        targetCtx.strokeStyle = `rgba(255, 255, 255, ${0.85 * life * seg.w})`;
        targetCtx.lineWidth = 1.5 * seg.w;
        targetCtx.beginPath();
        targetCtx.moveTo(seg.x1, seg.y1);
        targetCtx.lineTo(seg.x2, seg.y2);
        targetCtx.stroke();
      }

      // Impact flash at origin and target
      targetCtx.globalAlpha = life * 0.6;
      const flashR = tileSize * 0.4 * (1 + power * 0.2);
      const grad1 = targetCtx.createRadialGradient(start.x, start.y, 0, start.x, start.y, flashR);
      grad1.addColorStop(0, 'rgba(200,240,255,0.9)');
      grad1.addColorStop(1, 'rgba(80,180,255,0)');
      targetCtx.fillStyle = grad1;
      targetCtx.beginPath(); targetCtx.arc(start.x, start.y, flashR, 0, Math.PI * 2); targetCtx.fill();

      const grad2 = targetCtx.createRadialGradient(end.x, end.y, 0, end.x, end.y, flashR);
      grad2.addColorStop(0, 'rgba(200,240,255,0.9)');
      grad2.addColorStop(1, 'rgba(80,180,255,0)');
      targetCtx.fillStyle = grad2;
      targetCtx.beginPath(); targetCtx.arc(end.x, end.y, flashR, 0, Math.PI * 2); targetCtx.fill();

      targetCtx.restore();
      return true;
    }

    function drawIcebeamEffect(targetCtx, effect, playerX, playerY, viewCx, viewCy, tileSize, animNow) {
      if(!targetCtx || !effect) return false;
      const life = clamp(effect.life, 0, 1);
      const toSc = (wx, wy) => ({
        x: (wx - playerX + viewCx) * tileSize + tileSize / 2,
        y: (wy - playerY + viewCy) * tileSize + tileSize / 2
      });
      const start = toSc(effect.x1, effect.y1);
      const end   = toSc(effect.x2, effect.y2);

      // Build jagged ice segments — deterministic per 60ms tick
      const tick = Math.floor(animNow / 60);
      let rng = tick * 999983 + Math.floor(effect.x1) * 7 + Math.floor(effect.y2) * 13;
      function rand() {
        rng = (rng * 1664525 + 1013904223) & 0xffffffff;
        return (rng >>> 0) / 4294967296;
      }

      const steps = 10;
      const pts = [start];
      for(let i = 1; i < steps; i++) {
        const t = i / steps;
        const bx = start.x + (end.x - start.x) * t;
        const by = start.y + (end.y - start.y) * t;
        pts.push({
          x: bx + (rand() - 0.5) * tileSize * 0.5,
          y: by + (rand() - 0.5) * tileSize * 0.5
        });
      }
      pts.push(end);

      targetCtx.save();

      // Outer ice glow (thick, blue, semi-transparent)
      targetCtx.globalCompositeOperation = 'lighter';
      targetCtx.strokeStyle = `rgba(100,200,255, ${life * 0.25})`;
      targetCtx.lineWidth = 12;
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.beginPath();
      pts.forEach((p, i) => i === 0 ? targetCtx.moveTo(p.x, p.y) : targetCtx.lineTo(p.x, p.y));
      targetCtx.stroke();

      // Mid blue core
      targetCtx.strokeStyle = `rgba(160,230,255, ${life * 0.7})`;
      targetCtx.lineWidth = 3;
      targetCtx.beginPath();
      pts.forEach((p, i) => i === 0 ? targetCtx.moveTo(p.x, p.y) : targetCtx.lineTo(p.x, p.y));
      targetCtx.stroke();

      // White crystalline core
      targetCtx.strokeStyle = `rgba(240,250,255, ${life * 0.9})`;
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      pts.forEach((p, i) => i === 0 ? targetCtx.moveTo(p.x, p.y) : targetCtx.lineTo(p.x, p.y));
      targetCtx.stroke();

      // Ice shard burst at impact point
      targetCtx.globalAlpha = life * 0.8;
      const shardCount = 6;
      const shardLen = tileSize * 0.45;
      for(let i = 0; i < shardCount; i++) {
        const angle = (i / shardCount) * Math.PI * 2 + animNow * 0.0005;
        const x1 = end.x + Math.cos(angle) * tileSize * 0.1;
        const y1 = end.y + Math.sin(angle) * tileSize * 0.1;
        const x2 = end.x + Math.cos(angle) * shardLen * life;
        const y2 = end.y + Math.sin(angle) * shardLen * life;
        const grad = targetCtx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(220,245,255,${life * 0.9})`);
        grad.addColorStop(1, `rgba(100,200,255,0)`);
        targetCtx.strokeStyle = grad;
        targetCtx.lineWidth = 2 * life;
        targetCtx.beginPath(); targetCtx.moveTo(x1, y1); targetCtx.lineTo(x2, y2); targetCtx.stroke();
      }

      // Frost glow at impact
      const frostGrad = targetCtx.createRadialGradient(end.x, end.y, 0, end.x, end.y, tileSize * 0.7 * life);
      frostGrad.addColorStop(0, `rgba(200,240,255,${life * 0.6})`);
      frostGrad.addColorStop(0.5, `rgba(100,200,255,${life * 0.2})`);
      frostGrad.addColorStop(1, 'rgba(100,200,255,0)');
      targetCtx.fillStyle = frostGrad;
      targetCtx.beginPath(); targetCtx.arc(end.x, end.y, tileSize * 0.7 * life, 0, Math.PI * 2); targetCtx.fill();

      targetCtx.restore();
      return true;
    }

    // #14: Mimic gold coin tumbling effect
    function drawGoldCoinsEffect(targetCtx, effect, playerX, playerY, viewCx, viewCy, tileSize, animNow) {
      if(!ensureStarted() || !targetCtx || !effect) return false;
      const life = effect.life;
      const t = animNow * 0.001;
      const toScreen = (wx, wy) => ({
        x: (wx - playerX + viewCx) * tileSize + tileSize / 2,
        y: (wy - playerY + viewCy) * tileSize + tileSize / 2
      });
      const start = toScreen(effect.x1, effect.y1);
      const end = toScreen(effect.x2, effect.y2);
      targetCtx.save();
      targetCtx.globalAlpha = life;
      // Draw tumbling gold coins along the path
      const numCoins = 8;
      for(let i = 0; i < numCoins; i++) {
        const frac = (i / numCoins + t * 2) % 1;
        const cx = start.x + (end.x - start.x) * frac + Math.sin(t * 5 + i) * 8;
        const cy = start.y + (end.y - start.y) * frac + Math.cos(t * 7 + i * 2) * 6;
        const rot = t * 3 + i;
        const coinSize = 6 + Math.sin(t * 4 + i) * 2;
        targetCtx.save();
        targetCtx.translate(cx, cy);
        targetCtx.rotate(rot);
        targetCtx.fillStyle = `rgba(255,215,0,${life * 0.9})`;
        targetCtx.shadowColor = '#FFD700';
        targetCtx.shadowBlur = 8;
        // Coin shape (ellipse to show tumbling)
        const scaleX = Math.abs(Math.cos(rot)) * 0.6 + 0.4;
        targetCtx.scale(scaleX, 1);
        targetCtx.beginPath();
        targetCtx.arc(0, 0, coinSize, 0, Math.PI * 2);
        targetCtx.fill();
        // Inner ring
        targetCtx.strokeStyle = `rgba(200,170,0,${life * 0.7})`;
        targetCtx.lineWidth = 1;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, coinSize * 0.6, 0, Math.PI * 2);
        targetCtx.stroke();
        targetCtx.restore();
      }
      // Burst at impact point
      const burst = renderTexture(3, life * 0.6, [1.0, 0.84, 0.0], effect.x2 * 0.17, effect.y2 * 0.13, 28, 28);
      if(burst) {
        targetCtx.globalCompositeOperation = 'lighter';
        targetCtx.globalAlpha = life * 0.4;
        targetCtx.drawImage(burst, end.x - 14, end.y - 14, 28, 28);
      }
      targetCtx.restore();
      return true;
    }

    // Compile and link a WebGL program for the fireball particle system
    function createFireProgram(gl, vsrc, fsrc) {
      try {
        const vs = createShader(gl, gl.VERTEX_SHADER, vsrc);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsrc);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(prog) || 'Fireball program link failed');
        }
        return prog;
      } catch(e) {
        console.warn('createFireProgram failed:', e && e.message ? e.message : e);
        return null;
      }
    }

    // Lazy-init GPU fireball particle system
    function ensureFireballGL(size) {
      if(state.fireballGL && state.fireballGL.size >= size) return state.fireballGL;

      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
                 canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
      if(!gl) return null;

      const vsrc = [
        'attribute vec2 a_pos;',
        'attribute float a_heat;',
        'attribute float a_size;',
        'varying float v_heat;',
        'void main() {',
        '  v_heat = a_heat;',
        '  gl_Position = vec4(a_pos, 0.0, 1.0);',
        '  gl_PointSize = clamp(a_size * (0.5 + a_heat * 1.5), 1.0, 40.0);',
        '}'
      ].join('\n');

      const fsrc = [
        'precision mediump float;',
        'varying float v_heat;',
        'void main() {',
        '  vec2 uv = gl_PointCoord - 0.5;',
        '  float r = length(uv) * 2.0;',
        '  float alpha = smoothstep(1.0, 0.0, r) * v_heat;',
        '  vec3 col;',
        '  if(v_heat > 0.75) col = mix(vec3(1.0,0.85,0.3), vec3(1.0,1.0,0.95), (v_heat-0.75)*4.0);',
        '  else if(v_heat > 0.45) col = mix(vec3(1.0,0.3,0.0), vec3(1.0,0.85,0.3), (v_heat-0.45)/0.3);',
        '  else col = mix(vec3(0.4,0.05,0.0), vec3(1.0,0.3,0.0), v_heat/0.45);',
        '  gl_FragColor = vec4(col, alpha * 0.88);',
        '}'
      ].join('\n');

      const prog = createFireProgram(gl, vsrc, fsrc);
      if(!prog) return null;

      const buf = gl.createBuffer();
      state.fireballGL = { canvas, gl, prog, buf, size, particles: [], lastTime: 0 };
      return state.fireballGL;
    }

    function drawFireballEffect(targetCtx, effect, playerX, playerY, viewCx, viewCy, tileSize, animNow) {
      if(!targetCtx || !effect) return false;
      const worldX = effect.x != null ? effect.x : effect.x2;
      const worldY = effect.y != null ? effect.y : effect.y2;
      const screen = toScreen(worldX, worldY, playerX, playerY, viewCx, viewCy, tileSize);
      const isBurst = effect.kind === 'fireballBurst';
      const power = effect.power || 1;
      const drawSize = isBurst
        ? Math.ceil(tileSize * (1.15 + power * 0.35) * 2)
        : Math.ceil(tileSize * (0.65 + power * 0.25) * 2);

      const fgl = ensureFireballGL(drawSize);

      // Fallback: Canvas 2D orange/red radial gradients
      if(!fgl) {
        targetCtx.save();
        targetCtx.globalCompositeOperation = 'lighter';
        const r = drawSize / 2;
        const gr = targetCtx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, r);
        gr.addColorStop(0, `rgba(255,240,180,${isBurst ? 0.85 : 0.6})`);
        gr.addColorStop(0.35, `rgba(255,120,20,${isBurst ? 0.6 : 0.4})`);
        gr.addColorStop(1, 'rgba(255,40,0,0)');
        targetCtx.fillStyle = gr;
        targetCtx.beginPath();
        targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
        targetCtx.fill();
        if(!isBurst && effect.x1 != null && effect.y1 != null) {
          const tail = toScreen(effect.x1, effect.y1, playerX, playerY, viewCx, viewCy, tileSize);
          targetCtx.strokeStyle = 'rgba(255,160,60,0.28)';
          targetCtx.lineWidth = 5;
          targetCtx.beginPath();
          targetCtx.moveTo(tail.x, tail.y);
          targetCtx.lineTo(screen.x, screen.y);
          targetCtx.stroke();
        }
        targetCtx.restore();
        return true;
      }

      const { canvas: fCanvas, gl, prog, buf, particles } = fgl;
      const now = animNow;
      const dt = Math.min(80, now - (fgl.lastTime || now)) * 0.001;
      fgl.lastTime = now;

      const halfW = fCanvas.width / 2;
      const halfH = fCanvas.height / 2;

      // Spawn new particles
      const spawnCount = isBurst ? 40 : 8;
      for(let i = 0; i < spawnCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = isBurst
          ? (0.08 + Math.random() * 0.22)
          : (0.03 + Math.random() * 0.08);
        const r = isBurst ? Math.random() * 0.3 : Math.random() * 0.1;
        const upBias = isBurst ? 0 : -0.06;
        particles.push({
          // NDC coords centered in offscreen canvas
          x: r * Math.cos(angle),
          y: r * Math.sin(angle) + upBias,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + (isBurst ? 0 : -0.05),
          heat: 0.6 + Math.random() * 0.4,
          life: 0.7 + Math.random() * 0.6,
          age: 0,
          size: isBurst ? (6 + Math.random() * 14) : (4 + Math.random() * 8)
        });
      }

      // Update particles
      for(let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= 0.04 * dt; // slight upward drift for fire
        p.heat = Math.max(0, p.heat - dt * 0.8);
        if(p.age > p.life || p.heat <= 0) {
          particles.splice(i, 1);
        }
      }

      // Build GPU data arrays
      const count = particles.length;
      if(count > 0) {
        const posData  = new Float32Array(count * 2);
        const heatData = new Float32Array(count);
        const sizeData = new Float32Array(count);
        for(let i = 0; i < count; i++) {
          posData[i * 2]     = particles[i].x;
          posData[i * 2 + 1] = particles[i].y;
          heatData[i] = particles[i].heat;
          sizeData[i] = particles[i].size;
        }

        // Render to offscreen WebGL canvas
        gl.viewport(0, 0, fCanvas.width, fCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive blending

        gl.useProgram(prog);

        // Interleaved or separate? Use separate attribs via buffer re-bind trick
        const aPos  = gl.getAttribLocation(prog, 'a_pos');
        const aHeat = gl.getAttribLocation(prog, 'a_heat');
        const aSize = gl.getAttribLocation(prog, 'a_size');

        // Pack all data into a single interleaved buffer: [x, y, heat, size, ...]
        const interleaved = new Float32Array(count * 4);
        for(let i = 0; i < count; i++) {
          interleaved[i * 4]     = posData[i * 2];
          interleaved[i * 4 + 1] = posData[i * 2 + 1];
          interleaved[i * 4 + 2] = heatData[i];
          interleaved[i * 4 + 3] = sizeData[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.DYNAMIC_DRAW);

        const stride = 4 * 4; // 4 floats × 4 bytes
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos,  2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(aHeat);
        gl.vertexAttribPointer(aHeat, 1, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(aSize);
        gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 12);

        gl.drawArrays(gl.POINTS, 0, count);
      } else {
        // Clear with transparency when no particles
        gl.viewport(0, 0, fCanvas.width, fCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      // Composite onto game canvas
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'lighter';
      const half = drawSize / 2;
      targetCtx.drawImage(fCanvas, screen.x - half, screen.y - half, drawSize, drawSize);

      // Trail line for moving fireball
      if(!isBurst && effect.x1 != null && effect.y1 != null) {
        const tail = toScreen(effect.x1, effect.y1, playerX, playerY, viewCx, viewCy, tileSize);
        targetCtx.strokeStyle = 'rgba(255,160,60,0.28)';
        targetCtx.lineWidth = 5;
        targetCtx.lineCap = 'round';
        targetCtx.beginPath();
        targetCtx.moveTo(tail.x, tail.y);
        targetCtx.lineTo(screen.x, screen.y);
        targetCtx.stroke();
      }
      targetCtx.restore();
      return true;
    }

    function onPlayerMove(dx, dy, isRunning) {
      // #10: Slosh opposes direction of movement
      // Moving right (dx>0) → liquid shifts left (center < 0.5)
      // Moving left (dx<0) → liquid shifts right (center > 0.5)
      // Moving down (dy>0) → liquid shifts up (handled by wave phase offset)
      // Moving up (dy<0) → liquid shifts down
      const hSlosh = dx > 0 ? 0.28 : dx < 0 ? 0.72 : 0.5;
      const vSlosh = dy > 0 ? 0.35 : dy < 0 ? 0.65 : 0.5;
      const sloshedCenter = dx !== 0 ? hSlosh : vSlosh;
      energizeOrb('hp', isRunning ? 0.34 : 0.16, sloshedCenter);
      energizeOrb('mp', isRunning ? 0.16 : 0.08, sloshedCenter);
      return true;
    }

    function onPlayerDamage(amount) {
      energizeOrb('hp', 0.3 + amount * 0.035, 0.5 + (Math.random() - 0.5) * 0.35);
      return true;
    }

    function onCombatImpact(amount) {
      energizeOrb('hp', 0.14 + amount * 0.018, 0.5);
      return true;
    }

    function onManaUse(amount) {
      energizeOrb('mp', 0.3 + amount * 0.05, 0.62);
      return true;
    }

    function needsMapAnimation() {
      if(!state.active) return false;
      if(typeof activeEffects !== 'undefined' && activeEffects.some(eff => eff && eff.kind)) return true;
      if(currentScene === 'town') return true;
      if(window._eagleCragEntered) return true;
      // E16: Active bombs need per-frame animation for pulsing glow and countdown
      if(window._activeBombs && window._activeBombs.length > 0) return true;
      if(typeof theMap !== 'undefined' && typeof TILES !== 'undefined') {
        for(let y = 0; y < (theMap.length || 0); y++)
          for(let x = 0; x < ((theMap[y] || []).length || 0); x++)
            if(theMap[y][x] === TILES.PORTAL) return true;
      }
      return !!(typeof enemies !== 'undefined' && enemies.some(e => e && e.type === 'ifrit' && e.isIfrit));
    }

    // ── Portal Fluid Simulation (Navier-Stokes, ping-pong FBOs) ─────────────

    const SIM_W = 64;
    const SIM_H = 64;

    // Base vertex shader — reused for all fluid passes
    const portalBaseVS = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0, 1); }
    `;

    const portalAdvectFS = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_vel;
      uniform sampler2D u_src;
      uniform vec2 u_texelSize;
      uniform float u_dt;
      uniform float u_dissipation;
      void main() {
        vec2 vel = texture2D(u_vel, v_uv).xy;
        vec2 prevPos = v_uv - vel * u_dt;
        gl_FragColor = u_dissipation * texture2D(u_src, prevPos);
      }
    `;

    const portalDivergenceFS = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_vel;
      uniform vec2 u_texelSize;
      void main() {
        float L = texture2D(u_vel, v_uv - vec2(u_texelSize.x, 0.0)).x;
        float R = texture2D(u_vel, v_uv + vec2(u_texelSize.x, 0.0)).x;
        float T = texture2D(u_vel, v_uv + vec2(0.0, u_texelSize.y)).y;
        float B = texture2D(u_vel, v_uv - vec2(0.0, u_texelSize.y)).y;
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `;

    const portalPressureFS = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_pressure;
      uniform sampler2D u_divergence;
      uniform vec2 u_texelSize;
      void main() {
        float L = texture2D(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
        float R = texture2D(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
        float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
        float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
        float div = texture2D(u_divergence, v_uv).x;
        float p = (L + R + T + B - div) * 0.25;
        gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
      }
    `;

    const portalGradSubtractFS = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_pressure;
      uniform sampler2D u_vel;
      uniform vec2 u_texelSize;
      void main() {
        float L = texture2D(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
        float R = texture2D(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
        float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
        float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
        vec2 vel = texture2D(u_vel, v_uv).xy;
        vel -= 0.5 * vec2(R - L, T - B);
        gl_FragColor = vec4(vel, 0.0, 1.0);
      }
    `;

    const portalSplatFS = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_src;
      uniform vec2 u_point;
      uniform vec3 u_color;
      uniform float u_radius;
      void main() {
        vec2 diff = v_uv - u_point;
        float splat = exp(-dot(diff, diff) / u_radius);
        vec3 base = texture2D(u_src, v_uv).rgb;
        gl_FragColor = vec4(base + splat * u_color, 1.0);
      }
    `;

    const portalDisplayFS = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_dye;
      uniform float u_time;
      void main() {
        vec3 dye = texture2D(u_dye, v_uv).rgb;
        float brightness = length(dye);
        float hue = mod(u_time * 0.3 + v_uv.x * 2.0 + v_uv.y * 1.5, 1.0);
        vec3 c = abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0;
        vec3 rainbow = clamp(c, 0.0, 1.0);
        vec3 col = mix(vec3(0.02, 0.0, 0.08), rainbow, clamp(brightness * 2.5, 0.0, 1.0));
        float core = smoothstep(0.4, 1.2, brightness);
        col = mix(col, vec3(1.0), core * 0.4);
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function hsvToRgb(h, s, v) {
      let r, g, b;
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      switch(i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return [r, g, b];
    }

    function createPortalShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error('Portal shader compile: ' + (gl.getShaderInfoLog(shader) || ''));
      }
      return shader;
    }

    function createPortalProgram(gl, fs) {
      const prog = gl.createProgram();
      gl.attachShader(prog, createPortalShader(gl, gl.VERTEX_SHADER, portalBaseVS));
      gl.attachShader(prog, createPortalShader(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Portal program link: ' + (gl.getProgramInfoLog(prog) || ''));
      }
      return prog;
    }

    function createPortalFBO(gl, w, h, useFloat) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const type = useFloat ? gl.FLOAT : gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { tex, fbo };
    }

    function createPortalDoubleFBO(gl, w, h, useFloat) {
      const a = createPortalFBO(gl, w, h, useFloat);
      const b = createPortalFBO(gl, w, h, useFloat);
      return {
        read: a,
        write: b,
        swap() { const tmp = this.read; this.read = this.write; this.write = tmp; }
      };
    }

    function initPortalFluid() {
      try {
        const pCanvas = document.createElement('canvas');
        pCanvas.width = SIM_W;
        pCanvas.height = SIM_H;

        // Try WebGL2 first (supports RGBA16F FBOs natively), fall back to WebGL1
        let gl = pCanvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
        const isGL2 = !!gl;
        if(!gl) {
          gl = pCanvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true }) ||
               pCanvas.getContext('experimental-webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
        }
        if(!gl) { state.portal = { initialized: false }; return; }

        let useFloat = false;
        if(isGL2) {
          // WebGL2: RGBA16F is always renderable
          useFloat = true;
        } else {
          // WebGL1: try half_float first (widely supported), then float
          const halfExt = gl.getExtension('OES_texture_half_float');
          const floatExt = !halfExt && gl.getExtension('OES_texture_float');
          useFloat = !!(halfExt || floatExt);
        }

        const vel      = createPortalDoubleFBO(gl, SIM_W, SIM_H, useFloat);
        const pressure = createPortalDoubleFBO(gl, SIM_W, SIM_H, useFloat);
        const dye      = createPortalDoubleFBO(gl, SIM_W, SIM_H, useFloat);
        const diverge  = createPortalFBO(gl, SIM_W, SIM_H, useFloat);

        const programs = {
          advect:      createPortalProgram(gl, portalAdvectFS),
          divergence:  createPortalProgram(gl, portalDivergenceFS),
          pressure:    createPortalProgram(gl, portalPressureFS),
          gradSubtract:createPortalProgram(gl, portalGradSubtractFS),
          splat:       createPortalProgram(gl, portalSplatFS),
          display:     createPortalProgram(gl, portalDisplayFS),
        };

        // Fullscreen quad
        const quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        state.portal = {
          initialized: true,
          pCanvas, gl,
          vel, pressure, dye, diverge,
          programs, quadBuf,
          useFloat,
          lastSplat: 0,
          splatIdx: 0,
          castTime: window._portalCastTime || null
        };
        // Clear pending cast time
        window._portalCastTime = null;
      } catch(e) {
        console.warn('Portal fluid init failed:', e && e.message ? e.message : e);
        state.portal = { initialized: false };
      }
    }

    function portalRunProgram(pState, prog, srcTextures, destFBO, uniforms) {
      const gl = pState.gl;
      gl.useProgram(prog);

      // Bind the fullscreen quad
      gl.bindBuffer(gl.ARRAY_BUFFER, pState.quadBuf);
      const aPos = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // Bind source textures
      srcTextures.forEach((entry, idx) => {
        const loc = gl.getUniformLocation(prog, entry.name);
        gl.activeTexture(gl.TEXTURE0 + idx);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.uniform1i(loc, idx);
      });

      // Set uniform scalars/vectors
      if(uniforms) {
        Object.entries(uniforms).forEach(([name, val]) => {
          const loc = gl.getUniformLocation(prog, name);
          if(!loc && loc !== 0) return;
          if(typeof val === 'number') gl.uniform1f(loc, val);
          else if(val.length === 2) gl.uniform2f(loc, val[0], val[1]);
          else if(val.length === 3) gl.uniform3f(loc, val[0], val[1], val[2]);
        });
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, destFBO);
      gl.viewport(0, 0, SIM_W, SIM_H);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function portalAddSplat(pState, sx, sy, color, vel) {
      const ts = [1.0 / SIM_W, 1.0 / SIM_H];
      const gl = pState.gl;
      const prog = pState.programs.splat;

      // Splat velocity
      portalRunProgram(pState, prog,
        [{ name: 'u_src', tex: pState.vel.read.tex }],
        pState.vel.write.fbo,
        { u_point: [sx, sy], u_color: [vel[0], vel[1], 0], u_radius: 0.002, u_texelSize: ts }
      );
      pState.vel.swap();

      // Splat dye
      portalRunProgram(pState, prog,
        [{ name: 'u_src', tex: pState.dye.read.tex }],
        pState.dye.write.fbo,
        { u_point: [sx, sy], u_color: color, u_radius: 0.004, u_texelSize: ts }
      );
      pState.dye.swap();
    }

    function portalStepSim(pState, dt) {
      const ts = [1.0 / SIM_W, 1.0 / SIM_H];
      const p = pState.programs;

      // Advect velocity
      portalRunProgram(pState, p.advect,
        [{ name: 'u_vel', tex: pState.vel.read.tex }, { name: 'u_src', tex: pState.vel.read.tex }],
        pState.vel.write.fbo,
        { u_texelSize: ts, u_dt: dt, u_dissipation: 0.98 }
      );
      pState.vel.swap();

      // Compute divergence
      portalRunProgram(pState, p.divergence,
        [{ name: 'u_vel', tex: pState.vel.read.tex }],
        pState.diverge.fbo,
        { u_texelSize: ts }
      );

      // Pressure solve — 15 Jacobi iterations
      for(let i = 0; i < 15; i++) {
        portalRunProgram(pState, p.pressure,
          [{ name: 'u_pressure', tex: pState.pressure.read.tex }, { name: 'u_divergence', tex: pState.diverge.tex }],
          pState.pressure.write.fbo,
          { u_texelSize: ts }
        );
        pState.pressure.swap();
      }

      // Subtract pressure gradient from velocity
      portalRunProgram(pState, p.gradSubtract,
        [{ name: 'u_pressure', tex: pState.pressure.read.tex }, { name: 'u_vel', tex: pState.vel.read.tex }],
        pState.vel.write.fbo,
        { u_texelSize: ts }
      );
      pState.vel.swap();

      // Advect dye
      portalRunProgram(pState, p.advect,
        [{ name: 'u_vel', tex: pState.vel.read.tex }, { name: 'u_src', tex: pState.dye.read.tex }],
        pState.dye.write.fbo,
        { u_texelSize: ts, u_dt: dt, u_dissipation: 0.995 }
      );
      pState.dye.swap();
    }

    function drawPortalFluid(ctx, px, py, tileSize, animNow) {
      // Initialize fluid sim on first call
      if(!state.portal || !state.portal.initialized) {
        initPortalFluid();
        if(!state.portal || !state.portal.initialized) return false;
      }

      const pState = state.portal;
      const gl = pState.gl;
      const ts = [1.0 / SIM_W, 1.0 / SIM_H];

      // Step the simulation
      portalStepSim(pState, 0.016);

      // Auto-splat: inject a new colored splat every 0.4s
      if(animNow - pState.lastSplat > 400) {
        pState.lastSplat = animNow;
        const si = pState.splatIdx;
        const angle = (animNow * 0.001 * 0.8) + si * (Math.PI * 2 / 6);
        const r = 0.25 + Math.sin(si * 1.3) * 0.15;
        const sx = 0.5 + Math.cos(angle) * r;
        const sy = 0.5 + Math.sin(angle) * r;
        const hue = (si * 0.17) % 1.0;
        const color = hsvToRgb(hue, 1.0, 1.0);
        const vel = [Math.cos(angle + 0.5) * 0.002, Math.sin(angle + 0.5) * 0.002];
        portalAddSplat(pState, sx, sy, color, vel);
        pState.splatIdx++;
      }

      // Render dye to the sim canvas via display shader
      gl.useProgram(pState.programs.display);
      gl.bindBuffer(gl.ARRAY_BUFFER, pState.quadBuf);
      const aPos = gl.getAttribLocation(pState.programs.display, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pState.dye.read.tex);
      gl.uniform1i(gl.getUniformLocation(pState.programs.display, 'u_dye'), 0);
      gl.uniform1f(gl.getUniformLocation(pState.programs.display, 'u_time'), animNow * 0.001);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, SIM_W, SIM_H);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Composite the fluid canvas onto the game ctx, clipped to tile square
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, tileSize, tileSize);
      ctx.clip();
      ctx.drawImage(pState.pCanvas, px, py, tileSize, tileSize);
      ctx.restore();

      // Overlay swirl emoji (semi-transparent so fluid shows through) — spin at 30 RPM
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = px + tileSize / 2, cy = py + tileSize / 2;
      ctx.translate(cx, cy);
      ctx.rotate(animNow * 0.001 * Math.PI); // 30 RPM = π rad/s
      ctx.fillText('🌀', 0, 0);
      ctx.restore();

      // Pulsing outer glow ring
      const cx2 = px + tileSize / 2;
      const cy2 = py + tileSize / 2;
      const r = tileSize / 2;
      const glow = ctx.createRadialGradient(cx2, cy2, r * 0.7, cx2, cy2, r * 1.4);
      glow.addColorStop(0, 'rgba(180,0,255,0)');
      glow.addColorStop(0.5, `rgba(120,0,255,${0.25 + 0.15 * Math.sin(animNow * 0.004)})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.fillStyle = glow;
      ctx.fillRect(px - 8, py - 8, tileSize + 16, tileSize + 16);
      ctx.restore();

      return true;
    }

    function drawPortalCastEffect(ctx, px, py, ts, animNow) {
      if(!state.portal || !state.portal.castTime) return false;
      const age = animNow - state.portal.castTime;
      if(age > 1500) return false;
      const t = age / 1500;
      const cx2 = px + ts / 2, cy2 = py + ts / 2;

      // Expanding ring
      const maxR = ts * 3;
      const r = maxR * t;
      const alpha = (1 - t) * 0.8;
      ctx.save();
      ctx.strokeStyle = `hsla(${(animNow * 0.3) % 360}, 100%, 70%, ${alpha})`;
      ctx.lineWidth = 3 * (1 - t);
      ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.stroke();

      // Second ring (delayed)
      if(t > 0.2) {
        const r2 = maxR * (t - 0.2) / 0.8;
        ctx.strokeStyle = `hsla(${((animNow * 0.3) + 120) % 360}, 100%, 70%, ${(1 - (t - 0.2) / 0.8) * 0.6})`;
        ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI * 2); ctx.stroke();
      }

      // Spiral particles
      for(let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + t * Math.PI * 4;
        const pr = r * 0.7;
        const px2 = cx2 + Math.cos(angle) * pr;
        const py2 = cy2 + Math.sin(angle) * pr;
        ctx.fillStyle = `hsla(${(i * 30 + animNow * 0.2) % 360}, 100%, 80%, ${alpha})`;
        ctx.beginPath(); ctx.arc(px2, py2, 3 * (1 - t) + 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return true;
    }

    installOrbHooks();

    return {
      start: ensureStarted,
      enabled: function() { return !!state.active; },
      state,
      drawOrb,
      drawGrassUnderlay,
      drawIfritAura,
      drawChainLightning,
      drawFireballEffect,
      drawIcebeamEffect,
      drawGoldCoinsEffect,
      drawPortalFluid,
      drawPortalCastEffect,
      onPlayerMove,
      onPlayerDamage,
      onCombatImpact,
      onManaUse,
      needsMapAnimation,
      energizeOrb
    };
  })();
