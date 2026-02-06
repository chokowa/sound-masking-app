// ImpactDetector.ts

// 検知バンド定義
export interface DetectionBand {
    id: string;
    name: string;
    nameJa: string;
    minFreq: number;
    maxFreq: number;
    description: string;
}

// 詳細版の8バンド
export const DETECTION_BANDS: DetectionBand[] = [
    { id: 'ultra_low', name: 'Ultra Low Impact', nameJa: '超低域衝撃', minFreq: 20, maxFreq: 50, description: '飛び跳ね、ジャンプ' },
    { id: 'footsteps', name: 'Footsteps', nameJa: '歩行音', minFreq: 50, maxFreq: 100, description: '大人の歩行、走る' },
    { id: 'light_impact', name: 'Light Impact', nameJa: '軽い衝撃', minFreq: 100, maxFreq: 300, description: '物を落とす、椅子を引く' },
    { id: 'hard_impact', name: 'Hard Impact', nameJa: '硬質衝撃', minFreq: 300, maxFreq: 1000, description: 'スプーン落下、硬い物' },
    { id: 'low_freq', name: 'Low Frequency', nameJa: '低音域', minFreq: 50, maxFreq: 250, description: '重低音の音楽、ベース' },
    { id: 'voice_male', name: 'Male Voice', nameJa: '話し声(男性)', minFreq: 100, maxFreq: 500, description: '男性の会話' },
    { id: 'voice_female', name: 'Female/Child Voice', nameJa: '話し声(女性/子供)', minFreq: 300, maxFreq: 3000, description: '女性・子供の声、テレビ' },
    { id: 'high_freq', name: 'High Frequency', nameJa: '高周波雑音', minFreq: 2000, maxFreq: 8000, description: '電子機器、換気扇' }
];

// シンプル版の4モード
export const SIMPLE_MODES: { id: string; name: string; nameJa: string; bandIds: string[] }[] = [
    { id: 'footsteps_all', name: 'Footsteps', nameJa: '足音', bandIds: ['ultra_low', 'footsteps', 'light_impact'] },
    { id: 'impact_all', name: 'Impact', nameJa: '衝撃音', bandIds: ['ultra_low', 'footsteps', 'light_impact', 'hard_impact'] },
    { id: 'voice_all', name: 'Voice', nameJa: '話し声', bandIds: ['voice_male', 'voice_female'] },
    { id: 'all', name: 'All', nameJa: '全帯域', bandIds: [] }
];

// コールバック型定義
export interface DetectionCallbacks {
    // Reactiveモード: 衝撃検知時の即時トリガー
    onImpact?: (intensity: number, bandId?: string) => void;
    // Adaptiveモード: 騒音スコア更新時（毎フレーム）
    onNoiseScoreUpdate?: (score: number) => void;
}

export class ImpactDetector {
    private analyser: AnalyserNode;
    private frequencyData: Uint8Array;
    private callbacks: DetectionCallbacks;
    private isRunning = false;
    private animationFrameId: number | null = null;

    // 検知パラメータ
    public sensitivity = 0.5;

    // 有効な検知バンド
    public enabledBandIds: Set<string> = new Set();
    public isSimpleMode = true;

    // 適応的ベースライン
    private baselineEnergies: Map<string, number> = new Map();
    private readonly BASELINE_SMOOTHING = 0.98;

    // Reactiveモード用のクールダウン（衝撃検知）
    private impactCooldownFrames = 0;
    private readonly MAX_IMPACT_COOLDOWN = 20; // 約0.3秒

    // Adaptiveモード: 騒音スコア（移動平均）
    private noiseScore = 0;

    // モード設定
    public reactiveEnabled = true; // Reactive併用
    public adaptiveSpeed = 0.5; // 0.0(遅い) - 1.0(速い)

    // 外部から現在のノイズゲインを受け取る
    private currentNoiseGain = 0;

    // サンプリングレート
    private sampleRate: number;

    constructor(analyser: AnalyserNode, callbacks: DetectionCallbacks, sampleRate: number = 44100) {
        this.analyser = analyser;
        this.callbacks = callbacks;
        this.sampleRate = sampleRate;

        this.analyser.fftSize = 2048;
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.smoothingTimeConstant = 0.5;

        this.setSimpleMode('all');
    }

    // ノイズゲイン更新
    updateNoiseGain(gain: number) {
        this.currentNoiseGain = gain;
    }

    // 現在の騒音スコアを取得
    getNoiseScore(): number {
        return this.noiseScore;
    }

