
export class NoiseSimulator {
    private ctx: AudioContext;
    private masterGain: GainNode;

    // Nodes
    private osc: OscillatorNode | null = null;
    private noiseNode: AudioBufferSourceNode | null = null;
    private filter: BiquadFilterNode | null = null;
    private lfo: OscillatorNode | null = null;
    private lfoGain: GainNode | null = null;

    private isPlaying: boolean = false;
    private currentType: string = '';

    // Timer for periodic sounds (Footsteps)
    private timer: number | null = null;

    // Stored params for periodic updates
    private currentParams = { p: 0.5, s: 0.5, r: 0.5 };

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0; // Default muted
    }

    public startSimulation(type: string) {
        this.stop();

        // Cancel fade-out from stop() and reset volume
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);

        this.currentType = type;
        this.isPlaying = true;


        if (type === 'footsteps') {
            this.playFootsteps();
        } else if (type === 'voices') {
            this.playVoices();
        } else if (type === 'traffic') {
            this.playTraffic();
        } else if (type === 'tinnitus') {
            this.playTinnitus();
        }
    }

    public updateParams(pitch: number, sharpness: number, resonance: number) {
        if (!this.isPlaying) return;

        // 0-100 to normalized 0-1
        const p = pitch / 100;
        const s = sharpness / 100;
        const r = resonance / 100;

        this.currentParams = { p, s, r };

        if (this.currentType === 'footsteps') {
            this.updateFootsteps(p, s, r);
        } else if (this.currentType === 'voices') {
            this.updateVoices(p, s, r);
        } else if (this.currentType === 'traffic') {
            this.updateTraffic(p, s, r);
        } else if (this.currentType === 'tinnitus') {
            this.updateTinnitus(p, s, r);
        }
    }

    public stop() {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }

        try {
            if (this.osc) { this.osc.stop(); this.osc.disconnect(); this.osc = null; }
            if (this.noiseNode) { this.noiseNode.stop(); this.noiseNode.disconnect(); this.noiseNode = null; }
            if (this.lfo) { this.lfo.stop(); this.lfo.disconnect(); this.lfo = null; }
            if (this.lfoGain) { this.lfoGain.disconnect(); this.lfoGain = null; }
            if (this.filter) { this.filter.disconnect(); this.filter = null; }

            // Quick fade out to avoid clicks
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

            this.isPlaying = false;
        } catch (e) {
            console.error("Error stopping simulation:", e);
        }
    }


    // --- Generators ---

    // Footsteps: Periodic One-Shots
    private playFootsteps() {
        // Initial trigger
        this.triggerFootstep();

        // Loop interval based on params (could be dynamic)
        this.timer = window.setInterval(() => {
            if (this.isPlaying) this.triggerFootstep();
        }, 1200);
    }

    private triggerFootstep() {
        const t = this.ctx.currentTime;
        const { p, s, r } = this.currentParams;

        // 1. Thud (Low freq impact)
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';

        // Pitch: 40Hz - 80Hz
        const freq = 40 + (p * 40);
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.1);

        oscGain.gain.setValueAtTime(0.8, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15 + (r * 0.2)); // Resonance extends decay

        osc.connect(oscGain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.4);

        // 2. Click (Filtered Noise for surface definition)
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        // Sharpness: 500Hz - 2000Hz (Crisper sound)
        noiseFilter.frequency.setValueAtTime(500 + (s * 1500), t);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3 + (s * 0.3), t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

        noise.connect(noiseFilter).connect(noiseGain).connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.1);
    }

    private updateFootsteps(_p: number, _s: number, _r: number) {
        // Params are read in triggerFootstep
    }


    // Voices: Filtered Pink Noise with LFO modulation (Babble effect)
    private playVoices() {
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Pink Noise approx
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            data[i] *= 0.11;
            b6 = white * 0.115926;
        }

        this.noiseNode = this.ctx.createBufferSource();
        this.noiseNode.buffer = buffer;
        this.noiseNode.loop = true;

        // Bandpass for "Speech Range"
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'bandpass';
        this.filter.frequency.value = 500;
        this.filter.Q.value = 1.0;

        // LFO to modulate filter freq (simulation of intonation/activity)
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 3; // 3Hz speech rhythm

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 200; // Modulate freq by +/- 200Hz

        this.lfo.connect(this.lfoGain).connect(this.filter.frequency);

        this.noiseNode.connect(this.filter).connect(this.masterGain);

        this.noiseNode.start();
        this.lfo.start();
        this.updateVoices(0.5, 0.5, 0.5);
    }

    private updateVoices(p: number, s: number, r: number) {
        if (this.filter && this.lfo && this.lfoGain) {
            // Pitch: 300Hz (Low mumble) - 800Hz (Excited)
            this.filter.frequency.setTargetAtTime(300 + (p * 500), this.ctx.currentTime, 0.1);

            // Sharpness: Q factor. Higher Q = thinner/robotic. Lower Q = natural/muddy
            // Inverted logic: High sharpness = Narrow/Clearer peaks?
            // Actually, wider band (Low Q) sounds more like crowd noise.
            this.filter.Q.setTargetAtTime(0.5 + (s * 4.0), this.ctx.currentTime, 0.1);

            // Resonance: Modulate Speed (Activity level)
            this.lfo.frequency.setTargetAtTime(2 + (r * 6), this.ctx.currentTime, 0.1);
            this.lfoGain.gain.setTargetAtTime(100 + (r * 300), this.ctx.currentTime, 0.1); // Modulation Depth
        }
    }


    // Traffic: Low Rumble (Osc) + Hiss (Filtered Noise)
    private playTraffic() {
        // 1. Engine Rumble (Sawtooth + LPF)
        this.osc = this.ctx.createOscillator();
        this.osc.type = 'sawtooth';
        this.osc.frequency.value = 50;

        // Osc Filter (Muffler)
        // We need a separate filter for Osc if we want independent control.
        // For simplicity, let's filter the osc directly before Master.
        const oscFilter = this.ctx.createBiquadFilter();
        oscFilter.type = 'lowpass';
        oscFilter.frequency.value = 120;
        this.osc.connect(oscFilter).connect(this.masterGain);

        // 2. Road Noise (White Noise + Bandpass/Highpass)
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        this.noiseNode = this.ctx.createBufferSource();
        this.noiseNode.buffer = buffer;
        this.noiseNode.loop = true;

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass'; // Distant traffic is lowpass
        this.filter.frequency.value = 800;

        // LFO for "Whoosh" passing cars
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 0.2; // Slow changing flow

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 0.3; // Amplitude modulation depth (0.3 of volume)

        // Let's modulate Filter Cutoff with LFO (Doplpler-ish)

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 400; // +/- 400Hz sweep

        this.lfo.connect(this.lfoGain).connect(this.filter.frequency);

        this.noiseNode.connect(this.filter).connect(this.masterGain);

        this.osc.start();
        this.noiseNode.start();
        this.lfo.start();

        this.updateTraffic(0.5, 0.5, 0.5);
    }

    private updateTraffic(p: number, s: number, r: number) {
        if (this.osc) {
            // Pitch: Engine RPM (40-100Hz)
            this.osc.frequency.setTargetAtTime(40 + (p * 60), this.ctx.currentTime, 0.1);
        }
        if (this.filter) {
            // Sharpness: Distance (Cutoff). Closer = Brighter
            // 400Hz (Far) - 2000Hz (Close)
            const baseFreq = 400 + (s * 1600);
            this.filter.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
        }
        if (this.lfo) {
            // Resonance: Traffic Density/Speed (LFO Speed)
            // 0.1Hz (Sparse) - 2.0Hz (Busy)
            this.lfo.frequency.setTargetAtTime(0.1 + (r * 1.9), this.ctx.currentTime, 0.1);
        }
    }


    private playTinnitus() {
        this.osc = this.ctx.createOscillator();
        this.osc.type = 'sine';
        this.osc.frequency.value = 6000;
        this.osc.connect(this.masterGain);
        this.osc.start();
    }

    private updateTinnitus(p: number, _s: number, _r: number) {
        // Pitch: 4000Hz - 12000Hz
        if (this.osc) this.osc.frequency.setTargetAtTime(4000 + (p * 8000), this.ctx.currentTime, 0.1);
    }

}
