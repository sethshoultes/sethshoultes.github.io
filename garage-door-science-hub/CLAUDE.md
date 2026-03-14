# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Landing page that links together the A Plus Garage Doors educational project series. Single `index.html` file with no build system, no dependencies, and no tests.

## Running

Open `index.html` in a browser. Also deployed via GitHub Pages (legacy method, `main` branch): https://sethshoultes.github.io/garage-door-science-hub/

## Architecture

Single HTML file with inline CSS and no JavaScript. Responsive card grid linking to four sibling projects, each hosted on its own GitHub Pages site:

1. **Science of Garage Door Springs** → `sethshoultes.github.io/science-of-garage-door-springs/`
2. **Science of Garage Doors** → `sethshoultes.github.io/science-of-garage-doors/`
3. **Spring-Powered Catapult** → `sethshoultes.github.io/spring-powered-catapult/`
4. **Installation Training Simulator** → `sethshoultes.github.io/garage-door-trainer/`
5. **Spring Fatigue & Cold Weather** → `sethshoultes.github.io/garage-door-science-hub/spring-fatigue-cold-weather/` (subdirectory)
6. **Safety Systems Lab** → `sethshoultes.github.io/garage-door-science-hub/safety-systems-lab/` (subdirectory)

## Design System

- Dark industrial theme matching the sibling projects
- CSS custom properties in `:root` for all colors
- Font stack: Bebas Neue (headings), JetBrains Mono (labels/tags), Source Sans 3 (body)
- Each card has a unique gradient accent color via `card-{name}::before`
- Tags use color-coded border/text classes: `tag-danger`, `tag-energy`, `tag-accent`, `tag-blue`, `tag-purple`, `tag-orange`

## Adding a New Project Card

1. Add a `card-{name}::before` gradient rule in the CSS
2. Add a new `<a class="card card-{name}">` block in the `.cards` section, incrementing the card number
3. Push to `main` — GitHub Pages deploys automatically
