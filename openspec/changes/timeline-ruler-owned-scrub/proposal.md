# Change: Timeline ruler owns only scrubs that start on it

## Why

The frame ruler currently reacts to every pointer move whose mouse button is held. A drag started
over the canvas, Inspector or another timeline surface can therefore move the playhead merely by
crossing the ruler.

## What Changes

- Record the pointer whose primary press starts on the ruler.
- Ignore held pointer moves that do not belong to that gesture.
- End ownership on pointer-up, cancellation or lost pointer capture.
- Add DOM regression coverage for both foreign and ruler-owned drags.

## Impact

Designer timeline interaction only. The scene model, exported template and runtime are unchanged.
