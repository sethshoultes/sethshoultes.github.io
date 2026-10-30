"""Make cover pictures for the three courses WordPress had none for, through OpenRouter (the key is read from OPENROUTER_API_KEY).
Run once from the repo root; the pictures are committed in assets/academy/. No people, no text."""
import base64, json, os, subprocess, tempfile, urllib.request
MODEL = "google/gemini-nano-banana-2.1"
COVERS = {
    "intermediate-level-html-and-css": "Flat illustration in warm orange and deep navy: a browser window with a page layout of boxes being arranged by a grid of guide lines, a small flexible row of cards beside it.",
    "advanced-level-html-and-css": "Flat illustration in warm orange and deep navy: layered browser windows with a fast-loading gauge dial and tidy stacked blocks of code shapes, no readable text.",
    "business-startup-essentials": "Flat illustration in warm orange and deep navy: a desk with an open notebook, a pencil, a small shop-front sketch and a simple bar chart on paper, seen from above.",
}
for slug, prompt in COVERS.items():
    out = f"assets/academy/cover-{slug}.jpg"
    body = {"model": MODEL, "modalities": ["image", "text"], "image_config": {"aspect_ratio": "3:2"},
            "messages": [{"role": "user", "content": prompt + " No people, no faces, no text, no letters, no logos. 3:2 composition."}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", json.dumps(body).encode(),
                                 {"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"})
    url = json.load(urllib.request.urlopen(req, timeout=180))["choices"][0]["message"]["images"][0]["image_url"]["url"]
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
        t.write(base64.b64decode(url.split(",", 1)[1]))
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1280", t.name, "--out", out], check=True, capture_output=True)
    os.unlink(t.name)
    assert os.path.getsize(out) > 0
    print("ok", out)
