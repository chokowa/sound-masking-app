// Visualizer.ts

export class Visualizer {
    private canvas: HTMLCanvasElement;
    private canvasCtx: CanvasRenderingContext2D;
    private outputAnalyser: AnalyserNode | null = null;
    private inputAnalyser: AnalyserNode | null = null;
    private animationId: number | null = null;
    private isRunning = false;

    // バッファ
    private outputData: Uint8Array | null = null;
    private inputData: Uint8Array | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.canvasCtx = this.canvas.getContext('2d')!;

        // 高DPI対応
        this.setupCanvas();
        window.addEventListener('resize', () => this.setupCanvas());
    }

    private setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvasCtx.scale(dpr, dpr);
    }

    setOutputAnalyser(analyser: AnalyserNode) {
        this.outputAnalyser = analyser;
        this.outputAnalyser.fftSize = 256;
        this.outputData = new Uint8Array(this.outputAnalyser.frequencyBinCount);
    }

    setInputAnalyser(analyser: AnalyserNode) {
        this.inputAnalyser = analyser;
        this.inputAnalyser.fftSize = 256;
        this.inputData = new Uint8Array(this.inputAnalyser.frequencyBinCount);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.draw();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        // 停止時にキャンバスをクリア
        this.clear();
    }

    private clear() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvasCtx.fillStyle = '#1a1a1a';
        this.canvasCtx.fillRect(0, 0, rect.width, rect.height);
    }

    private draw = () => {
        if (!this.isRunning) return;

        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const halfHeight = height / 2;

        // 背景をクリア
        this.canvasCtx.fillStyle = '#1a1a1a';
        this.canvasCtx.fillRect(0, 0, width, height);

        // 中央線
        this.canvasCtx.strokeStyle = '#333';
        this.canvasCtx.lineWidth = 1;
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(0, halfHeight);
        this.canvasCtx.lineTo(width, halfHeight);
        this.canvasCtx.stroke();

        // 出力波形（下半分・青系グラデーション）
        if (this.outputAnalyser && this.outputData) {
            this.outputAnalyser.getByteFrequencyData(this.outputData as any);
            this.drawBars(this.outputData, halfHeight, height, '#4f46e5', '#818cf8');
        }

        // 入力波形（上半分・緑系グラデーション）
        if (this.inputAnalyser && this.inputData) {
            this.inputAnalyser.getByteFrequencyData(this.inputData as any);
            this.drawBars(this.inputData, 0, halfHeight, '#059669', '#34d399', true);
        }

        // ラベル
        this.canvasCtx.font = '10px Inter, sans-serif';
        this.canvasCtx.fillStyle = '#666';
        this.canvasCtx.fillText('Input (Mic)', 5, 12);
        this.canvasCtx.fillText('Output (Noise)', 5, halfHeight + 12);

        this.animationId = requestAnimationFrame(this.draw);
    };

    private drawBars(
        data: Uint8Array,
        yStart: number,
        yEnd: number,
        colorStart: string,
        colorEnd: string,
        inverted: boolean = false
    ) {
        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const barCount = data.length;
        const barWidth = width / barCount;
        const maxBarHeight = yEnd - yStart;

        // グラデーション
        const gradient = this.canvasCtx.createLinearGradient(0, yStart, 0, yEnd);
        if (inverted) {
            gradient.addColorStop(0, colorEnd);
            gradient.addColorStop(1, colorStart);
        } else {
            gradient.addColorStop(0, colorStart);
            gradient.addColorStop(1, colorEnd);
        }
        this.canvasCtx.fillStyle = gradient;

        for (let i = 0; i < barCount; i++) {
            const barHeight = (data[i] / 255) * maxBarHeight * 0.9;
            const x = i * barWidth;

            if (inverted) {
                // 上半分：下から上へ伸びる
                this.canvasCtx.fillRect(x, yEnd - barHeight, barWidth - 1, barHeight);
            } else {
                // 下半分：上から下へ伸びる
                this.canvasCtx.fillRect(x, yStart, barWidth - 1, barHeight);
            }
        }
    }
}
