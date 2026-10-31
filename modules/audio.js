let audioCtx = null;
let audioState = { muted: false, volume: 0.5 };

export function initAudio() {
    const muteToggle = document.getElementById('mute-toggle');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    if (!muteToggle || !volumeSlider) return;

    const stored = localStorage.getItem('pdc-audio');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            muteToggle.checked = parsed.muted ?? false;
            volumeSlider.value = parsed.volume ?? 0.5;
        } catch { /* ignore */ }
    }

    const save = () => {
        audioState.muted = muteToggle.checked;
        audioState.volume = Number(volumeSlider.value);
        localStorage.setItem('pdc-audio', JSON.stringify(audioState));
    };

    muteToggle.addEventListener('change', save);
    volumeSlider.addEventListener('input', () => {
        if (volumeValue) volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
        save();
    });
    if (volumeValue) volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
    save();
}

export function playSound(type) {
    if (audioState.muted) return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const volume = audioState.volume;
    const now = audioCtx.currentTime;
    switch (type) {
        case 'move':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
            gain.gain.setValueAtTime(0.05 * volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start();
            osc.stop(now + 0.08);
            break;
        case 'attack':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
            gain.gain.setValueAtTime(0.1 * volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start();
            osc.stop(now + 0.15);
            break;
        case 'hit':
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
            gain.gain.setValueAtTime(0.12 * volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start();
            osc.stop(now + 0.12);
            break;
        case 'treasure':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1760, now + 0.2);
            gain.gain.setValueAtTime(0.08 * volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start();
            osc.stop(now + 0.2);
            break;
    }
}
