// AudioEngine.ts
import { ImpactDetector, type DetectionCallbacks } from './ImpactDetector';

// EQバンド定義
const EQ_BANDS = [
    { freq: 60, type: 'lowshelf' as BiquadFilterType },
    { freq: 250, type: 'peaking' as BiquadFilterType },
    { freq: 1000, type: 'peaking' as BiquadFilterType },
    { freq: 4000, type: 'peaking' as BiquadFilterType },
    { freq: 12000, type: 'highshelf' as BiquadFilterType }
];

// AudioWorklet Code (Embedded to avoid GitHub Pages loading issues)
const processorCode = `
class NoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.b0 = 0;
    this.b1 = 0;
    this.b2 = 0;
    this.b3 = 0;
    this.b4 = 0;
    this.b5 = 0;
    this.b6 = 0;
    this.lastBrown = 0;
    this.lastDark = 0;
  }

  static get parameterDescriptors() {
    return [
      { name: 'whiteGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pinkGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'brownGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'darkGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'masterGain', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    const whiteGainParam = parameters['whiteGain'];
    const pinkGainParam = parameters['pinkGain'];
    const brownGainParam = parameters['brownGain'];
    const darkGainParam = parameters['darkGain'];
    const masterGainParam = parameters['masterGain'];

    const wGain = whiteGainParam[0];
    const pGain = pinkGainParam[0];
    const bGain = brownGainParam[0];
    const dGain = darkGainParam[0];

    if (wGain === 0 && pGain === 0 && bGain === 0 && dGain === 0) {
      for (let c = 0; c < output.length; c++) {
        output[c].fill(0);
      }
      return true;
    }

    const channelCount = output.length;
    for (let c = 0; c < channelCount; c++) {
      const channel = output[c];
      const len = channel.length;
      const shouldUseArray = masterGainParam.length > 1;

      for (let i = 0; i < len; i++) {
        const mGain = shouldUseArray ? masterGainParam[i] : masterGainParam[0];
        const white = Math.random() * 2 - 1;
        let mixedOutput = 0;

        if (wGain > 0) mixedOutput += white * wGain;

        if (pGain > 0) {
          this.b0 = 0.99886 * this.b0 + white * 0.0555179;
          this.b1 = 0.99332 * this.b1 + white * 0.0750759;
          this.b2 = 0.96900 * this.b2 + white * 0.1538520;
          this.b3 = 0.86650 * this.b3 + white * 0.3104856;
          this.b4 = 0.55000 * this.b4 + white * 0.5329522;
          this.b5 = -0.7616 * this.b5 - white * 0.0168980;
          let pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
          this.b6 = white * 0.115926;
          mixedOutput += (pink * 0.11) * pGain;
        }

        const brownUpdate = (this.lastBrown + (0.02 * white)) / 1.02;
        this.lastBrown = brownUpdate;
        if (bGain > 0) mixedOutput += (brownUpdate * 3.5) * bGain;

        const darkUpdate = (this.lastDark + (0.005 * white)) / 1.005;
        this.lastDark = darkUpdate;
        if (dGain > 0) mixedOutput += (darkUpdate * 4.0) * dGain;

        channel[i] = mixedOutput * mGain;
      }
    }
    return true;
  }
}
registerProcessor('noise-processor', NoiseProcessor);
`;

export class AudioEngine {
    private ctx: AudioContext | null = null;
    private noiseNode: AudioWorkletNode | null = null;
    private noiseGainNode: GainNode | null = null; // ノイズ専用マスターゲイン

    // ゲインノードを分離（直列接続）
    private baseGainNode: GainNode | null = null;      // 基本音量 (Global Master)
    private adaptiveGainNode: GainNode | null = null;  // Adaptive用
    private reactiveGainNode: GainNode | null = null;  // Reactive用

    private analyser: AnalyserNode | null = null;

    // EQフィルター
    private eqFilters: BiquadFilterNode[] = [];

    // マイク入力用
    private inputScanParams: { stream: MediaStream | null, source: MediaStreamAudioSourceNode | null, analyser: AnalyserNode | null } = { stream: null, source: null, analyser: null };
    private detector: ImpactDetector | null = null;

    public isInitialized = false;
    private baseVolume = 0.1;
    private isAutoMode = false;

    // Adaptiveモードのゲイン制御
    private adaptiveGain = 0; // 騒音スコアに基づくゲイン加算分
    private adaptiveTargetGain = 0;
    private adaptiveAnimationId: number | null = null;

    // Reactiveモードのブースト設定
    public reactiveBoostStrength = 0.3; // 0.0 - 0.5
    public reactiveBoostDuration = 10; // 秒（5-30）

