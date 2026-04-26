// ============================================================
// SOUND ENGINE — Web Audio API synthesized sci-fi SFX
// All sounds are generated in-browser, no external files.
// ============================================================

const Sound = (() => {
  let ctx = null;
  let masterGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(ctx.destination);
  }

  // resume on first user gesture (browser autoplay policy)
  function unlock() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(v) {
    muted = !!v;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.35;
  }
  function isMuted() { return muted; }

  // ---- helpers ----
  function tone({ freq = 440, type = 'sine', dur = 0.15, attack = 0.005, release = 0.08, volume = 0.4, freqEnd = null, filter = null }) {
    if (muted) return;
    ensure();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq || 1200;
      f.Q.value = filter.Q || 1;
      node.connect(f);
      f.connect(gain);
    } else {
      node.connect(gain);
    }
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.05);
  }

  function noiseBurst({ dur = 0.3, volume = 0.2, filterFreq = 1200, filterQ = 1, type = 'lowpass', sweep = false }) {
    if (muted) return;
    ensure();
    const t0 = ctx.currentTime;
    const bufLen = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) ch[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t0);
    f.Q.value = filterQ;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.15), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(gain); gain.connect(masterGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- public effects ----
  return {
    unlock, setMuted, isMuted,

    boot() {
      // multi-stage boot sequence
      unlock();
      tone({ freq: 220, type: 'sawtooth', dur: 0.2, freqEnd: 880, volume: 0.25, filter: { type: 'lowpass', freq: 2000, Q: 4 } });
      setTimeout(() => tone({ freq: 660, type: 'square', dur: 0.08, volume: 0.18 }), 220);
      setTimeout(() => tone({ freq: 990, type: 'square', dur: 0.08, volume: 0.18 }), 320);
      setTimeout(() => tone({ freq: 1320, type: 'sine',  dur: 0.18, volume: 0.22, freqEnd: 1760 }), 420);
      setTimeout(() => noiseBurst({ dur: 0.5, volume: 0.08, filterFreq: 1800, sweep: true, type: 'bandpass', filterQ: 2 }), 200);
    },

    click() { tone({ freq: 1400, type: 'square', dur: 0.04, volume: 0.18 }); },
    blip()  { tone({ freq: 880,  type: 'sine',   dur: 0.05, volume: 0.18, freqEnd: 1320 }); },
    hover() { tone({ freq: 2200, type: 'sine',   dur: 0.03, volume: 0.08 }); },

    select() {
      tone({ freq: 660,  type: 'square', dur: 0.05, volume: 0.18 });
      setTimeout(() => tone({ freq: 990, type: 'square', dur: 0.06, volume: 0.18 }), 50);
    },

    success() {
      tone({ freq: 660,  type: 'sine', dur: 0.1, volume: 0.22 });
      setTimeout(() => tone({ freq: 990,  type: 'sine', dur: 0.1, volume: 0.22 }), 100);
      setTimeout(() => tone({ freq: 1320, type: 'sine', dur: 0.18, volume: 0.22 }), 200);
    },

    error() {
      tone({ freq: 220, type: 'sawtooth', dur: 0.18, volume: 0.28, freqEnd: 110 });
      setTimeout(() => tone({ freq: 180, type: 'sawtooth', dur: 0.22, volume: 0.28, freqEnd: 90 }), 180);
    },

    whoosh() {
      noiseBurst({ dur: 0.4, volume: 0.18, filterFreq: 2400, type: 'bandpass', filterQ: 3, sweep: true });
    },

    scan() {
      tone({ freq: 1200, type: 'sine', dur: 0.6, volume: 0.12, freqEnd: 200, filter: { type: 'bandpass', freq: 1500, Q: 6 } });
    },

    typing() { tone({ freq: 2000 + Math.random() * 1000, type: 'square', dur: 0.015, volume: 0.05 }); },

    glitch() {
      noiseBurst({ dur: 0.12, volume: 0.22, filterFreq: 3500, type: 'highpass', filterQ: 2 });
      tone({ freq: 100, type: 'sawtooth', dur: 0.08, volume: 0.18, freqEnd: 40 });
    },
  };
})();
