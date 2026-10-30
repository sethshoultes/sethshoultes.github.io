#!/usr/bin/env bash
# Read-only export of every published MemberPress course, its sections and its lessons from smartwebutah.com,
# as one JSON document on stdout. Usage: export-courses.sh > build/academy/export.json
set -euo pipefail
ssh hetzner-sites 'cd /home/swsutah/htdocs/swsutah.com && wp --allow-root eval-file - ' <<'PHP'
<?php
global $wpdb;
$out = [];
$courses = get_posts(['post_type' => 'mpcs-course', 'post_status' => 'publish', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC']);
foreach ($courses as $c) {
  $secs = $wpdb->get_results($wpdb->prepare("SELECT id,title,description,section_order FROM {$wpdb->prefix}mpcs_sections WHERE course_id=%d ORDER BY section_order", $c->ID));
  $sections = [];
  foreach ($secs as $s) {
    $ids = $wpdb->get_col($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p
      JOIN {$wpdb->postmeta} a ON a.post_id=p.ID AND a.meta_key='_mpcs_lesson_section_id' AND a.meta_value=%d
      JOIN {$wpdb->postmeta} o ON o.post_id=p.ID AND o.meta_key='_mpcs_lesson_lesson_order'
      WHERE p.post_type='mpcs-lesson' AND p.post_status='publish' ORDER BY CAST(o.meta_value AS UNSIGNED)", $s->id));
    $lessons = [];
    foreach ($ids as $id) {
      $p = get_post($id);
      $lessons[] = ['id' => (int)$id, 'slug' => $p->post_name, 'title' => $p->post_title, 'date' => $p->post_date, 'content' => $p->post_content, 'link' => get_permalink($id)];
    }
    $sections[] = ['title' => $s->title, 'description' => $s->description, 'lessons' => $lessons];
  }
  $thumb = get_the_post_thumbnail_url($c->ID, 'full');
  $out[] = ['id' => $c->ID, 'slug' => $c->post_name, 'title' => $c->post_title, 'date' => $c->post_date, 'content' => $c->post_content,
            'excerpt' => $c->post_excerpt, 'image' => $thumb ?: null, 'link' => get_permalink($c->ID), 'sections' => $sections];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
PHP
