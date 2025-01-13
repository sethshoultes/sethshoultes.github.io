<?php
class Flappy_Bird_Achievements {
    private $achievements;
    private $table_name;

    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'flappy_bird_achievements';
        $this->init_achievements();
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }

    private function init_achievements() {
        $this->achievements = array(
            'first_flight' => array(
                'title' => 'First Flight',
                'description' => 'Play your first game',
                'condition' => 'games_played',
                'threshold' => 1,
                'points' => 10
            ),
            'high_flyer' => array(
                'title' => 'High Flyer',
                'description' => 'Score 50 points',
                'condition' => 'max_score',
                'threshold' => 50,
                'points' => 50
            ),
            'marathon_bird' => array(
                'title' => 'Marathon Bird',
                'description' => 'Play for 1 hour total',
                'condition' => 'total_time',
                'threshold' => 3600,
                'points' => 100
            )
        );
    }

    public function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS {$this->table_name} (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            achievement_key varchar(50) NOT NULL,
            earned_date datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY user_achievement (user_id, achievement_key)
        ) $charset_collate;";

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }

    public function check_achievements($user_id, $stats) {
        $earned = array();
        foreach ($this->achievements as $key => $achievement) {
            if (!$this->has_achievement($user_id, $key) && 
                $this->meets_condition($stats, $achievement)) {
                $this->award_achievement($user_id, $key);
                $earned[] = $achievement;
            }
        }
        return $earned;
    }

    private function has_achievement($user_id, $key) {
        global $wpdb;
        return $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->table_name} 
            WHERE user_id = %d AND achievement_key = %s",
            $user_id, $key
        )) > 0;
    }

    private function award_achievement($user_id, $key) {
        global $wpdb;
        $wpdb->insert(
            $this->table_name,
            array(
                'user_id' => $user_id,
                'achievement_key' => $key
            ),
            array('%d', '%s')
        );
    }

    private function meets_condition($stats, $achievement) {
        switch ($achievement['condition']) {
            case 'games_played':
                return $stats['games_played'] >= $achievement['threshold'];
            case 'max_score':
                return $stats['max_score'] >= $achievement['threshold'];
            case 'total_time':
                return $stats['total_time'] >= $achievement['threshold'];
            default:
                return false;
        }
    }

    public function register_rest_routes() {
        register_rest_route('flappy-bird/v1', '/achievements', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_user_achievements'),
            'permission_callback' => function() {
                return is_user_logged_in();
            }
        ));
    }

    public function get_user_achievements($request) {
        $user_id = get_current_user_id();
        global $wpdb;
        
        $achievements = $wpdb->get_results($wpdb->prepare(
            "SELECT achievement_key, earned_date 
            FROM {$this->table_name}
            WHERE user_id = %d
            ORDER BY earned_date DESC",
            $user_id
        ));

        $response = array();
        foreach ($achievements as $achievement) {
            if (isset($this->achievements[$achievement->achievement_key])) {
                $achievement_data = $this->achievements[$achievement->achievement_key];
                $response[] = array(
                    'key' => $achievement->achievement_key,
                    'title' => $achievement_data['title'],
                    'description' => $achievement_data['description'],
                    'points' => $achievement_data['points'],
                    'earned_date' => $achievement->earned_date
                );
            }
        }

        return new WP_REST_Response($response, 200);
    }
}