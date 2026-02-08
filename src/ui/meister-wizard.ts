import { NoiseSimulator } from '../audio/NoiseSimulator';
import { AutoTuner } from '../audio/AutoTuner';


export class MeisterWizard {
    private overlay: HTMLElement;
    private scenes: HTMLElement[];
    private currentSceneIndex: number = 0;
    private onComplete: (presetName: string, settings: any) => void;
    private onClose: (() => void) | null = null;
    private simulator: NoiseSimulator;
    private currentTarget: string = '';

    constructor(
        ctx: AudioContext,
        onComplete: (name: string, settings: any) => void,
        onClose?: () => void
    ) {
        this.onComplete = onComplete;
        this.onClose = onClose || null;
        this.simulator = new NoiseSimulator(ctx);
        this.overlay = document.getElementById('meister-overlay')!;
        if (!this.overlay) {
            console.error('Meister Overlay element not found!');
        }
        this.scenes = Array.from(document.querySelectorAll('.meister-scene'));

        this.initEvents();
    }

    public open() {
        if (!this.overlay) {
            console.error('Meister overlay not found');
            alert('Error: Meister Wizard overlay not found. Please refresh.');
            return;
        }
        this.overlay.classList.add('active');
        this.goToScene(0);
    }

    public close() {
        this.overlay.classList.remove('active');
        this.simulator.stop();
        if (this.onClose) {
            this.onClose();
        }
    }

    private goToScene(index: number) {
        // Stop simulation if leaving tuning scene (index 1)
        if (this.currentSceneIndex === 1 && index !== 1) {
            this.simulator.stop();
        }

        this.scenes.forEach((scene, i) => {
            scene.classList.toggle('active', i === index);
        });

        // Update current index before checks
        this.currentSceneIndex = index;

        if (index === 1) {
            // Start Simulation
            this.simulator.startSimulation(this.currentTarget);
            this.updateSimulation(); // Apply initial slider values
        } else if (index === 2) {
            // Calculate Countermeasure
            // Ensure stop is called (though logic above handles it, double safety)
            this.simulator.stop();
            this.generateCountermeasure();
        }
    }


    private updateSimulation() {
        const pitch = parseInt((document.getElementById('sim-pitch') as HTMLInputElement).value);
        const sharpness = parseInt((document.getElementById('sim-sharpness') as HTMLInputElement).value);
        const resonance = parseInt((document.getElementById('sim-resonance') as HTMLInputElement).value);
        this.simulator.updateParams(pitch, sharpness, resonance);
    }

    private generateCountermeasure() {
        // Calculate Optimal Settings
        const pitch = parseInt((document.getElementById('sim-pitch') as HTMLInputElement).value);
        const sharpness = parseInt((document.getElementById('sim-sharpness') as HTMLInputElement).value);
        const resonance = parseInt((document.getElementById('sim-resonance') as HTMLInputElement).value);

        const result = AutoTuner.calculateSettings(this.currentTarget, pitch, sharpness, resonance);

        // Display Result (Conceptual)
        const preview = document.querySelector('.result-preview');
        if (preview) {
            preview.innerHTML = `
                <div class="shield-icon">🛡️</div>
                <p>Defense Shield Ready</p>
                <div style="font-size:0.8rem; color:#aaa;">
                  Mix: B${(result.mix.b * 100).toFixed(0)}% / P${(result.mix.p * 100).toFixed(0)}%<br>
                  Rumble: ${(result.mix.r! * 100).toFixed(0)}% @ ${result.mix.rf?.toFixed(0)}Hz
                </div>
             `;
        }

        // Store for save
        this.currentSettings = result;
    }

    // Store settings temporarily for save
    private currentSettings: any = {};


    private initEvents() {
        const closeBtn = document.getElementById('meister-close');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.close();
            };
        }

        document.querySelectorAll('.meister-next-btn').forEach(btn => {
            // Skip the save button if it shares the class, to avoid conflict
            if (btn.id === 'btn-save-neister') return;

            (btn as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                this.goToScene(this.currentSceneIndex + 1);
            };
        });

        document.querySelectorAll('.meister-prev-btn').forEach(btn => {
            (btn as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                this.goToScene(this.currentSceneIndex - 1);
            };
        });

        // Target selection
        document.querySelectorAll('.target-icon').forEach(icon => {
            (icon as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                this.currentTarget = (icon as HTMLElement).dataset.target || '';
                this.goToScene(1);
            };
        });

        // Tuning Sliders
        ['sim-pitch', 'sim-sharpness', 'sim-resonance'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.oninput = (e) => {
                    e.stopPropagation();
                    this.updateSimulation();
                };
                el.onclick = (e) => e.stopPropagation();
            }
        });

        // Save
        const saveBtn = document.getElementById('btn-save-neister');
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.currentSettings) {
                    this.onComplete(`Meister: ${this.currentTarget}`, this.currentSettings);
                }
                this.close();
            };
        }

        // Prevent clicks on the overlay itself from reaching bottom elements
        if (this.overlay) {
            this.overlay.onclick = (e) => {
                e.stopPropagation();
            };
        }
    }
}
