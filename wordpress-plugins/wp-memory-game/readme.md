# WordPress Memory Game Plugin

A feature-rich memory card matching game plugin for WordPress with customizable settings, multiple themes, and high score tracking.

## Features

- 🎮 Classic memory card matching gameplay
- 🎨 Multiple theme options (Default, Dark, Kids, Professional)
- ⚙️ Customizable game settings:
  - Grid sizes (4x4, 4x5, 5x6)
  - Timer types (countdown/count-up)
  - Card flip animations
  - Match delay timing
- 🖼️ Custom card images and names
- 🏆 High score tracking
- ⏸️ Pause/Resume functionality
- 🔄 Restart game option
- 🎯 Move counter
- 📱 Responsive design
- 🌐 Translation-ready

## Installation

1. Download the plugin zip file
2. Go to WordPress admin panel → Plugins → Add New
3. Click "Upload Plugin" and choose the downloaded zip file
4. Click "Install Now" and then "Activate"

## Usage

### Creating a Memory Game

1. In WordPress admin, go to Memory Games → Add New
2. Set a title for your game
3. Configure game settings:
   - Timer type (countdown/count-up)
   - Timer value (10-300 seconds)
   - Grid size (4x4, 4x5, 5x6)
   - Card flip duration
   - Match delay
   - Theme selection
4. Upload at least 8 card images (each image will be used to create a matching pair)
5. Optionally add names for each card
6. Publish your game

### Adding the Game to Your Site

You can add the game to your site in two ways:

1. **Automatic Display**: The game will automatically appear below the content on its dedicated game page.

2. **Using Shortcode**: Add the game anywhere using the shortcode:
   ```
   [memory_game id="123"]
   ```
   Replace "123" with your game's post ID.

## Game Settings

### Timer Options
- **Timer Type**: Choose between countdown (time limit) or count-up (elapsed time)
- **Timer Value**: Set duration in seconds (10-300)

### Grid Sizes
- 4x4 (16 cards - 8 pairs)
- 4x5 (20 cards - 10 pairs)
- 5x6 (30 cards - 15 pairs)

### Animation Settings
- **Card Flip Duration**: How long the flip animation takes (100-1000ms)
- **Match Delay**: How long non-matching cards stay revealed (500-3000ms)

### Themes
- **Default**: Clean, light design
- **Dark**: Dark mode for low-light environments
- **Kids**: Colorful, playful design
- **Professional**: Business-friendly appearance

## Customization

### CSS Classes
The plugin uses the following main CSS classes for styling:

- `.wp-memory-game-container`: Main container
- `.game-board`: Game grid container
- `.card`: Individual card elements
- `.card.flipped`: Flipped card state
- `.card.matched`: Matched card state

### Theme Classes
Add custom themes by targeting:
```css
.wp-memory-game-container.theme-your-theme-name {
    /* Your theme styles */
}
```

## Development

### File Structure
```
wp-memory-game/
├── css/
│   ├── style.css
│   └── themes.css
├── js/
│   └── game.js
├── languages/
├── wp-memory-game.php
└── README.md
```

### Filters and Actions
The plugin provides hooks for extending functionality:

```php
// Modify game settings before save
add_filter('wp_memory_game_settings', function($settings) {
    // Modify settings
    return $settings;
});

// Custom initialization
add_action('wp_memory_game_init', function() {
    // Your initialization code
});
```

## Requirements

- WordPress 5.0 or higher
- PHP 7.2 or higher
- Modern web browser with JavaScript enabled

## License

This plugin is licensed under the GPL v2 or later.

## Support

For bug reports and feature requests, please use the GitHub issues page or contact the plugin author.

## Changelog

### 1.0.0
- Initial release
- Basic memory game functionality
- Multiple themes
- Customizable settings
- High score tracking
- Responsive design