    // シンプルモード設定
    setSimpleMode(modeId: string) {
        this.isSimpleMode = true;
        this.enabledBandIds.clear();
        this.baselineEnergies.clear();

        const mode = SIMPLE_MODES.find(m => m.id === modeId);
        if (mode) {
            mode.bandIds.forEach(id => this.enabledBandIds.add(id));
        }
    }

    // 詳細モード設定
    setDetailedMode(bandIds: string[]) {
        this.isSimpleMode = false;
        this.enabledBandIds.clear();
        this.baselineEnergies.clear();
        bandIds.forEach(id => this.enabledBandIds.add(id));
    }

    toggleBand(bandId: string, enabled: boolean) {
        if (enabled) {
            this.enabledBandIds.add(bandId);
        } else {
            this.enabledBandIds.delete(bandId);
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.baselineEnergies.clear();
        this.noiseScore = 0;
        this.loop();
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private freqToBin(freq: number): number {
        const nyquist = this.sampleRate / 2;
        const binCount = this.analyser.frequencyBinCount;
        return Math.round((freq / nyquist) * binCount);
    }

    private getBandEnergy(minFreq: number, maxFreq: number): number {
        const minBin = Math.max(0, this.freqToBin(minFreq));
        const maxBin = Math.min(this.frequencyData.length - 1, this.freqToBin(maxFreq));

        if (minBin >= maxBin) return 0;

        let sum = 0;
        for (let i = minBin; i <= maxBin; i++) {
            sum += this.frequencyData[i];
        }
        return sum / (maxBin - minBin + 1) / 255;
    }

    private updateBaseline(bandId: string, currentEnergy: number) {
        const prevBaseline = this.baselineEnergies.get(bandId) || currentEnergy;
        const noiseContribution = this.currentNoiseGain * 0.3;

        let newBaseline;
        if (currentEnergy < prevBaseline) {
            newBaseline = prevBaseline * this.BASELINE_SMOOTHING + currentEnergy * (1 - this.BASELINE_SMOOTHING);
        } else {
            newBaseline = prevBaseline * 0.95 + currentEnergy * 0.05;
        }

        const minBaseline = noiseContribution;
        this.baselineEnergies.set(bandId, Math.max(newBaseline, minBaseline));
    }

    private loop = () => {
        if (!this.isRunning) return;

        this.analyser.getByteFrequencyData(this.frequencyData as any);

        // Impactクールダウン処理
        if (this.impactCooldownFrames > 0) {
            this.impactCooldownFrames--;
        }

        // 全バンドまたは選択バンドの騒音成分を計算
        let totalDeviation = 0;
        let maxDeviation = 0;
        let maxDeviationBandId: string | undefined;

        if (this.enabledBandIds.size === 0) {
            // 全帯域
            const energy = this.getBandEnergy(20, 20000);
            const baseline = this.baselineEnergies.get('all') || energy;
            const deviation = Math.max(0, energy - baseline);
            totalDeviation = deviation;
            maxDeviation = deviation;
            this.updateBaseline('all', energy);
        } else {
            // バンド別
            for (const bandId of this.enabledBandIds) {
                const band = DETECTION_BANDS.find(b => b.id === bandId);
                if (!band) continue;

                const energy = this.getBandEnergy(band.minFreq, band.maxFreq);
                const baseline = this.baselineEnergies.get(bandId) || energy;
                const deviation = Math.max(0, energy - baseline);

                totalDeviation += deviation;
                if (deviation > maxDeviation) {
                    maxDeviation = deviation;
                    maxDeviationBandId = bandId;
                }
                this.updateBaseline(bandId, energy);
            }
            // 平均化
            totalDeviation = totalDeviation / this.enabledBandIds.size;
        }

        // Adaptive: 騒音スコアを更新（移動平均）
        // 感度維持のため、ここでは平滑化を弱め（反応を良く）して固定する
        // アタックの遅延はAudioEngine側で制御する
        const smoothing = 0.92;
        this.noiseScore = this.noiseScore * smoothing + totalDeviation * (1 - smoothing);

        // コールバック: 騒音スコア更新
        if (this.callbacks.onNoiseScoreUpdate) {
            this.callbacks.onNoiseScoreUpdate(this.noiseScore);
        }

        // Reactive: 衝撃検知
        if (this.reactiveEnabled && this.impactCooldownFrames === 0) {
            const impactThreshold = 0.3 * (1.0 - this.sensitivity) + 0.05;

            if (maxDeviation > impactThreshold) {
                const intensity = Math.min(maxDeviation * 3, 1.0);
                if (this.callbacks.onImpact) {
                    this.callbacks.onImpact(intensity, maxDeviationBandId);
                }
                this.impactCooldownFrames = this.MAX_IMPACT_COOLDOWN;
            }
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    };
}
