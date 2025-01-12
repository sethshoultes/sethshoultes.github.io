# HTML5 Flappy Bird Clone

A lightweight, single-file implementation of a Flappy Bird-style game using pure HTML5, CSS, and JavaScript. Play directly in your browser with no dependencies required.

![Flappy Bird Clone](screenshot.png) <!-- You'll need to add a screenshot -->

## 🎮 Play Now

You can play the game directly at: [Your GitHub Pages URL]

## 📋 Features

- Single HTML file implementation
- No external dependencies
- Responsive design for all screen sizes
- Progressive difficulty
- High score tracking
- Sound effects
- Touch screen support
- Cross-browser compatibility
- Pause functionality

## 🎯 How to Play

1. **Start the Game**
   - Open the HTML file in your web browser
   - Press Space or tap the screen to begin

2. **Controls**
   - Press SPACE to make the bird jump
   - Tap the screen (on mobile devices)
   - Press ESC to pause/resume

3. **Objective**
   - Guide the bird through the gaps between pipes
   - Each successful pass earns 1 point
   - Avoid hitting pipes or screen boundaries
   - Try to beat your high score!

## 🚀 Quick Start

### Play Online
Visit [Your GitHub Pages URL]

### Play Locally
1. Download `index.html`
2. Open in any modern web browser
3. Start playing!

## 🛠 Technical Details

### Browser Compatibility
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers

### Features Implementation
- **Responsive Design**: Automatically adjusts to screen size
- **Progressive Difficulty**: 
  - Speed increases every 5 points
  - Pipe gaps narrow as score increases
- **Local Storage**: Saves high scores between sessions
- **Touch Support**: Full mobile device compatibility

## 🔧 Customization

You can modify game parameters by adjusting values in the config object:

```javascript
const config = {
    baseSpeed: 2,
    speedIncrement: 0.1,
    baseGap: 160,
    gapDecrement: 1,
    minGap: 120,
    scoreThreshold: 5
};
```

### Adjustable Parameters:
- `baseSpeed`: Initial game speed
- `speedIncrement`: Speed increase per level
- `baseGap`: Starting gap size between pipes
- `gapDecrement`: How much the gap narrows
- `minGap`: Minimum possible gap size
- `scoreThreshold`: Points needed for difficulty increase

## 🎨 Styling

The game uses a clean, minimal design with:
- Smooth animations
- Gradient-based graphics
- Shadow effects
- Responsive canvas sizing

## 📱 Mobile Support

- Responsive design
- Touch controls
- Portrait and landscape orientation support
- Optimal performance on mobile devices

## 🔍 Known Issues

- Sound may not work on some mobile browsers
- Performance may vary on older devices

## 📝 License

This project is released under the MIT License. See the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## 📬 Contact

[Your Contact Information]

---

Made with ❤️ by [Your Name]