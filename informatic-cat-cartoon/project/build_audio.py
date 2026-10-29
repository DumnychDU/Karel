"""Local, deterministic audio for the informatic-cat short.

Synthesizes everything from scratch (no network): a chiptune/pluck music bed,
the cat's "babble" voice (one formant blip per syllable, Animal-Crossing style),
meows, a purr and UI sound effects. Also writes artifacts/timeline.json with the
dialogue lines and per-syllable times so the Remotion composition can flap the
mouth and type the speech bubbles exactly on the sound.

Usage: python3 build_audio.py
"""
import json
import wave
from pathlib import Path

import numpy as np

SR = 44100
TOTAL = 32.0
HERE = Path(__file__).resolve().parent
rng = np.random.default_rng(7)

VOWELS = set("аеєиіїоуюяaeiouy")
# rough vowel formants (F1, F2) for the babble colour
FORMANTS = {
    "а": (800, 1300), "a": (800, 1300), "я": (750, 1700),
    "е": (500, 1900), "e": (500, 1900), "є": (450, 2000),
    "и": (350, 1800), "y": (350, 1800), "і": (300, 2300), "i": (300, 2300), "ї": (300, 2300),
    "о": (500, 900), "o": (500, 900), "у": (330, 800), "u": (330, 800), "ю": (330, 1200),
}


def t2s(t):
    return int(round(t * SR))


def env_adsr(n, a=0.005, d=0.05, s=0.6, r=0.05):
    e = np.ones(n) * s
    na, nd, nr = t2s(a), t2s(d), t2s(r)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na)
    e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    nr = min(nr, n)
    e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def formant_tone(f0_curve, f1, f2, bright=1.0):
    """Harmonic stack whose harmonics are weighted by two gaussian formants."""
    n = len(f0_curve)
    phase = 2 * np.pi * np.cumsum(f0_curve) / SR
    out = np.zeros(n)
    f0m = float(np.mean(f0_curve))
    for h in range(1, 14):
        fh = h * f0m
        if fh > 6000:
            break
        amp = (np.exp(-((fh - f1) / 260) ** 2) + 0.7 * np.exp(-((fh - f2) / 380) ** 2)) * bright + 0.04 / h
        out += amp * np.sin(h * phase)
    return out / (np.max(np.abs(out)) + 1e-9)


def add(buf, sig, t, gain=1.0):
    i = t2s(t)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i] * gain


# ----------------------------------------------------------------------------- voice
def blip(vowel, pitch, dur=0.085, rise=0.0):
    n = t2s(dur)
    f0 = pitch * (1 + rise * np.linspace(0, 1, n)) * (1 + 0.012 * np.sin(np.linspace(0, 9, n)))
    f1, f2 = FORMANTS.get(vowel, (500, 1500))
    s = formant_tone(f0, f1 * 1.25, f2 * 1.2)  # small creature → formants shifted up
    return s * env_adsr(n, a=0.006, d=0.03, s=0.75, r=0.035)


def meow(dur=0.7, base=620):
    n = t2s(dur)
    x = np.linspace(0, 1, n)
    f0 = base * (1 + 0.55 * np.sin(np.pi * np.clip(x * 1.15, 0, 1)) ** 1.5) * (1 + 0.02 * np.sin(2 * np.pi * 6 * x * dur))
    # "m-e-a-u": move the formants across the call
    out = np.zeros(n)
    segs = [(0.0, 0.18, "і"), (0.18, 0.55, "а"), (0.55, 1.0, "у")]
    for a, b, v in segs:
        ia, ib = int(a * n), int(b * n)
        f1, f2 = FORMANTS[v]
        seg = formant_tone(f0[ia:ib], f1 * 1.3, f2 * 1.2)
        fade = np.ones(ib - ia)
        k = min(600, (ib - ia) // 3)
        fade[:k] = np.linspace(0, 1, k)
        fade[-k:] = np.linspace(1, 0, k)
        out[ia:ib] += seg * fade
    return out * env_adsr(n, a=0.03, d=0.1, s=0.85, r=0.18)


def purr(dur=0.9):
    n = t2s(dur)
    x = np.arange(n) / SR
    noise = rng.standard_normal(n)
    low = np.convolve(noise, np.ones(40) / 40, mode="same")
    tone = 0.5 * np.sin(2 * np.pi * 110 * x) + 0.3 * np.sin(2 * np.pi * 220 * x)
    am = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 24 * x)) * 0.9
    s = (low * 4 + tone) * am
    return s / np.max(np.abs(s)) * env_adsr(n, a=0.05, d=0.1, s=0.9, r=0.2)


