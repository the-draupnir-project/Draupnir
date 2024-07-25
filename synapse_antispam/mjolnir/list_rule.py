# -*- coding: utf-8 -*-
# SPDX-FileCopyrightText: 2022 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0

from .matching import glob_to_regex

RECOMMENDATION_BAN = "m.ban"
RECOMMENDATION_BAN_TYPES = [RECOMMENDATION_BAN, "org.matrix.mjolnir.ban"]

RULE_USER = "m.policy.rule.user"
RULE_ROOM = "m.policy.rule.room"
RULE_SERVER = "m.policy.rule.server"
USER_RULE_TYPES = [RULE_USER, "m.room.rule.user", "org.matrix.mjolnir.rule.user"]
ROOM_RULE_TYPES = [RULE_ROOM, "m.room.rule.room", "org.matrix.mjolnir.rule.room"]
SERVER_RULE_TYPES = [RULE_SERVER, "m.room.rule.server", "org.matrix.mjolnir.rule.server"]
ALL_RULE_TYPES = [*USER_RULE_TYPES, *ROOM_RULE_TYPES, *SERVER_RULE_TYPES]

def recommendation_to_stable(recommendation):
    if recommendation in RECOMMENDATION_BAN_TYPES:
        return RECOMMENDATION_BAN
    return None


def rule_type_to_stable(rule):
    if rule in USER_RULE_TYPES:
        return RULE_USER
    if rule in ROOM_RULE_TYPES:
        return RULE_ROOM
    if rule in SERVER_RULE_TYPES:
        return RULE_SERVER
    return None


class ListRule(object):
    def __init__(self, entity, action, reason, kind):
        self.entity = entity
        self.regex = glob_to_regex(entity)
        self.action = recommendation_to_stable(action)
        self.reason = reason
        self.kind = rule_type_to_stable(kind)

    def matches(self, victim):
        return self.regex.match(victim)
