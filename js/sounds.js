// ============================================================
// SOUND ENGINE — soft chime SFX (Tudor portrait theme)
// All sounds are synthesized in-browser; no external files.
// Tones use sine waves and gentle filtering for a candle-warm feel.
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
    masterGain.gain.value = 0.22;     // softer overall — chamber, not arcade
    masterGain.connect(ctx.destination);
  }

  function unlock() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(v) {
    muted = !!v;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.22;
  }
  function isMuted() { return muted; }

  // Soft bell-like tone — sine carrier with a gentle decay envelope.
  function chime({ freq = 660, dur = 0.6, volume = 0.18, freqEnd = null, attack = 0.01, release = 0.4, type = 'sine' }) {
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

    // gentle low-pass to remove harshness
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value = 0.7;

    osc.connect(lp); lp.connect(gain); gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.05);
  }

  // Soft breath / page-turn — narrow filtered noise.
  function breath({ dur = 0.4, volume = 0.10, filterFreq = 900, filterQ = 1, sweep = false }) {
    if (muted) return;
    ensure();
    const t0 = ctx.currentTime;
    const bufLen = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) ch[i] = (Math.random() * 2 - 1) * 0.6;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    f.Q.value = filterQ;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.25), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(gain); gain.connect(masterGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    unlock, setMuted, isMuted,

    // page turning open — soft chord
    boot() {
      unlock();
      chime({ freq: 523.25, dur: 0.35, volume: 0.12, release: 0.5 });           // C5
      setTimeout(() => chime({ freq: 659.25, dur: 0.35, volume: 0.10, release: 0.5 }), 110); // E5
      setTimeout(() => chime({ freq: 783.99, dur: 0.45, volume: 0.10, release: 0.6 }), 230); // G5
      breath({ dur: 0.5, volume: 0.05, filterFreq: 1200, sweep: true });
    },

    // light pluck on click
    click() { chime({ freq: 880, dur: 0.06, volume: 0.10, release: 0.12 }); },
    blip()  { chime({ freq: 988, dur: 0.10, volume: 0.10, freqEnd: 1244, release: 0.18 }); },
    hover() { chime({ freq: 1318, dur: 0.04, volume: 0.04, release: 0.08 }); },

    // small two-note motif on selection
    select() {
      chime({ freq: 659.25, dur: 0.10, volume: 0.10, release: 0.15 });
      setTimeout(() => chime({ freq: 880, dur: 0.14, volume: 0.10, release: 0.22 }), 90);
    },

    // happy three-note on success
    success() {
      chime({ freq: 523.25, dur: 0.14, volume: 0.12, release: 0.25 }); // C5
      setTimeout(() => chime({ freq: 659.25, dur: 0.14, volume: 0.12, release: 0.25 }), 110); // E5
      setTimeout(() => chime({ freq: 783.99, dur: 0.22, volume: 0.12, release: 0.35 }), 220); // G5
    },

    // soft mournful descending tone on error
    error() {
      chime({ freq: 392.00, dur: 0.30, volume: 0.16, freqEnd: 261.63, release: 0.4, type: 'triangle' }); // G4 → C4
    },

    // soft swish — used on view changes
    whoosh() {
      breath({ dur: 0.45, volume: 0.10, filterFreq: 1600, filterQ: 2, sweep: true });
    },

    // a single soft bell — used when the tree first paints
    scan() {
      chime({ freq: 1046.50, dur: 0.50, volume: 0.10, release: 0.7 }); // C6
    },

    // typing sound — kept for any future use, very quiet
    typing() { chime({ freq: 1800 + Math.random() * 600, dur: 0.012, volume: 0.04, release: 0.04 }); },

    // soft knock — replaces harsh glitch
    glitch() {
      chime({ freq: 196.00, dur: 0.10, volume: 0.18, freqEnd: 130.81, release: 0.2, type: 'triangle' });
      breath({ dur: 0.18, volume: 0.06, filterFreq: 700, filterQ: 2 });
    },
  };
})();
