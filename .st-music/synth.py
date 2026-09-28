#!/usr/bin/env python3
"""生成婚礼请柬 BGM：轻柔音乐盒圆舞曲（C 大调 3/4，76BPM，32 小节无缝循环）"""
import wave
import numpy as np

SR = 44100
BPM = 76
BEAT = 60.0 / BPM            # 0.7895s
BAR = 3 * BEAT               # 2.368s
BARS = 32
LOOP = BARS * BAR            # ≈75.8s
TAIL = 2.0
N = int((LOOP + TAIL) * SR)

def midi_f(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# ---------- 音色 ----------
def musicbox(freq, tau=1.1, vol=1.0, detune=0.0015):
    """音乐盒：基频 + 非谐泛音，高泛音衰减更快，微失谐出闪烁感"""
    n = min(int(tau * 4 * SR), N)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    partials = [(1.0, 1.0, 1.0), (3.98, 0.26, 0.62), (9.5, 0.08, 0.4), (15.2, 0.035, 0.28)]
    for k, (ratio, amp, tdk) in enumerate(partials):
        f = freq * ratio * (1 + detune * (1 if k % 2 else -1))
        sig += amp * np.exp(-t / (tau * tdk)) * np.sin(2 * np.pi * f * t)
    sig[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))  # 4ms 起音防爆音
    return sig * vol

