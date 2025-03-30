import os
import sys

# Add the project root directory to the Python path so autodoc can find the modules
sys.path.insert(0, os.path.abspath(".."))

# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = "Exploration Assistant"
copyright = "2025, Sam"
author = "Sam"
release = "0.1"

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = ["sphinxcontrib.plantuml", "sphinx_needs", "sphinx.ext.autodoc"]

templates_path = ["_templates"]
exclude_patterns = []


# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output


html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]

needs_types = [
    {
        "directive": "req",
        "title": "Requirement",
        "prefix": "R_",
        "color": "#BFD8D2",
        "style": "node",
    },
    {
        "directive": "SR",
        "title": "Safety Requirement",
        "prefix": "SR_",
        "color": "#D19F3C",
        "style": "node",
    },
    {
        "directive": "DFA",
        "title": "DFA Requirement",
        "prefix": "DFA_",
        "color": "#A73E89",
        "style": "node",
    },
    {
        "directive": "arch",
        "title": "Architecture",
        "prefix": "A_",  # prefix for auto-generated IDs
        "style": "component",  # style for the type in diagrams
        "color": "#BFD8D2",  # color for the type in diagrams
    },
]

need_extra_links = [
    {
        "option": "tutorial_required_by",
        "incoming": "requires",  # text to describe incoming links
        "outgoing": "required by",  # text to describe outgoing links
        "style": "#00AA00",  # color for the link in diagrams
    },
]

needs_extra_options = [
    "image",
    {
        "name": "asil",
        "description": "Safety Integrity Level",
        "values": ["A", "B", "C", "D", "A_D", "B_D", "C_D" ],
    },
    {
        "name": "sreqtype",
        "description": "Safety Requirement or DFA Requirement",
        "values": ["SR", "DFA" ],
    },
]


needs_build_json = True
