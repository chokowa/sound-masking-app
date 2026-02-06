import './style.css'
import { AudioEngine } from './audio/AudioEngine';
import { Visualizer } from './audio/Visualizer';

const engine = new AudioEngine();
const visualizer = new Visualizer('visualizer');

// ゲインインジケーター要素
const adaptiveIndicator = document.getElementById('adaptive-indicator') as HTMLDivElement;
const adaptiveIndicatorValue = document.getElementById('adaptive-indicator-value') as HTMLSpanElement;
const reactiveIndicator = document.getElementById('reactive-indicator') as HTMLDivElement;
const reactiveIndicatorValue = document.getElementById('reactive-indicator-value') as HTMLSpanElement;

// マイク入力インジケーター
const micInputLevel = document.getElementById('mic-input-level') as HTMLDivElement;

// インジケーター更新ループ
let indicatorAnimationId: number | null = null;

function startIndicatorLoop() {
  const updateIndicators = () => {
    const gains = engine.getGainValues();

    // Adaptive
    const adaptiveActive = gains.adaptive > 1.01;
    adaptiveIndicator.classList.toggle('active', adaptiveActive);
    adaptiveIndicatorValue.textContent = gains.adaptive.toFixed(2) + 'x';

    // Reactive
    const reactiveActive = gains.reactive > 1.01;
    reactiveIndicator.classList.toggle('active', reactiveActive);
    reactiveIndicatorValue.textContent = gains.reactive.toFixed(2) + 'x';

    // Mic Input Level
    if (micInputLevel) {
      const micVolume = engine.getMicrophoneVolume();
      micInputLevel.style.width = `${micVolume * 100}%`;
    }

    indicatorAnimationId = requestAnimationFrame(updateIndicators);
  };

  indicatorAnimationId = requestAnimationFrame(updateIndicators);
}

function stopIndicatorLoop() {
  if (indicatorAnimationId !== null) {
    cancelAnimationFrame(indicatorAnimationId);
    indicatorAnimationId = null;
  }
  // リセット
  adaptiveIndicator.classList.remove('active');
  reactiveIndicator.classList.remove('active');
  adaptiveIndicatorValue.textContent = '1.0x';
  reactiveIndicatorValue.textContent = '1.0x';
}

const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumeValue = document.getElementById('volume-value') as HTMLSpanElement;
const noiseSlider = document.getElementById('noise-slider') as HTMLInputElement;
const noiseValue = document.getElementById('noise-value') as HTMLSpanElement;
const soundSlider = document.getElementById('sound-slider') as HTMLInputElement;
const soundValue = document.getElementById('sound-value') as HTMLSpanElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

// Auto Mode UI
const autoModeCheck = document.getElementById('auto-mode-check') as HTMLInputElement;
const sensSlider = document.getElementById('sens-slider') as HTMLInputElement;
const sensValue = document.getElementById('sens-value') as HTMLSpanElement;

// 初期設定
volumeValue.textContent = parseFloat(volumeSlider.value).toFixed(2);

// Media Session Setup
function setupMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Sound Masking',
      artist: 'AntiGravity',
      album: 'Ambient Noise Generator',
      artwork: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', async () => {
      if (engine.isInitialized) {
        await engine.resume();
        updatePlayButtonState(true);
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      if (engine.isInitialized) {
        engine.suspend();
        updatePlayButtonState(false);
      }
    });
  }
}

// Media Session Setup Call
setupMediaSession();

// Helper to update UI based on playback state
function updatePlayButtonState(isPlaying: boolean) {
  if (isPlaying) {
    statusEl.textContent = 'Running';
    statusEl.className = 'status-running';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusEl.textContent = 'Stopped';
    statusEl.className = 'status-stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// Start Button Handler
startBtn.addEventListener('click', async () => {
  try {
    if (!engine.isInitialized) {
      await engine.init();
    }
    await engine.resume();

    // Soundscapesロード開始
    initAndLoadSounds();

    // 現在選択されているノイズタイプを適用
    const selectedRadio = document.querySelector('input[name="noiseType"]:checked') as HTMLInputElement;
    if (selectedRadio) {
      engine.setNoiseType(parseInt(selectedRadio.value));
    }

    // Update UI
    updatePlayButtonState(true);
    startIndicatorLoop();

    // Update Media Session State
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }

    // 現在の音量を適用
    engine.setVolume(parseFloat(volumeSlider.value));

    // 初期設定を適用
    updateMixer();
    engine.setVolume(parseFloat(volumeSlider.value));
    engine.setNoiseVolume(parseFloat(noiseSlider.value));
    engine.setSoundscapeVolume(parseFloat(soundSlider.value));

    // ビジュアライザー開始
    const outputAnalyser = engine.getOutputAnalyser();
    if (outputAnalyser) {
      visualizer.setOutputAnalyser(outputAnalyser);
    }
    visualizer.start();
    startIndicatorLoop(); // インジケーター開始

    statusEl.textContent = 'Playing';
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Auto Mode設定反映
    if (autoModeCheck.checked) {
      engine.toggleAutoMode(true);
      // 入力Analyserをビジュアライザーに設定
      setTimeout(() => {
        const inputAnalyser = engine.getInputAnalyser();
        if (inputAnalyser) {
          visualizer.setInputAnalyser(inputAnalyser);
        }
      }, 500); // マイク初期化待ち
    }

  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Error: ' + String(e);
  }
});

stopBtn.addEventListener('click', () => {
  engine.suspend();
  engine.toggleAutoMode(false);
  autoModeCheck.checked = false;
  visualizer.stop();
  stopIndicatorLoop(); // インジケーター停止
  statusEl.textContent = 'Stopped';
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

volumeSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  volumeValue.textContent = val.toFixed(2);
  engine.setVolume(val);
});

noiseSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  noiseValue.textContent = val.toFixed(2);
  engine.setNoiseVolume(val);
});

soundSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  soundValue.textContent = val.toFixed(2);
  engine.setSoundscapeVolume(val);
});

// 初期表示更新
volumeValue.textContent = parseFloat(volumeSlider.value).toFixed(2);
noiseValue.textContent = parseFloat(noiseSlider.value).toFixed(2);
soundValue.textContent = parseFloat(soundSlider.value).toFixed(2);

// noiseRadiosリスナー削除（ミキサーに移行済み）

autoModeCheck.addEventListener('change', (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  if (!engine.isInitialized && checked) {
    return;
  }
  try {
    engine.toggleAutoMode(checked);
    statusEl.textContent = checked ? 'Auto Mode Active' : 'Playing';

    // 入力Analyserをビジュアライザーに設定
    if (checked) {
      setTimeout(() => {
        const inputAnalyser = engine.getInputAnalyser();
        if (inputAnalyser) {
          visualizer.setInputAnalyser(inputAnalyser);
        }
      }, 500);
    }
  } catch (e) {
    console.error(e);
    autoModeCheck.checked = false;
    alert('Microphone access required for Auto Mode.');
  }
});

sensSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  sensValue.textContent = val.toFixed(2);
  engine.setSensitivity(val);
});

// ==========================================
// 検知モード切り替え
// ==========================================

const simpleModeBtn = document.getElementById('simple-mode-btn') as HTMLButtonElement;
const detailedModeBtn = document.getElementById('detailed-mode-btn') as HTMLButtonElement;
const simpleModePanel = document.getElementById('simple-mode-panel') as HTMLDivElement;
const detailedModePanel = document.getElementById('detailed-mode-panel') as HTMLDivElement;

// シンプル/詳細モード切り替え
simpleModeBtn.addEventListener('click', () => {
  simpleModeBtn.classList.add('active');
  detailedModeBtn.classList.remove('active');
  simpleModePanel.classList.remove('hidden');
  detailedModePanel.classList.add('hidden');
});

detailedModeBtn.addEventListener('click', () => {
  detailedModeBtn.classList.add('active');
  simpleModeBtn.classList.remove('active');
  detailedModePanel.classList.remove('hidden');
  simpleModePanel.classList.add('hidden');

  // 詳細モードに切り替え時、現在選択されているチェックボックスを反映
  applyDetailedModeFromCheckboxes();
});

// シンプルモードボタン
document.querySelectorAll('.simple-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.simple-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const modeId = (btn as HTMLElement).dataset.mode;
    if (modeId) {
      engine.setDetectionSimpleMode(modeId);
    }
  });
});

// 詳細モードチェックボックス
function applyDetailedModeFromCheckboxes() {
  const selectedBands: string[] = [];
  document.querySelectorAll('.band-check input[type="checkbox"]').forEach((checkbox) => {
    const input = checkbox as HTMLInputElement;
    if (input.checked) {
      const bandId = input.dataset.band;
      if (bandId) selectedBands.push(bandId);
    }
  });
  engine.setDetectionDetailedMode(selectedBands);
}

document.querySelectorAll('.band-check input[type="checkbox"]').forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    applyDetailedModeFromCheckboxes();
  });
});

// ==========================================
// ゲイン調整設定（Adaptive + Reactive）
// ==========================================

// Adaptive反応速度 (Attack)
const adaptiveSpeedSlider = document.getElementById('adaptive-speed-slider') as HTMLInputElement;
const adaptiveSpeedValue = document.getElementById('adaptive-speed-value') as HTMLSpanElement;

adaptiveSpeedSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  adaptiveSpeedValue.textContent = val.toFixed(1);
  engine.setAdaptiveSpeed(val);
});

// Adaptive減衰時間 (Decay)
const adaptiveDecaySlider = document.getElementById('adaptive-decay-slider') as HTMLInputElement;
const adaptiveDecayValue = document.getElementById('adaptive-decay-value') as HTMLSpanElement;

adaptiveDecaySlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  adaptiveDecayValue.textContent = val.toFixed(1);
  engine.setAdaptiveDecay(val);
});

// Reactive有効/無効
const reactiveCheck = document.getElementById('reactive-check') as HTMLInputElement;
const reactiveControls = document.getElementById('reactive-controls') as HTMLDivElement;
const reactiveSensControls = document.getElementById('reactive-sens-controls') as HTMLDivElement;

reactiveCheck.addEventListener('change', (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  engine.setReactiveEnabled(checked);
  reactiveControls.classList.toggle('disabled', !checked);
  reactiveSensControls.classList.toggle('disabled', !checked);
});

// Reactiveブースト強度
const reactiveStrengthSlider = document.getElementById('reactive-strength-slider') as HTMLInputElement;
const reactiveStrengthValue = document.getElementById('reactive-strength-value') as HTMLSpanElement;

reactiveStrengthSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  reactiveStrengthValue.textContent = val.toFixed(2);
  engine.setReactiveBoostStrength(val);
});

// Reactiveブースト持続時間
const reactiveDurationSlider = document.getElementById('reactive-duration-slider') as HTMLInputElement;
const reactiveDurationValue = document.getElementById('reactive-duration-value') as HTMLSpanElement;

reactiveDurationSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value);
  reactiveDurationValue.textContent = String(val);
  engine.setReactiveBoostDuration(val);
});


// EQ Sliders
const eqSliders = document.querySelectorAll('.eq-slider');
eqSliders.forEach((slider) => {
  slider.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const bandIndex = parseInt(target.dataset.band || '0');
    const gainDb = parseFloat(target.value);

    const valueSpan = target.parentElement?.querySelector('.eq-value');
    if (valueSpan) {
      valueSpan.textContent = gainDb > 0 ? `+${gainDb}` : String(gainDb);
    }

    engine.setEQBand(bandIndex, gainDb);
  });
});

// Noise Mixer Elements
const mixWhiteSlider = document.getElementById('mix-white') as HTMLInputElement;
const mixPinkSlider = document.getElementById('mix-pink') as HTMLInputElement;
const mixBrownSlider = document.getElementById('mix-brown') as HTMLInputElement;
const mixDarkSlider = document.getElementById('mix-dark') as HTMLInputElement;

const valWhite = document.getElementById('val-white') as HTMLSpanElement;
const valPink = document.getElementById('val-pink') as HTMLSpanElement;
const valBrown = document.getElementById('val-brown') as HTMLSpanElement;
const valDark = document.getElementById('val-dark') as HTMLSpanElement;
// Sub-Bass
const mixSubSlider = document.getElementById('mix-sub') as HTMLInputElement;
const valSub = document.getElementById('val-sub') as HTMLSpanElement;

// Mixer Event Handlers
function updateMixer() {
  const w = parseFloat(mixWhiteSlider.value);
  const p = parseFloat(mixPinkSlider.value);
  const b = parseFloat(mixBrownSlider.value);
  const d = parseFloat(mixDarkSlider.value);
  const s = parseFloat(mixSubSlider.value);

  valWhite.textContent = Math.round(w * 100) + '%';
  valPink.textContent = Math.round(p * 100) + '%';
  valBrown.textContent = Math.round(b * 100) + '%';
  valDark.textContent = Math.round(d * 100) + '%';
  valSub.textContent = Math.round(s * 100) + '%';

  engine.setNoiseMix(w, p, b, d);
  engine.setSubBassVolume(s);
}

// UI更新ヘルパー (プリセット適用時などに使う)
function applyMixerUI(w: number, p: number, b: number, d: number, s: number) {
  mixWhiteSlider.value = String(w);
  mixPinkSlider.value = String(p);
  mixBrownSlider.value = String(b);
  mixDarkSlider.value = String(d);
  mixSubSlider.value = String(s);

  // engineへの送信はupdateMixer内で行うが、
  // UIから呼ばれた場合と区別するためここでは呼び出さず、
  // 値表示の更新だけ行うか、あるいは updateMixer を呼ぶか。
  // ここではシンプルに呼び出し元で一括管理するため、
  // applyMixerUIは「スライダーと数値表示の更新」に徹するべきだが、
  // 既存コードで applyMixerUI(...) の後に engine.setNoiseMix を呼んでいるので、
  // ここではUI更新のみを行う。

  valWhite.textContent = Math.round(w * 100) + '%';
  valPink.textContent = Math.round(p * 100) + '%';
  valBrown.textContent = Math.round(b * 100) + '%';
  valDark.textContent = Math.round(d * 100) + '%';
}