    // Adaptiveモードの減衰速度（UIスライダー値 0.0-1.0）
    private adaptiveSpeedValue = 0.5; // 反応速度 (Attack)
    private adaptiveDecayValue = 0.5; // 減衰時間 (Decay)

    private isExplicitlyStopped = false;

    constructor() { }

    async init() {
        if (this.isInitialized) return;

        // latencyHint to 'playback' caused issues with Mic input (Auto Mode) on Bluetooth.
        // Reverting to default (interactive) but keeping strict state monitoring.
        this.ctx = new AudioContext();

        // 状態監視: Bluetooth接続などでSuspendedになったら復帰を試みる
        this.ctx.onstatechange = () => {
            console.log(`AudioContext state changed to: ${this.ctx?.state}`);
            // ユーザーが停止ボタンを押していないのにSuspendedになった場合のみ復帰
            if (this.ctx?.state === 'suspended' && !this.isExplicitlyStopped) {
                console.log('Auto-resuming audio context...');
                this.ctx.resume().catch(e => console.warn('Auto-resume failed:', e));
            }
        };

        try {
            // Blob URLを作成して読み込み
            const blob = new Blob([processorCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await this.ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url); // メモリ解放

            this.noiseNode = new AudioWorkletNode(this.ctx, 'noise-processor');

            // ノイズ専用ゲイン作成
            this.noiseGainNode = this.ctx.createGain();
            this.noiseGainNode.gain.value = 1.0;

            // 3つのゲインノードを作成
            this.baseGainNode = this.ctx.createGain();
            this.adaptiveGainNode = this.ctx.createGain();
            this.reactiveGainNode = this.ctx.createGain();
            this.analyser = this.ctx.createAnalyser();

            // 初期値設定
            this.baseGainNode.gain.value = this.baseVolume;
            this.adaptiveGainNode.gain.value = 1.0; // 乗算式（デフォルトは変化なし）
            this.reactiveGainNode.gain.value = 1.0; // 乗算式（デフォルトは変化なし）
            this.analyser.fftSize = 2048;

            // EQフィルターを作成
            this.eqFilters = EQ_BANDS.map((band) => {
                const filter = this.ctx!.createBiquadFilter();
                filter.type = band.type;
                filter.frequency.value = band.freq;
                filter.gain.value = 0;
                filter.Q.value = 1.0;
                return filter;
            });

            // 接続: Noise -> NoiseGain -> EQ -> BaseGain -> AdaptiveGain -> ReactiveGain -> Analyser -> Output
            this.noiseNode.connect(this.noiseGainNode);
            this.noiseGainNode.connect(this.eqFilters[0]);

            for (let i = 0; i < this.eqFilters.length - 1; i++) {
                this.eqFilters[i].connect(this.eqFilters[i + 1]);
            }
            this.eqFilters[this.eqFilters.length - 1].connect(this.baseGainNode);
            this.baseGainNode.connect(this.adaptiveGainNode);
            this.adaptiveGainNode.connect(this.reactiveGainNode);
            this.reactiveGainNode.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);

            this.isInitialized = true;
            console.log('AudioEngine initialized with 5-band EQ and separate gains');
        } catch (e) {
            console.error('Failed to load AudioWorklet:', e);
            throw e;
        }
    }

    // EQ設定
    setEQBand(bandIndex: number, gainDb: number) {
        if (bandIndex < 0 || bandIndex >= this.eqFilters.length) return;
        const filter = this.eqFilters[bandIndex];
        if (filter && this.ctx) {
            filter.gain.setTargetAtTime(gainDb, this.ctx.currentTime, 0.02);
        }
    }

    getEQValues(): number[] {
        return this.eqFilters.map(f => f.gain.value);
    }

    getEQBands() {
        return EQ_BANDS;
    }

    getOutputAnalyser(): AnalyserNode | null {
        return this.analyser;
    }

    getInputAnalyser(): AnalyserNode | null {
        return this.inputScanParams.analyser;
    }

