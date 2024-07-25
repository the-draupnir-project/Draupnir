# SPDX-FileCopyrightText: 2019 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0

from setuptools import setup, find_packages

setup(
    name="mjolnir",
    version="2.0.0-beta.4", # version automated in package.json - Do not edit this line, use `yarn version`.
    packages=find_packages(),
    description="Mjolnir Antispam",
    include_package_data=True,
    zip_safe=True,
    install_requires=[],
)
