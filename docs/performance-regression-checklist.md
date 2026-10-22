# performance regression checklist

Before releasing a visual change, check that the page remains usable without WebGL, respects reduced-motion preferences, and does not start duplicate animation loops after route changes. Measure initial load and long-task behavior on a mid-range device. Dispose of event listeners, observers, animation frames, and GPU resources when components unmount. Test keyboard navigation and verify the main content remains available if a visual effect fails.