PAUSES = {",": 0.16, "—": 0.32, "…": 0.36, "!": 0.2, "?": 0.22, ".": 0.0, "-": 0.05}


def plan_line(text, start, base_pitch, rate=7.2, question=False, seed=0):
    """Return syllable list [{t, ci, vowel, pitch}] for a line."""
    r = np.random.default_rng(seed)
    t = start
    syl = []
    vidx = [i for i, ch in enumerate(text) if ch.lower() in VOWELS]
    for k, i in enumerate(vidx):
        ch = text[i].lower()
        semis = r.choice([-2, 0, 0, 2, 3, 5, -3])
        pitch = base_pitch * 2 ** (semis / 12)
        last = k == len(vidx) - 1
        if question and k >= len(vidx) - 2:
            pitch *= 1.25 + 0.15 * (k - len(vidx) + 2)
        # reveal: show text up to (not incl.) the next vowel's consonant cluster
        reveal = vidx[k + 1] if not last else len(text)
        if not last:
            # step back over consonants that belong to the next syllable
            j = reveal
            while j - 1 > i and text[j - 1].isalpha() and text[j - 1].lower() not in VOWELS:
                j -= 1
            reveal = max(i + 1, j)
        syl.append({"t": round(t, 3), "reveal": reveal, "vowel": ch, "pitch": round(float(pitch), 1)})
        t += 1.0 / rate * r.uniform(0.85, 1.15)
        # punctuation between this vowel and the next adds a pause
        seg = text[i + 1: (vidx[k + 1] if not last else len(text))]
        for p, d in PAUSES.items():
            if p in seg:
                t += d
    return syl, t


LINES = [
    # (id, kind, text, start, scene)
    ("l0", "meow", "Мяу!", 0.55, "s1"),
    ("l1", "talk", "Привіт! Я котик Біт!", 1.55, "s1"),
    ("l2", "talk", "Думаєш, інформатика — це складно?", 5.0, "s2"),
    ("l3", "purr", "Мур-р… Зовсім ні!", 7.7, "s2"),
    ("l4", "talk", "На сайті informatic.website — уроки, тести й задачі з програмування!", 11.0, "s3"),
    ("l5", "talk", "Вчися крок за кроком…", 17.4, "s4"),
    ("l6", "talk", "…і напиши свій перший код!", 19.3, "s4"),
    ("l7", "talk", "Заходь на informatic.website!", 23.5, "s5"),
    ("l8", "talk", "Підписуйся на @informatic_it в Instagram!", 25.4, "s5"),
    ("l9", "meow", "Мяу!", 28.9, "s5"),
]


def build_voice(voice):
    lines_out = []
    for n, (lid, kind, text, start, scene) in enumerate(LINES):
        if kind == "meow":
            d = 0.75
            add(voice, meow(d, base=640 if lid == "l0" else 700), start, 0.8)
            syl = [{"t": start, "reveal": len(text), "vowel": "а", "pitch": 640}]
            end = start + d
            mouth = [{"t": start, "d": d}]
        else:
            t0 = start
            if kind == "purr":
                add(voice, purr(0.9), start, 0.55)
                t0 = start + 1.0
            syl, end = plan_line(text, t0, base_pitch=560, question=text.endswith("?"), seed=n * 13 + 1)
            if kind == "purr":
                syl = [{"t": start, "reveal": 6, "vowel": "у", "pitch": 0}] + syl
            for s in syl:
                if s["pitch"]:
                    add(voice, blip(s["vowel"], s["pitch"], rise=0.12 if s is syl[-1] else 0.0), s["t"], 0.55)
            mouth = [{"t": s["t"], "d": 0.085} for s in syl if s["pitch"]]
            if kind == "purr":
                mouth = mouth  # mouth stays closed (smile) while purring
        lines_out.append({"id": lid, "kind": kind, "text": text, "start": start,
                          "end": round(end + 0.05, 3), "scene": scene, "syllables": syl, "mouth": mouth})
    return lines_out


# ----------------------------------------------------------------------------- sfx
def sfx_pop():
    n = t2s(0.12)
    x = np.linspace(0, 1, n)
    f = 380 + 1100 * x ** 0.6
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 5)


