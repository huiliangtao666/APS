#!/usr/bin/env python3
"""Python-stack platform dev command; exec replaces this process. No install/build."""
import os
import pathlib
import sys

if __name__ == '__main__':
    server = pathlib.Path(__file__).with_name('b15-user-preview-server.mjs')
    os.execvp('node', ['node', str(server), *sys.argv[1:]])
