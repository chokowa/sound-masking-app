
export class AutoTuner {
    /**
     * Generates optimal masking settings based on simulation parameters.
     * @param targetType 'footsteps' | 'voices' | 'traffic' | 'tinnitus'
     * @param pitch 0-100 (Low-High)
     * @param sharpness 0-100 (Soft-Sharp)
     * @param resonance 0-100 (Dry-Boomy)
     */
    public static calculateSettings(targetType: string, pitch: number, sharpness: number, resonance: number) {
        // Default base settings
        let mix = { w: 0, p: 0, b: 0, d: 0 };
        let eq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let rumble = { vol: 0, freq: 55, speed: 1.0 };
        let sub = { vol: 0, freq: 55 };

        // Normalized values (0.0 - 1.0)
        const p = pitch / 100;
        const s = sharpness / 100;
        const r = resonance / 100;

        switch (targetType) {
            case 'footsteps':
                // Base: Brown Noise for low thuds
                mix.b = 0.6 + (r * 0.4); // More resonance -> More Brown level
                mix.d = 0.2 + (1.0 - p) * 0.3; // Lower pitch -> Darker noise

                // Rumble Logic
                rumble.vol = 0.5 + (r * 0.5); // Boomy -> High Rumble
                rumble.freq = 40 + (p * 40);  // Pitch matches Rumble Freq (40-80Hz)
                rumble.speed = 0.5 + (s * 2.0); // Sharpness affects Rumble modulation speed

                // EQ: Boost Lows, Cut Highs (unless sharp)
                eq[0] = 5 + (r * 5); // 32Hz boost
                eq[1] = 3 + (r * 3); // 63Hz boost
                if (s > 0.6) {
                    mix.p = (s - 0.6); // Add Pink if very sharp (hard heels)
                    eq[5] = 2; // Boost 1kHz
                }
                break;

            case 'voices':
                // Base: Pink Noise (Language range)
                mix.p = 0.5 + (s * 0.3);
                mix.b = 0.3 + (1.0 - p) * 0.2; // Deep voices need Brown
                mix.w = (s > 0.8) ? (s - 0.8) * 0.5 : 0; // Very sharp/sibilant voices get White

                // EQ: Focus on 250Hz - 2kHz
                eq[2] = 2; // 125Hz
                eq[3] = 4 - (p * 2); // 250Hz
                eq[4] = 4 + (s * 2); // 500Hz
                eq[5] = 2 + (s * 4); // 1kHz (Clarity)

                // Rumble: Subtle, for atmosphere
                rumble.vol = 0.2;
                rumble.freq = 80;
                rumble.speed = 0.2;
                break;

            case 'traffic':
                // Base: Dark + Brown (Distant roar)
                mix.d = 0.6 + (1.0 - s) * 0.4; // Soft traffic -> Dark
                mix.b = 0.4 + (p * 0.3);       // Higher pitch -> Brown

                // Rumble: Constant drone
                rumble.vol = 0.4;
                rumble.freq = 50 + (p * 50);
                rumble.speed = 0.1; // Very slow modulation (constant)

                // EQ
                eq[0] = 4;
                eq[1] = 3;
                eq[9] = -5; // Cut highs
                break;

            case 'tinnitus':
                // Base: White / Pink (Broadband masking)
                mix.w = 0.3 + (p * 0.7); // Higher pitch -> More White
                mix.p = 0.4 + (1.0 - p) * 0.6; // Lower pitch -> More Pink

                // Notch Filter approach logic (inverse peak?)
                // For general tinnitus masking, we want broad spectrum
                eq[6] = 2; // 2kHz
                eq[7] = 2; // 4kHz
                eq[8] = 2; // 8kHz

                rumble.vol = 0; // No rumble for tinnitus
                break;
        }

        return { mix: { ...mix, r: rumble.vol, rf: rumble.freq, rs: rumble.speed, s: sub.vol }, eq };
    }
}
