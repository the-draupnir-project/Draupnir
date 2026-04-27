// SPDX-FileCopyrightText: 2025 - 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";

export type LawSubjectFactory<Subject> = () => Promise<Result<Subject>>;

export type SemanticCheck<Subject> = (
  makeSubject: LawSubjectFactory<Subject>
) => void | Promise<void>;

export interface SemanticDescription {
  what: string;
  why: string;
  when?: string;
  law?: string;
}

export interface Semantic {
  semanticTypeName: string;
  name: string;
  what: string;
  why: string;
  when?: string;
  law?: string;
}

export interface VerifiableSemantic<Subject> extends Semantic {
  check: SemanticCheck<Subject>;
}

export interface SemanticType<Subject, SemanticNames extends string = string> {
  name: string;
  semantics: Array<Semantic>;
  verify(
    checks: Partial<Record<SemanticNames, SemanticCheck<Subject>>>
  ): VerifiableSemanticType<Subject>;
}

export interface VerifiableSemanticType<Subject> {
  semanticType: SemanticType<Subject>;
  verifiableSemantics: Array<VerifiableSemantic<Subject>>;
  check(makeSubject: LawSubjectFactory<Subject>): Promise<void>;
}

/**
 * A semantic type is used to describe the expected behavior of a type beyond
 * its shape. Semantic declarations document the behavioural contract directly
 * at the interface, while verification can be attached later for any subset of
 * those semantics. Before we added the semantic type abstraction, these checks
 * would be placed loosely in unit tests with no organisation on an adhoc basis.
 *
 * Another important feature of semantic type is to they describe why semantics
 * included, which helps negotiating their removal if the underlying abstraction
 * changes.
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
    declare<Semantics extends Record<string, SemanticDescription>>(
      semantics: Semantics
    ): SemanticType<Subject, keyof Semantics & string> {
      return describeSemanticType<Subject, keyof Semantics & string>({
        name,
        semantics,
      });
    },
    Law<
      Laws extends Record<
        string,
        SemanticDescription & { check: SemanticCheck<Subject> }
      >,
    >(laws: Laws): VerifiableSemanticType<Subject> {
      const semantics = Object.fromEntries(
        Object.entries(laws).map(
          ([semanticName, { check: _check, ...semantic }]) => [
            semanticName,
            semantic,
          ]
        )
      ) as Record<string, SemanticDescription>;
      return describeSemanticType<Subject, keyof Laws & string>({
        name,
        semantics,
      }).verify(
        Object.fromEntries(
          Object.entries(laws).map(([semanticName, law]) => [
            semanticName,
            law.check,
          ])
        ) as Partial<Record<keyof Laws & string, SemanticCheck<Subject>>>
      );
    },
  };
}

export function describeSemanticType<
  Subject,
  SemanticNames extends string,
>(description: {
  name: string;
  semantics: Record<SemanticNames, SemanticDescription>;
}): SemanticType<Subject, SemanticNames> {
  const semanticEntries = Object.entries(description.semantics) as Array<
    [SemanticNames, SemanticDescription]
  >;
  const semantics: Array<Semantic> = semanticEntries.map(
    ([semanticName, semanticDescription]) => ({
      semanticTypeName: description.name,
      name: semanticName,
      ...semanticDescription,
    })
  );
  const semanticType: SemanticType<Subject, SemanticNames> = {
    name: description.name,
    semantics,
    verify(
      checks: Partial<Record<SemanticNames, SemanticCheck<Subject>>>
    ): VerifiableSemanticType<Subject> {
      const verifiableSemantics: Array<VerifiableSemantic<Subject>> =
        semantics.flatMap((semantic) => {
          const check = checks[semantic.name as SemanticNames];
          return check === undefined ? [] : [{ ...semantic, check }];
        });
      return {
        semanticType,
        verifiableSemantics,
        async check(makeSubject) {
          for (const semantic of verifiableSemantics) {
            await semantic.check(makeSubject);
          }
        },
      };
    },
  };
  return semanticType;
}
