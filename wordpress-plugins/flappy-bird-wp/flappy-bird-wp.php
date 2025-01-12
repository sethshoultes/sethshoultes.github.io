<?php
/**
 * Plugin Name: Flappy Bird WP
 * Plugin URI: https://wpbuildr.com/flappy-bird-wp
 * Description: A customizable Flappy Bird game for WordPress
 * Version: 1.0.0
 * Author: Seth Shoultes
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

/**
 * Initializes the plugin, creating a new instance of Flappy_Bird_Game and
 * Flappy_Bird_Admin (if in the admin dashboard).
 *
 * @since 1.0.0
 */
function flappy_bird_init() {
    $game = new Flappy_Bird_Game();
/**
 * Handles plugin activation by setting default options if they are not already
 * set.
 *
 * @since 1.0.0
 */
    if (is_admin()) {
        $admin = new Flappy_Bird_Admin();
    }
}
add_action('init', 'flappy_bird_init');

register_activation_hook(__FILE__, 'flappy_bird_activate');
/**
 * Handles plugin activation by setting default options if they are not already
 * set.
 *
 * @since 1.0.0
 */
function flappy_bird_activate() {
    if (!get_option('flappy_bird_options')) {
        add_option('flappy_bird_options', Flappy_Bird_Game::get_default_options());
    }
}

register_deactivation_hook(__FILE__, 'flappy_bird_deactivate');

/**
 * Handles plugin deactivation by cleaning up any needed resources.
 *
 * @since 1.0.0
 */
function flappy_bird_deactivate() {
    // Cleanup if needed
}

register_uninstall_hook(__FILE__, 'flappy_bird_uninstall');
/**
 * Handles plugin uninstallation by cleaning up any needed resources.
 *
 * @since 1.0.0
 */
function flappy_bird_uninstall() {
    delete_option('flappy_bird_options');
}