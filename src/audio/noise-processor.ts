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

  // Rumble用の状態変数 (Oscillators)
  private rumblePhase1 = 0;
  private rumblePhase2 = 0;
  private rumblePhase3 = 0;
  private rumbleModPhase = 0; // AM変調用



  static get parameterDescriptors() {
    return [
      { name: 'whiteGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pinkGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'brownGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'darkGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rumbleGain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rumbleFreq', defaultValue: 55, minValue: 20, maxValue: 300, automationRate: 'k-rate' }, // New
      { name: 'rumbleSpeed', defaultValue: 1, minValue: 0.1, maxValue: 10, automationRate: 'k-rate' }, // New
      { name: 'masterGain', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0];
    const whiteGainParam = parameters['whiteGain'];
    const pinkGainParam = parameters['pinkGain'];
    const brownGainParam = parameters['brownGain'];
    const darkGainParam = parameters['darkGain'];
    const rumbleGainParam = parameters['rumbleGain'];
    const rumbleFreqParam = parameters['rumbleFreq']; // New
    const rumbleSpeedParam = parameters['rumbleSpeed']; // New
    const masterGainParam = parameters['masterGain'];

    // k-rateパラメータの取得（先頭値）
    const wGain = whiteGainParam[0];
    const pGain = pinkGainParam[0];
    const bGain = brownGainParam[0];
    const dGain = darkGainParam[0];
    const rGain = rumbleGainParam[0];
    const rFreq = rumbleFreqParam[0];
    const rSpeed = rumbleSpeedParam[0];


    // 全て0なら処理スキップ（最適化）
    if (wGain === 0 && pGain === 0 && bGain === 0 && dGain === 0 && rGain === 0) {
      output.forEach(channel => channel.fill(0));

      return true;
    }

    // チャンネルごとに処理
    const sampleRate = (globalThis as any).sampleRate || 44100;

    output.forEach((channel) => {
      const shouldUseArray = masterGainParam.length > 1;

      // Phase increments for rumble (calculated once per channel block)
      // Osc 1: Main (x1.0)
      // Osc 2: Sub1 (x1.13)
      // Osc 3: Sub2 (x1.31)
      const inc1 = (2 * Math.PI * rFreq) / sampleRate;
      const inc2 = (2 * Math.PI * rFreq * 1.13) / sampleRate;
      const inc3 = (2 * Math.PI * rFreq * 1.31) / sampleRate;

      // AM Modulation increment
      const modInc = (2 * Math.PI * rSpeed) / sampleRate;

      for (let i = 0; i < channel.length; i++) {
        const mGain = shouldUseArray ? masterGainParam[i] : masterGainParam[0];

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

        // 5. Rumble (Dynamic Sub-Bass)
        if (rGain > 0) {
          this.rumblePhase1 += inc1;
          this.rumblePhase2 += inc2;
          this.rumblePhase3 += inc3;

          if (this.rumblePhase1 > 2 * Math.PI) this.rumblePhase1 -= 2 * Math.PI;
          if (this.rumblePhase2 > 2 * Math.PI) this.rumblePhase2 -= 2 * Math.PI;
          if (this.rumblePhase3 > 2 * Math.PI) this.rumblePhase3 -= 2 * Math.PI;

          // AM Mod Phase update
          this.rumbleModPhase += modInc;
          if (this.rumbleModPhase > 2 * Math.PI) this.rumbleModPhase -= 2 * Math.PI;

          let rumble = Math.sin(this.rumblePhase1) * 0.5 +
            Math.sin(this.rumblePhase2) * 0.3 +
            Math.sin(this.rumblePhase3) * 0.2;

          // Apply AM Modulation (0.7 ~ 1.3 depth)
          const mod = 1.0 + Math.sin(this.rumbleModPhase) * 0.3;
          rumble *= mod;

          mixedOutput += rumble * rGain * 0.8;
        }

        channel[i] = mixedOutput * mGain;
      }
    });

    return true;
  }
}

registerProcessor('noise-processor', NoiseProcessor);
