// Pronunciation via the browser's speech synthesis (Croatian voice only).

let voice = null;

function pickVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const hr = voices.filter((v) => /^hr([-_]|$)/i.test(v.lang));
  voice = hr.find((v) => v.localService) || hr[0] || null;
  return voice;
}

/** Resolves to true when a Croatian voice is available. Voices load asynchronously on some browsers. */
export function initSpeech(timeoutMs = 2500) {
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  if (pickVoice()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(!!pickVoice());
    };
    const onChange = () => {
      if (pickVoice()) done();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
    setTimeout(done, timeoutMs);
  });
}

export function hasVoice() {
  return !!voice;
}

export function speak(text) {
  if (!voice) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang || 'hr-HR';
  u.rate = 0.9;
  synth.speak(u);
}
