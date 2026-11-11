"""hero-scenes (site-kit#282): the build half. `head.styles` links the slot's stylesheet, writes the site's settings as a JSON block
the engine reads (which scenes may run, the answer cards' assistant names, the other words and the font), and adds the engine as a
module script, which mounts the scenes after the page has loaded. Lists are comma-separated; `cited` is the long and short chip text
split by "|". Colours are not settings here: the engine reads the site's own tokens. Anything malformed stops the build."""
import json
import re

SCENES = ("flow", "orb", "answer", "blocks", "pins", "page")
FONT = re.compile(r"""[A-Za-z0-9 ,'"-]{1,120}""")


def _list(text, sep=","):
    return [part.strip() for part in text.split(sep) if part.strip()]


def checked(config):
    scenes = _list(config["scenes"])
    unknown = [s for s in scenes if s not in SCENES]
    if not scenes or unknown:
        raise ValueError(f"scenes must name some of {', '.join(SCENES)}; not {', '.join(unknown) or 'none'}")
    if not FONT.fullmatch(config["font"]):
        raise ValueError(f'font "{config["font"]}" must be a plain font stack, like Georgia, serif')
    cited = _list(config["cited"], "|")
    if not cited:
        raise ValueError("cited needs the chip's text: the long one, then | and a shorter one")
    text = {k: config[k].strip() for k in ("question", "answer_label", "citation", "ranking_label")}
    return {"scenes": scenes, "assistants": _list(config["assistants"]), "sources": _list(config["sources"]), **text,
            "cited": cited, "font": config["font"].strip()}


def styles(ctx):
    data = json.dumps(checked(ctx.config), ensure_ascii=False, separators=(",", ":"))
    data = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")   # never closes its own <script>
    return ('<link rel="stylesheet" href="/assets/plugins/hero-scenes/assets/hero-scenes.css">\n'
            f'<script type="application/json" id="hero-scenes-settings">{data}</script>\n'
            '<script type="module" src="/assets/plugins/hero-scenes/assets/hero-scenes.js"></script>')


hooks = {"head.styles": styles}
