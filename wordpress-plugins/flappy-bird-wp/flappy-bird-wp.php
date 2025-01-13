<?php
/*
Plugin Name: Simple Flappy Bird
Description: Adds a Flappy Bird game to your WordPress site using [flappy_bird] shortcode
Version: 1.0
Author: Your Name
*/

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('FLAPPY_BIRD_VERSION', '1.0.0');
define('FLAPPY_BIRD_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('FLAPPY_BIRD_PLUGIN_URL', plugin_dir_url(__FILE__));

class Simple_Flappy_Bird {
    public function __construct() {
        // Initialize plugin
        add_action('init', array($this, 'init'));
        
        // Load required files
        require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-game.php';
        require_once FLAPPY_BIRD_PLUGIN_DIR . 'includes/class-flappy-bird-admin.php';
        
        // Initialize admin if in admin area
        if (is_admin()) {
            new Flappy_Bird_Admin();
        }
    }

    public function init() {
        add_shortcode('flappy_bird', array($this, 'render_game'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function enqueue_assets() {
        // Enqueue styles
        wp_enqueue_style(
            'simple-flappy-bird',
            plugins_url('assets/css/style.css', __FILE__),
            array(),
            '1.0'
        );
        
        // Enqueue scripts
        wp_enqueue_script(
            'simple-flappy-bird',
            plugins_url('assets/js/game.js', __FILE__),
            array('jquery'),
            '1.0',
            true
        );
    
        // Pass settings to JavaScript
        $options = get_option('flappy_bird_options', array());
        wp_localize_script('simple-flappy-bird', 'flappyBirdSettings', array(
            'gravity' => isset($options['gravity']) ? floatval($options['gravity']) : 0.5,
            'jump_force' => isset($options['jump_force']) ? floatval($options['jump_force']) : -7,
            'pipe_speed' => isset($options['pipe_speed']) ? floatval($options['pipe_speed']) : 3,
            'pipe_gap' => isset($options['pipe_gap']) ? intval($options['pipe_gap']) : 150,
            'assets_url' => plugins_url('assets/', __FILE__),
        ));
    }

    public function render_game() {
        $game = new Flappy_Bird_Game();
        return $game->render_game();
    }
}

// Initialize plugin
new Simple_Flappy_Bird();