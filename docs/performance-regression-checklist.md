# performance regression checklist

Before releasing a visual change, check that the page remains usable without WebGL, respects reduced-motion preferences, and does not start duplicate animation loops after route changes. Measure initial load and long-task behavior on a mid-range device. Dispose of event listeners, observers, animation frames, and GPU resources when components unmount. Test keyboard navigation and verify the main content remains available if a visual effect fails.

## External navigation checks

For links that open a new tab, verify the destination is intentional and the link uses `rel="noopener noreferrer"` where appropriate. Keep accessible labels on icon-only links, and ensure a failed external destination does not prevent local portfolio navigation. Do not use JavaScript to open a URL derived from unvalidated user input. Include a mobile check for links inside the phone/contact UI and ensure nested interactive elements are not introduced.
