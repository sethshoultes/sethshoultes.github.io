<?php
/**
 * Plugin Name: WP Memory Game
 * Plugin URI: https://wpbuildr.com/wp-memory-game/
 * Description: A memory card matching game with high score tracking and pause functionality
 * Version: 1.0.0
 * Author: Seth Shoultes
 * Author URI: https://wpbuildr.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: wp-memory-game
 */

if (!defined('ABSPATH')) {
    exit;
}

class WP_Memory_Game {
    private $default_image_names;

    public function __construct() {
        $this->default_image_names = array();
        for ($i = 1; $i <= 8; $i++) {
            $this->default_image_names[$i] = sprintf(__('Image %d', 'wp-memory-game'), $i);
        }

        add_action('init', array($this, 'init'));
        add_action('init', array($this, 'register_memory_game_cpt'));
        add_action('add_meta_boxes', array($this, 'add_memory_game_meta_boxes'));
        add_action('save_post_memory_game', array($this, 'save_memory_game_meta'));
        add_shortcode('memory_game', array($this, 'render_game'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
        add_filter('the_content', array($this, 'append_game_to_content'));
    }
   public function init() {
       // Initialize plugin
       load_plugin_textdomain('wp-memory-game', false, dirname(plugin_basename(__FILE__)) . '/languages');
   }

   public function register_memory_game_cpt() {
       $labels = array(
           'name'               => _x('Memory Games', 'post type general name', 'wp-memory-game'),
           'singular_name'      => _x('Memory Game', 'post type singular name', 'wp-memory-game'),
           'menu_name'          => _x('Memory Games', 'admin menu', 'wp-memory-game'),
           'name_admin_bar'     => _x('Memory Game', 'add new on admin bar', 'wp-memory-game'),
           'add_new'            => _x('Add New', 'memory game', 'wp-memory-game'),
           'add_new_item'       => __('Add New Memory Game', 'wp-memory-game'),
           'new_item'           => __('New Memory Game', 'wp-memory-game'),
           'edit_item'          => __('Edit Memory Game', 'wp-memory-game'),
           'view_item'          => __('View Memory Game', 'wp-memory-game'),
           'all_items'          => __('All Memory Games', 'wp-memory-game'),
           'search_items'       => __('Search Memory Games', 'wp-memory-game'),
           'not_found'          => __('No memory games found.', 'wp-memory-game'),
           'not_found_in_trash' => __('No memory games found in Trash.', 'wp-memory-game')
       );

       $args = array(
           'labels'             => $labels,
           'public'             => true,
           'publicly_queryable' => true,
           'show_ui'            => true,
           'show_in_menu'       => true,
           'query_var'          => true,
           'rewrite'            => array('slug' => 'memory-game'),
           'capability_type'    => 'post',
           'has_archive'        => true,
           'hierarchical'       => false,
           'menu_position'      => null,
           'supports'           => array('title', 'editor', 'thumbnail'),
           'menu_icon'          => 'dashicons-games',
           'taxonomies'         => array('post_tag', 'category', 'post_format'),
       );

       register_post_type('memory_game', $args);
   }

   public function add_memory_game_meta_boxes() {
       add_meta_box(
           'memory_game_settings',
           __('Game Settings', 'wp-memory-game'),
           array($this, 'render_settings_meta_box'),
           'memory_game',
           'normal',
           'high'
       );

       add_meta_box(
           'memory_game_cards',
           __('Game Cards', 'wp-memory-game'),
           array($this, 'render_cards_meta_box'),
           'memory_game',
           'normal',
           'high'
       );
   }

   public function render_settings_meta_box($post) {
       wp_nonce_field('memory_game_settings', 'memory_game_settings_nonce');
       
       $settings = get_post_meta($post->ID, '_memory_game_settings', true) ?: array();
       $timer_type = isset($settings['timer_type']) ? $settings['timer_type'] : 'countdown';
       $timer_value = isset($settings['timer_value']) ? $settings['timer_value'] : 60;
       $grid_size = isset($settings['grid_size']) ? $settings['grid_size'] : '4x4';
       $theme = isset($settings['theme']) ? $settings['theme'] : 'default';
      $flip_duration = isset($settings['flip_duration']) ? $settings['flip_duration'] : 300;
      $match_delay = isset($settings['match_delay']) ? $settings['match_delay'] : 1000;
       ?>
       <table class="form-table">
           <tr>
               <th scope="row">
                   <label for="timer_type"><?php esc_html_e('Timer Type', 'wp-memory-game'); ?></label>
               </th>
               <td>
                   <select name="memory_game_settings[timer_type]" id="timer_type">
                       <option value="countdown" <?php selected($timer_type, 'countdown'); ?>>
                           <?php esc_html_e('Countdown', 'wp-memory-game'); ?>
                       </option>
                       <option value="countup" <?php selected($timer_type, 'countup'); ?>>
                           <?php esc_html_e('Count Up', 'wp-memory-game'); ?>
                       </option>
                   </select>
               </td>
           </tr>
           <tr>
               <th scope="row">
                   <label for="timer_value"><?php esc_html_e('Timer Value (seconds)', 'wp-memory-game'); ?></label>
               </th>
               <td>
                   <input type="number" 
                          id="timer_value" 
                          name="memory_game_settings[timer_value]" 
                          value="<?php echo esc_attr($timer_value); ?>" 
                          min="10" 
                          max="300" />
               </td>
           </tr>
           <tr>
               <th scope="row">
                   <label for="grid_size"><?php esc_html_e('Grid Size', 'wp-memory-game'); ?></label>
               </th>
               <td>
                   <select name="memory_game_settings[grid_size]" id="grid_size">
                       <option value="4x4" <?php selected($grid_size, '4x4'); ?>>4x4</option>
                       <option value="4x5" <?php selected($grid_size, '4x5'); ?>>4x5</option>
                       <option value="5x6" <?php selected($grid_size, '5x6'); ?>>5x6</option>
                   </select>
               </td>
           </tr>
           <tr>
               <th scope="row">
                   <label for="flip_duration"><?php esc_html_e('Card Flip Duration (ms)', 'wp-memory-game'); ?></label>
               </th>
               <td>
                   <input type="number" 
                          id="flip_duration" 
                          name="memory_game_settings[flip_duration]" 
                          value="<?php echo esc_attr($flip_duration); ?>" 
                          min="100" 
                          max="1000"
                          step="50" />
                   <p class="description">
                       <?php esc_html_e('How long it takes for a card to flip (in milliseconds)', 'wp-memory-game'); ?>
                   </p>
               </td>
           </tr>
           <tr>
               <th scope="row">
                   <label for="match_delay"><?php esc_html_e('Match Delay (ms)', 'wp-memory-game'); ?></label>
               </th>
               <td>
                   <input type="number" 
                          id="match_delay" 
                          name="memory_game_settings[match_delay]" 
                          value="<?php echo esc_attr($match_delay); ?>" 
                          min="500" 
                          max="3000"
                          step="100" />
                   <p class="description">
                       <?php esc_html_e('How long to wait before flipping back non-matching cards (in milliseconds)', 'wp-memory-game'); ?>
                   </p>
               </td>
           </tr>
           <tr>
               <th scope="row">
                   <label for="theme"><?php esc_html_e('Theme', 'wp-memory-game'); ?></label>
               </th>
               <td>
                   <select name="memory_game_settings[theme]" id="theme">
                       <option value="default" <?php selected($theme, 'default'); ?>>
                           <?php esc_html_e('Default', 'wp-memory-game'); ?>
                       </option>
                       <option value="dark" <?php selected($theme, 'dark'); ?>>
                           <?php esc_html_e('Dark', 'wp-memory-game'); ?>
                       </option>
                       <option value="kids" <?php selected($theme, 'kids'); ?>>
                           <?php esc_html_e('Kids', 'wp-memory-game'); ?>
                       </option>
                       <option value="professional" <?php selected($theme, 'professional'); ?>>
                           <?php esc_html_e('Professional', 'wp-memory-game'); ?>
                       </option>
                   </select>
               </td>
           </tr>
       </table>
       <?php
   }

   public function render_cards_meta_box($post) {
       wp_nonce_field('memory_game_cards', 'memory_game_cards_nonce');
       
       $cards = get_post_meta($post->ID, '_memory_game_cards', true) ?: array();

       // Ensure minimum of 8 card slots
       if (count($cards) < 8) {
           $cards = array_pad($cards, 8, array('name' => '', 'image' => ''));
       }
       
       // Ensure WordPress Media Uploader scripts are loaded
       wp_enqueue_media();
       ?>
       <div id="memory-game-cards">
           <p class="description">
               <?php esc_html_e('Upload at least 8 unique images for your memory game cards. Each image will be used to create a matching pair.', 'wp-memory-game'); ?>
           </p>
           <div class="card-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0;">
               <?php foreach ($cards as $i => $card): ?>
                   <div class="card-field" style="background: #f9f9f9; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
                       <h4><?php printf(esc_html__('Card %d', 'wp-memory-game'), $i + 1); ?></h4>
                       <div class="image-upload" style="margin: 10px 0;">
                           <input type="hidden" 
                                  name="memory_game_cards[<?php echo $i; ?>][image]" 
                                  value="<?php echo esc_url($card['image']); ?>" 
                                  class="image-url" />
                           <button type="button" class="button upload-image-button">
                               <?php echo empty($card['image']) ? esc_html__('Upload Image', 'wp-memory-game') : esc_html__('Change Image', 'wp-memory-game'); ?>
                           </button>
                           <button type="button" class="button button-link-delete remove-image-button" style="<?php echo empty($card['image']) ? 'display: none;' : ''; ?>">
                               <?php esc_html_e('Remove', 'wp-memory-game'); ?>
                           </button>
                       </div>
                       <div class="image-preview" style="margin-top: 10px; text-align: center;">
                           <?php if (!empty($card['image'])): ?>
                               <img src="<?php echo esc_url($card['image']); ?>" 
                                    style="max-width: 100%; height: auto; border-radius: 4px;" />
                           <?php endif; ?>
                       </div>
                       <input type="text" 
                              name="memory_game_cards[<?php echo $i; ?>][name]" 
                              value="<?php echo esc_attr($card['name']); ?>" 
                              placeholder="<?php esc_attr_e('Card Name (optional)', 'wp-memory-game'); ?>"
                              class="widefat"
                              style="margin-top: 10px;" />
                   </div>
               <?php endforeach; ?>
           </div>
           <div style="text-align: center; margin-top: 20px;">
               <button type="button" id="add-more-cards" class="button button-primary">
                   <?php esc_html_e('Add More Cards', 'wp-memory-game'); ?>
               </button>
           </div>
       </div>

       <script>
       jQuery(document).ready(function($) {
           // Handle image upload - using event delegation
           $(document).on('click', '.upload-image-button', function(e) {
               e.preventDefault();
               var $button = $(this);
               var $field = $button.closest('.card-field');
               
               var frame = wp.media({
                   title: '<?php esc_html_e('Select Card Image', 'wp-memory-game'); ?>',
                   button: {
                       text: '<?php esc_html_e('Use this image', 'wp-memory-game'); ?>'
                   },
                   multiple: false
               });

               frame.on('select', function() {
                   var attachment = frame.state().get('selection').first().toJSON();
                   $field.find('.image-url').val(attachment.url);
                   $field.find('.image-preview').html(
                       $('<img>', {
                           src: attachment.url,
                           style: 'max-width: 100%; height: auto; border-radius: 4px;'
                       })
                   );
                   $button.text('<?php esc_html_e('Change Image', 'wp-memory-game'); ?>');
                   $field.find('.remove-image-button').show();
               });

               frame.open();
           });

           // Handle image removal - using event delegation
           $(document).on('click', '.remove-image-button', function(e) {
               e.preventDefault();
               var $button = $(this);
               var $field = $button.closest('.card-field');
               
               $field.find('.image-url').val('');
               $field.find('.image-preview').empty();
               $field.find('.upload-image-button').text('<?php esc_html_e('Upload Image', 'wp-memory-game'); ?>');
               $button.hide();
           });

           // Handle adding more cards
           $('#add-more-cards').on('click', function(e) {
               e.preventDefault();
               var $grid = $('.card-grid');
               var cardCount = $('.card-field').length;
               var newIndex = cardCount;

               // Create new card field
               var $newCard = $('<div>', {
                   class: 'card-field',
                   style: 'background: #f9f9f9; padding: 15px; border: 1px solid #ddd; border-radius: 4px;'
               }).append(
                   $('<h4>').text('<?php esc_html_e('Card', 'wp-memory-game'); ?> ' + (newIndex + 1)),
                   $('<div>', {
                       class: 'image-upload',
                       style: 'margin: 10px 0;'
                   }).append(
                       $('<input>', {
                           type: 'hidden',
                           name: 'memory_game_cards[' + newIndex + '][image]',
                           class: 'image-url'
                       }),
                       $('<button>', {
                           type: 'button',
                           class: 'button upload-image-button',
                          text: '<?php esc_html_e('Upload Image', 'wp-memory-game'); ?>',
                          style: 'margin-right: 5px;'
                       }),
                       $('<button>', {
                           type: 'button',
                           class: 'button button-link-delete remove-image-button',
                           text: '<?php esc_html_e('Remove', 'wp-memory-game'); ?>',
                           style: 'display: none;'
                       })
                   ),
                   $('<div>', {
                       class: 'image-preview',
                       style: 'margin-top: 10px; text-align: center;'
                   }),
                   $('<input>', {
                       type: 'text',
                       name: 'memory_game_cards[' + newIndex + '][name]',
                       class: 'widefat',
                       placeholder: '<?php esc_attr_e('Card Name (optional)', 'wp-memory-game'); ?>',
                       style: 'margin-top: 10px;'
                   })
               );

               $grid.append($newCard);
           });
       });
       </script>
       <?php
   }

   public function save_memory_game_meta($post_id) {
       // Verify nonces
       if (!isset($_POST['memory_game_settings_nonce']) || 
           !wp_verify_nonce($_POST['memory_game_settings_nonce'], 'memory_game_settings')) {
           return;
       }

       if (!isset($_POST['memory_game_cards_nonce']) || 
           !wp_verify_nonce($_POST['memory_game_cards_nonce'], 'memory_game_cards')) {
           return;
       }

       // Save settings
       if (isset($_POST['memory_game_settings'])) {
           $settings = array(
               'timer_type' => sanitize_text_field($_POST['memory_game_settings']['timer_type']),
               'timer_value' => intval($_POST['memory_game_settings']['timer_value']),
               'flip_duration' => intval($_POST['memory_game_settings']['flip_duration']),
               'match_delay' => intval($_POST['memory_game_settings']['match_delay']),
               'grid_size' => sanitize_text_field($_POST['memory_game_settings']['grid_size']),
               'theme' => sanitize_text_field($_POST['memory_game_settings']['theme'])
           );
           update_post_meta($post_id, '_memory_game_settings', $settings);
       }

       // Save cards
       if (isset($_POST['memory_game_cards'])) {
           $cards = array();
           foreach ($_POST['memory_game_cards'] as $card) {
               if (!empty($card['name']) || !empty($card['image'])) {
                   $cards[] = array(
                       'name' => sanitize_text_field($card['name']),
                       'image' => esc_url_raw($card['image'])
                   );
               }
           }
           update_post_meta($post_id, '_memory_game_cards', $cards);
       }
   }

    public function append_game_to_content($content) {
        global $post;
        
        // Check if we're in the main query and in the loop
        if (!is_main_query() || !in_the_loop()) {
            return $content;
        }

        // Handle memory game post type
        if (is_singular('memory_game')) {
            // Get the game settings and generate the game HTML
            $game_content = $this->render_game(array(
                'id' => $post->ID,
                'title' => get_the_title($post->ID)
            ));
            
            // Add the game content after the post content
            return $content . $game_content;
        }

        // Handle shortcode in regular posts
        if (has_shortcode($content, 'memory_game')) {
            return $content;
        }
        
        return $content;
    }

    public function enqueue_assets() {
        // Only enqueue if shortcode is present or if viewing a memory game post
        global $post;
        if (!is_a($post, 'WP_Post') ||
            (!has_shortcode($post->post_content, 'memory_game') &&
             !is_singular('memory_game'))) {
            return;
        }

        // Get game ID from shortcode if present
        $game_id = null;
        if (is_singular('memory_game')) {
            $game_id = get_the_ID();
        } elseif (has_shortcode($post->post_content, 'memory_game')) {
            preg_match_all('/\[memory_game.*?id=["\'](\d+)["\'].*?\]/', $post->post_content, $matches);
            if (!empty($matches[1][0])) {
                $game_id = $matches[1][0];
            }
        }

        wp_enqueue_style(
            'wp-memory-game',
            plugins_url('css/style.css', __FILE__),
            array(),
            '1.0.0'
        );

        wp_enqueue_script(
            'dompurify',
            'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
            array(),
            '3.0.6',
            true
        );

        wp_enqueue_script(
            'wp-memory-game',
            plugins_url('js/game.js', __FILE__),
            array('dompurify'),
            '1.0.0',
            true
        );

        // Add theme-specific styles
        wp_enqueue_style(
            'wp-memory-game-themes',
            plugins_url('css/themes.css', __FILE__),
            array('wp-memory-game'),
            '1.0.0'
        );

        wp_localize_script(
            'wp-memory-game',
            'wpMemoryGame',
            $this->get_game_data($game_id)
        );
    }

    private function get_game_data($game_id = null) {
        $data = array(
                'pluginUrl' => plugins_url('', __FILE__),
                'images' => array(),
                'imageNames' => array(),
                'options' => array(
                    'timer_type' => 'countdown',
                    'timer_value' => 60
                )
        );

        if ($game_id) {
            $settings = get_post_meta($game_id, '_memory_game_settings', true) ?: array();
            $cards = get_post_meta($game_id, '_memory_game_cards', true) ?: array();

            // Update options with game settings
            $data['options'] = array_merge($data['options'], array(
                'timer_type' => $settings['timer_type'] ?? 'countdown',
                'timer_value' => intval($settings['timer_value'] ?? 60),
               'flip_duration' => intval($settings['flip_duration'] ?? 300),
               'match_delay' => intval($settings['match_delay'] ?? 1000),
                'grid_size' => $settings['grid_size'] ?? '4x4',
                'theme' => $settings['theme'] ?? 'default'
            ));

            // Add card images and names
            foreach ($cards as $card) {
                if (!empty($card['image'])) {
                    $data['images'][] = $card['image'];
                    $data['imageNames'][] = $card['name'] ?? '';
                }
            }

            // Ensure we have pairs by duplicating the images
            $data['images'] = array_merge($data['images'], $data['images']);
            $data['imageNames'] = array_merge($data['imageNames'], $data['imageNames']);
        }

        // Fallback to default images if no custom images are set
        if (empty($data['images'])) {
            $data['images'] = $this->get_default_images();
            $data['imageNames'] = $this->get_default_image_names();
        }

        return $data;
    }

    private function get_default_images() {
        $images = array();
        for ($i = 1; $i <= 8; $i++) {
            $images[] = "https://picsum.photos/150/200?random=" . $i;
        }
        return array_merge($images, $images); // Create pairs
    }
    
    private function get_default_image_names() {
        $names = array();
        for ($i = 1; $i <= 8; $i++) {
            $names[] = sprintf(__('Card %d', 'wp-memory-game'), $i);
        }
        return array_merge($names, $names); // Create pairs
    }

    // Rest of the code remains the same as in the original file...

    public function render_game($atts) {
       $atts = shortcode_atts(array(
           'id' => 0,
           'title' => ''
       ), $atts);

       // Get theme setting
       $theme = 'default';
       if (!empty($atts['id'])) {
           $settings = get_post_meta($atts['id'], '_memory_game_settings', true);
           $theme = isset($settings['theme']) ? $settings['theme'] : 'default';
       }

       if (!empty($atts['id'])) {
           $game = get_post($atts['id']);
           if ($game && 'memory_game' === $game->post_type) {
               $atts['title'] = $game->post_title;
           }
       }
       
       if (empty($atts['title'])) {
           $atts['title'] = __('Memory Game', 'wp-memory-game');
       }

        ob_start();
        ?>
       <div class="wp-memory-game-container theme-<?php echo esc_attr($theme); ?>">
            <div class="container">
               <h1><?php echo esc_html($atts['title']); ?></h1>
                <div class="game-info">
                    <div class="moves"><?php esc_html_e('Moves:', 'wp-memory-game'); ?> <span id="moves">0</span></div>
                    <div class="timer">
                        <span id="timer-label"><?php esc_html_e('Time:', 'wp-memory-game'); ?></span>
                        <span id="timer">0</span>s
                    </div>
                    <div class="high-score"><?php esc_html_e('Best Score:', 'wp-memory-game'); ?> <span id="high-score">-</span></div>
                    <button id="pause" class="restart-btn"><?php esc_html_e('Pause', 'wp-memory-game'); ?></button>
                </div>
                <div class="game-board" id="game-board"></div>
                <button id="restart" class="restart-btn"><?php esc_html_e('Restart Game', 'wp-memory-game'); ?></button>
                <div class="pause-overlay" id="pause-overlay">
                    <div class="pause-content">
                        <h2><?php esc_html_e('Game Paused', 'wp-memory-game'); ?></h2>
                        <button id="resume" class="restart-btn"><?php esc_html_e('Resume Game', 'wp-memory-game'); ?></button>
                    </div>
                </div>
                <div class="game-over" id="game-over">
                    <div class="game-over-content">
                        <h2><?php esc_html_e('Game Over!', 'wp-memory-game'); ?></h2>
                        <p><?php esc_html_e('Total Moves:', 'wp-memory-game'); ?> <span id="final-moves">0</span></p>
                        <p><?php esc_html_e('Pairs Found:', 'wp-memory-game'); ?> <span id="final-pairs">0</span></p>
                        <p><?php esc_html_e('Best Score:', 'wp-memory-game'); ?> <span id="final-high-score">-</span></p>
                        <button id="play-again" class="restart-btn"><?php esc_html_e('Play Again', 'wp-memory-game'); ?></button>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}

// Initialize the plugin
new WP_Memory_Game();