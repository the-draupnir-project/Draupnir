// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";

export type InvariantCheck<Subject> = Invariant<Subject>;

export interface Invariant<Subject> {
  semanticTypeName: string;
  lawName: string;
  what: string;
  why: string;
  law: string;
  check: (makeSubject: LawSubjectFactory<Subject>) => void | Promise<void>;
}

export type LawSubjectFactory<Subject> = () => Promise<Result<Subject>>;

export interface LawDescription<Subject> {
  what: string;
  why: string;
  law: string;
  check: (makeSubject: LawSubjectFactory<Subject>) => void | Promise<void>;
}

export interface SemanticType<Subject> {
  name: string;
  invariants: Array<Invariant<Subject>>;
  check(makeSubject: LawSubjectFactory<Subject>): Promise<void>;
}

/**
 * A semantic type is used to describe the expected behavior of a type beyond its shape.
 * At the moment invariants can be specified through the `Law` method.
 * This adds structure to important behavioural contracts that would otherwise be
 * placed loosely in unit tests with no organisation.
 *
 * Another important feature of the invariant law is that they describe why they
 * are included in the sematic type which helps negotiating their removal if
 * the underlying abstraction changes.
 *
 * Critically the laws as opposed to tests are also defined against the
 * interface and not any single concrete implementation. But all implementations
 * can test their implementation against the semantic type.
 *
 * This brings the benefits of test driven development directly to the stage
 * where the interface (and thus abstraction) is defined (or changed). Before
 * any concrete implementation is even considered.
 */
export function SemanticType<Subject>(name: string) {
  return {
    Law<Laws extends Record<string, LawDescription<Subject>>>(
      laws: Laws
    ): SemanticType<Subject> {
      return describeSemanticType<Subject, Laws>({ name, ...laws });
    },
  };
}

export function describeSemanticType<
  Subject,
  Laws extends Record<string, LawDescription<Subject>>,
>(description: { name: string } & Laws): SemanticType<Subject> {
  const { name, ...rest } = description;
  const lawDescriptions = rest as Record<string, LawDescription<Subject>>;
  const invariants: Array<Invariant<Subject>> = Object.entries(
    lawDescriptions
  ).map(([lawName, lawDescription]) => ({
    semanticTypeName: name,
    lawName,
    ...lawDescription,
  }));
  return {
    name,
    invariants,
    async check(makeSubject) {
      for (const law of invariants) {
        await law.check(makeSubject);
      }
    },
  };
}
