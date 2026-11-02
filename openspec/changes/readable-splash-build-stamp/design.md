# Design — readable splash build stamp

`@cg/splash-kit` remains the single source of the build identity. Only its display formatter changes; the structured `__CG_BUILD__` object and release identity stay unchanged. The splash HTML continues to receive one pre-rendered string before application JavaScript starts.
