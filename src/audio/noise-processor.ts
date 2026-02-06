// noise-processor.ts

class NoiseProcessor extends AudioWorkletProcessor {
  // ピンクノイズ用の状態変数
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;

  // ブラウンノイズ用の状態変数
  private lastBrown = 0;
  // Dark Brown用の状態変数
  private lastDark = 0;

  static get parameterDescriptors() {
    return [
      { name: 'whiteGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pinkGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'brownGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'darkGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'masterGain', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0];
    const whiteGainParam = parameters['whiteGain'];
    const pinkGainParam = parameters['pinkGain'];
    const brownGainParam = parameters['brownGain'];
    const darkGainParam = parameters['darkGain'];
    const masterGainParam = parameters['masterGain'];

    // k-rateパラメータの取得（先頭値）
    const wGain = whiteGainParam[0];
    const pGain = pinkGainParam[0];
    const bGain = brownGainParam[0];
    const dGain = darkGainParam[0];

    // 全て0なら処理スキップ（最適化）
    if (wGain === 0 && pGain === 0 && bGain === 0 && dGain === 0) {
      output.forEach(channel => channel.fill(0));
      return true;
    }

    // チャンネルごとに処理
    output.forEach((channel) => {
      for (let i = 0; i < channel.length; i++) {
        const mGain = masterGainParam.length > 1 ? masterGainParam[i] : masterGainParam[0];

        // White Noise Source
        const white = Math.random() * 2 - 1;

        let mixedOutput = 0;

        // 1. White Noise
        if (wGain > 0) {
          mixedOutput += white * wGain;
        }

        // 2. Pink Noise (Paul Kellet's optimized method)
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

        // 3. Brown Noise (Standard -6dB/oct)
        // 係数 0.02 / 1.02 -> カットオフ高め
        const brownUpdate = (this.lastBrown + (0.02 * white)) / 1.02;
        this.lastBrown = brownUpdate;
        if (bGain > 0) {
          mixedOutput += (brownUpdate * 3.5) * bGain;
        }

        // 4. Dark Brown (Ultra Low)
        // 係数を小さくしてカットオフを下げる (より「こもった」地響き系)
        // 0.005 / 1.005
        const darkUpdate = (this.lastDark + (0.005 * white)) / 1.005;
        this.lastDark = darkUpdate;
        if (dGain > 0) {
          // エネルギーが低域に集中するため振幅が大きくなりやすいので補正
          mixedOutput += (darkUpdate * 4.0) * dGain;
        }

        channel[i] = mixedOutput * mGain;
      }
    });

    return true;
  }
}

registerProcessor('noise-processor', NoiseProcessor);