def pluck(freq, tau=0.55, vol=1.0):
    """伴奏拨弦：圆一点，泛音少"""
    n = min(int(tau * 4 * SR), N)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for ratio, amp, tdk in [(1.0, 1.0, 1.0), (2.0, 0.35, 0.7), (3.0, 0.12, 0.5)]:
        sig += amp * np.exp(-t / (tau * tdk)) * np.sin(2 * np.pi * freq * ratio * t)
    sig[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    return sig * vol

def pad_tone(freq, dur, vol=1.0):
    """暖垫：慢起音慢收，正弦+八度，铺底不抢戏"""
    n = min(int((dur + 0.6) * SR), N)
    t = np.arange(n) / SR
    env = np.ones(n)
    a = int(0.6 * SR); r = int(0.45 * SR)
    env[:a] = np.linspace(0, 1, a) ** 2
    env[-r:] *= np.linspace(1, 0, r) ** 2
    return (np.sin(2 * np.pi * freq * t) + 0.22 * np.sin(4 * np.pi * freq * t)) * env * vol

# ---------- 和声 ----------
CH = {  # 低音bass / 伴奏双音 / 垫底三和弦（根+12）
    'C':  (48, [64, 67], (60, 64, 67)),
    'F':  (53, [65, 69], (53, 57, 60)),
    'G':  (55, [62, 67], (55, 59, 62)),
    'Am': (57, [60, 64], (57, 60, 64)),
    'Em': (52, [64, 67], (52, 55, 59)),
}
A_CH = ['C', 'C', 'F', 'G', 'Am', 'F', 'G', 'C']
B_CH = ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C']

# 旋律 (phrase 内起始拍, 持续拍, midi)
A = [(0,1,67),(1,1,72),(2,1,76),(3,2,76),(5,1,74),(6,1,72),(7,1,74),(8,1,77),
     (9,2,76),(11,1,74),(12,1,72),(13,1,76),(14,1,81),(15,2,79),(17,1,77),
     (18,1,76),(19,1,74),(20,1,71),(21,3,72)]
B = [(0,1,69),(1,1,72),(2,1,77),(3,2,76),(5,1,74),(6,1,71),(7,1,74),(8,1,79),
     (9,2,76),(11,1,72),(12,2,81),(14,1,79),(15,1,79),(16,1,81),(17,1,83),
     (18,2,84),(20,1,79),(21,3,76)]

FORM = [(A, A_CH), (B, B_CH), (A, A_CH), (B, B_CH)]
PHRASE_BEATS = 24

dry = np.zeros(N)

def add(sig, t, pan=0.0, vol=1.0):
    i0 = int(t * SR)
    if i0 >= N:
        return
    seg = sig[: N - i0] * vol
    gL, gR = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    busL[i0 : i0 + len(seg)] += seg * gL
    busR[i0 : i0 + len(seg)] += seg * gR

busL = np.zeros(N); busR = np.zeros(N)

for p, (mel, chords) in enumerate(FORM):
    echo = p >= 2                       # 后半段加高八度回声
    p_off = p * PHRASE_BEATS * BEAT
    # 旋律
    for (b, d, m) in mel:
        t = p_off + b * BEAT
        add(musicbox(midi_f(m), tau=1.05), t, pan=0.15, vol=0.30)
        if echo:
            add(musicbox(midi_f(m + 12), tau=0.7), t, pan=0.35, vol=0.085)
    # 伴奏：每小节 低音(1) + 双音(2,3)
    for bar_i, ch in enumerate(chords):
        bass, up, _ = CH[ch]
        t0 = p_off + bar_i * BAR
        add(pluck(midi_f(bass), tau=1.0), t0, pan=-0.12, vol=0.20)
        for beat in (1, 2):
            for note in up:
                add(pluck(midi_f(note), tau=0.45), t0 + beat * BEAT, pan=-0.2, vol=0.10)
        # 垫底
        for note in CH[ch][2]:
            add(pad_tone(midi_f(note), BAR * 0.95), t0, pan=0.0, vol=0.055)

# ---------- 后期 ----------
dry = (busL + busR) / 2          # 合成单声道做滤波
spec = np.fft.rfft(dry)
freqs = np.fft.rfftfreq(len(dry), 1 / SR)
spec *= 1 / (1 + (freqs / 9000) ** 2)     # 9kHz 巴特沃斯式柔化
dry = np.fft.irfft(spec, len(dry))

def shift(x, sec):
    d = int(sec * SR)
    out = np.zeros_like(x)
    out[d:] = x[:-d]
    return out

# 立体声展宽（双抽头交叉延迟，无反馈环 → 循环安全）
Ld = dry * 0.88 + shift(dry, 0.27) * 0.14 + shift(dry, 0.54) * 0.07
Rd = dry * 0.88 + shift(dry, 0.38) * 0.14 + shift(dry, 0.76) * 0.07
# 恢复每侧带各自的干声 pan 色彩：把干声 pan 差异重新叠回
Ld += (busL - busR).clip(-1, 1) * 0.10
Rd -= (busL - busR).clip(-1, 1) * 0.10

# 无缝循环：把 LOOP 之后的尾巴回卷叠加到开头
loop_n = int(LOOP * SR)
tail_n = N - loop_n
Ld[:tail_n] += Ld[loop_n:]; Ld[loop_n:] = 0
Rd[:tail_n] += Rd[loop_n:]; Rd[loop_n:] = 0

peak = max(np.abs(Ld).max(), np.abs(Rd).max())
gain = 0.88 / peak
Ld *= gain; Rd *= gain
rms = np.sqrt(np.mean(Ld[loop_n - SR : loop_n] ** 2))

data = np.empty((N, 2), dtype=np.int16)
data[:, 0] = np.clip(Ld * 32767, -32768, 32767).astype(np.int16)
data[:, 1] = np.clip(Rd * 32767, -32768, 32767).astype(np.int16)

out = '/home/xiaofeiyang/QoderWorkSpace/wedding-invitation/.st-music/bgm_loop.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(data.tobytes())

print(f'WAV: {out}')
print(f'时长 {N/SR:.1f}s（循环体 {LOOP:.1f}s + 回卷尾巴 {TAIL:.1f}s）')
print(f'峰值 {peak:.3f} → 归一化 0.88，稳态 RMS {20*np.log10(rms+1e-9):.1f} dBFS')
print(f'音符事件渲染完成，立体声 {SR}Hz 16bit')
