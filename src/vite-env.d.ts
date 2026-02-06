/// <reference types="vite/client" />

declare class AudioWorkletProcessor {
    port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: (new (options?: any) => AudioWorkletProcessor)): void;