    // マイク入力の初期化
    async initInput() {
        if (!this.ctx) return;
        if (this.inputScanParams.stream) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            this.inputScanParams.stream = stream;
            this.inputScanParams.source = this.ctx.createMediaStreamSource(stream);
            this.inputScanParams.analyser = this.ctx.createAnalyser();
            this.inputScanParams.analyser.fftSize = 2048;

            this.inputScanParams.source.connect(this.inputScanParams.analyser);

            // コールバック設定
            const callbacks: DetectionCallbacks = {
                onImpact: (intensity, bandId) => {
                    this.handleReactiveImpact(intensity, bandId);
                },
                onNoiseScoreUpdate: (score) => {
                    this.handleAdaptiveUpdate(score);
                }
            };

            this.detector = new ImpactDetector(
                this.inputScanParams.analyser,
                callbacks,
                this.ctx.sampleRate
            );

            console.log('Microphone initialized');
        } catch (e) {
            console.error('Microphone access denied:', e);
            throw e;
        }
    }

    toggleAutoMode(enable: boolean) {
        this.isAutoMode = enable;
        if (enable) {
            if (!this.inputScanParams.stream) {
                this.initInput().then(() => {
                    this.detector?.start();
                    this.startAdaptiveLoop();
                });
            } else {
                this.detector?.start();
                this.detector?.updateNoiseGain(this.baseVolume);
                this.startAdaptiveLoop();
            }
        } else {
            this.detector?.stop();
            this.stopAdaptiveLoop();
            this.adaptiveGain = 0;
            this.adaptiveTargetGain = 0;

            // マイクストリームを完全に停止・解放する
            if (this.inputScanParams.stream) {
                this.inputScanParams.stream.getTracks().forEach(track => track.stop());
                this.inputScanParams.stream = null;
                // Source/Analyserも作り直しになるためクリア
                if (this.inputScanParams.source) {
                    this.inputScanParams.source.disconnect();
                    this.inputScanParams.source = null;
                }
                // Analyserは再利用してもいいが、念のため
                if (this.inputScanParams.analyser) {
                    this.inputScanParams.analyser.disconnect();
                    this.inputScanParams.analyser = null;
                }
                console.log('Microphone stream released');
            }

            // ゲインを元に戻す
            if (this.adaptiveGainNode && this.reactiveGainNode && this.ctx) {
                this.adaptiveGainNode.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.5);
                this.reactiveGainNode.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.5);
            }
        }
    }

    // Adaptiveゲイン更新ループ
    private startAdaptiveLoop() {
        if (this.adaptiveAnimationId !== null) return;

        const loop = () => {
            if (!this.isAutoMode) return;

            // 目標ゲインに向けて緩やかに追従
            const diff = this.adaptiveTargetGain - this.adaptiveGain;
            if (Math.abs(diff) > 0.001) {
                // 上昇は速め(0.02)、下降は設定値に基づく
                // Decay 0.0 (短い) -> Speed 0.0020 (速く戻る)
                // Decay 1.0 (長い) -> Speed 0.0001 (ゆっくり戻る)
                const decaySpeed = 0.0001 + ((1.0 - this.adaptiveDecayValue) * 0.0019);

                // 上昇速度 (Attack) をスライダー連動に変更
                // Attack 0.0 (遅い) -> 0.0005 (じわじわ上がる)
                // Attack 1.0 (速い) -> 0.02 (以前の固定値＝俊敏)
                const attackSpeed = 0.0005 + (this.adaptiveSpeedValue * 0.0195);

                const speed = diff > 0 ? attackSpeed : decaySpeed;
                this.adaptiveGain += diff * speed;
                this.applyAdaptiveGain();
            }

            this.adaptiveAnimationId = requestAnimationFrame(loop);
        };

        this.adaptiveAnimationId = requestAnimationFrame(loop);
    }

    private stopAdaptiveLoop() {
        if (this.adaptiveAnimationId !== null) {
            cancelAnimationFrame(this.adaptiveAnimationId);
            this.adaptiveAnimationId = null;
        }
    }

    // Adaptive: 騒音スコアからターゲットゲインを計算
    private handleAdaptiveUpdate(noiseScore: number) {
        if (!this.isAutoMode) return;

        // 騒音スコアをゲイン加算分に変換（最大+0.4）
        this.adaptiveTargetGain = Math.min(noiseScore * 2, 0.4);

        // 検知器にノイズゲインを通知
        this.detector?.updateNoiseGain(this.baseVolume + this.adaptiveGain);
    }

    // Reactive: 衝撃検知時の即時ブースト
    private handleReactiveImpact(intensity: number, _bandId?: string) {
        if (!this.isAutoMode || !this.reactiveGainNode || !this.ctx) return;

        // Reactiveが無効の場合はスキップ
        if (!this.detector?.reactiveEnabled) return;

        const now = this.ctx.currentTime;
        // ブースト量を乗算式のゲインとして計算（例: 1.0 + 0.3 = 1.3倍）
        const boostMultiplier = 1.0 + (intensity * this.reactiveBoostStrength * 3);

        // 即時ブースト → 穏やかにフェードアウト
        this.reactiveGainNode.gain.cancelScheduledValues(now);
        this.reactiveGainNode.gain.setValueAtTime(this.reactiveGainNode.gain.value, now);
        // 0.1秒でブースト
        this.reactiveGainNode.gain.linearRampToValueAtTime(boostMultiplier, now + 0.1);
        // 持続時間の50%までブーストを維持し、残り50%でフェードアウト
        const holdTime = this.reactiveBoostDuration * 0.5;
        const fadeTime = this.reactiveBoostDuration * 0.5;
        this.reactiveGainNode.gain.setValueAtTime(boostMultiplier, now + 0.1 + holdTime);
        // フェードアウト（1.0に戻る）
        this.reactiveGainNode.gain.exponentialRampToValueAtTime(
            1.0,
            now + 0.1 + holdTime + fadeTime
        );

        console.log(`Reactive! Intensity: ${intensity.toFixed(2)}, Multiplier: ${boostMultiplier.toFixed(2)}`);
    }

    // Adaptiveゲインを適用
    private applyAdaptiveGain() {
        if (!this.adaptiveGainNode || !this.ctx) return;

        // 乗算式: 1.0 + adaptiveGain * 3（最大2.2倍）
        let multiplier = 1.0 + this.adaptiveGain * 3;

        // 不感帯: 1.10未満は1.0として無視
        // これによりスピーカーからの微小な揺らぎを無視
        if (multiplier < 1.10) {
            multiplier = 1.0;
        }

        this.adaptiveGainNode.gain.setTargetAtTime(multiplier, this.ctx.currentTime, 0.1);
    }

    // 現在のゲイン値を取得（インジケーター用）
    getGainValues(): { adaptive: number; reactive: number } {
        return {
            adaptive: this.adaptiveGainNode?.gain.value ?? 1.0,
            reactive: this.reactiveGainNode?.gain.value ?? 1.0
        };
    }

    setSensitivity(val: number) {
        if (this.detector) {
            this.detector.sensitivity = val;
        }
    }

    // Reactive有効/無効
    setReactiveEnabled(enabled: boolean) {
        if (this.detector) {
            this.detector.reactiveEnabled = enabled;
        }
    }

    // Reactiveブースト強度
    setReactiveBoostStrength(val: number) {
        this.reactiveBoostStrength = val;
    }

    // Reactiveブースト持続時間（秒）
    setReactiveBoostDuration(val: number) {
        this.reactiveBoostDuration = val;
    }

    // Adaptive反応速度 (Attack)
    setAdaptiveSpeed(val: number) {
        this.adaptiveSpeedValue = val;
        // Detector側の感度は固定化したため、ここではDetectorには値を渡さない
        // if (this.detector) {
        //     this.detector.adaptiveSpeed = val;
        // }
    }

    // Adaptive減衰時間 (Decay)
    setAdaptiveDecay(val: number) {
        this.adaptiveDecayValue = val;
    }

    setDetectionSimpleMode(modeId: string) {
        if (this.detector) {
            this.detector.setSimpleMode(modeId);
        }
    }

    setDetectionDetailedMode(bandIds: string[]) {
        if (this.detector) {
            this.detector.setDetailedMode(bandIds);
        }
    }

    toggleDetectionBand(bandId: string, enabled: boolean) {
        if (this.detector) {
            this.detector.toggleBand(bandId, enabled);
        }
    }

    getDetector() {
        return this.detector;
    }

    async resume() {
        if (!this.ctx) return;
        this.isExplicitlyStopped = false; // 再開フラグ
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    suspend() {
        if (!this.ctx) return;
        this.isExplicitlyStopped = true; // 停止フラグ
        this.ctx.suspend();
        this.detector?.stop();
        this.stopAdaptiveLoop();
        this.isAutoMode = false;
    }

    // ノイズミキシング設定 (0.0 - 1.0)
    setNoiseMix(white: number, pink: number, brown: number, dark: number) {
        if (!this.noiseNode) return;
        const params = this.noiseNode.parameters;

        // k-rateパラメータ更新
        if (params.has('whiteGain')) params.get('whiteGain')!.setValueAtTime(white, this.ctx!.currentTime);
        if (params.has('pinkGain')) params.get('pinkGain')!.setValueAtTime(pink, this.ctx!.currentTime);
        if (params.has('brownGain')) params.get('brownGain')!.setValueAtTime(brown, this.ctx!.currentTime);
        if (params.has('darkGain')) params.get('darkGain')!.setValueAtTime(dark, this.ctx!.currentTime);
    }

    setNoiseType(type: number) {
        // Legacy support mapping
        switch (type) {
            case 0: this.setNoiseMix(1, 0, 0, 0); break; // White
            case 1: this.setNoiseMix(0, 1, 0, 0); break; // Pink
            case 2: this.setNoiseMix(0, 0, 1, 0); break; // Brown
            default: this.setNoiseMix(0, 0, 1, 0); break;
        }
    }

    // Global Master Volume
    setVolume(value: number) {
        this.baseVolume = value;
        if (this.baseGainNode && this.ctx) {
            this.baseGainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        }
    }

    // New: Noise Master Volume
    setNoiseVolume(value: number) {
        if (this.noiseGainNode && this.ctx) {
            this.noiseGainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        }
    }

    // New: Soundscape Master Volume
    setSoundscapeVolume(value: number) {
        if (this.soundscapeMasterGain && this.ctx) {
            this.soundscapeMasterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        }
    }

    // ==========================================
    // File Playback (Soundscapes)
    // ==========================================

    private layers: Map<string, SoundLayer> = new Map();
    private soundscapeMasterGain: GainNode | null = null;

    async initSoundscapes() {
        if (!this.ctx) return;

        // Soundscapes用のマスターゲインを作成し、メインのEQ前または後に接続
        // ここでは Noise と並列に EQ に入れるか、あるいは EQ を通さずに混ぜるか。
        // 環境音は既にマスタリングされていることが多いので、EQを通すと意図しない音になる可能性あり。
        // しかし、全体の統一感を出すためにEQを通すのもアリ。
        // ここでは「Noise生成音」と「環境音」を混ぜてから、EQ -> Adaptive -> Reactive のフローに乗せるのが自然。
        // したがって、mixNodeを作成し、そこにNoiseとSoundscapesを集める。

        // 現状: NoiseNode -> eqFilters[0] ...
        // 変更: 
        // NoiseNode -> eqFilters[0]
        // Soundscapes -> eqFilters[0]

        // これなら簡単に追加可能。

        if (!this.soundscapeMasterGain) {
            this.soundscapeMasterGain = this.ctx.createGain();
            this.soundscapeMasterGain.gain.value = 1.0;

            // EQの最初のノードに接続
            if (this.eqFilters.length > 0) {
                this.soundscapeMasterGain.connect(this.eqFilters[0]);
            }
        }
    }

    async loadSound(id: string, url: string) {
        if (!this.ctx) return;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = 0; // 初期状態はミュート

            // マスター（EQの手前）に接続
            if (this.soundscapeMasterGain) {
                gainNode.connect(this.soundscapeMasterGain);
            }

            this.layers.set(id, {
                buffer: audioBuffer,
                gainNode: gainNode,
                sourceNode: null,
                isPlaying: false,
                volume: 0
            });

            console.log(`Loaded sound: ${id}`);
        } catch (e) {
            console.error(`Failed to load sound ${id}:`, e);
        }
    }

    setSoundVolume(id: string, volume: number) {
        const layer = this.layers.get(id);
        if (!layer || !this.ctx) return;

        // ボリューム値を更新
        layer.volume = volume;

        // フェード処理（0.1秒）
        layer.gainNode.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);

        if (volume > 0) {
            if (!layer.isPlaying) {
                this.startSound(id);
            }
        } else {
            // ボリューム0の場合、少し待ってから停止（フェードアウト時間を確保）
            // 即座に止めるとプチッというノイズが入るため
            if (layer.isPlaying) {
                setTimeout(() => {
                    // 最新のボリュームがまだ0なら停止（連打防止）
                    if (layer.volume === 0) {
                        this.stopSound(id);
                    }
                }, 300);
            }
        }
    }

    private startSound(id: string) {
        const layer = this.layers.get(id);
        if (!layer || !this.ctx || !layer.gainNode) return;

        // 既存のソースがあれば停止（二重再生防止）
        if (layer.sourceNode) {
            try { layer.sourceNode.stop(); } catch { }
        }

        const source = this.ctx.createBufferSource();
        source.buffer = layer.buffer;
        source.loop = true;
        source.connect(layer.gainNode);
        source.start();

        layer.sourceNode = source;
        layer.isPlaying = true;
    }

    private stopSound(id: string) {
        const layer = this.layers.get(id);
        if (!layer || !layer.sourceNode) return;

        try {
            layer.sourceNode.stop();
        } catch (e) {
            // すでに止まっている場合など
        }
        layer.sourceNode.disconnect(); // 切断
        layer.sourceNode = null;
        layer.isPlaying = false;
        console.log(`Stopped sound: ${id}`);
    }
}

interface SoundLayer {
    buffer: AudioBuffer;
    gainNode: GainNode;
    sourceNode: AudioBufferSourceNode | null;
    isPlaying: boolean;
    volume: number;
}