[mixWhite, mixPink, mixBrown, mixDark].forEach(slider => {
  slider.addEventListener('input', updateMixer);
});

// プリセット定義（リサーチ資料に基づく最適設定）
// プリセット定義（リサーチ資料に基づく最適設定）
interface Preset {
  mix: { w: number; p: number; b: number; d: number }; // White, Pink, Brown, Dark
  eq: number[];      // 5バンドEQ値 [60Hz, 250Hz, 1kHz, 4kHz, 12kHz]
  volume: number;
}

const PRESETS: Record<string, Preset> = {
  // 子供の走り回り (LH): < 63Hz, Deep Brown主体 + 60Hz Max Boost
  footsteps_child: { mix: { w: 0, p: 0, b: 0.8, d: 0.8 }, eq: [12, 6, 0, -4, -8], volume: 0.20 },

  // 大人の歩行 (LH): 63-250Hz, Brown/Pink Mix + 250Hz Boost
  footsteps_adult: { mix: { w: 0, p: 0.2, b: 0.6, d: 0.4 }, eq: [4, 8, 2, 0, -4], volume: 0.18 },

  // 落下音 (LL): 100-500Hz, Pink主体 mid-range boost
  impact_mid: { mix: { w: 0, p: 0.7, b: 0.3, d: 0.2 }, eq: [2, 6, 4, 0, -4], volume: 0.15 },

  // 話し声・テレビ: 100-3kHz, Pink/White Mix
  voices: { mix: { w: 0.2, p: 0.6, b: 0.2, d: 0 }, eq: [-4, 4, 8, 4, -2], volume: 0.12 },

  // 睡眠用: High cut for relaxation
  sleep: { mix: { w: 0, p: 0, b: 1.0, d: 0.1 }, eq: [6, 4, 0, -6, -10], volume: 0.08 },

  // 集中用: Pink/Brown Mix
  focus: { mix: { w: 0, p: 0.6, b: 0.4, d: 0 }, eq: [2, 2, 0, 0, -2], volume: 0.1 },

  // 耳鳴り/高音対策: > 4kHz, White + High Boost
  tinnitus: { mix: { w: 0.4, p: 0.1, b: 0, d: 0 }, eq: [-12, -6, 0, 6, 12], volume: 0.05 },

  // フラット
  flat: { mix: { w: 0.5, p: 0, b: 0, d: 0 }, eq: [0, 0, 0, 0, 0], volume: 0.1 }
};

// プリセット適用関数
function applyPreset(presetName: string) {
  const preset = PRESETS[presetName];
  if (!preset) return;

  // ノイズミキシング設定適用
  const m = preset.mix;
  applyMixerUI(m.w, m.p, m.b, m.d);
  engine.setNoiseMix(m.w, m.p, m.b, m.d);

  // EQ設定
  preset.eq.forEach((gain, index) => {
    engine.setEQBand(index, gain);
    const slider = document.querySelector(`.eq-slider[data-band="${index}"]`) as HTMLInputElement;
    if (slider) {
      slider.value = String(gain);
      const valueSpan = slider.parentElement?.querySelector('.eq-value');
      if (valueSpan) {
        valueSpan.textContent = gain > 0 ? `+${gain}` : String(gain);
      }
    }
  });

  // ボリューム設定
  engine.setVolume(preset.volume);
  volumeSlider.value = String(preset.volume);
  volumeValue.textContent = preset.volume.toFixed(2);

  // アクティブ表示
  document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.preset-btn[data-preset="${presetName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

// プリセットボタンイベント
const presetBtns = document.querySelectorAll('.preset-btn');
presetBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const presetName = (btn as HTMLElement).dataset.preset;
    if (presetName) {
      applyPreset(presetName);
    }
  });
});

// ==========================================
// カスタムスロット機能
// ==========================================

const SLOT_STORAGE_KEY = 'soundmasking_custom_slots_v2'; // v2へ移行

interface CustomSlotData {
  mix: { w: number; p: number; b: number; d: number; s?: number }; // Sub added
  eq: number[];
  volume: number;
  noiseVolume: number; // New V3
  soundVolume: number; // New V3
  soundscapes: Record<string, number>; // New V3: Sound ID -> volume

  // New V4: Auto Masking settings (Timer excluded)
  autoMode: boolean;
  detectionMode: string; // 'simple' or 'detailed'
  simpleModeId: string; // e.g., 'all'
  detailedBands: string[]; // List of checked bands

