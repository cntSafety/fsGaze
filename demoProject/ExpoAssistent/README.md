# Exploration Assistant

This demonstration project is used as the reference for fsGaze and it showcases the integration between SysML v2 and Sphinx Needs.

SysML v2 already incorporates requirements as native model elements, making Sphinx Needs optional for fsGaze implementations. However, fsGaze provides support for projects that prefer Sphinx Needs for requirement management and traceability. This support includes importing Sphinx Needs requirements and generating Sphinx Needs-based reports that integrate with your project documentation.

To set-up the SysML-v2 enviroment see https://github.com/Systems-Modeling/SysML-v2-Release/tree/master/install/jupyter

The following instruction is related to sphinx needs setup.
First read the sphinx needs instructions see https://sphinx-needs.readthedocs.io/en/latest/installation.html

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
