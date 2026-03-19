// SPDX-FileCopyrightText: Bea <20361868+enbea@users.noreply.github.com>
//
// SPDX-License-Identifier: 0BSD

type CoalesceNever<T1, T2> = [T1] extends [never] ? T2 : T1;

type ExtractOrExtend<O, K extends PropertyKey, T> = CoalesceNever<
  Extract<O, Record<K, T>>, // Extract members of `O` that match `O[K]: T`.
  O & Record<K, T> // If none do then add the property to all the members.
>;

// `ExtractOrExtend`'s third parameter must be `unknown` here
export function hasOwn<O extends object, K extends PropertyKey>(
  o: O,
  k: K
): o is ExtractOrExtend<O, K, unknown> {
  return Object.hasOwn(o, k);
}