  // Auto Masking Sliders
  adaptiveSpeed: number;
  adaptiveDecay: number;
  reactiveEnabled: boolean;
  sensitivity: number;
  reactiveStrength: number;
  reactiveDuration: number;

  // New V5: Fluctuation
  fluctuationEnabled?: boolean;
  fluctuationStrength?: number;

  savedAt: string;
}

// 現在の設定を取得
function getCurrentSettings(): CustomSlotData {
  const mix = {
    w: parseFloat(mixWhiteSlider.value),
    p: parseFloat(mixPinkSlider.value),
    b: parseFloat(mixBrownSlider.value),
    d: parseFloat(mixDarkSlider.value),
    s: parseFloat(mixSubSlider.value)
  };

  const eq: number[] = [];
  document.querySelectorAll('.eq-slider').forEach((slider) => {
    eq.push(parseFloat((slider as HTMLInputElement).value));
  });

  const volume = parseFloat(volumeSlider.value);
  const noiseVolume = parseFloat(noiseSlider.value);
  const soundVolume = parseFloat(soundSlider.value);

  const soundscapes: Record<string, number> = {};
  document.querySelectorAll('.sound-slider').forEach((slider) => {
    const s = slider as HTMLInputElement;
    const id = s.dataset.sound;
    if (id && parseFloat(s.value) > 0) {
      soundscapes[id] = parseFloat(s.value);
    }
  });

  // Auto Masking Settings
  const autoMode = autoModeCheck.checked;
  const detectionMode = document.getElementById('simple-mode-panel')?.classList.contains('hidden') ? 'detailed' : 'simple';

  const activeSimpleBtn = document.querySelector('.simple-mode-btn.active') as HTMLElement;
  const simpleModeId = activeSimpleBtn ? activeSimpleBtn.dataset.mode || 'all' : 'all';

  const detailedBands: string[] = [];
  document.querySelectorAll('.band-check input[type="checkbox"]').forEach((c) => {
    const cb = c as HTMLInputElement;
    if (cb.checked && cb.dataset.band) detailedBands.push(cb.dataset.band);
  });

  // Fluctuation
  const fluctuationEnabled = fluctuationCheck.checked;
  const fluctuationStrength = parseFloat(fluctuationStrengthSlider.value);

  return {
    mix,
    eq,
    volume,
    noiseVolume,
    soundVolume,
    soundscapes,

    // Auto Masking
    autoMode,
    detectionMode,
    simpleModeId,
    detailedBands,
    adaptiveSpeed: parseFloat(adaptiveSpeedSlider.value),
    adaptiveDecay: parseFloat(adaptiveDecaySlider.value),
    reactiveEnabled: reactiveCheck.checked,
    sensitivity: parseFloat(sensSlider.value),
    reactiveStrength: parseFloat(reactiveStrengthSlider.value),
    reactiveDuration: parseInt(reactiveDurationSlider.value),

    fluctuationEnabled,
    fluctuationStrength,
    savedAt: new Date().toISOString()
  };
}

// Fluctuation Elements
const fluctuationCheck = document.getElementById('fluctuation-check') as HTMLInputElement;
const fluctuationStrengthSlider = document.getElementById('fluctuation-strength-slider') as HTMLInputElement;
const fluctuationStrengthValue = document.getElementById('fluctuation-strength-value') as HTMLSpanElement;

fluctuationCheck.addEventListener('change', (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  engine.setFluctuation(checked);
});

fluctuationStrengthSlider.addEventListener('input', (e) => {
  const val = parseFloat((e.target as HTMLInputElement).value);
  fluctuationStrengthValue.textContent = val.toFixed(1);
  engine.setFluctuationStrength(val);
});

