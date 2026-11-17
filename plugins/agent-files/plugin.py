"""agent-files fills no theme spots: its work is the edge module and the twin builder (plugin.json). The site loader
imports a plugin.py for every plugin, so this one says so."""
hooks = {}


def edge_on(ctx):
    """Never in functions/_plugins.js: agent-files has no handle() for the chain. The middleware imports it straight from
    plugins/agent-files/ and calls agentFiles() itself, after runRequired (site-kit#298)."""
    return False
