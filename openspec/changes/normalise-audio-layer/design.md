# Design

Use the stored source measurements for the offer. Older WAVs without metadata are measured from their bytes when selected. Calculate the gain against the −23 LUFS target and the −1 dBTP estimated true peak ceiling. A peak-limited source can land below the target.

Save the chosen gain as `normalisationGainDb` on the selected audio element. Its asset reference remains the original WAV, including when several placements share that WAV. Existing projects with baked copies continue to read those WAVs with unity normalisation gain.

The Sound section reports estimated sample peak, true peak and loudness after normalisation, ahead of manual volume and fades. Removing the gain returns those readouts to the source measurements. Applying or removing the gain is one document edit each.

The shared playback runtime multiplies the normalisation and manual volume gains before applying fades. The normalisation gain can exceed the manual fader's +6 dB range.