// スロットデータを読み込み
function loadSlotData(): Record<string, CustomSlotData> {
  try {
    const data = localStorage.getItem(SLOT_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// スロットデータを保存
function saveSlotData(slots: Record<string, CustomSlotData>) {
  localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(slots));
}

// スロットにセーブ
function saveToSlot(slotId: string) {
  const slots = loadSlotData();
  slots[slotId] = getCurrentSettings();
  saveSlotData(slots);
  updateSlotUI();
}

// スロットからロード
function loadFromSlot(slotId: string) {
  const slots = loadSlotData();
  const slotData = slots[slotId];
  if (!slotData) return;

  // ノイズタイプ設定
  // ノイズ設定復元
  // 旧データ互換性チェック: noiseTypeがある場合は変換
  const anySlot = slotData as any;
  if (anySlot.noiseType !== undefined && !slotData.mix) {
    // Migration
    const type = anySlot.noiseType;
    let w = 0, p = 0, b = 0, d = 0, s = 0;
    if (type === 0) w = 1;
    else if (type === 1) p = 1;
    else b = 1;

    applyMixerUI(w, p, b, d, s);
    engine.setNoiseMix(w, p, b, d);
    engine.setSubBassVolume(s);
  } else if (slotData.mix) {
    const m = slotData.mix;
    // 古いデータにはsがないかもしれないのでチェック
    const s = (m as any).s || 0;
    applyMixerUI(m.w, m.p, m.b, m.d, s);
    engine.setNoiseMix(m.w, m.p, m.b, m.d);
    engine.setSubBassVolume(s);
  }

  // EQ設定
  slotData.eq.forEach((gain, index) => {
    engine.setEQBand(index, gain);
    const slider = document.querySelector(`.eq-slider[data-band="${index}"]`) as HTMLInputElement;
    if (slider) {
      slider.value = String(gain);
      const valueSpan = slider.parentElement?.querySelector('.eq-value');
      if (valueSpan) {
        valueSpan.textContent = gain > 0 ? `+${gain}` : String(gain);
      }
    }
  });

  // ボリューム設定
  engine.setVolume(slotData.volume);
  volumeSlider.value = String(slotData.volume);
  volumeValue.textContent = slotData.volume.toFixed(2);

  if (slotData.noiseVolume !== undefined) {
    engine.setNoiseVolume(slotData.noiseVolume);
    noiseSlider.value = String(slotData.noiseVolume);
    noiseValue.textContent = slotData.noiseVolume.toFixed(2);
  }

  if (slotData.soundVolume !== undefined) {
    engine.setSoundscapeVolume(slotData.soundVolume);
    soundSlider.value = String(slotData.soundVolume);
    soundValue.textContent = slotData.soundVolume.toFixed(2);
  }

  // Soundscapes復元 (一度全てリセットしてから適用)
  // まず全てのSoundSliderを0にする
  document.querySelectorAll('.sound-slider').forEach((slider) => {
    const s = slider as HTMLInputElement;
    s.value = '0';
    const id = s.dataset.sound;
    if (id) engine.setSoundVolume(id, 0);
  });

  if (slotData.soundscapes) {
    Object.entries(slotData.soundscapes).forEach(([id, vol]) => {
      engine.setSoundVolume(id, vol);
      const s = document.querySelector(`.sound-slider[data-sound="${id}"]`) as HTMLInputElement;
      if (s) {
        s.value = String(vol);
      }
    });
  }

  // Auto Masking復元 (V4)
  if (slotData.autoMode !== undefined) {
    autoModeCheck.checked = slotData.autoMode;
    // Dispatch event to trigger engine update
    autoModeCheck.dispatchEvent(new Event('change'));

    // Mode Selection
    if (slotData.detectionMode === 'detailed') {
      detailedModeBtn.click();
      // Restore checked bands
      document.querySelectorAll('.band-check input[type="checkbox"]').forEach((c) => {
        const cb = c as HTMLInputElement;
        cb.checked = slotData.detailedBands.includes(cb.dataset.band || '');
      });
      // Apply
      applyDetailedModeFromCheckboxes();
    } else {
      simpleModeBtn.click();
      // Click corresponding simple mode button
      const btn = document.querySelector(`.simple-mode-btn[data-mode="${slotData.simpleModeId}"]`) as HTMLElement;
      if (btn) btn.click();
    }

    // Sliders & Checks
    adaptiveSpeedSlider.value = String(slotData.adaptiveSpeed);
    adaptiveSpeedValue.textContent = slotData.adaptiveSpeed.toFixed(1);
    engine.setAdaptiveSpeed(slotData.adaptiveSpeed);

    adaptiveDecaySlider.value = String(slotData.adaptiveDecay);
    adaptiveDecayValue.textContent = slotData.adaptiveDecay.toFixed(1);
    engine.setAdaptiveDecay(slotData.adaptiveDecay);

    reactiveCheck.checked = slotData.reactiveEnabled;
    // Trigger change to update UI state
    reactiveCheck.dispatchEvent(new Event('change'));

    sensSlider.value = String(slotData.sensitivity);
    sensValue.textContent = slotData.sensitivity.toFixed(1);
    engine.setSensitivity(slotData.sensitivity);

    reactiveStrengthSlider.value = String(slotData.reactiveStrength);
    reactiveStrengthValue.textContent = slotData.reactiveStrength.toFixed(2);
    engine.setReactiveBoostStrength(slotData.reactiveStrength);

    reactiveDurationSlider.value = String(slotData.reactiveDuration);
    reactiveDurationValue.textContent = String(slotData.reactiveDuration);
    engine.setReactiveBoostDuration(slotData.reactiveDuration);
  }

  // Fluctuation復元
  if (slotData.fluctuationEnabled !== undefined) {
    fluctuationCheck.checked = slotData.fluctuationEnabled;
    engine.setFluctuation(slotData.fluctuationEnabled);
  } else {
    fluctuationCheck.checked = false;
    engine.setFluctuation(false);
  }
  if (slotData.fluctuationStrength !== undefined) {
    fluctuationStrengthSlider.value = String(slotData.fluctuationStrength);
    fluctuationStrengthValue.textContent = slotData.fluctuationStrength.toFixed(1);
    engine.setFluctuationStrength(slotData.fluctuationStrength);
  }

  // プリセットのアクティブ表示をクリア
  document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
}


// スロットUIを更新
function updateSlotUI() {
  const slots = loadSlotData();

  for (let i = 1; i <= 3; i++) {
    const slotId = String(i);
    const slotData = slots[slotId];
    const statusEl = document.getElementById(`slot-status-${i}`);
    const loadBtn = document.querySelector(`.load-btn[data-slot="${i}"]`) as HTMLButtonElement;

    if (slotData) {
      // 保存日時をフォーマット
      const date = new Date(slotData.savedAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      const noiseNames = ['White', 'Pink', 'Brown'];

      if (statusEl) {
        const anySlot = slotData as any;
        const name = anySlot.noiseType !== undefined ? noiseNames[anySlot.noiseType] : 'Custom Mix';
        statusEl.textContent = `${name} / Vol ${(slotData.volume * 100).toFixed(0)}% (${dateStr})`;
        statusEl.classList.add('has-data');
      }
      if (loadBtn) loadBtn.disabled = false;
    } else {
      if (statusEl) {
        statusEl.textContent = 'Empty';
        statusEl.classList.remove('has-data');
      }
      if (loadBtn) loadBtn.disabled = true;
    }
  }
}

// セーブボタンイベント
document.querySelectorAll('.save-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const slotId = (btn as HTMLElement).dataset.slot;
    if (slotId) {
      saveToSlot(slotId);
    }
  });
});

