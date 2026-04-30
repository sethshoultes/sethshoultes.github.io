# Video Narrative Map: personas-are-channels-not-pms

## 1. HeyGen Intro: The Category Error
**Visual**: A high-fidelity avatar of Seth in a clean, minimalist studio setting.
**Script**: 
"When an AI agent pipeline stalls, our first instinct is usually to add a 'PM Persona.' We think, 'If we just had a manager in there, they'd figure out why we're stuck.' But that's a category error. A persona isn't a manager—it's a channel. It's a specific way of speaking and thinking. But a persona has no clock. It can't wake up at 8 AM and notice a project is dead. To fix a stall, you don't need a better persona; you need better infrastructure."

## 2. Remotion Demo: The Mechanics of Motion
**Visual**: A choreographed technical walkthrough.
- **Scene A**: A screen recording of a "stalled" project (e.g., a GitHub board with no movement for 3 days).
- **Scene B**: An overlay of a terminal window showing a `cron` job firing.
- **Scene C**: A visual flow diagram: `Cron` $\rightarrow$ `Stall-Detector Script` $\rightarrow$ `Threshold Tripped` $\rightarrow$ `Dispatch Queue`.
- **Scene D**: The final step showing the `claude -p` command invoking a specific "Product Lead" persona to analyze the specific data provided by the detector.
- **Caption**: *Infrastructure (The Clock) $\rightarrow$ Persona (The Channel)*

## 3. HeyGen Outro: The Takeaway
**Visual**: Return to the avatar.
**Script**:
"The lesson here is a distinction between the voice and the trigger. If you find your agents spending all their time analyzing why they aren't making progress, you've fallen for the 'analysis-as-progress' fallacy. Stop adding personas and start building detectors. Separate your channels from your controllers, and you'll move from a system that describes its failures to one that actually resolves them."