def sfx_whoosh(d=0.45):
    n = t2s(d)
    x = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # moving one-pole lowpass → sweep
    y = 0.0
    cut = 0.02 + 0.25 * np.sin(np.pi * x)
    for i in range(n):
        y += cut[i] * (noise[i] - y)
        out[i] = y
    return out / np.max(np.abs(out)) * np.sin(np.pi * x) ** 2


def sfx_ding():
    n = t2s(0.9)
    x = np.arange(n) / SR
    s = np.sin(2 * np.pi * 1568 * x) + 0.5 * np.sin(2 * np.pi * 2349 * x) + 0.25 * np.sin(2 * np.pi * 3136 * x)
    return s / 1.75 * np.exp(-x * 4.5)


def sfx_click():
    n = t2s(0.03)
    return rng.standard_normal(n) * np.exp(-np.linspace(0, 9, n)) * 0.6


def sfx_tada():
    out = np.zeros(t2s(1.0))
    for k, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        n = t2s(0.7)
        x = np.arange(n) / SR
        tone = (np.sign(np.sin(2 * np.pi * f * x)) * 0.35 + np.sin(2 * np.pi * f * x)) * np.exp(-x * 4)
        i = t2s(k * 0.07)
        out[i:i + n] += tone[: len(out) - i]
    return out / np.max(np.abs(out))


def sfx_boing():
    n = t2s(0.35)
    x = np.linspace(0, 1, n)
    f = 220 + 260 * np.sin(2 * np.pi * 3 * x) * (1 - x) + 160 * x
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - x) ** 2


SFX = [
    (0.25, "whoosh", 0.35), (0.5, "boing", 0.45),
    (4.6, "whoosh", 0.3), (7.6, "pop", 0.4), (7.9, "pop", 0.35), (8.2, "pop", 0.35), (8.5, "ding", 0.3),
    (10.3, "whoosh", 0.35), (12.2, "pop", 0.45), (13.0, "pop", 0.45), (13.8, "pop", 0.45),
    (16.9, "whoosh", 0.3), (17.6, "boing", 0.35), (18.4, "boing", 0.35), (19.2, "boing", 0.35),
    (21.4, "tada", 0.4),
    (23.0, "whoosh", 0.35), (25.2, "ding", 0.35), (28.8, "pop", 0.4),
]
SFX_FN = {"pop": sfx_pop, "whoosh": sfx_whoosh, "ding": sfx_ding, "tada": sfx_tada, "boing": sfx_boing}


# ----------------------------------------------------------------------------- music
BPM = 116
BEAT = 60 / BPM


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def pluck(freq, dur, bright=0.5):
    """Karplus–Strong string — reads as a ukulele."""
    n = t2s(dur)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * (0.993 + 0.006 * bright)
    return out * env_adsr(n, a=0.002, d=0.02, s=1.0, r=0.04)


def square(freq, dur, duty=0.25, vol=1.0):
    n = t2s(dur)
    x = (np.arange(n) * freq / SR) % 1.0
    s = np.where(x < duty, 1.0, -1.0)
    return s * env_adsr(n, a=0.004, d=0.06, s=0.55, r=0.03) * vol


def triangle(freq, dur):
    n = t2s(dur)
    x = (np.arange(n) * freq / SR) % 1.0
    return (4 * np.abs(x - 0.5) - 1) * env_adsr(n, a=0.003, d=0.05, s=0.8, r=0.02)


def kick():
    n = t2s(0.22)
    x = np.linspace(0, 1, n)
    f = 45 + 110 * np.exp(-x * 14)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 6)


def hat():
    n = t2s(0.05)
    s = np.diff(rng.standard_normal(n + 1))
    return s * np.exp(-np.linspace(0, 8, n)) * 0.25


def clap():
    n = t2s(0.16)
    s = rng.standard_normal(n)
    s = s - np.convolve(s, np.ones(6) / 6, mode="same")
    return s * np.exp(-np.linspace(0, 7, n)) * 0.6