// ロードボタンイベント
document.querySelectorAll('.load-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const slotId = (btn as HTMLElement).dataset.slot;
    if (slotId) {
      loadFromSlot(slotId);
    }
  });
});

// 初期化時にスロットUIを更新
updateSlotUI();

// ==========================================
// タイマー機能
// ==========================================

// タイマー要素
const timerPresetBtns = document.querySelectorAll('.timer-presets .timer-btn');
const timerCustomInput = document.getElementById('timer-custom-input') as HTMLInputElement;
const timerCustomBtn = document.getElementById('timer-custom-btn') as HTMLButtonElement;
const timerDisplay = document.getElementById('timer-display') as HTMLDivElement;
const timerRemaining = document.getElementById('timer-remaining') as HTMLSpanElement;
const timerFadeoutCheck = document.getElementById('timer-fadeout') as HTMLInputElement;
const timerCancelBtn = document.getElementById('timer-cancel-btn') as HTMLButtonElement;

// タイマー状態
let timerEndTime: number | null = null;
let timerIntervalId: number | null = null;
let originalVolume: number = 0.1;

// タイマー設定
function setTimer(minutes: number) {
  // 既存タイマーをクリア
  clearTimer();

  if (minutes <= 0) {
    return;
  }

  // 現在の音量を保存
  originalVolume = parseFloat(volumeSlider.value);

  // 終了時刻を設定
  timerEndTime = Date.now() + minutes * 60 * 1000;

  // UI更新
  timerDisplay.classList.add('active');
  timerCancelBtn.disabled = false;

  // プリセットボタンのアクティブ状態を更新
  timerPresetBtns.forEach(btn => {
    const btnMinutes = parseInt((btn as HTMLElement).dataset.minutes || '0');
    btn.classList.toggle('active', btnMinutes === minutes);
  });

  // 更新ループ開始
  timerIntervalId = window.setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();

  console.log(`Timer set for ${minutes} minutes`);
}

// タイマー表示更新
function updateTimerDisplay() {
  if (!timerEndTime) return;

  const remaining = timerEndTime - Date.now();

  if (remaining <= 0) {
    // タイマー終了
    handleTimerEnd();
    return;
  }

  // 残り時間表示
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerRemaining.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // 警告色
  timerRemaining.classList.remove('warning', 'critical');
  if (totalSeconds <= 60) {
    timerRemaining.classList.add('critical');
  } else if (totalSeconds <= 300) {
    timerRemaining.classList.add('warning');
  }

  // フェードアウト処理（最後の1分）
  if (timerFadeoutCheck.checked && totalSeconds <= 60) {
    const fadeRatio = totalSeconds / 60; // 1.0 → 0.0
    const fadeVolume = originalVolume * fadeRatio;
    engine.setVolume(fadeVolume);
    volumeSlider.value = fadeVolume.toString();
    volumeValue.textContent = fadeVolume.toFixed(2);
  }
}

