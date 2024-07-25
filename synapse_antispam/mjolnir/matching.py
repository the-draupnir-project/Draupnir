# -*- coding: utf-8 -*-
# SPDX-FileCopyrightText: 2022 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0

import re
from typing import Pattern

def re_word_boundary(r: str) -> str:
    """
    Adds word boundary characters to the start and end of an
    expression to require that the match occur as a whole word,
    but do so respecting the fact that strings starting or ending
    with non-word characters will change word boundaries.
    """
    # we can't use \b as it chokes on unicode. however \W seems to be okay
    # as shorthand for [^0-9A-Za-z_].
    return r"(^|\W)%s(\W|$)" % (r,)

_WILDCARD_RUN = re.compile(r"([\?\*]+)")
def glob_to_regex(glob: str, word_boundary: bool = False) -> Pattern:
    """Converts a glob to a compiled regex object.

    Args:
        glob: pattern to match
        word_boundary: If True, the pattern will be allowed to match at word boundaries
        anywhere in the string. Otherwise, the pattern is anchored at the start and
        end of the string.

    Returns:
        compiled regex pattern
    """

    # Patterns with wildcards must be simplified to avoid performance cliffs
    # - The glob `?**?**?` is equivalent to the glob `???*`
    # - The glob `???*` is equivalent to the regex `.{3,}`
    chunks = []
    for chunk in _WILDCARD_RUN.split(glob):
        # No wildcards? re.escape()
        if not _WILDCARD_RUN.match(chunk):
            chunks.append(re.escape(chunk))
            continue

        # Wildcards? Simplify.
        qmarks = chunk.count("?")
        if "*" in chunk:
            chunks.append(".{%d,}" % qmarks)
        else:
            chunks.append(".{%d}" % qmarks)

    res = "".join(chunks)

    if word_boundary:
        res = re_word_boundary(res)
    else:
        # \A anchors at start of string, \Z at end of string
        res = r"\A" + res + r"\Z"

    return re.compile(res, re.IGNORECASE)
