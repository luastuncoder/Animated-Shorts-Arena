#!/usr/bin/env python3
"""Assemble voice.wav + words.json from the per-sentence TTS segments.

usage: python3 scripts/voice_build.py <segments.json> <seg_dir> <voice_out.wav> <words_out.json> [--atempo 1.0]

- Measures each segNN.wav (PCM wav, wave module).
- Concatenates segments with the explicit gaps (44.1 kHz mono 16-bit), applies optional atempo via ffmpeg.
- Emits words.json: [{"word": ..., "start": sec, "end": sec}, ...] — word spans inside a segment are
  proportional to word character counts (incl. following space). If atempo is applied, times are scaled.
"""
import json, re, subprocess, sys, wave
import numpy as np

def wav_samples(path):
    w = wave.open(path, "rb")
    assert w.getnchannels() == 1 and w.getframerate() == 44100 and w.getsampwidth() == 2, f"{path}: need mono 44.1k 16-bit"
    data = w.readframes(w.getnframes())
    return np.frombuffer(data, dtype=np.int16), w.getnframes() / w.getframerate()

def main():
    segs_path, seg_dir, voice_out, words_out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    atempo = 1.0
    if "--atempo" in sys.argv:
        atempo = float(sys.argv[sys.argv.index("--atempo") + 1])
    segs = json.load(open(segs_path))

    total = sum(wav_samples(f"{seg_dir}/seg{s['id']:02d}.wav")[1] for s in segs) + sum(s["gap"] for s in segs[:-1])
    print(f"raw VO total: {total:.2f}s (29 segs + gaps, before atempo={atempo})")

    sr = 44100
    out = np.zeros(int(total * sr) + sr, dtype=np.int16)
    cursor = 0.0
    words = []
    for s in segs:
        samples, dur = wav_samples(f"{seg_dir}/seg{s['id']:02d}.wav")
        i0 = int(cursor * sr)
        out[i0:i0 + len(samples)] = samples
        # word timings proportional to character lengths (incl. trailing space)
        toks = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", s["text"])]
        weights = [len(toks[i][0]) + 1 for i in range(len(toks))]
        wsum = sum(weights)
        t = cursor
        for tok, w in zip(toks, weights):
            wd = dur * (w / wsum)
            words.append({"word": tok[0], "start": round(t, 4), "end": round(t + wd, 4)})
            t += wd
        cursor += dur + s["gap"]

    raw_len = int(cursor * sr) if segs[-1]["gap"] == 0 else int((cursor - segs[-1]["gap"]) * sr)
    out = out[:raw_len]
    w = wave.open(voice_out, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(out.tobytes()); w.close()
    print(f"wrote {voice_out}: {len(out)/sr:.2f}s, {len(words)} words")

    if atempo != 1.0:
        tmp = voice_out + ".tmp.wav"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", voice_out,
                        "-filter:a", f"atempo={atempo}", tmp], check=True)
        import os; os.replace(tmp, voice_out)
        words = [{"word": w["word"], "start": round(w["start"] / atempo, 4), "end": round(w["end"] / atempo, 4)} for w in words]
        print(f"atempo={atempo}: final duration {raw_len / sr / atempo:.2f}s")

    json.dump(words, open(words_out, "w"), indent=1)
    print(f"wrote {words_out}: {len(words)} words, last word ends at {words[-1]['end']:.2f}s")

if __name__ == "__main__":
    main()