# C  G  Am F  — bouncy major
CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
ROOTS = [36, 43, 45, 41]
MELODY = [  # (beat offset in 4-bar phrase, midi, beats)
    (0, 76, 0.5), (0.5, 79, 0.5), (1, 76, 0.5), (1.5, 72, 0.5), (2, 74, 1), (3, 79, 1),
    (4, 74, 0.5), (4.5, 71, 0.5), (5, 74, 0.5), (5.5, 79, 0.5), (6, 83, 1), (7, 81, 1),
    (8, 81, 0.5), (8.5, 79, 0.5), (9, 76, 0.5), (9.5, 72, 0.5), (10, 76, 1), (11, 79, 1),
    (12, 77, 0.5), (12.5, 76, 0.5), (13, 74, 0.5), (13.5, 72, 0.5), (14, 74, 1.5),
]


def build_music():
    m = np.zeros(t2s(TOTAL + 1))
    bars = int((TOTAL - 1.2) / (4 * BEAT))
    for bar in range(bars):
        t_bar = bar * 4 * BEAT
        ci = bar % 4
        intro = bar == 0
        # uke strum on the off-beats
        for b in range(8):
            t = t_bar + b * BEAT / 2
            if b % 2 == 1 or intro:
                for k, note in enumerate(CHORDS[ci]):
                    add(m, pluck(midi(note + 12), 0.5), t + k * 0.012, 0.16)
        if not intro:
            # bass
            for b in range(4):
                n = ROOTS[ci] + (12 if b == 2 else 0) + 12
                add(m, triangle(midi(n), BEAT * 0.9), t_bar + b * BEAT, 0.32)
            # drums
            for b in range(4):
                add(m, kick(), t_bar + b * BEAT, 0.5 if b in (0, 2) else 0.0)
                if b in (1, 3):
                    add(m, clap(), t_bar + b * BEAT, 0.33)
                for h in range(2):
                    add(m, hat(), t_bar + b * BEAT + h * BEAT / 2, 0.5)
        # chiptune lead on phrases 2..
        if bar >= 1:
            pb = (bar - 1) % 4
            for off, note, beats in MELODY:
                if pb * 4 <= off < pb * 4 + 4:
                    add(m, square(midi(note), beats * BEAT * 0.92), t_bar + (off - pb * 4) * BEAT, 0.07)
    # ending: big C chord + glock run
    t_end = bars * 4 * BEAT
    for k, note in enumerate([60, 64, 67, 72, 76]):
        add(m, pluck(midi(note + 12), 1.6), t_end + k * 0.03, 0.2)
        add(m, square(midi(note + 12), 0.25, duty=0.5, vol=1), t_end + k * 0.09, 0.05)
    add(m, kick(), t_end, 0.55)
    return m[: t2s(TOTAL)]


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2")
    stereo = np.stack([pcm, pcm], axis=1).reshape(-1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


def main():
    n = t2s(TOTAL)
    voice = np.zeros(n + SR)
    lines = build_voice(voice)
    voice = voice[:n]
    sfx = np.zeros(n + SR)
    for t, kind, g in SFX:
        add(sfx, SFX_FN[kind](), t, g)
    sfx = sfx[:n]
    music = build_music()

    # duck the music under the voice
    env = np.abs(voice)
    k = t2s(0.12)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    duck = 1 - 0.55 * np.clip(env / (env.max() + 1e-9) * 4, 0, 1)
    music_gain = 0.55
    fade = np.ones(n)
    fade[-t2s(1.2):] = np.linspace(1, 0, t2s(1.2))
    mix = voice * 0.95 + sfx * 0.6 + music * music_gain * duck
    mix *= fade
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix *= 0.89 / np.max(np.abs(mix))
    mix *= 0.7  # ≈ -14 LUFS integrated for social delivery

    out_dir = HERE / "assets" / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)
    write_wav(out_dir / "voice.wav", voice / (np.max(np.abs(voice)) + 1e-9) * 0.9)
    write_wav(HERE / "assets" / "music" / "music.wav", music / np.max(np.abs(music)) * 0.9)
    write_wav(out_dir / "mix.wav", mix)
    (HERE / "public").mkdir(exist_ok=True)
    write_wav(HERE / "public" / "mix.wav", mix)

    timeline = {"fps": 30, "duration": TOTAL, "lines": lines,
                "sfx": [{"t": t, "kind": k} for t, k, _ in SFX]}
    (HERE / "artifacts").mkdir(exist_ok=True)
    (HERE / "artifacts" / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1))
    for ln in lines:
        print(f'{ln["id"]} {ln["start"]:6.2f} -> {ln["end"]:6.2f}  {ln["text"]}')


if __name__ == "__main__":
    main()
