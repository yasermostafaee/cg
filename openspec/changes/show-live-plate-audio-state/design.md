## One state answer

The frame continues to use `plateAudioState`, and the row uses `audioSummary`. No component derives
audibility from volume or hold flags on its own. A held plate therefore draws Volume Muted even when
its stored intent is armed, because the active look is suppressing it.

The row audio control remains in the alias cell; the fixed six-verb grid is unchanged. The icon is a
flat ON/MUTED state, never a meter: CasparCG exposes only programme-channel peaks, not a truthful
per-input level.
