<?php
/**
 * Plugin Name: Flappy Bird WP
 * Plugin URI: https://example.com/flappy-bird-wp
 * Description: A customizable Flappy Bird game for WordPress
 * Version: 1.0.0
 * Author: Your Name
 * Text Domain: flappy-bird-wp
 * License: GPL v2 or later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('FLAPPY_BIRD_VERSION', '1.0.0');
define('FLAPPY_BIRD_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('FLAPPY_BIRD_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-game.php';
require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-admin.php';
require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-achievements.php';

function flappy_bird_init() {
    $game = new Flappy_Bird_Game();
    if (is_admin()) {
        $admin = new Flappy_Bird_Admin();
    }
    $achievements = new Flappy_Bird_Achievements();
}
add_action('init', 'flappy_bird_init');

function flappy_bird_activate() {
    if (!get_option('flappy_bird_options')) {
        add_option('flappy_bird_options', Flappy_Bird_Game::get_default_options());
    }
    
    $game = new Flappy_Bird_Game();
    $game->create_tables();
    
    update_option('flappy_bird_db_version', '1.0');
}
register_activation_hook(__FILE__, 'flappy_bird_activate');

function flappy_bird_deactivate() {
    // Cleanup if needed
}
register_deactivation_hook(__FILE__, 'flappy_bird_deactivate');

function flappy_bird_uninstall() {
    delete_option('flappy_bird_options');
    // Optional: Remove database tables
}
register_uninstall_hook(__FILE__, 'flappy_bird_uninstall');

function flappy_bird_debug_info() {
    if (WP_DEBUG) {
        $debug_info = array(
            'plugin_url' => FLAPPY_BIRD_PLUGIN_URL,
            'plugin_dir' => FLAPPY_BIRD_PLUGIN_DIR,
            'version' => FLAPPY_BIRD_VERSION,
            'wp_version' => get_bloginfo('version'),
            'is_admin' => is_admin(),
            'debug_mode' => WP_DEBUG
        );
        
        echo '<!-- Flappy Bird WP Debug Info: ' . 
             esc_html(json_encode($debug_info)) . 
             ' -->';
    }
}
add_action('wp_footer', 'flappy_bird_debug_info');