  // === Audio Synthesizer (FM / OPL style) ===
  /*
    AUDIO ENGINE – WEB AUDIO API
    ============================
    This module implements a hybrid audio system:
    1. FM (Frequency Modulation) synthesis for music and sound effects,
       inspired by vintage OPL (Yamaha YM3812) chips.
    2. Sample playback for pre‑loaded audio buffers (v6.2.0).

    The Sound object provides a simple API for game sound effects and
    music sequencing. All audio is generated programmatically, requiring
    no external assets except for optional samples.
  */
  // Main audio namespace – all public methods are attached here.
  const Sound = {
    ctx: null,
    tracks: {},
    currentTrack: null,
    musicTimer: null,
    resumeAttempted: false,

    voiceAudio: null,
    _savedMusicVolume: null,
    MUSIC_VOLUME: 0.11,
    _fmGainNode: null,
    _crossfadeTimer: null,

    /*
      Initializes the Web Audio context. Called automatically before any sound plays.
      Falls back gracefully if the browser doesn't support Web Audio API.
    */
    init: () => {
      if(!Sound.ctx && (window.AudioContext || window.webkitAudioContext)) {
        try {
          Sound.ctx = new (window.AudioContext || window.webkitAudioContext)();
          Sound.resumeAttempted = false;
          if (Sound.ctx.state === 'suspended') {
            Sound.ctx.resume().catch(() => {});
          }
        }
        catch(e) { Sound.ctx = 'failed'; }
      }
    },
    ensureAudioContext: () => {
      if (!Sound.ctx || Sound.ctx === 'failed') {
        Sound.ctx = null;
        Sound.init();
        if (!Sound.ctx || Sound.ctx === 'failed') return false;
      }
      if (Sound.ctx.state === 'suspended') {
        Sound.resumeAttempted = true;
        Sound.ctx.resume().then(() => {
          console.log('Audio context resumed successfully');
        }).catch((e) => {
          console.error('Failed to resume audio context:', e);
          Sound.resumeAttempted = false;
        });
      }
      return true;
    },

    /*
      FM (Frequency Modulation) Operator – The core of OPL‑style synthesis.
      Creates two oscillators: a carrier and a modulator. The modulator's
      output is connected to the carrier's frequency, producing rich,
      harmonic‑rich tones characteristic of vintage game soundcards.
      Parameters:
        freq: carrier frequency (Hz)
        duration: note length (seconds)
        vol: amplitude (0‑1)
        ratio: modulator frequency multiplier (typical: 2)
        modulatorIndex: modulation depth (higher = more harmonics)
    */
    playFM: (freq, duration, vol=0.1, ratio=2, modulatorIndex=5) => {
      if(!Sound.ensureAudioContext()) return;
      if(window.gameSettings && !window.gameSettings.music) return;
      const t = Sound.ctx.currentTime;
      
      const carrier = Sound.ctx.createOscillator();
      const modulator = Sound.ctx.createOscillator();
      const modGain = Sound.ctx.createGain();
      const mainGain = Sound.ctx.createGain();

      carrier.frequency.value = freq;
      modulator.frequency.value = freq * ratio;
      modGain.gain.value = freq * modulatorIndex;

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(mainGain);
      mainGain.connect(Sound.ctx.destination);

      mainGain.gain.setValueAtTime(0, t);
      mainGain.gain.linearRampToValueAtTime(vol, t + 0.05);
      mainGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

      carrier.start(t); modulator.start(t);
      carrier.stop(t + duration); modulator.stop(t + duration);
    },

    /*
      Play a pre‑loaded sample from the assets.sounds dictionary.
      Used for sound effects that have been loaded from external files
      (e.g., sword swing, monster grunt). Falls back silently if the
      sample is missing or the audio context is unavailable.
    */
    playSample: (name, vol=0.2, opts={}) => {
      if(!assets.sounds[name]) return null;
      if(window.gameSettings && !window.gameSettings.sfx) return null;
      const sample = assets.sounds[name];
      // Zero-byte / invalid MP3 fallback
      if(typeof sample === 'string' && sample.length < 50) return null;
      try {
        if(typeof sample === 'string' && sample.startsWith('data:audio')) {
          const audio = new Audio(sample);
          audio.volume = vol;
          audio.loop = !!opts.loop;
          audio.play().catch(() => {});
          return audio;
        }
        if(!Sound.ensureAudioContext()) return null;
        const source = Sound.ctx.createBufferSource();
        const gain = Sound.ctx.createGain();
        source.buffer = sample;
        source.loop = !!opts.loop;
        source.connect(gain);
        gain.connect(Sound.ctx.destination);
        gain.gain.value = vol;
        source.start(0);
        return source;
      } catch(e) { console.error("Sample error:", e); return null; }
    },

    // B11 FIX: Dennis voice files boosted by 200% (volume=2.0) via ffmpeg.
    // Files boosted: voice_dennis_advice.mp3, voice_dennis_animals_furious.mp3,
    //   voice_dennis_animals_worried.mp3, voice_dennis_government.mp3,
    //   voice_dennis_greeting.mp3, voice_dennis_weapons.mp3
    // All files are in sounds/generated/voices/dennis/
    playVoice: (name, vol=0.9) => {
      if(window.gameSettings && !window.gameSettings.sfx) return null;
      Sound.stopVoice();
      const audio = Sound.playSample(name, vol, { loop: false });
      Sound.voiceAudio = audio || null;
      // Reduce music volume during dialog (25% of normal)
      if(audio) {
        Sound._savedMusicVolume = null;
        Sound._lowerMusicVolume();
        // Restore volume when voice clip ends
        if(typeof audio.addEventListener === 'function') {
          audio.addEventListener('ended', () => { Sound._restoreMusicVolume(); });
        }
      }
      return audio;
    },

    stopVoice: () => {
      if(Sound.voiceAudio) {
        try {
          if(typeof Sound.voiceAudio.pause === 'function') {
            Sound.voiceAudio.pause();
            Sound.voiceAudio.currentTime = 0;
          } else if(typeof Sound.voiceAudio.stop === 'function') {
            Sound.voiceAudio.stop();
          }
        } catch(e) {}
      }
      Sound.voiceAudio = null;
      Sound._restoreMusicVolume();
    },

    _lowerMusicVolume: () => {
      if(Sound.currentMusicAudio) {
        const cur = Sound.currentMusicAudio.volume;
        Sound._savedMusicVolume = (cur && cur > 0.02) ? cur : Sound.MUSIC_VOLUME;
        Sound.currentMusicAudio.volume = Sound._savedMusicVolume * 0.25;
      }
      if(Sound._fmGainNode) {
        Sound._savedMusicVolume = Sound._fmGainNode.gain.value;
        Sound._fmGainNode.gain.setValueAtTime(Sound._savedMusicVolume * 0.25, Sound.ctx.currentTime);
      }
    },

    _restoreMusicVolume: () => {
      if(Sound._savedMusicVolume !== null && Sound._savedMusicVolume !== undefined) {
        if(Sound.currentMusicAudio) {
          Sound.currentMusicAudio.volume = Sound._savedMusicVolume;
        }
        if(Sound._fmGainNode) {
          Sound._fmGainNode.gain.setValueAtTime(Sound._savedMusicVolume, Sound.ctx.currentTime);
        }
        Sound._savedMusicVolume = null;
      }
    },

    _playLoopingMusicSample: (name, vol=0.22) => {
      if(window.gameSettings && !window.gameSettings.music) return false;
      // Check for exact key first, then try common aliases
      const aliases = { monkey: 'pirate', lechuck: 'pirate', leftys: 'pirate' };
      const resolvedName = aliases[name] || name;
      const sampleKey = `music_${resolvedName}`;
      if(!assets.sounds[sampleKey] || typeof assets.sounds[sampleKey] !== 'string') return false;
      const audio = new Audio(assets.sounds[sampleKey]);
      audio.loop = true;
      audio.volume = vol;
      audio.play().catch(() => {});
      Sound.currentMusicAudio = audio;
      return true;
    },

    /*
      Convenience sound‑effect methods.
      Each method attempts to play a pre‑loaded sample; if the sample is missing,
      it falls back to a synthesized tone using playTone().
      These are used throughout the game code for auditory feedback.
    */
    step: () => {
      // B31 FIX: Use footstep.mp3 buffer if loaded (higher quality than FM fallback)
      if (window._footstepBuffer && Sound.ctx) {
        try {
          const src = Sound.ctx.createBufferSource();
          src.buffer = window._footstepBuffer;
          const gain = Sound.ctx.createGain();
          gain.gain.value = 0.6;
          src.connect(gain);
          gain.connect(Sound.ctx.destination);
          src.start(0);
          return;
        } catch(e) {}
      }
      Sound.playSample('step', 0.35) || Sound.playTone(150, 'square', 0.05, 0.2, 50);
    },
    grunt: () => Sound.playSample('grunt', 0.35) || Sound.playTone(200, 'triangle', 0.2, 0.2, 80),
    scream: () => Sound.playSample('scream', 0.45) || Sound.playTone(400, 'sawtooth', 0.6, 0.3, 50),
    clink: () => Sound.playSample('clink', 0.4) || Sound.playTone(1200, 'sine', 0.1, 0.1, 2000),
    sword: () => { if(Sound.playSample('sword', 0.35)) return; 
      Sound.playTone(400, 'square', 0.1, 0.2, 1200); 
      setTimeout(() => Sound.playTone(800, 'triangle', 0.05, 0.1, 200), 50);
    },
    splash: () => Sound.playSample('splash', 0.35) || Sound.playTone(100, 'triangle', 0.2, 0.2, 40),
    quack: () => { if(Sound.playSample('quack', 0.45)) return; 
      Sound.playTone(400, 'sawtooth', 0.1, 0.1, 600); 
      setTimeout(() => Sound.playTone(400, 'sawtooth', 0.1, 0.1, 600), 120); 
    },
    moo: () => Sound.playSample('moo', 0.42) || (Sound.playTone(110, 'sawtooth', 0.18, 0.16, 95), setTimeout(() => Sound.playTone(95, 'triangle', 0.14, 0.15, 80), 120)),
    oink: () => Sound.playSample('oink', 0.4) || (Sound.playTone(180, 'square', 0.11, 0.08, 220), setTimeout(() => Sound.playTone(150, 'sawtooth', 0.09, 0.08, 200), 80)),
    cluck: () => Sound.playSample('cluck', 0.4) || (Sound.playTone(520, 'triangle', 0.08, 0.06, 820), setTimeout(() => Sound.playTone(420, 'triangle', 0.08, 0.06, 700), 60)),
    baa: () => Sound.playSample('baa', 0.4) || (Sound.playTone(240, 'sawtooth', 0.12, 0.12, 260), setTimeout(() => Sound.playTone(200, 'triangle', 0.09, 0.12, 220), 90)),
    honk: () => Sound.playSample('honk', 0.42) || (Sound.playTone(340, 'square', 0.14, 0.1, 500), setTimeout(() => Sound.playTone(300, 'sawtooth', 0.11, 0.08, 450), 85)),
    bray: () => Sound.playSample('bray', 0.42) || (Sound.playTone(260, 'sawtooth', 0.12, 0.12, 300), setTimeout(() => Sound.playTone(360, 'square', 0.08, 0.1, 360), 140)),
    squeak: () => Sound.playSample('squeak', 0.25) || Sound.playTone(1800, 'sine', 0.05, 0.1, 2000),
    gurgle: () => { for(let i=0; i<4; i++) setTimeout(() => Sound.playTone(100 + Math.random()*100, 'sine', 0.2, 0.1, 50), i*150); },
    oof: () => Sound.playSample('oof', 0.35) || Sound.playTone(120, 'sawtooth', 0.1, 0.2, 60),
    snore: () => Sound.playSample('snore', 0.35) || Sound.playTone(60, 'sawtooth', 0.8, 0.1, 40),
    fanfare: () => Sound.playSample('fanfare', 0.5) || Sound.playTone(523, 'sine', 0.3, 0.1, 1047),
    gibberish: () => {
      // Apu's characteristic Indian-accent gibberish sound
      [0,1,2,3].forEach(i => setTimeout(() => Sound.playTone(300 + Math.random()*400, 'sine', 0.1, 0.08, 200 + Math.random()*400), i*90));
    },

    // ── BACKFILLED SOUND EFFECTS ──
    // These were missing moments in the game that deserved audio feedback.
    // All synthesized — no external assets required.

    // Fireball: whoosh rising into a crackle
    fireball: () => {
      Sound.playTone(200, 'sawtooth', 0.3, 0.15, 800);
      setTimeout(() => Sound.playTone(100, 'square', 0.15, 0.1, 50), 200);
      setTimeout(() => {
        for(let i=0; i<3; i++) setTimeout(() => Sound.playTone(600+Math.random()*400, 'sawtooth', 0.05, 0.06), i*40);
      }, 300);
    },

    // Achievement unlocked: bright ascending fanfare (3 notes)
    achieve: () => {
      if(Sound.playSample('achieve', 0.45)) return;
      Sound.playTone(523, 'sine', 0.15, 0.12);           // C5
      setTimeout(() => Sound.playTone(659, 'sine', 0.15, 0.12), 120);  // E5
      setTimeout(() => Sound.playTone(784, 'sine', 0.3, 0.15), 240);   // G5 (held)
    },

    // Quest advance: page-turn / parchment rustle
    questAdvance: () => {
      for(let i=0; i<5; i++) {
        setTimeout(() => Sound.playTone(2000+Math.random()*2000, 'sawtooth', 0.02, 0.04), i*25);
      }
      setTimeout(() => Sound.playTone(800, 'sine', 0.1, 0.06, 1200), 100);
    },

    // Chest open: creak then clink
    chestOpen: () => {
      if(Sound.playSample('chest_open', 0.35)) return;
      Sound.playTone(80, 'sawtooth', 0.2, 0.1, 120);
      setTimeout(() => Sound.playTone(60, 'triangle', 0.15, 0.08, 100), 100);
      setTimeout(() => Sound.playTone(1200, 'sine', 0.1, 0.1, 2000), 250);
    },

    // Secret wall: stone grinding rumble
    stoneGrind: () => {
      if(Sound.playSample('stone_grind', 0.35)) return;
      Sound.playTone(60, 'sawtooth', 0.4, 0.15, 40);
      Sound.playTone(80, 'square', 0.3, 0.08, 50);
      setTimeout(() => Sound.playTone(100, 'triangle', 0.2, 0.1, 60), 200);
    },

    // Shark bite: heavy underwater crunch
    sharkBite: () => {
      if(Sound.playSample('shark_bite', 0.4)) return;
      Sound.playTone(150, 'square', 0.1, 0.2, 50);
      setTimeout(() => Sound.playTone(80, 'sawtooth', 0.15, 0.15, 30), 80);
      setTimeout(() => Sound.playTone(200, 'triangle', 0.3, 0.1, 40), 120);
    },

    // Laugh: descending staccato (Duck Hunt dog)
    laugh: () => {
      if(Sound.playSample('laugh', 0.35)) return;
      [0,1,2,3,4].forEach(i => {
        setTimeout(() => Sound.playTone(600 - i*60, 'sine', 0.08, 0.1), i*100);
      });
    },

    // Rocket launch: rising noise burst (Astrochicken)
    rocketLaunch: () => {
      if(Sound.playSample('rocket_launch', 0.35)) return;
      Sound.playTone(80, 'sawtooth', 0.5, 0.12, 1200);
      setTimeout(() => Sound.playTone(200, 'square', 0.3, 0.08, 2000), 150);
    },

    // Explosion: impact + decay (Astrochicken fail / grenade)
    explosion: () => {
      if(Sound.playSample('explosion', 0.45)) return;
      Sound.playTone(80, 'sawtooth', 0.3, 0.2, 20);
      Sound.playTone(120, 'square', 0.2, 0.15, 30);
      for(let i=0; i<6; i++) {
        setTimeout(() => Sound.playTone(50+Math.random()*100, 'sawtooth', 0.05, 0.06+Math.random()*0.04), i*50);
      }
    },

    // Insult clash: sword ring + crowd murmur
    insultClash: () => {
      if(Sound.playSample('insult_clash', 0.35)) return;
      Sound.playTone(600, 'square', 0.08, 0.15, 1800);
      setTimeout(() => Sound.playTone(900, 'triangle', 0.06, 0.1, 400), 60);
      setTimeout(() => {
        for(let i=0; i<3; i++) setTimeout(() => Sound.playTone(200+Math.random()*200, 'sine', 0.15, 0.03), i*80);
      }, 150);
    },

    // Grog: pour + sizzle (caustic grog burns through things)
    grogPour: () => {
      if(Sound.playSample('grog_pour', 0.35)) return;
      Sound.playTone(300, 'triangle', 0.3, 0.08, 100);
      setTimeout(() => {
        for(let i=0; i<8; i++) setTimeout(() => Sound.playTone(3000+Math.random()*3000, 'sawtooth', 0.02, 0.03), i*30);
      }, 200);
    },

    polka: () => {
      if(Sound._polkaTimer) clearTimeout(Sound._polkaTimer);
      const melody = [392, 440, 494, 523, 494, 440, 392, 330, 349, 392, 440, 392, 330, 294, 330, 349];
      const bass = [196, 0, 196, 0, 220, 0, 196, 0, 175, 0, 196, 0, 165, 0, 196, 0];
      const beatMs = 640;
      melody.forEach((freq, idx) => {
        setTimeout(() => {
          Sound.playFM(freq, 0.42, 0.03, 2.1, 5);
          if(bass[idx] > 0) Sound.playFM(bass[idx], 0.35, 0.04, 1.01, 2.2);
          if(idx % 2 === 1) Sound.playTone(110 + idx * 8, 'square', 0.05, 0.025, 90);
        }, idx * beatMs);
      });
      Sound._polkaTimer = setTimeout(() => { Sound._polkaTimer = null; }, melody.length * beatMs + 50);
    },

    // Machine: mechanical clunk + whirr (Atlantean machines)
    machine: () => {
      if(Sound.playSample('machine', 0.35)) return;
      Sound.playTone(100, 'square', 0.05, 0.15);
      setTimeout(() => Sound.playTone(80, 'sawtooth', 0.05, 0.12), 80);
      setTimeout(() => Sound.playTone(200, 'triangle', 0.4, 0.06, 400), 150);
      setTimeout(() => Sound.playTone(300, 'sine', 0.3, 0.04, 500), 250);
    },

    errorBuzz: () => Sound.playSample('error_buzz', 0.35) || Sound.playTone(150, 'sawtooth', 0.3, 0.1),

    // E15: T-Rex sounds — FM-synthesized deep roar and ground-shaking stomp
    trexRoar: function() {
      if(!Sound.ctx) return;
      const ctx = Sound.ctx;
      // Deep, low roar using oscillator cascade
      [80, 60, 45].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq*0.5, ctx.currentTime + 0.8);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.4 - i*0.1, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i*0.05);
        osc.stop(ctx.currentTime + 1.2);
      });
    },
    trexStomp: function() {
      if(!Sound.ctx) return;
      const ctx = Sound.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/data.length, 3) * 0.8;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain(); gain.gain.value = 1.0;
      src.connect(gain); gain.connect(ctx.destination); src.start();
    },

    /*
      Simple tone generator – creates a single oscillator with optional frequency slide.
      Used as a fallback for missing samples and for simple beeps/effects.
      Parameters:
        freq: starting frequency (Hz)
        type: oscillator waveform ('sine', 'square', 'sawtooth', 'triangle')
        duration: length in seconds
        vol: amplitude (0‑1)
        slideFreq: if provided, the frequency slides exponentially to this value.
    */
    playTone: (freq, type, duration, vol=0.1, slideFreq=null) => {
      if(!Sound.ensureAudioContext()) return;
      // Respect SFX setting
      if(window.gameSettings && !window.gameSettings.sfx) return;
      const osc = Sound.ctx.createOscillator();
      const gain = Sound.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, Sound.ctx.currentTime);
      if(slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, Sound.ctx.currentTime + duration);
      gain.gain.setValueAtTime(vol, Sound.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, Sound.ctx.currentTime + duration);
      osc.connect(gain); gain.connect(Sound.ctx.destination);
      osc.start(); osc.stop(Sound.ctx.currentTime + duration);
    },

    /*
      Music sequencer – plays a JSON‑defined track using FM synthesis.
      The track is an array of note objects: { f: frequency, d: duration, r: ratio, i: index }.
      The sequencer steps through the track recursively using setTimeout,
      allowing real‑time music playback that can be interrupted at any time.
    */
    playMusic: (name) => {
      if(Sound.currentTrack === name) return;
      if(window.gameSettings && !window.gameSettings.music) {
        Sound.currentTrack = name;
        return;
      }
      // Crossfade: fade out old track over 5 seconds while fading in new
      const oldAudio = Sound.currentMusicAudio;
      const oldTimer = Sound.musicTimer;
      Sound.currentTrack = name;
      if(Sound.musicTimer) clearTimeout(Sound.musicTimer);
      Sound.musicTimer = null;

      if(oldAudio) {
        // Fade out old audio over 5 seconds
        try {
          const startVol = oldAudio.volume || Sound.MUSIC_VOLUME;
          const steps = 50;
          const interval = 100; // 50 * 100ms = 5s
          let step = 0;
          const fadeOut = setInterval(() => {
            step++;
            if(step >= steps) {
              clearInterval(fadeOut);
              try {
                if(typeof oldAudio.pause === 'function') { oldAudio.pause(); oldAudio.currentTime = 0; }
                else if(typeof oldAudio.stop === 'function') oldAudio.stop();
              } catch(e) {}
              return;
            }
            oldAudio.volume = startVol * (1 - step / steps);
          }, interval);
        } catch(e) {
          try { if(typeof oldAudio.pause === 'function') oldAudio.pause(); else if(typeof oldAudio.stop === 'function') oldAudio.stop(); } catch(e2) {}
        }
      }
      Sound.currentMusicAudio = null;

      // Try sample path with fade-in
      const aliases2 = { monkey: 'pirate', lechuck: 'pirate', leftys: 'pirate', fields: 'tristram' };
      const resolvedName2 = aliases2[name] || name;
      const sampleKey2 = `music_${resolvedName2}`;
      if(window.assets && window.assets.sounds[sampleKey2] && typeof window.assets.sounds[sampleKey2] === 'string') {
        const audio = new Audio(window.assets.sounds[sampleKey2]);
        audio.loop = true;
        audio.volume = 0;
        audio.play().catch(() => {});
        Sound.currentMusicAudio = audio;
        // Fade in over 5 seconds
        const targetVol = Sound.MUSIC_VOLUME;
        const steps2 = 50;
        let step2 = 0;
        const fadeIn = setInterval(() => {
          step2++;
          if(step2 >= steps2) { clearInterval(fadeIn); audio.volume = targetVol; return; }
          audio.volume = targetVol * (step2 / steps2);
        }, 100);
        return;
      }
       
      const track = Sound.tracks[name];
      if(!track) return;

      // FM sequencer path
      if(!Sound.ensureAudioContext()) return;
      const fmGain = Sound.ctx.createGain();
      fmGain.gain.value = 0;
      fmGain.connect(Sound.ctx.destination);
      Sound._fmGainNode = fmGain;
      // Fade in FM over 5 seconds
      const fmSteps = 50;
      let fmStep = 0;
      const fmFadeIn = setInterval(() => {
        fmStep++;
        if(fmStep >= fmSteps) { clearInterval(fmFadeIn); fmGain.gain.value = 0.5; return; }
        fmGain.gain.setValueAtTime((fmStep / fmSteps) * 0.5, Sound.ctx.currentTime);
      }, 100);

      let step3 = 0;
      const nextNote = () => {
        if(Sound.currentTrack !== name) return;
        const note = track[step3];
        if(note.f > 0) {
          const carrier = Sound.ctx.createOscillator();
          const modulator = Sound.ctx.createOscillator();
          const modGain = Sound.ctx.createGain();
          const noteGain = Sound.ctx.createGain();
          const t2 = Sound.ctx.currentTime;
          carrier.frequency.value = note.f;
          modulator.frequency.value = note.f * (note.r || 2);
          modGain.gain.value = note.f * (note.i || 5);
          modulator.connect(modGain);
          modGain.connect(carrier.frequency);
          carrier.connect(noteGain);
          noteGain.connect(fmGain);
          noteGain.gain.setValueAtTime(0, t2);
          noteGain.gain.linearRampToValueAtTime(0.02, t2 + 0.05);
          noteGain.gain.exponentialRampToValueAtTime(0.01, t2 + note.d);
          carrier.start(t2); modulator.start(t2);
          carrier.stop(t2 + note.d); modulator.stop(t2 + note.d);
        }
        step3 = (step3 + 1) % track.length;
        Sound.musicTimer = setTimeout(nextNote, note.d * 1000);
      };
      nextNote();
    },

    // Stops the currently playing music track and clears the sequencer timer.
    stopMusic: () => {
      Sound.currentTrack = null;
      if(Sound.musicTimer) clearTimeout(Sound.musicTimer);
      Sound.musicTimer = null;
      if(Sound._crossfadeTimer) { clearInterval(Sound._crossfadeTimer); Sound._crossfadeTimer = null; }

      if(Sound.currentMusicAudio) {
        try {
          if(typeof Sound.currentMusicAudio.pause === 'function') {
            Sound.currentMusicAudio.pause();
            Sound.currentMusicAudio.currentTime = 0;
          }
        } catch(e) {}
      }
      Sound.currentMusicAudio = null;
      if(Sound._fmGainNode) {
        try { Sound._fmGainNode.disconnect(); } catch(e) {}
        Sound._fmGainNode = null;
      }
      Sound._savedMusicVolume = null;
    },

    // ── AMBIENT AUDIO SYSTEM ──
    // Scene-based looping ambient sound.
    // Uses real OGG/MP3 files embedded in roguelike_assets.dat when available.
    // Falls back to synthesized ambience if no file exists.
    //
    // LESSON: Ambient sound is a LAYER, not a music track. It should:
    //   - Loop seamlessly with no audible click
    //   - Be low enough in volume not to compete with music or SFX
    //   - Change when the scene changes (dungeon drips → beach waves → forest birds)
    //   - Be interruptible immediately (player should hear SFX clearly)
    ambientNode: null,
    ambientGain: null,
    currentAmbient: null,

    playAmbient: (sceneName) => {
      if(Sound.currentAmbient === sceneName) return;
      Sound.stopAmbient();
      Sound.currentAmbient = sceneName;
      if(!Sound.ensureAudioContext()) return;

      // Try to load from assets
      let assetKey = `ambient_${sceneName}`;
      if(window.assets && window.assets.sounds && window.assets.sounds[assetKey]) {
        let b64 = window.assets.sounds[assetKey];
        // Decode base64 data URI and play as buffer
        Sound._playAmbientBuffer(b64, sceneName);
        return;
      }

      // Synthesized fallback per scene
      Sound._synthAmbient(sceneName);
    },

    _playAmbientBuffer: (dataURI, sceneName) => {
      // Decode the data URI and play as a looping AudioBuffer
      let b64 = dataURI.split(',')[1];
      let binary = atob(b64);
      let bytes = new Uint8Array(binary.length);
      for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      Sound.ctx.decodeAudioData(bytes.buffer, (buffer) => {
        if(Sound.currentAmbient !== sceneName) return; // Scene changed during decode
        let source = Sound.ctx.createBufferSource();
        let gain = Sound.ctx.createGain();
        gain.gain.value = 0.18;
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        gain.connect(Sound.ctx.destination);
        source.start();
        Sound.ambientNode = source;
        Sound.ambientGain = gain;
      }, (err) => {
        // Decode failed — fall back to synth
        Sound._synthAmbient(sceneName);
      });
    },

    _synthAmbient: (sceneName) => {
      // Synthesized ambient loops using slow random tones
      // Different character per scene
      if(!Sound.ensureAudioContext()) return;
      let ambientInterval;

      const scheduleAmbientTone = () => {
        if(Sound.currentAmbient !== sceneName) { clearInterval(ambientInterval); return; }
        switch(sceneName) {
          case 'dungeon':
            // Distant drips and low rumbles
            if(Math.random() < 0.3) Sound.playTone(60 + Math.random()*40, 'triangle', 1.5, 0.03, 40);
            if(Math.random() < 0.15) Sound.playTone(800 + Math.random()*400, 'sine', 0.1, 0.02); // drip
            break;
          case 'beach':
            // Gentle whooshes
            Sound.playTone(80 + Math.random()*40, 'triangle', 2.0, 0.03, 60 + Math.random()*20);
            break;
          case 'forest':
            // High, soft chirps
            if(Math.random() < 0.4) Sound.playTone(1200 + Math.random()*600, 'sine', 0.15, 0.015);
            break;
          case 'desert':
            // Low wind moan
            Sound.playTone(50 + Math.random()*30, 'sawtooth', 3.0, 0.02, 40 + Math.random()*20);
            break;
        }
      };

      ambientInterval = setInterval(scheduleAmbientTone, 2500);
      Sound.ambientNode = { _interval: ambientInterval }; // store ref for cleanup
    },

    stopAmbient: () => {
      Sound.currentAmbient = null;
      if(Sound.ambientNode) {
        if(Sound.ambientNode.stop) {
          try { Sound.ambientNode.stop(); } catch(e) {}
        }
        if(Sound.ambientNode._interval) clearInterval(Sound.ambientNode._interval);
        Sound.ambientNode = null;
      }
      if(Sound.ambientGain) {
        Sound.ambientGain.disconnect();
        Sound.ambientGain = null;
      }
    },

    // ── MIDI PLAYBACK SYSTEM ──
    // Plays MIDI files using Web Audio API FM synthesis.
    // Converts MIDI note numbers to frequencies and plays them sequentially.
    midiPlaying: false,
    midiTimer: null,
    midiTracks: {},

    // Convert MIDI note number to frequency (A4 = 69 = 440Hz)
    midiNoteToFreq: (note) => {
      return 440 * Math.pow(2, (note - 69) / 12);
    },

    // Parse a simple MIDI file (type 0 or type 1)
    parseMidi: (data) => {
      const view = new DataView(data.buffer || data);
      let pos = 0;
      const tracks = [];
      
      // Read header
      const headerType = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      if(headerType !== 'MThd') {
        console.error('Invalid MIDI file: missing MThd header');
        return null;
      }
      
      pos = 8; // Skip header chunk type and length
      const format = view.getUint16(pos); pos += 2;
      const trackCount = view.getUint16(pos); pos += 2;
      const division = view.getUint16(pos); pos += 2;
      
      console.log(`MIDI: format=${format}, tracks=${trackCount}, division=${division}`);
      
      // Calculate ticks per quarter note
      const ticksPerBeat = division;
      const tempo = 500000; // Default tempo: 120 BPM (500000 microseconds per beat)
      
      // Read tracks
      for(let t = 0; t < trackCount; t++) {
        // Find track header
        while(pos < view.byteLength - 4) {
          const chunkType = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3));
          if(chunkType === 'MTrk') break;
          pos++;
        }
        
        if(pos >= view.byteLength - 4) break;
        
        pos += 4; // Skip 'MTrk'
        const trackLength = view.getUint32(pos); pos += 4;
        const trackEnd = pos + trackLength;
        const events = [];
        let runningStatus = 0;
        
        while(pos < trackEnd && pos < view.byteLength) {
          // Read variable-length delta time
          let deltaTime = 0;
          let byte;
          do {
            byte = view.getUint8(pos++);
            deltaTime = (deltaTime << 7) | (byte & 0x7F);
          } while(byte & 0x80);
          
          // Read event
          let status = view.getUint8(pos);
          
          if(status < 0x80) {
            // Running status
            status = runningStatus;
          } else {
            pos++;
            runningStatus = status;
          }
          
          const eventType = status & 0xF0;
          
          if(eventType === 0x90 || eventType === 0x80) {
            // Note on/off
            const note = view.getUint8(pos++);
            const velocity = view.getUint8(pos++);
            const isNoteOn = eventType === 0x90 && velocity > 0;
            
            events.push({
              type: isNoteOn ? 'noteOn' : 'noteOff',
              note: note,
              velocity: velocity / 127,
              deltaTime: deltaTime,
              tick: 0 // Will be calculated
            });
          } else if(eventType === 0xB0) {
            // Control change
            pos += 2; // Skip controller number and value
          } else if(eventType === 0xC0) {
            // Program change
            pos += 1; // Skip program number
          } else if(eventType === 0xE0) {
            // Pitch bend
            pos += 2; // Skip LSB and MSB
          } else if(status === 0xFF) {
            // Meta event
            const metaType = view.getUint8(pos++);
            let metaLength = 0;
            do {
              byte = view.getUint8(pos++);
              metaLength = (metaLength << 7) | (byte & 0x7F);
            } while(byte & 0x80);
            
            if(metaType === 0x51) {
              // Tempo change
              const tempoMicroseconds = (view.getUint8(pos) << 16) | (view.getUint8(pos+1) << 8) | view.getUint8(pos+2);
              // Update tempo for this track
            }
            
            pos += metaLength;
          } else if(status === 0xF0 || status === 0xF7) {
            // SysEx
            let sysexLength = 0;
            do {
              byte = view.getUint8(pos++);
              sysexLength = (sysexLength << 7) | (byte & 0x7F);
            } while(byte & 0x80);
            pos += sysexLength;
          } else {
            // Unknown event, try to skip
            console.warn('Unknown MIDI event:', status.toString(16));
            pos++;
          }
        }
        
        // Calculate absolute tick times
        let currentTick = 0;
        events.forEach(event => {
          currentTick += event.deltaTime;
          event.tick = currentTick;
        });
        
        tracks.push({ events, tempo });
      }
      
      return {
        format,
        tracks,
        ticksPerBeat,
        tempo
      };
    },

    // Play a parsed MIDI file
    playMidi: (midiData) => {
      if(!Sound.ensureAudioContext()) return;
      if(Sound.midiPlaying) Sound.stopMidi();
      
      Sound.midiPlaying = true;
      const startTime = Sound.ctx.currentTime;
      
      // Merge all tracks into a single event list
      let allEvents = [];
      const ticksPerBeat = midiData.ticksPerBeat;
      const tempo = midiData.tempo;
      const secondsPerTick = (tempo / 1000000) / ticksPerBeat;
      
      midiData.tracks.forEach((track, trackIndex) => {
        track.events.forEach(event => {
          allEvents.push({
            ...event,
            track: trackIndex,
            time: event.tick * secondsPerTick
          });
        });
      });
      
      // Sort by time
      allEvents.sort((a, b) => a.time - b.time);
      
      console.log(`Playing MIDI: ${allEvents.length} events, ${secondsPerTick.toFixed(6)} sec/tick`);
      
      // Schedule all events
      const activeOscillators = {};
      
      allEvents.forEach(event => {
        const eventTime = startTime + event.time;
        
        if(event.type === 'noteOn') {
          const freq = Sound.midiNoteToFreq(event.note);
          
          // Create FM synthesis oscillator
          const carrier = Sound.ctx.createOscillator();
          const modulator = Sound.ctx.createOscillator();
          const modGain = Sound.ctx.createGain();
          const mainGain = Sound.ctx.createGain();
          
          carrier.frequency.value = freq;
          modulator.frequency.value = freq * 2; // Modulation ratio
          modGain.gain.value = freq * 5; // Modulation index
          
          modulator.connect(modGain);
          modGain.connect(carrier.frequency);
          carrier.connect(mainGain);
          mainGain.connect(Sound.ctx.destination);
          
          mainGain.gain.setValueAtTime(0, eventTime);
          mainGain.gain.linearRampToValueAtTime(event.velocity * 0.05, eventTime + 0.01);
          
          carrier.start(eventTime);
          modulator.start(eventTime);
          
          // Store for note off
          if(!activeOscillators[event.note]) {
            activeOscillators[event.note] = [];
          }
          activeOscillators[event.note].push({ carrier, modulator, gain: mainGain });
          
        } else if(event.type === 'noteOff') {
          const oscillators = activeOscillators[event.note];
          if(oscillators && oscillators.length > 0) {
            const osc = oscillators.shift();
            osc.gain.gain.setValueAtTime(osc.gain.gain.value, eventTime);
            osc.gain.gain.exponentialRampToValueAtTime(0.01, eventTime + 0.1);
            osc.carrier.stop(eventTime + 0.1);
            osc.modulator.stop(eventTime + 0.1);
          }
        }
      });
      
      // Set timer to stop when done
      const lastEvent = allEvents[allEvents.length - 1];
      if(lastEvent) {
        const totalDuration = lastEvent.time + 1; // Add 1 second buffer
        Sound.midiTimer = setTimeout(() => {
          Sound.midiPlaying = false;
          console.log('MIDI playback finished');
        }, totalDuration * 1000);
      }
    },

    // Stop MIDI playback
    stopMidi: () => {
      Sound.midiPlaying = false;
      if(Sound.midiTimer) {
        clearTimeout(Sound.midiTimer);
        Sound.midiTimer = null;
      }
      // Note: In a full implementation, we'd track and stop all active oscillators
    },

    // B31 FIX: Load footstep.mp3 as an AudioBuffer for high-quality step sound.
    // Called from startGame in input.js after Sound.init().
    // If footstep.mp3 is present, window._footstepBuffer is set and Sound.step()
    // will use it instead of the FM fallback.
    loadFootstep: async function() {
      if (!Sound.ctx || !window.fetch) return;
      try {
        const resp = await fetch('footstep.mp3');
        if (!resp.ok) return;
        const buf = await resp.arrayBuffer();
        Sound.ctx.decodeAudioData(buf, decoded => {
          window._footstepBuffer = decoded;
        });
      } catch(e) {}
    },

    // Load and play a MIDI file from URL or data
    playMidiFile: async (source) => {
      try {
        let data;
        if(typeof source === 'string') {
          // URL
          const response = await fetch(source);
          const buffer = await response.arrayBuffer();
          data = new Uint8Array(buffer);
        } else if(source instanceof ArrayBuffer) {
          data = new Uint8Array(source);
        } else {
          data = source;
        }
        
        const midi = Sound.parseMidi(data);
        if(midi) {
          Sound.playMidi(midi);
          return true;
        }
        return false;
      } catch(e) {
        console.error('Failed to play MIDI file:', e);
        return false;
      }
    }
  };
