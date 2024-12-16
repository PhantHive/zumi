// utils/AudioManager.ts
class AudioManagerClass {
    private static instance: AudioManagerClass;
    private isInitialized = false;
    private audio: HTMLAudioElement | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;

    private constructor() {}

    static getInstance() {
        if (!AudioManagerClass.instance) {
            AudioManagerClass.instance = new AudioManagerClass();
        }
        return AudioManagerClass.instance;
    }

    async initialize(voiceNumber: number, audioPath: string) {
        if (this.isInitialized) {
            console.log('Audio already initialized, skipping');
            return null;
        }

        console.log('Initializing audio');
        this.isInitialized = true;

        try {
            this.audio = new Audio(audioPath);
            this.audioContext = new AudioContext();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;

            const source = this.audioContext.createMediaElementSource(
                this.audio,
            );
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            await this.audio.play();
            console.log('Audio initialized successfully');

            return {
                audioContext: this.audioContext,
                analyser: this.analyser,
            };
        } catch (error) {
            console.error('Audio initialization failed:', error);
            this.cleanup();
            return null;
        }
    }

    getAnalyserData() {
        if (!this.analyser) return null;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    cleanup() {
        if (this.audio) {
            this.audio.pause();
            this.audio.src = '';
            this.audio.load();
            this.audio = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.analyser) {
            this.analyser = null;
        }
        this.isInitialized = false;
    }
}

export const AudioManager = AudioManagerClass.getInstance();