// タイマー終了処理
function handleTimerEnd() {
  console.log('Timer ended');

  // 停止
  stopBtn.click();

  // クリア
  clearTimer();

  // 音量を元に戻す（次回用）
  engine.setVolume(originalVolume);
  volumeSlider.value = originalVolume.toString();
  volumeValue.textContent = originalVolume.toFixed(2);
}

// タイマークリア
function clearTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  timerEndTime = null;
  timerRemaining.textContent = '--:--';
  timerRemaining.classList.remove('warning', 'critical');
  timerDisplay.classList.remove('active');
  timerCancelBtn.disabled = true;

  timerPresetBtns.forEach(btn => btn.classList.remove('active'));
}

// プリセットボタンのイベント
timerPresetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt((btn as HTMLElement).dataset.minutes || '0');
    setTimer(minutes);
  });
});

// カスタムタイマーボタン
timerCustomBtn.addEventListener('click', () => {
  const minutes = parseInt(timerCustomInput.value) || 0;
  if (minutes > 0) {
    setTimer(minutes);
  }
});

// キャンセルボタン
timerCancelBtn.addEventListener('click', () => {
  clearTimer();
  // 音量を元に戻す
  engine.setVolume(originalVolume);
  volumeSlider.value = originalVolume.toString();
  volumeValue.textContent = originalVolume.toFixed(2);
});

// 停止時にタイマーもクリア
stopBtn.addEventListener('click', () => {
  clearTimer();
  stopIndicatorLoop(); // インジケーター停止を追加で呼んでおく（念のため）
});


// ==========================================
// Soundscapes & Tabs Logic
// ==========================================

// Sound Definition
const SOUND_ASSETS = [
  { id: 'rain_window', url: 'sounds/rain_window.mp3' },
  { id: 'rain_summer', url: 'sounds/rain_summer.mp3' },
  { id: 'rain_green', url: 'sounds/rain_green.mp3' },
  { id: 'underwater', url: 'sounds/underwater.mp3' },
  { id: 'brown_noise_smooth', url: 'sounds/brown_noise_smooth.mp3' },
  { id: 'spaceship', url: 'sounds/spaceship.mp3' },
  { id: 'airplane', url: 'sounds/airplane.mp3' },
  { id: 'rumble', url: 'sounds/rumble.mp3' },
  { id: 'car_driving', url: 'sounds/car_driving.mp3' }
];

let soundsLoaded = false;

async function initAndLoadSounds() {
  if (soundsLoaded) return;

  await engine.initSoundscapes();

  // 並列ロード
  const promises = SOUND_ASSETS.map(asset => engine.loadSound(asset.id, asset.url));
  await Promise.all(promises);

  soundsLoaded = true;
  console.log('All soundscapes loaded');
}

// Startボタンフックへの追加
// 既存のstartBtnリスナー内で engine.init() が呼ばれるが、
// ここで追加の非同期処理を差し込むのは少し難しい（既存コードを書き換える必要がある）。
// なので、既存の startBtn リスナーの冒頭で呼ばれる engine.init() はそのままに、
// 別でリスナーを追加して、そこでロードを行う。
// ただし、AudioContextのresumeが必要なため、既存リスナーとタイミングを合わせる必要がある。
// 一番確実なのは既存の startBtn.addEventListener を書き換えることだが、
// ここではシンプルに「追加のリスナー」として登録し、その中でロードを発火する。
// AudioEngineのinitは冪等性がある（isInitializedチェックがある）ので、
// startBtnが非同期で複数回呼ばれても大丈夫なはずだが、
// 念のため、既存の startBtn 内で engine.init() された後にロードが走るようにしたい。

// 既存の startBtn リスナーを書き換える方が安全。
// 上部の startBtn.addEventListener を書き換える。

// Tab Switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Active class update
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show content
    const targetId = (btn as HTMLElement).dataset.tab;
    tabContents.forEach(content => {
      if (content.id === targetId) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  });
});

// Sound Sliders
document.querySelectorAll('.sound-slider').forEach(slider => {
  slider.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const soundId = target.dataset.sound;
    const vol = parseFloat(target.value);

    // スライダーの背景色などで音量を視覚化しても良いが、今回はシンプルに
    if (soundId) {
      engine.setSoundVolume(soundId, vol);
    }
  });
});

