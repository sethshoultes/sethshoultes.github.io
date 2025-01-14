<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AdventureBuildr Arcade Homepage</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            overflow-x: hidden;
            position: relative;
            min-height: 100vh;
        }

        .parallax-background {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            background: linear-gradient(135deg, #B0C4DE, #4682B4);
        }

        .geometric-shapes {
            position: absolute;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }

        .shape {
            position: absolute;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
        }

        .shape-1 {
            width: 200px;
            height: 200px;
            top: 20%;
            left: 10%;
            animation: float 8s infinite;
        }

        .shape-2 {
            width: 150px;
            height: 150px;
            top: 40%;
            right: 15%;
            animation: float 6s infinite;
        }

        .shape-3 {
            width: 100px;
            height: 100px;
            bottom: 30%;
            left: 30%;
            animation: float 10s infinite;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(10deg); }
        }

        .navbar {
            
            top: 0;
            width: 100%;
            background: rgba(14, 22, 84, 0.9);
            padding: 1rem;
            z-index: 1000;
        }

        .navbar h1 {
            color: #fff;
            text-align: center;
            font-size: 2rem;
            text-transform: uppercase;
            letter-spacing: 3px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
            float: right;
            margin-top: 70px;
            margin-right: 140px;
        }

        .main-content {
            position: relative;
            margin-top: 80px; /* Adjusted to account for fixed navbar */
            padding: 2rem;
            z-index: 1;
        }

        .section {
            background: rgba(255, 255, 255, 0.9);
            padding: 2rem;
            margin-bottom: 2rem;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .section h2 {
            color: #4682B4;
            margin-bottom: 2rem;
            text-align: center;
            font-size: 2rem;
        }

        .featured-games {
            display: flex;
            overflow-x: auto;
            gap: 2rem;
            padding: 1rem;
        }

        .game-card {
            flex: 0 0 auto;
            width: 200px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
            transition: transform 0.3s;
            cursor: pointer;
        }

        .game-card:hover {
            transform: translateY(-5px);
        }

        .game-card img {
            width: 100%;
            height: 150px;
            object-fit: cover;
            border-radius: 4px;
            margin-bottom: 1rem;
        }

        .categories {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            padding: 1rem;
        }

        .category {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 8px;
            text-align: center;
            transition: transform 0.3s;
            cursor: pointer;
        }

        .category:hover {
            transform: scale(1.05);
        }

        @media (max-width: 768px) {
            .section {
                padding: 1.5rem 1rem;
            }

            .featured-games {
                gap: 1rem;
            }

            .game-card {
                width: 160px;
            }
        }
        .arcade-button {
            display: inline-block;
            margin-top: 20px;
            padding: 0.8em 1.8em;
            background: linear-gradient(45deg, #4682B4, #5F9EA0);
            color: white;
            text-decoration: none;
            border-radius: 30px;
            font-weight: 600;
            letter-spacing: 0.5px;
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(70, 130, 180, 0.2);
        }

        .arcade-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(70, 130, 180, 0.3);
            background: linear-gradient(45deg, #5F9EA0, #4682B4);
            color: white;
            text-decoration: none;
        }

        .arcade-button:active {
            transform: translateY(1px);
            box-shadow: 0 2px 10px rgba(70, 130, 180, 0.2);
        }

        .arcade-button::after {
            content: "";
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: 0.5s;
        }

        .arcade-button:hover::after {
            left: 100%;
        }
    </style>
</head>
<body>
    <div class="parallax-background">
        <div class="geometric-shapes">
            <div class="shape shape-1"></div>
            <div class="shape shape-2"></div>
            <div class="shape shape-3"></div>
        </div>
    </div>

    <nav class="navbar">
       <figure class="wp-block-image size-full is-resized"><a href="/"><img fetchpriority="high" decoding="async" width="588" height="217" src="https://adventurebuildrstorage.storage.googleapis.com/wp-content/uploads/2024/10/11185818/AdventureBuildr-Logo-e1731351627826.png" alt="AdventureBuildr Logo" class="wp-image-1420" style="width:500px" srcset="https://adventurebuildrstorage.storage.googleapis.com/wp-content/uploads/2024/10/11185818/AdventureBuildr-Logo-e1731351627826.png 588w, https://adventurebuildrstorage.storage.googleapis.com/wp-content/uploads/2024/10/11185818/AdventureBuildr-Logo-e1731351627826-300x111.png 300w" sizes="(max-width: 588px) 100vw, 588px" /></a> <h1>Arcade</h1></figure>

    </nav>

    <main class="main-content">
        <section class="section">
            <h2>Featured Games</h2>
            <div class="featured-games">
                <div class="game-card">
                    <img src="https://adventurebuildrstorage.storage.googleapis.com/wp-content/uploads/2025/01/14143316/memory-master.jpg" alt="Memory Master">
                    <h3>Memory Master</h3>
                    <a class="arcade-button" href="https://adventurebuildr.com/memory-game/memory-master/" target="_blank">Play Now</a>
                </div>
                <div class="game-card">
                    <img src="https://adventurebuildrstorage.storage.googleapis.com/wp-content/uploads/2025/01/14153014/bouncy-ball-1.jpg" alt="Bouncy Ball">
                    <h3>Bouncy Ball</h3>
                    <a class="arcade-button" href="https://adventurebuildr.com/arcade/bouncy-ball.html" target="_blank">Play Now</a>
                </div>
                <div class="game-card">
                    <img src="https://adventurebuildrstorage.storage.googleapis.com/wp-content/uploads/2025/01/14153526/type-runner.jpg" alt="Bouncy Ball">
                    <h3>TypeRunner</h3>
                    <a class="arcade-button" href="https://adventurebuildr.com/arcade/typerunner.html" target="_blank">Play Now</a>
                </div>
                <div class="game-card">
                    <img src="/api/placeholder/200/150" alt="Game 3">
                    <h3>Puzzle Quest</h3>
                </div>
                <div class="game-card">
                    <img src="/api/placeholder/200/150" alt="Game 4">
                    <h3>Dragon Tales</h3>
                </div>
            </div>
        </section>

        <section class="section">
            <h2>Categories</h2>
            <div class="categories">
                <div class="category">
                    <h3>Action</h3>
                </div>
                <div class="category">
                    <h3>Adventure</h3>
                </div>
                <div class="category">
                    <h3>Puzzle</h3>
                </div>
                <div class="category">
                    <h3>Strategy</h3>
                </div>
            </div>
        </section>
    </main>
</body>
</html>