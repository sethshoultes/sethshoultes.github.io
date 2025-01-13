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

class Simple_Flappy_Bird {
    public function __construct() {
        add_action('init', array($this, 'init'));
    }

    public function init() {
        add_shortcode('flappy_bird', array($this, 'render_game'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function enqueue_assets() {
        wp_enqueue_style(
            'simple-flappy-bird',
            plugins_url('style.css', __FILE__),
            array(),
            '1.0'
        );
        
        wp_enqueue_script(
            'simple-flappy-bird',
            plugins_url('game.js', __FILE__),
            array(),
            '1.0',
            true
        );
    }

    public function render_game() {
        return <<<HTML
        <div class="flappy-bird-game">
            <div id="game-screen">
                <div id="bird"></div>
                <div id="score">0</div>
                <div id="start-message">Press Space or Click to Start</div>
                <div id="game-over" style="display:none;">
                    <h2>Game Over!</h2>
                    <p>Score: <span id="final-score">0</span></p>
                    <p>High Score: <span id="high-score">0</span></p>
                    <button id="restart-button">Play Again</button>
                </div>
            </div>
        </div>
HTML;
    }
}

// Initialize plugin
new Simple_Flappy_Bird();