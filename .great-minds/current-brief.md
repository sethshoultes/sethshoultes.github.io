# BRIEF: Switch Channels, Don't Dig
    
## Core Claim
When an AI agent is failing to produce the desired result, the instinct is to "dig deeper" with more detailed prompts, more constraints, and more context—trying to force a failing channel to work. This is a waste of tokens and cognitive load. The solution is not to refine the prompt, but to switch the channel. If the "Creative" channel is failing to be precise, don't prompt it to be precise; switch to the "Analytic" channel.

## The "Why" (Architectural Insight)
Model capabilities are not a monolithic "intelligence" but a set of distinct probabilistic channels (registries of behavior). Prompting is the act of steering the model into a specific channel. Once you are in a channel, you can refine the output, but you cannot fundamentally change the channel's nature. If you are in a "Chatty" channel, no amount of "be concise" prompting will ever be as effective as switching to a "Clinical" channel.

## Key Narrative Pillars
1. **The Digging Fallacy**: Describe the cycle of "prompt-refine-fail-refine" where the operator becomes obsessed with the wording of the prompt rather than the nature of the channel.
2. **Channels vs. Prompts**: Contrast the "Prompting" mindset (fixing the word) with the "Channel" mindset (fixing the route). 
3. **The Cost of Digging**: Explain how "digging" increases context window noise and degrades the model's ability to follow instructions, often making the failure worse.
4. **The Switch**: Provide a clear framework for recognizing when to stop digging and start switching. "If you've refined the prompt three times and the core failure persists, the channel is wrong."

## Voice Directive: John McPhee
- **Tone**: Observational, structured, and obsessed with the precise arrangement of information.
- **Style**: High-density factual detail, clear structural transitions, and a focus on the "geology" of the interaction.
- **Goal**: Treat the AI interaction not as a conversation, but as a survey of different linguistic terrains.

## Success Criteria
- The reader should stop viewing prompting as la "negotiating with a ghost" and start viewing it as "selecting a frequency."
- The reader should recognize the "Three-Strike Rule": three failed refinements = switch channel.
- The reader should understand that the most efficient path to a result is often a change in the identity/persona of the agent.
