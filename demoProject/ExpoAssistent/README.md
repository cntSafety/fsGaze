# Exploration Assistant

Demo project related to the interaction of SysML-v2 and Sphinx Needs.

create the virtual enviroment (.venv) by running

```bash
python -m venv .venv
```

activate the .venv

```bash
.venv\Scripts\activate
```

install the packages from requirements.txt then generate html and the needs.json

```bash
pip install -r requirements.txt
```

generate html and the needs.json

```bash
sphinx-build -b html source build/html
```

if the sphinx-build is not working

1. check if .venv is activated
2. check if sphinx is installed

```bash
pip show sphinx
```
