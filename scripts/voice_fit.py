#!/usr/bin/env python3
"""Fit the re-synthesized TTS segments onto the ORIGINAL 73.62 s timeline.

Each segment is time-stretched (ffmpeg atempo, pitch preserved) so its words occupy
exactly the same [start, end) window as the original voice (from words.json.orig);
inter-segment gaps reuse the original gap timings verbatim. The output words.json is
therefore a drop-in replacement: every shot cut in story.ts stays in sync.

usage: python3 scripts/voice_fit.py <segments.json> <seg_wav_dir> <voice_out.wav> <words_out.json> [--orig words.json.orig]
"""
import json, re, subprocess, sys, wave
import numpy as np
import os

sr = 44100
segs_path, seg_dir, voice_out, words_out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
args = sys.argv[5:]
orig_path = "shorts/tambora/voice/words.json.orig"
if "--orig" in args:
    orig_path = args[args.index("--orig") + 1]

segs = json.load(open(segs_path))
orig_words = json.load(open(orig_path))
print(f"orig: {len(orig_words)} words, last ends {orig_words[-1]['end']}s")

# cumulative token ranges per segment
_ranges = []
i = 0
for s in segs:
    toks = list(re.finditer(r"\S+", s["text"]))
    _ranges.append((i, i + len(toks)))
    i += len(toks)
assert i == len(orig_words), f"token count mismatch: {i} vs {len(orig_words)}"

spans, gaps, cursor = [], [], 0.0
for k, (a, b) in enumerate(_ranges):
    spans.append((orig_words[a]["start"], orig_words[b - 1]["end"]))
    if k + 1 < len(segs):
        gaps.append(orig_words[_ranges[k + 1][0]]["start"] - orig_words[b - 1]["end"])
for k, g in enumerate(gaps):
    print(f"gap{k+1:2}: {g:.3f}s (raw {segs[k]['gap']})")

total_samples = int(round(orig_words[-1]["end"] * sr))
out = np.zeros(total_samples + sr, dtype=np.int16)
words = []
t = 0.0
for k, s in enumerate(segs):
    a, b = _ranges[k]
    D = spans[k][1] - spans[k][0]
    src = f"{seg_dir}/seg{s['id']:02d}.wav"
    w = wave.open(src)
    assert (w.getnchannels(), w.getframerate(), w.getsampwidth()) == (1, sr, 2), src
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    w.close()
    # trim near-silent head/tail (keep 80 ms lead / 120 ms trail), then fit to D
    xf = x.astype(np.float32) / 32768.0
    win = int(0.02 * sr)
    rms = np.sqrt(np.convolve(xf ** 2, np.ones(win) / win, mode="same"))
    thr = 10 ** (-38 / 20)
    content = np.where(rms > thr)[0]
    if len(content):
        t0 = max(0, content[0] - int(0.08 * sr))
        t1 = min(len(x), content[-1] + int(0.12 * sr))
    else:
        t0, t1 = 0, len(x)
    x = x[t0:t1]
    if t0 or t1 < len(xf):
        trimed = f"/tmp/seg{s['id']:02d}_trim.wav"
        with wave.open(trimed, "wb") as tw:
            tw.setnchannels(1); tw.setsampwidth(2); tw.setframerate(sr)
            tw.writeframes(x.tobytes())
        src = trimed
    d = len(x) / sr
    atempo = d / D
    if atempo > 3.0:
        print(f"WARNING: seg{s['id']:02d} atempo {atempo:.3f} unusually high")
    dst = f"/tmp/seg{s['id']:02d}_fit.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
                    "-filter:a", f"atempo={atempo:.5f}", dst], check=True)
    w = wave.open(dst)
    samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    w.close()
    target_n = int(round(D * sr))
    if len(samples) > target_n:
        samples = samples[:target_n]         # trim tail silence (atempo frame rounding)
    elif len(samples) < target_n:
        samples = np.concatenate([samples, np.zeros(target_n - len(samples), dtype=np.int16)])
    i0 = int(round(t * sr))
    out[i0:i0 + len(samples)] = samples
    print(f"seg{s['id']:02d}: new {d:.2f}s -> span {D:.2f}s (atempo {atempo:.3f}), at t={t:.2f}s")
    # word timings: same char-weight method as voice_build.py, fitted duration D
    toks = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", s["text"])]
    weights = [len(tok[0]) + 1 for tok in toks]
    wsum = sum(weights)
    t_loc = 0.0
    for tok, wt in zip(toks, weights):
        wd = D * (wt / wsum)
        words.append({"word": tok[0], "start": round(t + t_loc, 4), "end": round(t + t_loc + wd, 4)})
        t_loc += wd
    t += D + (gaps[k] if k < len(gaps) else 0.0)

n = int(round(t * sr))
out = out[:n]
with wave.open(voice_out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(out.tobytes())
json.dump(words, open(words_out, "w"), indent=1)
print(f"wrote {voice_out}: {n/sr:.2f}s; wrote {words_out}: {len(words)} words, last ends {words[-1]['end']}s")
