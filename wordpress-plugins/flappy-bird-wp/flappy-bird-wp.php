<?php
/**
 * Plugin Name: Flappy Bird WP
 * Plugin URI: https://your-site.com/flappy-bird-wp
 * Description: A customizable Flappy Bird game for WordPress
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://your-site.com
 * Text Domain: flappy-bird-wp
 * License: GPL v2 or later
 */

if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('FLAPPY_BIRD_VERSION', '1.0.0');
define('FLAPPY_BIRD_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('FLAPPY_BIRD_PLUGIN_URL', plugin_dir_url(__FILE__));

// Include required files
require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-game.php';
require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-admin.php';

// Initialize plugin
function flappy_bird_init() {
    // Initialize game
    $game = new Flappy_Bird_Game();
    
    // Initialize admin if in admin area
    if (is_admin()) {
        $admin = new Flappy_Bird_Admin();
    }
}
add_action('init', 'flappy_bird_init');

// Activation hook
register_activation_hook(__FILE__, 'flappy_bird_activate');
function flappy_bird_activate() {
    // Set default options
    if (!get_option('flappy_bird_options')) {
        add_option('flappy_bird_options', Flappy_Bird_Game::get_default_options());
    }
}

// Deactivation hook
register_deactivation_hook(__FILE__, 'flappy_bird_deactivate');
function flappy_bird_deactivate() {
    // Cleanup if needed
}

// Uninstall hook
register_uninstall_hook(__FILE__, 'flappy_bird_uninstall');
function flappy_bird_uninstall() {
    delete_option('flappy_bird_options');
}