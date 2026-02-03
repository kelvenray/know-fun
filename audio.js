// 音频引擎 - Web Audio API 合成
class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.bgmSource = null;
        this.engineSource = null;
        this.nitroSource = null;
        this.sounds = {};
        this.initialized = false;
        this.bgmGain = null;
        this.engineGain = null;
        this.nitroGain = null;
    }

    // 初始化音频上下文（必须在用户交互后调用）
    init() {
        if (this.initialized) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.createSounds();
            this.initialized = true;
            console.log('AudioEngine initialized');
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    // 创建合成声音
    createSounds() {
        // 背景音乐 - 合成电子循环
        this.createBGM();
        
        // 引擎声 - 随速度变化
        this.createEngineSound();
        
        // 氮气声
        this.createNitroSound();
        
        // 音效
        this.createSound('correct', 800, 0.3, 0.2);
        this.createSound('wrong', 300, 0.4, 0.1);
        this.createSound('click', 1200, 0.2, 0.05);
    }

    createBGM() {
        // 简单的合成循环
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
        
        // 节奏 pattern
        const pattern = [0.3, 0.1, 0.3, 0.1, 0.5, 0.1];
        let time = this.audioContext.currentTime;
        
        pattern.forEach((value, i) => {
            gain.gain.setValueAtTime(value * 0.1, time);
            time += 0.2;
        });
        
        oscillator.start();
        oscillator.stop(time + 0.2);
        
        // 循环
        oscillator.onended = () => {
            if (this.bgmSource) this.createBGM();
        };
        
        this.bgmSource = oscillator;
        this.bgmGain = gain;
    }

    createEngineSound() {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(80, this.audioContext.currentTime);
        gain.gain.setValueAtTime(0, this.audioContext.currentTime);
        
        oscillator.start();
        
        this.engineSource = oscillator;
        this.engineGain = gain;
    }

    createNitroSound() {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
        gain.gain.setValueAtTime(0, this.audioContext.currentTime);
        
        oscillator.start();
        
        this.nitroSource = oscillator;
        this.nitroGain = gain;
    }

    createSound(name, freq, volume, duration) {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
        gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
        
        this.sounds[name] = { oscillator, gain };
    }

    // 播放音效
    playSound(name) {
        if (!this.initialized || !this.sounds[name]) return;
        this.createSound(name, 
            name === 'correct' ? 800 : 300,
            name === 'correct' ? 0.3 : 0.4,
            0.2
        );
    }

    // 更新引擎声音（根据速度）
    updateEngine(speed) {
        if (!this.initialized || !this.engineSource) return;
        
        const freq = 80 + speed * 100; // 80-380 Hz
        const volume = Math.min(0.3, speed * 0.1);
        
        this.engineSource.frequency.setValueAtTime(freq, this.audioContext.currentTime);
        this.engineGain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    }

    // 氮气开关
    setNitro(on) {
        if (!this.initialized || !this.nitroSource) return;
        this.nitroGain.gain.setValueAtTime(on ? 0.2 : 0, this.audioContext.currentTime);
    }

    // 停止所有声音
    stopAll() {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource = null;
        }
        if (this.engineSource) {
            this.engineSource.stop();
            this.engineSource = null;
        }
        if (this.nitroSource) {
            this.nitroSource.stop();
            this.nitroSource = null;
        }
        this.initialized = false;
    }
}

// 全局音频实例
const audioEngine = new AudioEngine();

// 导出
export { audioEngine };