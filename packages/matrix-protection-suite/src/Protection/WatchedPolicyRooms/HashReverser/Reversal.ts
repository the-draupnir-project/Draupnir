// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { PolicyRuleType } from "../../../MatrixTypes/PolicyEvents";
import { PolicyListRevision } from "../../../PolicyList/PolicyListRevision";
import {
  LiteralPolicyRule,
  makeReversedHashedPolicy,
} from "../../../PolicyList/PolicyRule";

type HashRecord = { sha256: string };
type EntityFromRecord<R extends HashRecord> = (record: R) => string;

export function reversePoliciesOfType<Record extends HashRecord>(
  hashRecords: Record[],
  entityExtractor: EntityFromRecord<Record>,
  type: PolicyRuleType,
  sourceRevision: PolicyListRevision
): LiteralPolicyRule[] {
  const reversedPolicies: LiteralPolicyRule[] = [];
  for (const record of hashRecords) {
    const matchingPolicies = sourceRevision.findRulesMatchingHash(
      record.sha256,
      "sha256",
      {
        type,
      }
    );
    reversedPolicies.push(
      ...matchingPolicies.map((policy) =>
        makeReversedHashedPolicy(entityExtractor(record), policy)
      )
    );
  }
  return reversedPolicies;
}
